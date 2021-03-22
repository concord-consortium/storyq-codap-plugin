/**
 * Classification manager allows the user to choose an existing model and use it to classify
 * phrases in a dataset.
 */

import React, {Component} from 'react';
import codapInterface, {CODAP_Notification} from "./lib/CodapInterface";
import {
	getCaseCount, getCollectionNames,
	getDatasetNamesWithFilter, getAttributeNameByIndex, isAModel, isNotAModel, deselectAllCasesIn
} from './lib/codap-helper';
import {wordTokenizer} from "./lib/one_hot";
import './storyq.css';
import {LogitPrediction} from './lib/logit_prediction';
import TextFeedbackManager, {TFMStorage} from "./text_feedback_manager";
import Button from 'devextreme-react/button';
import {SelectBox} from "devextreme-react/select-box";

// import tf from "@tensorflow/tfjs";

export interface Classification_StorageCallbackFuncs {
	createStorageCallback: () => any,
	restoreStorageCallback: (iStorage: any) => void
}

export interface Classification_Props {
	status: string,
	setStorageCallbacks: (iCallbacks: Classification_StorageCallbackFuncs) => void
}

interface ClassificationStorage {
	modelsDatasetName: string,
	modelToplevelName: string,
	modelCaseIndex: number,
	modelCollectionName: string,
	modelCategories: string[],
	targetDatasetName: string,
	targetCollectionName: string,
	targetAttributeName: string,
	targetClassAttributeName: string,
	status: string
	textFeedbackManagerStorage: TFMStorage
}

interface ClassificationModel {
	features: string[],
	weights: number[],
	caseIDs: number[],
	usages: number[][],
	labels: string[],
	threshold: number,
	constantWeightTerm: number,
	predictor: any
}

const kProbabilityAttributeName = 'prob of positive';
const kFeatureIDsAttributeName = 'featureIDs';

export class ClassificationManager extends Component<Classification_Props, {
	status: string,
	count: number
}> {
	[indexindex: string]: any;

	private modelDatasetNames: string[] = [];
	private modelsDatasetName: string = '';
	private modelToplevelNames: string[] = [];
	private modelToplevelName: string = '';
	private modelCaseIndex: number = 0;
	private modelCollectionName = 'models';
	private modelCategories: string[] = [];
	private targetDatasetNames: string[] = [];
	private targetDatasetName: string = '';
	private targetCollectionNames: string[] = [];
	private targetCollectionName = '';
	private targetAttributeName = '';
	private targetAttributeNames: string[] = [];
	private targetClassAttributeName = '';
	private targetPredictedLabelAttributeName = 'classification';
	private targetColumnFeatureNames: string[] = [];
	private subscriberIndex: number = -1;
	private textFeedbackManager: TextFeedbackManager | null = null;
	private restoredStatus: string = '';

	constructor(props: Classification_Props) {
		super(props);
		this.state = {
			status: props.status,
			count: 0
		};
		this.handleNotification = this.handleNotification.bind(this);
		this.createStorage = this.createStorage.bind(this);
		this.restoreStorage = this.restoreStorage.bind(this);
		props.setStorageCallbacks({
			createStorageCallback: this.createStorage,
			restoreStorageCallback: this.restoreStorage
		});

	}

	public async componentDidMount() {
		this.props.setStorageCallbacks({
			createStorageCallback: this.createStorage,
			restoreStorageCallback: this.restoreStorage
		});
		await this.updateTargetNames();
		this.subscriberIndex = codapInterface.on('notify', '*', '', this.handleNotification);
		this.setState({count: this.state.count + 1});
		if (this.restoredStatus !== '')
			this.setState({status: this.restoredStatus});
	}

	public componentWillUnmount() {
		codapInterface.off(this.subscriberIndex);
		this.getTextFeedbackManager().closeTextComponent();
	}

	public createStorage(): ClassificationStorage {
		return {
			modelsDatasetName: this.modelsDatasetName,
			modelToplevelName: this.modelToplevelName || '',
			modelCaseIndex: this.modelCaseIndex,
			modelCollectionName: this.modelCollectionName,
			modelCategories: this.modelCategories,
			targetDatasetName: this.targetDatasetName,
			targetCollectionName: this.targetCollectionName,
			targetAttributeName: this.targetAttributeName,
			targetClassAttributeName: this.targetClassAttributeName,
			status: this.state.status,
			textFeedbackManagerStorage: this.getTextFeedbackManager().createStorage()
		}
	}

	public restoreStorage(iStorage: ClassificationStorage) {
		this.modelsDatasetName = iStorage.modelsDatasetName;
		this.modelToplevelName = iStorage.modelToplevelName || '';
		this.modelCaseIndex = iStorage.modelCaseIndex;
		this.modelCollectionName = iStorage.modelCollectionName || '';
		this.modelCategories = iStorage.modelCategories || [];
		this.targetDatasetName = iStorage.targetDatasetName || '';
		this.targetCollectionName = iStorage.targetCollectionName || '';
		this.targetAttributeName = iStorage.targetAttributeName || '';
		this.targetClassAttributeName = iStorage.targetClassAttributeName || '';
		// this.setState({status: iStorage.status || 'testing'});
		this.restoredStatus = iStorage.status || 'testing';
		this.getTextFeedbackManager().restoreStorage(iStorage.textFeedbackManagerStorage);
	}

	private async getModelToplevelNames(): Promise<string[]> {
		let tCollectionNames = await getCollectionNames(this.modelsDatasetName),
			tModelTopLevelCases: any = await codapInterface.sendRequest({
				"action": "get",
				"resource": `dataContext[${this.modelsDatasetName}].collection[${tCollectionNames[0]}].caseFormulaSearch[true]`
			}).catch(() => {
					console.log('Error getting model cases');
				}
			);
		return tModelTopLevelCases.values.map((aCase: any) => {
			return aCase.values['Model'];
		});
	}

	private async getTargetCollectionNames(): Promise<string[]> {
		return await getCollectionNames(this.targetDatasetName);
	}

	private async getTargetAttributeNames(): Promise<string[]> {
		if (this.targetCollectionName === '') {
			const tCollNames = await this.getTargetCollectionNames();
			if (tCollNames.length === 0)
				return [];
			this.targetCollectionName = tCollNames[tCollNames.length - 1];
		}
		const tListResult: any = await codapInterface.sendRequest(
			{
				action: 'get',
				resource: `dataContext[${this.targetDatasetName}].collection[${this.targetCollectionName}].attributeList`
			}
		)
			.catch(() => {
				console.log('Error getting attribute names')
			});
		return tListResult.values.map((iValue: any) => {
			return iValue.name;
		});
	}

	/**
	 * Lazy instantiation since we can't properly initizlize until we've chosen a model and dataset of phrases
	 */
	private getTextFeedbackManager(): TextFeedbackManager {
		if (!this.textFeedbackManager) {
			this.textFeedbackManager = new TextFeedbackManager(this.modelCategories, this.targetAttributeName);
		} else {
			this.textFeedbackManager.targetAttributeName = this.targetAttributeName;
			this.textFeedbackManager.targetCategories = this.modelCategories;
		}
		return this.textFeedbackManager;
	}

	/**
	 * We update as many name lists as necessary to be able to display them as choices in the UI.
	 * @private
	 */
	private async updateTargetNames() {
		this.modelDatasetNames = await getDatasetNamesWithFilter(isAModel);
		if (this.modelsDatasetName === '') {
			if (this.modelDatasetNames.length > 0)
				this.modelsDatasetName = this.modelDatasetNames[0];
		}
		if (this.modelsDatasetName !== '') {
			this.modelToplevelNames = await this.getModelToplevelNames();
			if (this.modelToplevelName === '' && this.modelToplevelNames.length > 0) {
				this.modelToplevelName = this.modelToplevelNames[0];
				this.modelCaseIndex = 0;
			} else if (this.modelToplevelName !== '')
				this.modelCaseIndex = this.modelToplevelNames.indexOf(this.modelToplevelName);
		}
		this.targetDatasetNames = await getDatasetNamesWithFilter(isNotAModel);
		if (this.targetDatasetName === '') {
			if (this.targetDatasetNames.length > 0)
				this.targetDatasetName = this.targetDatasetNames[0];
		}
		if (this.targetDatasetName !== '') {
			this.targetCollectionNames = await this.getTargetCollectionNames();
			if (this.targetCollectionName === '' && this.targetCollectionNames.length > 0)
				this.targetCollectionName = this.targetCollectionNames[this.targetCollectionNames.length - 1];
			this.targetAttributeNames = await this.getTargetAttributeNames();
			if (this.targetAttributeName === '' && this.targetAttributeNames.length > 0)
				this.targetAttributeName = this.targetAttributeNames[0];
			if (this.targetClassAttributeName === '' && this.targetAttributeNames.length > 1)
				this.targetClassAttributeName = this.targetAttributeNames[1];
		}
	}

	/**
	 *
	 * @param iNotification    (from CODAP)
	 */
	private async handleNotification(iNotification: CODAP_Notification) {
		if (iNotification.action === 'notify' && iNotification.values.operation === 'dataContextCountChanged') {
			this.modelDatasetNames = await getDatasetNamesWithFilter(isAModel);
			this.targetDatasetNames = await getDatasetNamesWithFilter(isNotAModel);
			// Force next render to allow choices if they exist
			this.modelsDatasetName = '';
			this.targetDatasetName = '';
			this.setState({count: this.state.count + 1});
		} else if (iNotification.action === 'notify' && iNotification.values.operation === 'selectCases') {
			// @ts-ignore
			let tDataContextName: string = iNotification.resource && iNotification.resource.match(/\[(.+)]/)[1];
			if (tDataContextName === this.modelsDatasetName && !this.isSelectingFeatures) {
				this.isSelectingTargetPhrases = true;
				await this.getTextFeedbackManager().handleFeatureSelection(this);
				this.isSelectingTargetPhrases = false;
			} else if (tDataContextName === this.targetDatasetName && !this.isSelectingTargetPhrases) {
				this.isSelectingFeatures = true;
				await this.getTextFeedbackManager().handleTargetSelection(this);
				this.isSelectingFeatures = false;
			}
		} else if (iNotification.action === 'notify' && iNotification.resource === `dataContextChangeNotice[${this.targetDatasetName}]` &&
			iNotification.values.operation === 'createCases') {
			await this.classify();
		}
	}

	private async addAttributesToTarget() {
		// Add the predicted label attribute to the target collection
		await codapInterface.sendRequest(
			{
				action: 'create',
				resource: `dataContext[${this.targetDatasetName}].collection[${this.targetCollectionName}].attribute`,
				values: [
					{
						name: this.targetPredictedLabelAttributeName,
						description: 'The label predicted by the model'
					},
					{
						name: kProbabilityAttributeName,
						description: 'The probability predicted by the model that the classification is positive',
						precision: 5
					},
					{
						name: kFeatureIDsAttributeName,
						hidden: true
					}
				]
			}
		)
			.catch(() => {
				console.log('Error showing adding target attributes')
			});

	}

	/**
	 * Extract relevant info from model dataset and use it to classify phrases in target dataset
	 * @private
	 */
	private async classify() {
		let this_ = this,
			tModel: ClassificationModel = {
				features: [],
				weights: [],
				caseIDs: [],
				labels: [],
				usages: [],
				threshold: 0.5,
				constantWeightTerm: 0,
				predictor: null
			},
			tLabelValues: { id: number, values: any }[] = [];

		async function buildModelFromDataset() {
			let tModelCollectionNames = await getCollectionNames(this_.modelsDatasetName),
				tModelParentCollectionName = tModelCollectionNames[0];
			this_.modelCollectionName = tModelCollectionNames.pop() || 'cases';
			let tCaseCount = await getCaseCount(this_.modelsDatasetName, this_.modelCollectionName);
			for (let i = 0; i < tCaseCount; i++) {
				const tGetResult: any = await codapInterface.sendRequest({
					"action": "get",
					"resource": `dataContext[${this_.modelsDatasetName}].collection[${this_.modelCollectionName}].caseByIndex[${i}]`
				})
					.catch(() => {
						console.log('unable to get feature');
					});

				tModel.features.push(tGetResult.values.case.values['feature']);
				tModel.weights.push(tGetResult.values.case.values['weight']);
				tModel.caseIDs.push(tGetResult.values.case.id);
				tModel.usages.push([]);
			}
			const tParentCaseResult: any = await codapInterface.sendRequest({
				"action": "get",
				"resource":
					`dataContext[${this_.modelsDatasetName}].collection[${tModelParentCollectionName}].caseByIndex[${this_.modelCaseIndex}]`
			})
				.catch((e) => {
					console.log(`Error ${e} while getting parent case`);
				});
			let tLabels = tParentCaseResult.values.case.values['Classes'] || `["negative", "positive"]`;
			tModel.labels = JSON.parse(tLabels);
			this_.modelCategories = tModel.labels;	// Needed to pass to TextFeedbackManager
			tModel.threshold = tParentCaseResult.values.case.values['Threshold'];
			tModel.constantWeightTerm = tParentCaseResult.values.case.values['Constant Weight'];
			tModel.predictor = new LogitPrediction(tModel.constantWeightTerm, tModel.weights, tModel.threshold);
		}

		async function addUsagesAttributeToModelDataset() {
			await codapInterface.sendRequest({
					action: 'create',
					resource: `dataContext[${this_.modelsDatasetName}].collection[${this_.modelCollectionName}].attribute`,
					values: [
						{
							name: 'usages',
							description: 'IDs of cases with phrase that use this feature',
							hidden: true
						}
					]
				}
			)
		}

		async function classifyEachPhrase() {
			let tPhraseCount = await getCaseCount(this_.targetDatasetName, this_.targetCollectionName);
			for (let i = 0; i < tPhraseCount; i++) {
				const tGetResult: any = await codapInterface.sendRequest({
					"action": "get",
					"resource": `dataContext[${this_.targetDatasetName}].collection[${this_.targetCollectionName}].caseByIndex[${i}]`
				})
					.catch(() => {
						console.log('unable to get target phrase');
					});
				let tPhraseID = tGetResult.values.case.id,
					tPhrase = tGetResult.values.case.values[this_.targetAttributeName],
					tGiven = Array(tModel.features.length).fill(0),
					tFeatureIDs: number[] = [];
				// Find the index of each feature the phrase
				wordTokenizer(tPhrase, false).forEach((iFeature) => {
					let tIndex = tModel.features.indexOf(iFeature);
					if (tIndex >= 0) {	// We've found a feature
						// Mark it in the array
						tGiven[tIndex] = 1;
						// Add the case ID to the list of featureIDs for this phrase
						tFeatureIDs.push(tModel.caseIDs[tIndex]);
						tModel.usages[tIndex].push(tPhraseID);
					}
				});
				let tCaseValues: { [key: string]: string } = {},
					tPrediction = tModel.predictor.predict(tGiven);
				tCaseValues[this_.targetPredictedLabelAttributeName] = tPrediction.class ?
					tModel.labels[1] : tModel.labels[0];
				tCaseValues[kProbabilityAttributeName] = tPrediction.probability;
				tCaseValues[kFeatureIDsAttributeName] = JSON.stringify(tFeatureIDs);
				tLabelValues.push({
					id: tGetResult.values.case.id,
					values: tCaseValues
				});
			}
			// Send the values to CODAP
			await codapInterface.sendRequest({
				action: 'update',
				resource: `dataContext[${this_.targetDatasetName}].collection[${this_.targetCollectionName}].case`,
				values: tLabelValues
			});
			// Add the usages to each feature case
			let tFeatureUpdates = tModel.caseIDs.map((iID, iIndex) => {
				return {
					id: iID,
					values: {usages: JSON.stringify(tModel.usages[iIndex])}
				}
			});
			await codapInterface.sendRequest({
				action: 'update',
				resource: `dataContext[${this_.modelsDatasetName}].collection[${this_.modelCollectionName}].case`,
				values: tFeatureUpdates
			})
		}

		this.targetCollectionName = (await getCollectionNames(this.targetDatasetName)).pop() || 'cases';
		this.targetAttributeName = await getAttributeNameByIndex(this.targetDatasetName || '',
			this.targetCollectionName, 0);
/*
		this.targetClassAttributeName = await getAttributeNameByIndex(this.targetDatasetName || '',
			this.targetCollectionName, 1);
*/

		await deselectAllCasesIn(this.targetDatasetName);
		await deselectAllCasesIn(this.modelsDatasetName);
		await buildModelFromDataset();
		await addUsagesAttributeToModelDataset();
		await this.addAttributesToTarget();
		await classifyEachPhrase();
		await this.getTextFeedbackManager().addTextComponent();
	}

	private renderForActiveState() {
		const kNoModels = 'No models to choose from',
			kNoTargets = 'No phrases to classify found';
		let this_ = this;

		function propertyControl(listOfNames: string[], propName: string, prompt: string, noneFoundPrompt: string) {
			if (listOfNames.length === 1)
				this_[propName] = listOfNames[0];
			if (listOfNames.length === 0) {
				return (
					<div>
						<label>{prompt}<em>{noneFoundPrompt}</em></label>
					</div>
				)
			} else {
				return (
					<label>
						<br/><br/>
						<span>{prompt}</span>
						<SelectBox
							dataSource={listOfNames}
							placeholder={'Choose one'}
							defaultValue={this_[propName]}
							style={{display: 'inline-block'}}
							onValueChange={(e) => {
								this_[propName] = e;
								this_.updateTargetNames();
								this_.setState({count: this_.count + 1});
							}
							}
						>
						</SelectBox>
					</label>
				);
			}
		}

		function modelDatasetsControl() {
			return propertyControl(this_.modelDatasetNames, 'modelsDatasetName', 'Models dataset: ',
				kNoModels);
		}

		function modelNamesControl() {
			return propertyControl(this_.modelToplevelNames, 'modelToplevelName', 'Model to use: ',
				kNoModels);
		}

		function targetControl() {
			return propertyControl(this_.targetDatasetNames, 'targetDatasetName',
				'Dataset to use for classification: ',
				kNoTargets);
		}

		function getTargetAttributeControl() {
			if (this_.targetDatasetName === '')
				return '';
			return (propertyControl(this_.targetAttributeNames,
				'targetAttributeName', 'Column to classify: ', 'No columns found'));
		}

		function doItButton() {
			if (this_.targetDatasetName === '' && this_.modelsDatasetName === '') {
				return (
					<div>
						<br/>
						<p>Cannot classify without both a model and phrases to classify.</p>
					</div>
				);
			} else if (this_.targetDatasetName === '') {
				return (
					<div>
						<br/>
						<p>Cannot classify without phrases to classify.</p>
					</div>
				);
			} else if (this_.modelsDatasetName === '') {
				return (
					<div>
						<br/>
						<p>Cannot classify without a model.</p>
					</div>
				);
			} else {
				return (
					<div>
						<br/>
						<Button onClick={() => {
							this_.classify();
						}}>Classify!</Button>
					</div>
				);
			}

		}

		return (<div className='sq-options'>
			{modelDatasetsControl()}
			{modelNamesControl()}
			{targetControl()}
			{getTargetAttributeControl()}
			{doItButton()}
		</div>)
	}

	public render() {
		return (
			<div>
				{this.renderForActiveState()}
			</div>
		)
	}
}
