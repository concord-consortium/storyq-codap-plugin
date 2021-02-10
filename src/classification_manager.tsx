/**
 * Classification manager allows the user to choose an existing model and use it to classify
 * phrases in a dataset.
 */

import React, {Component} from 'react';
// import pluralize from 'pluralize';
//import naiveBaseClassifier from './lib/NaiveBayesClassifier';
import codapInterface, {CODAP_Notification} from "./lib/CodapInterface";
import {
	getCaseCount, getCollectionNames,
	getDatasetNamesWithFilter, getAttributeNameByIndex, isAModel, isNotAModel
} from './lib/codap-helper';
import Dropdown from 'react-bootstrap/Dropdown';
import DropdownButton from 'react-bootstrap/DropdownButton';
import ButtonGroup from "react-bootstrap/esm/ButtonGroup";
import 'bootstrap/dist/css/bootstrap.min.css';
import {wordTokenizer} from "./lib/one_hot";
import './storyq.css';
import {LogitPrediction} from './lib/logit_prediction';
import TextFeedbackManager from "./text_feedback_manager";
import Button from "react-bootstrap/Button";

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
	modelDatasetID: number,
	modelsDatasetName: string,
	modelCaseID: number,
	modelCollectionName: string,
	modelCategories: string[],
	targetDatasetID: number,
	targetDatasetName: string,
	targetCollectionName: string,
	targetAttributeName: string,
	targetClassAttributeName: string,
	textComponentID: number,
	status: string
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
	private modelDatasetID = 0;
	public modelsDatasetName: string = '';
	public modelCaseID: number = 0;
	private modelCollectionName = 'models';
	private modelCategories: string[] = [];
	private targetDatasetNames: string[] = [];
	private targetDatasetID = -1
	public targetDatasetName: string = '';
	public targetCollectionName = '';
	private targetAttributeName = '';
	public targetClassAttributeName = '';
	public targetPredictedLabelAttributeName = 'classification';
	private textComponentID = 0;
	private subscriberIndex: number = -1;
	private textFeedbackManager: TextFeedbackManager | null = null;

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

	private getModelNames() {

	}

	public async componentDidMount() {
		this.modelDatasetNames = await getDatasetNamesWithFilter(isAModel);
		this.targetDatasetNames = await getDatasetNamesWithFilter(isNotAModel);
		this.subscriberIndex = codapInterface.on('notify', '*', '', this.handleNotification);
		this.setState({count: this.state.count + 1})
	}

	public componentWillUnmount() {
		codapInterface.off(this.subscriberIndex);
		this.getTextFeedbackManager().closeTextComponent();
	}

	public createStorage(): ClassificationStorage {
		return {
			modelDatasetID: this.modelDatasetID,
			modelsDatasetName: this.modelsDatasetName,
			modelCaseID: this.modelCaseID,
			modelCollectionName: this.modelCollectionName,
			modelCategories: this.modelCategories,
			targetDatasetID: this.targetDatasetID,
			targetDatasetName: this.targetDatasetName,
			targetCollectionName: this.targetCollectionName,
			targetAttributeName: this.targetAttributeName,
			targetClassAttributeName: this.targetClassAttributeName,
			textComponentID: this.textComponentID,
			status: this.state.status
		}
	}

	public restoreStorage(iStorage: ClassificationStorage) {
		this.modelDatasetID = iStorage.modelDatasetID;
		this.modelsDatasetName = iStorage.modelsDatasetName;
		this.modelCaseID = iStorage.modelCaseID;
		this.modelCollectionName = iStorage.modelCollectionName;
		this.modelCategories = iStorage.modelCategories;
		this.targetDatasetID = iStorage.targetDatasetID;
		this.targetDatasetName = iStorage.targetDatasetName;
		this.targetCollectionName = iStorage.targetCollectionName;
		this.targetAttributeName = iStorage.targetAttributeName;
		this.targetClassAttributeName = iStorage.targetClassAttributeName;
		this.textComponentID = iStorage.textComponentID;
		this.setState({status: iStorage.status || 'testing'})
	}

	private getTextFeedbackManager(): TextFeedbackManager {
		if (!this.textFeedbackManager) {
			this.textFeedbackManager = new TextFeedbackManager(this.modelCategories, this.targetAttributeName);
		}
		return this.textFeedbackManager;
	}

/*
	private async getModelNames():Promise<string[]> {
		let this_ = this,
				tModelDatasetNames = await getDatasetNamesWithFilter(isAModel),
				tModelNames:string[] = [];
		tModelDatasetNames.forEach((iDatasetName) =>{
			let tCollectionNames = await codapInterface.sendRequest({

			})
		});
		return tModelNames;
	}

*/
	/**
	 *
	 * @param iNotification    (from CODAP)
	 */
	private async handleNotification(iNotification: CODAP_Notification) {
		if (iNotification.action === 'notify' && iNotification.values.operation === 'dataContextCountChanged') {
			this.modelDatasetNames = await getDatasetNamesWithFilter(isAModel);
			this.targetDatasetNames = await getDatasetNamesWithFilter(isNotAModel)
			this.setState({count: this.state.count + 1});
		}
		else if (iNotification.action === 'notify' && iNotification.values.operation === 'selectCases') {
			// @ts-ignore
			let tDataContextName: string = iNotification.resource && iNotification.resource.match(/\[(.+)]/)[1];
			if (tDataContextName === this.modelsDatasetName && !this.isSelectingFeatures) {
				this.isSelectingTargetPhrases = true;
				await this.getTextFeedbackManager().handleFeatureSelection( this);
				this.isSelectingTargetPhrases = false;
			} else if (tDataContextName === this.targetDatasetName && !this.isSelectingTargetPhrases) {
				this.isSelectingFeatures = true;
				await this.getTextFeedbackManager().handleTargetSelection( this);
				this.isSelectingFeatures = false;
			}
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
				"resource": `dataContext[${this_.modelsDatasetName}].collection[${tModelParentCollectionName}].caseByIndex[0]`
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
				wordTokenizer(tPhrase).forEach((iFeature) => {
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
					values: { usages: JSON.stringify(tModel.usages[iIndex])}
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
		if( this.state.status === 'testing') {
			this.targetClassAttributeName = await getAttributeNameByIndex(this.targetDatasetName || '',
				this.targetCollectionName, 1);
		}

		await buildModelFromDataset();
		await addUsagesAttributeToModelDataset();
		await this.addAttributesToTarget();
		await classifyEachPhrase();
		await this.getTextFeedbackManager().closeTextComponent();
		await this.getTextFeedbackManager().addTextComponent();
	}

	private renderForActiveState() {
		const kNoModels = 'No models to choose from',
			kNoTargets = 'No phrases to classify found',
			kHeading = this.state.status === 'using' ? 'Use a Model for Classification' : 'Test a Trained Model';
		let this_ = this;

		function propertyControl(listOfNames: string[], propName: string, prompt: string, noneFoundPrompt: string) {
			if (listOfNames.length === 1)
				this_[propName] = listOfNames[0];
			if (this_[propName] !== '') {
				return (
					<p>{prompt}<strong>{this_[propName]}</strong></p>
				);
			} else if (listOfNames.length === 0) {
				return (
					<p>{prompt}<em>{noneFoundPrompt}</em></p>
				)
			} else {
				return (
					<DropdownButton as={ButtonGroup} key='Secondary'
													title="Choose One" size="sm" variant="secondary">
						{listOfNames.map((aName, iIndex) => {
							return <Dropdown.Item as="button" key={String(iIndex)}
																		eventKey={aName} onSelect={(iName: any) => {
								this_[propName] = iName;
								this_.setState({count: this_.state.count + 1})
							}
							}>
								{aName}</Dropdown.Item>
						})}
					</DropdownButton>
				);
			}
		}

		function modelControl() {
			return propertyControl(this_.modelDatasetNames, 'modelsDatasetName', 'Model to use: ',
				kNoModels);
		}

		function targetControl() {
			return propertyControl(this_.targetDatasetNames, 'targetDatasetName', 'Phrases to classify: ',
				kNoTargets);
		}

		function doItButton() {
			if (this_.targetDatasetName === '' && this_.modelsDatasetName === '') {
				return (
					<div>
						<p>Cannot classify without both a model and phrases.</p>
					</div>
				);
			} else 			if (this_.targetDatasetName === '') {
				return (
					<div>
						<p>Cannot classify without phrases.</p>
					</div>
				);
			} else if (this_.modelsDatasetName === '') {
				return (
					<div>
						<p>Cannot classify without a model.</p>
					</div>
				);
			} else {
				return (
					<div>
						<br/><br/>
						<Button onClick={() => {
							this_.classify();
						}} variant="outline-primary">Classify!</Button>
					</div>
				);
			}

		}

		return (<div className='sq-options'>
			<p><strong>{kHeading}</strong></p>
			{targetControl()}
			{modelControl()}
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
