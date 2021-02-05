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
	getDatasetNamesWithFilter, getSelectedCasesFrom, getAttributeNameByIndex
} from './lib/codap-helper';
import Dropdown from 'react-bootstrap/Dropdown';
import DropdownButton from 'react-bootstrap/DropdownButton';
import ButtonGroup from "react-bootstrap/esm/ButtonGroup";
import 'bootstrap/dist/css/bootstrap.min.css';
import {textToObject, phraseToFeatures} from "./utilities";
import {wordTokenizer} from "./lib/one_hot";
import './storyq.css';
import {LogitPrediction} from './lib/logit_prediction';
import {PhraseTriple} from "./headings_manager";
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
	modelDatasetName: string,
	modelCollectionName: string,
	modelCategories: string[],
	targetDatasetID: number,
	targetDatasetName: string,
	targetCollectionName: string,
	targetAttributeName: string,
	textComponentID: number,
	status: string
}

interface ClassificationModel {
	features: string[],
	weights: number[],
	labels: string[],
	threshold: number,
	constantWeightTerm: number,
	predictor: any
}

const kClassificationAttributeName = 'classification';
const kProbabilityAttributeName = 'prob of positive';

export class ClassificationManager extends Component<Classification_Props, {
	status: string,
	count: number
}> {
	[index: string]: any;

	private modelDatasetNames: string[] = [];
	private modelDatasetID = 0;
	private modelDatasetName: string = '';
	private modelCollectionName = 'models';
	private modelCategories: string[] = [];
	private targetDatasetNames: string[] = [];
	private targetDatasetID = -1
	private targetDatasetName: string = '';
	private targetCollectionName = '';
	private targetAttributeName = '';
	private textComponentName = 'Selected';
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

	/**
	 * Used to determine if an dataset name qualifies the dataset as containing one or more models.
	 * @param iValue
	 * @private
	 */
	private static isAModel(iValue: any): boolean {
		return iValue.title.toLowerCase().indexOf('model') >= 0;
	}

	private static isNotAModel(iValue: any): boolean {
		return iValue.title.toLowerCase().indexOf('model') < 0;
	}

	public async componentDidMount() {

		this.modelDatasetNames = await getDatasetNamesWithFilter(ClassificationManager.isAModel);
		this.targetDatasetNames = await getDatasetNamesWithFilter(ClassificationManager.isNotAModel);
		this.subscriberIndex = codapInterface.on('notify', '*', '', this.handleNotification);
		this.setState({status: this.state.status, count: this.state.count + 1})
	}

	public componentWillUnmount() {
		codapInterface.off(this.subscriberIndex);
	}

	public createStorage(): ClassificationStorage {
		return {
			modelDatasetID: this.modelDatasetID,
			modelDatasetName: this.modelDatasetName,
			modelCollectionName: this.modelCollectionName,
			modelCategories: this.modelCategories,
			targetDatasetID: this.targetDatasetID,
			targetDatasetName: this.targetDatasetName,
			targetCollectionName: this.targetCollectionName,
			targetAttributeName: this.targetAttributeName,
			textComponentID: this.textComponentID,
			status: this.state.status
		}
	}

	public restoreStorage(iStorage: ClassificationStorage) {
		this.modelDatasetID = iStorage.modelDatasetID;
		this.modelDatasetName = iStorage.modelDatasetName;
		this.modelCollectionName = iStorage.modelCollectionName;
		this.modelCategories = iStorage.modelCategories;
		this.targetDatasetID = iStorage.targetDatasetID;
		this.targetDatasetName = iStorage.targetDatasetName;
		this.targetCollectionName = iStorage.targetCollectionName;
		this.targetAttributeName = iStorage.targetAttributeName;
		this.textComponentID = iStorage.textComponentID;
		this.setState({status: iStorage.status || 'active', count: this.state.count})
	}

	private getTextFeedbackManager(): TextFeedbackManager {
		if (!this.textFeedbackManager) {
			this.textFeedbackManager = new TextFeedbackManager(this.modelCategories, this.targetAttributeName);
		}
		return this.textFeedbackManager;
	}

	/**
	 *
	 * @param iNotification    (from CODAP)
	 */
	private async handleNotification(iNotification: CODAP_Notification) {
		if (iNotification.action === 'notify' && iNotification.values.operation === 'dataContextCountChanged') {
			this.modelDatasetNames = await getDatasetNamesWithFilter(this.isAModel);
			this.targetDatasetNames = await getDatasetNamesWithFilter(this.isNotAModel)
			this.setState({count: this.state.count + 1, status: this.state.status});
		}
		/*
				else if(iNotification.action === 'notify' && iNotification.values.operation === 'selectCases') {
					// @ts-ignore
					let tDataContextName:string = iNotification.resource && iNotification.resource.match(/\[(.+)]/)[1];
					if( tDataContextName === this.modelsDatasetName && !this.isSelectingFeatures) {
						this.isSelectingTargetPhrases = true;
						await this.handleFeatureSelection();
						this.isSelectingTargetPhrases = false;
					}
					else if( tDataContextName === this.targetDatasetName && !this.isSelectingTargetPhrases) {
						this.isSelectingFeatures = true;
						await this.handleTargetSelection();
						this.isSelectingFeatures = false;
					}
				}
		*/
	}

	/**
	 * If the Features dataset has cases selected, for each selected case
	 * 	- Pull out the array of 'usages' - the the case IDs of the cases in the dataset being analyzed
	 * 	- Select these cases in that dataset
	 * 	- Pull the phrase from the target case
	 */
	private async handleFeatureSelection() {
		let tSelectedCases = await getSelectedCasesFrom(this.modelDatasetName);
		let tFeatures: string[] = [],
			tUsedIDsSet: Set<number> = new Set();
		tSelectedCases.forEach((iCase: any) => {
			let tUsages = iCase.values.usages;
			if (typeof tUsages === 'string' && tUsages.length > 0) {
				(JSON.parse(tUsages)).forEach((anID: number) => {
					tUsedIDsSet.add(anID);
				});
			}
			tFeatures.push(iCase.values.feature);
		});
		let tUsedCaseIDs: number[] = Array.from(tUsedIDsSet);
		await codapInterface.sendRequest({
			action: 'create',
			resource: `dataContext[${this.targetDatasetName}].selectionList`,
			values: tUsedCaseIDs
		});
		let tTriples: { actual: string, predicted: string, phrase: string }[] = [];
		const tTargetPhrasesToShow = Math.min(tUsedCaseIDs.length, 20);
		// Here is where we put the contents of the text component together
		for (let i = 0; i < tTargetPhrasesToShow; i++) {
			let tGetCaseResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${this.targetDatasetName}].collection[${this.targetCollectionName}].caseByID[${tUsedCaseIDs[i]}]`
			});
			let tPhrase = tGetCaseResult.values.case.values[this.targetAttributeName];
			// tTriples.push({actual: tActualClass, predicted: tPredictedClass, phrase: tPhrase});
		}
		await this.getTextFeedbackManager().composeText(tTriples, tFeatures, textToObject);
	}

	/**
	 * First, For each selected target phrase, select the cases in the Feature dataset that contain the target
	 * case id.
	 * Second, under headings for the classification, display each selected target phrase as text with
	 * features highlighted and non-features grayed out
	 */
	private async handleTargetSelection() {
		let this_ = this,
			tSelectedTargetCases: any = await getSelectedCasesFrom(this.targetDatasetName),
			tTargetTriples: PhraseTriple[] = [],
			tIDsOfFeaturesToSelect: number[] = [];
		tSelectedTargetCases.forEach((iCase: any) => {
			let tFeatureIDs: number[] = JSON.parse(iCase.values.featureIDs);
			tIDsOfFeaturesToSelect = tIDsOfFeaturesToSelect.concat(tFeatureIDs);
			/*
						tTargetTriples.push({
							actual: iCase.values[this_.classAttributeName],
							predicted: iCase.values[this_.targetPredictedLabelAttributeName],
							phrase: iCase.values[this_.targetAttributeName]
						});
			*/
		});
		// Select the features
		await codapInterface.sendRequest({
			action: 'create',
			resource: `dataContext[${this.modelDatasetName}].selectionList`,
			values: tIDsOfFeaturesToSelect
		});
		// Get the features and stash them in a set
		let tSelectedFeatureCases: any = await getSelectedCasesFrom(this.modelDatasetName),
			tFeatures = new Set<string>(),
			tFeaturesArray: string[] = [];
		tSelectedFeatureCases.forEach((iCase: any) => {
			tFeatures.add(iCase.values.feature);
		});
		tFeatures.forEach(iFeature => {
			tFeaturesArray.push(iFeature);
		});
		await this.getTextFeedbackManager().composeText(tTargetTriples, tFeaturesArray, phraseToFeatures);
	}

	private async addAttributesToTarget() {
		// Add the predicted label attribute to the target collection
		await codapInterface.sendRequest(
			{
				action: 'create',
				resource: `dataContext[${this.targetDatasetName}].collection[${this.targetCollectionName}].attribute`,
				values: [
					{
						name: kClassificationAttributeName,
						description: 'The label predicted by the model'
					},
					{
						name: kProbabilityAttributeName,
						description: 'The probability predicted by the model that the classification is positive',
						precision: 5
					},
					{
						name: 'featureIDs',
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
				labels: [],
				threshold: 0.5,
				constantWeightTerm: 0,
				predictor: null
			},
			tLabelValues: { id: number, values: any	}[] = [];

		async function buildModelFromDataset() {
			let tModelCollectionNames = await getCollectionNames(this_.modelDatasetName),
					tModelParentCollectionName = tModelCollectionNames[0];
			this_.modelCollectionName = tModelCollectionNames.pop() || 'cases';
			let tCaseCount = await getCaseCount(this_.modelDatasetName, this_.modelCollectionName);
			for (let i = 0; i < tCaseCount; i++) {
				const tGetResult: any = await codapInterface.sendRequest({
					"action": "get",
					"resource": `dataContext[${this_.modelDatasetName}].collection[${this_.modelCollectionName}].caseByIndex[${i}]`
				})
					.catch(() => {
						console.log('unable to get feature');
					});

				tModel.features.push(tGetResult.values.case.values['feature']);
				tModel.weights.push(tGetResult.values.case.values['weight']);
			}
			const tParentCaseResult: any = await codapInterface.sendRequest( {
				"action": "get",
				"resource": `dataContext[${this_.modelDatasetName}].collection[${tModelParentCollectionName}].caseByIndex[0]`
			})
				.catch((e) => {
					console.log(`Error ${e} while getting parent case`);
				});
			let tLabels = tParentCaseResult.values.case.values['Classes'] || `["negative", "positive"]`;
			tModel.labels = JSON.parse(tLabels);
			tModel.threshold = tParentCaseResult.values.case.values['Threshold'];
			tModel.constantWeightTerm = tParentCaseResult.values.case.values['Constant Weight'];
			tModel.predictor = new LogitPrediction( tModel.constantWeightTerm, tModel.weights, tModel.threshold);
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
				let tPhrase = tGetResult.values.case.values[this_.targetAttributeName],
						tGiven = Array(tModel.features.length).fill(0);
				// Find the index of each feature the phrase
				wordTokenizer(tPhrase).forEach((iFeature) => {
					let tIndex = tModel.features.indexOf(iFeature);
					if( tIndex >= 0)
						tGiven[tIndex] = 1;
				});
				let tCaseValues:{[key: string]: string} = {},
						tPrediction = tModel.predictor.predict( tGiven);
				tCaseValues[kClassificationAttributeName] = tPrediction.class ?
					tModel.labels[1] : tModel.labels[0];
				tCaseValues[kProbabilityAttributeName] = tPrediction.probability;
				tLabelValues.push({
					id: tGetResult.values.case.id,
					values: tCaseValues
				}) ;
			}
			// Send the values to CODAP
			await codapInterface.sendRequest( {
				action: 'update',
				resource:`dataContext[${this_.targetDatasetName}].collection[${this_.targetCollectionName}].case`,
				values: tLabelValues
			});
		}

		this.targetCollectionName = (await getCollectionNames(this.targetDatasetName)).pop() || 'cases';
		this.targetAttributeName = await getAttributeNameByIndex( this.targetDatasetName || '',
			this.targetCollectionName, 0);

		await buildModelFromDataset();
		await this.addAttributesToTarget();
		await classifyEachPhrase();
	}

	private renderForActiveState() {
		const kNoModels = 'No models to choose from',
			kNoTargets = 'No phrases to classify found';
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
			return propertyControl(this_.modelDatasetNames, 'modelDatasetName', 'Model to use: ',
				kNoModels);
		}

		function targetControl() {
			return propertyControl(this_.targetDatasetNames, 'targetDatasetName', 'Phrases to classify: ',
				kNoTargets);
		}

		function doItButton() {
			if (this_.targetDatasetName === '') {
				return (
					<div>
						<p>Cannot classify without phrases.</p>
					</div>
				);
			} else if (this_.modelDatasetName === '') {
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
			<p><strong>Classification</strong></p>
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
