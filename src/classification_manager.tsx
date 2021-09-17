/**
 * Classification manager allows the user to choose an existing model and use it to classify
 * phrases in a dataset.
 */

import React, {Component} from 'react';
import codapInterface, {CODAP_Notification} from "./lib/CodapInterface";
import {
	getCaseCount, getCollectionNames,
	getDatasetInfoWithFilter, isAModel, isNotAModel, deselectAllCasesIn, entityInfo, scrollCaseTableToRight
} from './lib/codap-helper';
import {wordTokenizer} from "./lib/one_hot";
import './storyq.css';
import {LogitPrediction} from './lib/logit_prediction';
import TextFeedbackManager, {TFMStorage} from "./text_feedback_manager";
import Button from 'devextreme-react/button';
import {SelectBox} from "devextreme-react/select-box";
import {computeKappa} from "./utilities";

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
	modelColumnFeatures: string[],
	targetDatasetInfo: entityInfo,
	targetDatasetName: string | null,
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
	positiveLabel: string,
	modelColumnFeatures: string[],
	threshold: number,
	constantWeightTerm: number,
	predictor: any
}

const kFeatureIDsAttributeName = 'featureIDs';

export class ClassificationManager extends Component<Classification_Props, {
	status: string,
	count: number
}> {
	[indexindex: string]: any;

	private modelDatasetInfoArray: entityInfo[] = [];
	private modelsDatasetName: string = '';
	private modelToplevelNames: string[] = [];
	private modelToplevelName: string = '';
	private modelCaseIndex: number = 0;
	private modelCollectionName = 'models';
	private modelCategories: string[] = [];
	private modelColumnFeatures: string[] = [];
	private targetDatasetInfoArray: entityInfo[] = [];
	private targetDatasetInfo: entityInfo = {name: '', title: '', id: -1};
	private targetCollectionNames: string[] = [];
	private targetCollectionName = '';
	private targetAttributeName = '';
	private targetAttributeNames: string[] = [];
	private targetClassAttributeName = '';
	private targetPredictedLabelAttributeName = 'classification';
	private targetProbabilityAttributeName = 'probability of positive';
	private subscriberIndex: number = -1;
	private textFeedbackManager: TextFeedbackManager | null = null;
	private restoredStatus: string = '';
	private results: {
		targetTitle: string, modelName: string,
		numPositive: number, numNegative: number,
		accuracy: number, kappa: number
	};

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
		this.results = {
			targetTitle: '', modelName: '', numPositive: 0, numNegative: 0,
			accuracy: 0, kappa: 0
		};
	}

	public async componentDidMount() {
		this.props.setStorageCallbacks({
			createStorageCallback: this.createStorage,
			restoreStorageCallback: this.restoreStorage
		});
		await this.updateTargetNames();
		this.subscriberIndex = codapInterface.on('notify', '*', '', this.handleNotification);
		this.setState({count: this.state.count + 1});
		if (this.restoredStatus !== '') {
			this.setState({status: this.restoredStatus});
			this.restoredStatus = '';
		}
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
			modelColumnFeatures: this.modelColumnFeatures,
			targetDatasetInfo: this.targetDatasetInfo,
			targetDatasetName: null,
			targetCollectionName: this.targetCollectionName,
			targetAttributeName: this.targetAttributeName,
			targetClassAttributeName: this.targetClassAttributeName,
			status: this.state.status,
			textFeedbackManagerStorage: this.getTextFeedbackManager().createStorage()
		}
	}

	public restoreStorage(iStorage: ClassificationStorage) {
		if (typeof iStorage.targetDatasetName === 'string') { // backward compatibility
			iStorage.targetDatasetInfo = {name: iStorage.targetDatasetName, title: iStorage.targetDatasetName, id: -1};
			iStorage.targetDatasetName = null;
		}
		this.modelsDatasetName = iStorage.modelsDatasetName;
		this.modelToplevelName = iStorage.modelToplevelName || '';
		this.modelCaseIndex = iStorage.modelCaseIndex;
		this.modelCollectionName = iStorage.modelCollectionName || '';
		this.modelCategories = iStorage.modelCategories || [];
		this.modelColumnFeatures = iStorage.modelColumnFeatures || [];
		this.targetDatasetInfo = iStorage.targetDatasetInfo || {name: '', title: '', id: -1};
		this.targetCollectionName = iStorage.targetCollectionName || '';
		this.targetAttributeName = iStorage.targetAttributeName || '';
		this.targetClassAttributeName = iStorage.targetClassAttributeName || '';
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
		return await getCollectionNames(this.targetDatasetInfo.name);
	}

	private async getTargetAttributeNames(): Promise<string[]> {
		const tCollNames = await this.getTargetCollectionNames();
		if (tCollNames.length === 0)
			return [];
		this.targetCollectionName = tCollNames[tCollNames.length - 1];
		const tListResult: any = await codapInterface.sendRequest(
			{
				action: 'get',
				resource: `dataContext[${this.targetDatasetInfo.name}].collection[${this.targetCollectionName}].attributeList`
			}
		)
			.catch((reason) => {
				console.log('Error getting attribute names because', reason);
			});
		console.log('getTargetAttributeNames, success', tListResult.success);
		if (tListResult.success) {
			return tListResult.values.map((iValue: any) => {
				return iValue.name;
			});
		} else return [];
	}

	public getConstructedFeatureNames(): string[] {
		return [];
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

	private async getModelCategories(): Promise<string[]> {
		let tResult: string[] = [];
		if (this.modelsDatasetName !== '') {
			let tCollectionNames = await getCollectionNames(this.modelsDatasetName),
				tModelInfoResult: any = await codapInterface.sendRequest({
					action: 'get',
					resource: `dataContext[${this.modelsDatasetName}].collection[${tCollectionNames[0]}].caseByIndex[
						${this.modelCaseIndex}]`
				});
			tResult = JSON.parse(tModelInfoResult.values.case.values['Classes'] || '[]');
		}
		return tResult;
	}

	/**
	 * We update as many name lists as necessary to be able to display them as choices in the UI.
	 * @private
	 */
	private async updateTargetNames() {

		async function allValuesAreInArray(iDatasetName: string, collectionName: string,
																			 iAttrName: string, iCategories: string[]) {
			let tFormula = `\`${iAttrName}\`!="${iCategories[0]}" and \`${iAttrName}\`!="${iCategories[1]}"`;
			// console.log(tFormula);
			let tCasesResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${iDatasetName}].collection[${collectionName}].caseFormulaSearch[${tFormula}]`
			});
			return tCasesResult.values.length === 0;
		}

		this.modelDatasetInfoArray = await getDatasetInfoWithFilter(isAModel);
		if (this.modelsDatasetName === '') {
			if (this.modelDatasetInfoArray.length > 0)
				this.modelsDatasetName = this.modelDatasetInfoArray[0].name;
		}
		if (this.modelsDatasetName !== '') {
			this.modelToplevelNames = await this.getModelToplevelNames();
			if (this.modelToplevelName === '' && this.modelToplevelNames.length > 0) {
				this.modelToplevelName = this.modelToplevelNames[0];
				this.modelCaseIndex = 0;
			} else if (this.modelToplevelName !== '')
				this.modelCaseIndex = this.modelToplevelNames.indexOf(this.modelToplevelName);
		}
		this.targetDatasetInfoArray = await getDatasetInfoWithFilter(isNotAModel);
		if (this.targetDatasetInfo.name === '') {
			if (this.targetDatasetInfoArray.length > 0)
				this.targetDatasetInfo = this.targetDatasetInfoArray[0];
		}
		if (this.targetDatasetInfo.name !== '') {
			this.targetCollectionNames = await this.getTargetCollectionNames();
			if (this.targetCollectionName === '' && this.targetCollectionNames.length > 0)
				this.targetCollectionName = this.targetCollectionNames[this.targetCollectionNames.length - 1];
			this.targetAttributeNames = await this.getTargetAttributeNames();
			if (this.targetAttributeName === '' && this.targetAttributeNames.length > 0)
				this.targetAttributeName = this.targetAttributeNames[0];
			if (this.targetClassAttributeName === '' && this.targetAttributeNames.length > 1) {
				this.modelCategories = await this.getModelCategories();
				let tCandidate = this.targetAttributeNames[1];
				if (allValuesAreInArray(this.targetDatasetInfo.name, this.targetCollectionName, tCandidate, this.modelCategories))
					this.targetClassAttributeName = tCandidate;
			}
		}
		console.log('targetAttributeName', this.targetAttributeName);
		this.setState({count: this.count + 1});
	}

	/**
	 *
	 * @param iNotification    (from CODAP)
	 */
	private async handleNotification(iNotification: CODAP_Notification) {
		if (iNotification.action === 'notify') {
			if (iNotification.values.operation === 'dataContextCountChanged') {
				this.modelDatasetInfoArray = await getDatasetInfoWithFilter(isAModel);
				this.targetDatasetInfoArray = await getDatasetInfoWithFilter(isNotAModel);
				// Force next render to allow choices if they exist
				this.modelsDatasetName = '';
				this.targetDatasetInfo = {name: '', title: '', id: -1};
				this.setState({count: this.state.count + 1});
			} else if (iNotification.values.operation === 'selectCases') {
				// @ts-ignore
				let tDataContextName: string = iNotification.resource && iNotification.resource.match(/\[(.+)]/)[1];
				if (tDataContextName === this.modelsDatasetName && !this.isSelectingFeatures) {
					this.isSelectingTargetPhrases = true;
					await this.getTextFeedbackManager().handleFeatureSelection(this);
					this.isSelectingTargetPhrases = false;
				} else if (tDataContextName === this.targetDatasetInfo.name && !this.isSelectingTargetPhrases) {
					this.isSelectingFeatures = true;
					await this.getTextFeedbackManager().handleTargetSelection(this);
					this.isSelectingFeatures = false;
				}
			} else if (['titleChange', 'updateAttributes'].includes(iNotification.values.operation)) {
				this.updateTargetNames();
			} else if (iNotification.resource === `dataContextChangeNotice[${this.targetDatasetInfo.name}]` &&
				iNotification.values.operation === 'createCases') {
				await this.classify();
			}
		}
	}

	private async addAttributesToTarget() {
		// Add the predicted label attribute to the target collection
		await codapInterface.sendRequest(
			{
				action: 'create',
				resource: `dataContext[${this.targetDatasetInfo.name}].collection[${this.targetCollectionName}].attribute`,
				values: [
					{
						name: this.targetPredictedLabelAttributeName,
						description: 'The label predicted by the model'
					},
					{
						name: this.targetProbabilityAttributeName,
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
			.catch((reason) => {
				console.log('Error adding target attributes because', reason);
			});
		await scrollCaseTableToRight(this.targetDatasetInfo.name);
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
				positiveLabel: '',
				modelColumnFeatures: [],
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
			tModel.positiveLabel = tParentCaseResult.values.case.values['Target Class'] || `positive`;
			this_.targetPredictedLabelAttributeName = tParentCaseResult.values.case.values['Predicted Column Name'] || `classification`;
			this_.targetProbabilityAttributeName = 'probability of ' + tModel.positiveLabel;
			this_.modelCategories = tModel.labels;	// Needed to pass to TextFeedbackManager
			let tColumnFeatures = tParentCaseResult.values.case.values['Column Features'] || `[]`;
			tModel.modelColumnFeatures = tColumnFeatures.split(',').map((iFeature: string) => {
				return iFeature.trimLeft();
			});
			this_.modelColumnFeatures = tModel.modelColumnFeatures;	// So they get saved and used to get values
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
			let tPhraseCount = await getCaseCount(this_.targetDatasetInfo.name, this_.targetCollectionName),
				tMatrix = {posPos: 0, negPos: 0, posNeg: 0, negNeg: 0},
				tNegativeLabel = tModel.positiveLabel === tModel.labels[0] ? tModel.labels[1] : tModel.labels[0];
			for (let i = 0; i < tPhraseCount; i++) {
				const tGetResult: any = await codapInterface.sendRequest({
					"action": "get",
					"resource": `dataContext[${this_.targetDatasetInfo.name}].collection[${this_.targetCollectionName}].caseByIndex[${i}]`
				})
					.catch(() => {
						console.log('unable to get target phrase');
					});
				let tPhraseID = tGetResult.values.case.id,
					tPhrase = tGetResult.values.case.values[this_.targetAttributeName],
					tActual = this_.targetClassAttributeName === '' ? '' :
						tGetResult.values.case.values[this_.targetClassAttributeName],
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
				// The column features are names of attributes we expect to find having values true or false
				tModel.modelColumnFeatures.forEach(iFeature => {
					if (tGetResult.values.case.values[iFeature]) {
						let tIndex = tModel.features.indexOf(iFeature);
						if (tIndex >= 0) {
							// Mark it in the array
							tGiven[tIndex] = 1;
							// Add the case ID to the list of featureIDs for this phrase
							tFeatureIDs.push(tModel.caseIDs[tIndex]);
							tModel.usages[tIndex].push(tPhraseID);
						}
					}
				});
				let tCaseValues: { [key: string]: string } = {},
					tPrediction = tModel.predictor.predict(tGiven);
				tCaseValues[this_.targetPredictedLabelAttributeName] = tPrediction.class ?
					tModel.positiveLabel : tNegativeLabel;
				tCaseValues[this_.targetProbabilityAttributeName] = tPrediction.probability;
				tCaseValues[kFeatureIDsAttributeName] = JSON.stringify(tFeatureIDs);
				tLabelValues.push({
					id: tGetResult.values.case.id,
					values: tCaseValues
				});
				// Increment results
				let tActualBool = tActual === tModel.positiveLabel;
				if (tPrediction.class) {
					this_.results.numPositive++;
					if (tActualBool)
						tMatrix.posPos++;
					else
						tMatrix.negPos++;
				} else {
					this_.results.numNegative++;
					if (tActualBool)
						tMatrix.posNeg++;
					else
						tMatrix.negNeg++;
				}
			}
			// Send the values to CODAP
			await codapInterface.sendRequest({
				action: 'update',
				resource: `dataContext[${this_.targetDatasetInfo.name}].collection[${this_.targetCollectionName}].case`,
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
			});
			if (this_.targetClassAttributeName !== '') {
				let computedKappa = computeKappa( tPhraseCount, tMatrix.posPos, tMatrix.negNeg,
					tMatrix.posPos + tMatrix.posNeg, tMatrix.posPos + tMatrix.negPos);
				this_.results.accuracy = Number(computedKappa.observed.toFixed(3));
				this_.results.kappa = Number(computedKappa.kappa.toFixed(3));
			}
		}

		function wipeResults() {
			this_.results = {
				targetTitle: '',
				modelName: '',
				numPositive: 0,
				numNegative: 0,
				accuracy: 0,
				kappa: 0
			}
		}

		/**
		 * Setting results will cause them to be displayed
		 */
		function reportResults() {
			this_.results.targetTitle = this_.targetDatasetInfo.title;
			this_.results.modelName = this_.modelToplevelName;
			this_.setState({count: this_.state.count + 1})
		}

		wipeResults();
		await deselectAllCasesIn(this.targetDatasetInfo.name);
		await deselectAllCasesIn(this.modelsDatasetName);
		await buildModelFromDataset();
		await addUsagesAttributeToModelDataset();
		await this.addAttributesToTarget();
		await classifyEachPhrase();
		reportResults();
		await this.getTextFeedbackManager().addTextComponent();
	}

	private renderForActiveState() {
		const kNoModels = 'No models to choose from',
			kNoTargets = 'No phrases to classify found';
		let this_ = this;

		function entityPropertyControl(entityInfoArray: entityInfo[], propName: string, prompt: string, noneFoundPrompt: string) {
			if (entityInfoArray.length === 1)
				this_[propName] = entityInfoArray[0];
			if (entityInfoArray.length === 0) {
				return (
					<p>{prompt}<em>{noneFoundPrompt}</em></p>
				)
			} else {
				return (
					<div>
						<label>
							<span>{prompt}</span>
							<SelectBox
								dataSource={entityInfoArray.map(iInfo => iInfo.title)}
								placeholder={'Choose one'}
								value={this_[propName].title}
								style={{display: 'inline-block'}}
								onValueChange={async (e) => {
									this_[propName] = entityInfoArray.find(iInfo => iInfo.title === e);
									await this_.updateTargetNames();
									this_.setState({count: this_.count + 1});
								}
								}
							>
							</SelectBox>
						</label>
						<br/>
					</div>
				);
			}
		}

		function stringPropertyControl(listOfNames: string[], propName: string, prompt: string, noneFoundPrompt: string) {
			if (listOfNames.length === 1)
				this_[propName] = listOfNames[0];
			if (listOfNames.length === 0) {
				return (
					<p>{prompt}<em>{noneFoundPrompt}</em></p>
				)
			} else {
				return (
					<label>
						<span>{prompt}</span>
						<SelectBox
							dataSource={listOfNames}
							placeholder={'Choose one'}
							value={this_[propName]}
							style={{display: 'inline-block'}}
							onValueChange={async (e) => {
								this_[propName] = e;
								await this_.updateTargetNames();
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
			return stringPropertyControl(this_.modelDatasetInfoArray.map(iInfo => iInfo.name),
				'modelsDatasetName', 'Models dataset: ',
				kNoModels);
		}

		function modelNamesControl() {
			return stringPropertyControl(this_.modelToplevelNames, 'modelToplevelName', 'Model to use: ',
				kNoModels);
		}

		function targetControl() {
			return entityPropertyControl(this_.targetDatasetInfoArray, 'targetDatasetInfo',
				'Dataset to use for classification: ',
				kNoTargets);
		}

		function getTargetAttributeControl() {
			if (this_.targetDatasetInfo.name === '')
				return '';
			return (stringPropertyControl(this_.targetAttributeNames,
				'targetAttributeName', 'Column to classify: ', 'No columns found'));
		}

		function doItButton() {
			if (this_.targetDatasetInfo.name === '' && this_.modelsDatasetName === '') {
				return (
					<div>
						<br/>
						<p>Cannot classify without both a model and phrases to classify.</p>
					</div>
				);
			} else if (this_.targetDatasetInfo.name === '') {
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

		function getResults() {

			function getAccuracyAndKappa() {
				return (this_.targetClassAttributeName === '' ? '' :
					(<div>
							<li>Accuracy = {this_.results.accuracy}</li>
							<li>Kappa = {this_.results.kappa}</li>
						</div>
					));
			}

			if (this_.results.targetTitle === '')
				return '';
			else {
				return (
					<div>
						<br/>
						<p>Results of classifying <strong>{this_.results.targetTitle}</strong> using
							<strong> {this_.results.modelName}</strong></p>
						<ul>
							<li>{this_.results.numPositive} were classified as <strong>{this_.modelCategories[1]}</strong></li>
							<li>{this_.results.numNegative} were classified as <strong>{this_.modelCategories[0]}</strong></li>
							{getAccuracyAndKappa()}
						</ul>
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
			{getResults()}
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
