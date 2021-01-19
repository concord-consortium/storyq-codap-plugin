import React, {Component} from 'react';
import pluralize from 'pluralize';
//import naiveBaseClassifier from './lib/NaiveBayesClassifier';
import codapInterface, {CODAP_Notification} from "./lib/CodapInterface";
import {getDatasetNames, getSelectedCasesFrom} from './lib/codap-helper';
import Dropdown from 'react-bootstrap/Dropdown';
import DropdownButton from 'react-bootstrap/DropdownButton';
import ButtonGroup from "react-bootstrap/esm/ButtonGroup";
import 'bootstrap/dist/css/bootstrap.min.css';
import {textToObject, phraseToFeatures} from "./utilities";
import {oneHot} from "./lib/one_hot";
import './storyq.css';
import NaiveBayesClassifier from "./lib/NaiveBayesClassifier";
import {LogisticRegression} from './lib/jsregression';
import {HeadingsManager, PhraseTriple, ClassLabel, HeadingSpec} from "./headings_manager";

// import tf from "@tensorflow/tfjs";

export interface StorageCallbackFuncs {
	createStorageCallback: ()=> any,
	restoreStorageCallback: ( iStorage:any)=> void
}

export interface FM_Props {
	status:string, setStorageCallbacks:(iCallbacks: StorageCallbackFuncs)=>void
}

interface FMStorage {
	datasetName: string | null,
	collectionName: string,
	targetAttributeName: string,
	targetCaseCount: number,
	targetCategories: string[],
	classAttributeName: string,
	modelsDatasetName: string,
	modelsDatasetID: number,
	featureCollectionName: string,
	modelCurrentParentCaseID: number,
	modelCollectionName: string,
	featureCaseCount: number,
	textComponentName: string,
	textComponentID: number,
	modelAccuracy:number,
	modelKappa:number,
	modelThreshold:number,
	status: string

}

export class FeatureManager extends Component<FM_Props, {
	status:string,
	count:number,
	iterations:number,
	frequencyThreshold:number,
	showWeightsGraph:boolean
}> {
	private targetDatasetName:string | null = '';
	private datasetNames:string[] = [];
	private targetCollectionName = '';
	private targetAttributeName = '';
	private targetPredictedLabelAttributeName = 'predicted label';
	private classAttributeName = '';
	private targetCaseCount = 0;
	private targetCategories:string[] = [];
	private modelsDatasetName = 'Models';
	private modelsDatasetID = 0;
	private modelCollectionName = 'models';
	private modelCurrentParentCaseID = 0;
	private featureCollectionName = 'features';
	private featureCaseCount = 0;
	private textComponentName = 'Selected';
	private textComponentID = 0;
	private subscriberIndex:number | null = null;
	private nbClassifier: NaiveBayesClassifier;
	// Some flags to prevent recursion in selecting features or target cases
	private isSelectingTargetPhrases = false;
	private isSelectingFeatures = false;
	private featureTokenArray:any[] = [];	// Used during feedback process
	// private logisticModel: tf.Sequential = new tf.Sequential();
	// @ts-ignore
	private logisticModel:LogisticRegression = new LogisticRegression({
		alpha: 1,
		iterations: 100,
		lambda: 0.0,
		accuracy: 0,
		kappa: 0,
		threshold: 0.5,
		trace: false,
		progressCallback: this.handleFittingProgress.bind(this)
	});
	private feedbackNames = {
		dataContextName: 'FittingFeedback',
		collectionName: 'iterations',
		iterationName: 'iteration',
		costName: 'cost'
	};
	private headingsManager:HeadingsManager | null = null;

	constructor(props: FM_Props) {
		super(props);
		this.state = {
			status: props.status,
			count: 0,
			iterations: 50,
			frequencyThreshold: 4,
			showWeightsGraph: false
		};
		this.extract = this.extract.bind(this);
		this.handleNotification = this.handleNotification.bind(this);
		this.createStorage = this.createStorage.bind(this);
		this.restoreStorage = this.restoreStorage.bind(this);
		this.createFeatureDataset = this.createFeatureDataset.bind(this);
		props.setStorageCallbacks( {
			createStorageCallback: this.createStorage,
			restoreStorageCallback: this.restoreStorage
		});

	}

	public async componentDidMount() {
		this.datasetNames = await getDatasetNames();
		this.subscriberIndex = codapInterface.on('notify', '*', '', this.handleNotification);
		this.nbClassifier = new NaiveBayesClassifier();
		this.setState({status: this.state.status, count: this.state.count + 1 })
	}

	public createStorage():FMStorage {
		return {
			datasetName: this.targetDatasetName,
			collectionName: this.targetCollectionName,
			targetAttributeName: this.targetAttributeName,
			targetCaseCount: this.targetCaseCount,
			targetCategories: this.targetCategories,
			classAttributeName: this.classAttributeName,
			modelsDatasetName: this.modelsDatasetName,
			modelsDatasetID: this.modelsDatasetID,
			modelCollectionName: this.modelCollectionName,
			modelCurrentParentCaseID: this.modelCurrentParentCaseID,
			featureCollectionName: this.featureCollectionName,
			featureCaseCount: this.featureCaseCount,
			textComponentName: this.textComponentName,
			textComponentID: this.textComponentID,
			modelAccuracy: this.logisticModel.accuracy,
			modelKappa: this.logisticModel.kappa,
			modelThreshold: this.logisticModel.threshold,
			status: this.state.status
		}
	}

	public restoreStorage( iStorage:FMStorage) {
		this.targetDatasetName = iStorage.datasetName;
		this.targetCollectionName = iStorage.collectionName;
		this.targetAttributeName = iStorage.targetAttributeName;
		this.targetCaseCount = iStorage.targetCaseCount;
		this.targetCategories = iStorage.targetCategories;
		this.classAttributeName = iStorage.classAttributeName;
		this.modelsDatasetName = iStorage.modelsDatasetName;
		this.modelsDatasetID = iStorage.modelsDatasetID;
		this.modelCollectionName = iStorage.modelCollectionName;
		this.modelCurrentParentCaseID = iStorage.modelCurrentParentCaseID;
		this.featureCollectionName = iStorage.featureCollectionName;
		this.featureCaseCount = iStorage.featureCaseCount;
		this.textComponentName = iStorage.textComponentName;
		this.textComponentID = iStorage.textComponentID;
		this.logisticModel.accuracy = iStorage.modelAccuracy;
		this.logisticModel.kappa = iStorage.modelKappa;
		this.logisticModel.threshold = iStorage.modelThreshold;
		this.setState({status: iStorage.status || 'active', count: this.state.count})
	}

	/**
	 *
	 * @param iNotification    (from CODAP)
	 */
	private async handleNotification(iNotification: CODAP_Notification) {
		if (iNotification.action === 'notify' && iNotification.values.operation === 'dataContextCountChanged') {
			this.datasetNames = await getDatasetNames();
			this.setState({count: this.state.count + 1, status: this.state.status });
		}
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
	}

	private getHeadingsManager():HeadingsManager {
		if( !this.headingsManager) {
			this.headingsManager = new HeadingsManager(this.targetCategories[0], this.targetCategories[1],
				'Actual', 'Predicted');
		}
		return this.headingsManager;
	}

	/**
	 * Cause the text component to display phrases with the feature highlighting determined by
	 * 	given function
	 * @param iPhraseTriples  Specifications for the phrases to be displayed
	 * @param iFeatures {string[]}	The features to be highlighted
	 * @param iHighlightFunc {Function}	Function called to do the highlighting
	 * @private
	 */
	private async composeText(iPhraseTriples: PhraseTriple[], iFeatures: string[], iHighlightFunc: Function) {
		let this_ = this;
		const kHeadingsManager = this.getHeadingsManager();
		const kProps = ['negNeg', 'negPos', 'posNeg', 'posPos'];
		// @ts-ignore
		const kHeadings: HeadingSpec = kHeadingsManager.headings;
		let tClassItems = {
				negNeg: [],
				negPos: [],
				posNeg: [],
				posPos: []
			},
			tItems: any = [];


		function addOnePhrase(iTriple: PhraseTriple) {
			// @ts-ignore
			const kLabels: ClassLabel = kHeadingsManager.classLabels;

			let tGroup: string,
					tColor:string = '';
			switch (iTriple.actual) {
				case kLabels.negLabel:
					switch (iTriple.predicted) {
						case kLabels.negLabel:
							tGroup = 'negNeg';
							// @ts-ignore
							tColor = this_.headingsManager.colors.green;
							break;
						case kLabels.posLabel:
							tGroup = 'negPos';
							// @ts-ignore
							tColor = this_.headingsManager.colors.red;
					}
					break;
				case kLabels.posLabel:
					switch (iTriple.predicted) {
						case kLabels.negLabel:
							tGroup = 'posNeg';
							// @ts-ignore
							tColor = this_.headingsManager.colors.red;
							break;
						case kLabels.posLabel:
							tGroup = 'posPos';
							// @ts-ignore
							tColor = this_.headingsManager.colors.green;
					}
			}
			const tSquare = {
				text: '■ ',
				color: tColor
			}
			// @ts-ignore
			tClassItems[tGroup].push({
				type: 'list-item',
				children: [tSquare].concat(iHighlightFunc(iTriple.phrase, iFeatures))
			});
		}

		iPhraseTriples.forEach(iTriple => {
			addOnePhrase(iTriple);
		});

		// The phrases are all in their groups. Create the array of group objects
		kProps.forEach(iProp => {
			// @ts-ignore
			let tPhrases = tClassItems[iProp];
			if (tPhrases.length !== 0) {
				let tHeadingItems = [
					// @ts-ignore
					kHeadings[iProp],
					{
						type: 'bulleted-list',
						// @ts-ignore
						children: tClassItems[iProp]
					}];
				tItems = tItems.concat(tHeadingItems);
			}
		});
		if (tItems.length === 0)
			this.clearText();
		else {
			// Send it all off to the text object
			await codapInterface.sendRequest({
				action: 'update',
				resource: `component[${this.textComponentID}]`,
				values: {
					text: {
						document: {
							children: tItems,
							objTypes: {
								'list-item': 'block',
								'bulleted-list': 'block',
								'paragraph': 'block'
							}
						}
					}
				}
			});
		}

	}

	/**
	 * If the Features dataset has cases selected, for each selected case
	 * 	- Pull out the array of 'usages' - the the case IDs of the cases in the dataset being analyzed
	 * 	- Select these cases in that dataset
	 * 	- Pull the phrase from the target case
	 */
	private async handleFeatureSelection() {
		let tSelectedCases = await getSelectedCasesFrom(this.modelsDatasetName);
		let tFeatures: string[] = [],
			tUsedIDsSet: Set<number> = new Set();
		tSelectedCases.forEach((iCase: any) => {
			var tUsages = iCase.values.usages;
			if( typeof tUsages === 'string' && tUsages.length > 0) {
				(JSON.parse( tUsages)).forEach((anID: number) => {
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
		let tTriples:{ actual:string, predicted:string, phrase:string}[] = [];
		const tTargetPhrasesToShow = Math.min( tUsedCaseIDs.length, 20);
		// Here is where we put the contents of the text component together
		for (let i = 0; i < tTargetPhrasesToShow; i++) {
			let tGetCaseResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${this.targetDatasetName}].collection[${this.targetCollectionName}].caseByID[${tUsedCaseIDs[i]}]`
			});
			let tActualClass = tGetCaseResult.values.case.values[this.classAttributeName];
			let tPredictedClass = tGetCaseResult.values.case.values[this.targetPredictedLabelAttributeName];
			let tPhrase = tGetCaseResult.values.case.values[this.targetAttributeName];
			tTriples.push({actual: tActualClass, predicted: tPredictedClass, phrase: tPhrase});
		}
		await this.composeText(tTriples, tFeatures, textToObject);
	}

	private async clearText() {
		await codapInterface.sendRequest({
			action: 'update',
			resource: `component[${this.textComponentID}]`,
			values: {
				text: {
					document: {
						children: [
							{
								type: "paragraph",
								children: [
									{
										text: `This is where selected ${pluralize(this.targetAttributeName)} appear.`
									}
								]
							}
						],
						objTypes: {
							"paragraph": "block"
						}
					}
				}
			}
		});
	}

	/**
	 * First, For each selected target phrase, select the cases in the Feature dataset that contain the target
	 * case id.
	 * Second, under headings for the classification, display each selected target phrase as text with
	 * features highlighted and non-features grayed out
	 */
	private async handleTargetSelection() {
		let this_ = this,
			tSelectedTargetCases:any = await getSelectedCasesFrom(this.targetDatasetName),
			tTargetTriples:PhraseTriple[] = [],
			tIDsOfFeaturesToSelect:number[] = [];
		tSelectedTargetCases.forEach((iCase:any)=> {
			let tFeatureIDs:number[] = JSON.parse(iCase.values.featureIDs);
			tIDsOfFeaturesToSelect = tIDsOfFeaturesToSelect.concat(tFeatureIDs);
			tTargetTriples.push({
				actual: iCase.values[this_.classAttributeName],
				predicted: iCase.values[this_.targetPredictedLabelAttributeName],
				phrase: iCase.values[this_.targetAttributeName]
			});
		});
		// Select the features
		await codapInterface.sendRequest({
			action: 'create',
			resource: `dataContext[${this.modelsDatasetName}].selectionList`,
			values: tIDsOfFeaturesToSelect
		});
		// Get the features and stash them in a set
		let tSelectedFeatureCases:any = await getSelectedCasesFrom(this.modelsDatasetName),
				tFeatures = new Set<string>(),
				tFeaturesArray:string[] = [];
		tSelectedFeatureCases.forEach((iCase:any)=>{
			tFeatures.add(iCase.values.feature);
		});
		tFeatures.forEach(iFeature=>{
			tFeaturesArray.push(iFeature);
		});
		this.composeText( tTargetTriples, tFeaturesArray, phraseToFeatures);
	}

	private async getCaseCount(): Promise<number> {
		const tCountResult:any = await codapInterface.sendRequest(
			{
				action: 'get',
				resource:`dataContext[${this.targetDatasetName}].collection[${this.targetCollectionName}].caseCount`
			}
		)
			.catch(() => { console.log('Error getting case count')});
		return tCountResult.values;
	}

	private async setupFeedbackDataset() {
		const tContextList:any = await codapInterface.sendRequest( {
			action: 'get',
			resource: 'dataContextList'
		});
		let tAlreadyPresent = tContextList.values.findIndex((iValue:any)=>{
						return iValue.name === this.feedbackNames.dataContextName;
					}) >= 0;
		if( !tAlreadyPresent) {
			await codapInterface.sendRequest( {
				action: 'create',
				resource: 'dataContext',
				values: {
					name: this.feedbackNames.dataContextName,
					collections: [ {
						name: this.feedbackNames.collectionName,
						attrs: [
							{ name: this.feedbackNames.iterationName,
							description: 'For each iteration a new set of weights is computed with the intent of improving the fit as measured by the cost.'},
							{ name: this.feedbackNames.costName,
							description: 'The cost is a measure of how how poorly the model fits the data. Lower cost means better fit.'}
						]
					}],
				}
			});
		}
	}

	private async makeFeedbackGraphs():Promise<string> {
		await codapInterface.sendRequest([
			{
				action: 'create',
				resource: 'component',
				values: {
					type: 'graph',
					name: 'Fitting Progress',
					dimensions: {
						width: 200,
						height: 200
					},
					dataContext: this.feedbackNames.dataContextName,
					xAttributeName: this.feedbackNames.iterationName,
					yAttributeName: this.feedbackNames.costName,
				}
			},
			{
				action: 'create',
				resource: 'component',
				values: {
					type: 'graph',
					name: 'Trial Weights by iteration',
					dimensions: {
						width: 200,
						height: 250
					},
					dataContext: this.modelsDatasetName,
					xAttributeName: 'iteration',
					yAttributeName: 'trialWeight',
				}
			}
		]);
		return 'made graph';
	}

	private async handleFittingProgress (iIteration:number, iCost:number, iWeights:number[]):Promise<string> {
		if( iIteration === 3) {
			await this.makeFeedbackGraphs();
		}
		let tCaseValues:any = {};
		tCaseValues[this.feedbackNames.iterationName] = iIteration;
		tCaseValues[this.feedbackNames.costName] = iCost;
		await codapInterface.sendRequest({
			action: 'create',
			resource: `dataContext[${this.feedbackNames.dataContextName}].collection[${this.feedbackNames.collectionName}].case`,
			values: [{
				values: tCaseValues
			}]
		});

		// Add the given weights to the child collection of the Features dataset
		// iWeights and this.featureTokenArray must be parallel so we can stash the current values of weights in the
		//		child collection of the Features collection
		let tCasesToAdd:any[] = [];
		for( let i = 0; i < iWeights.length && i < this.featureTokenArray.length; i++) {
			tCasesToAdd.push({ parent: this.featureTokenArray[i].featureCaseID,
													values: { iteration: iIteration, trialWeight: iWeights[i]}})
		}
		await codapInterface.sendRequest({
			action: 'create',
			resource: `dataContext[${this.modelsDatasetName}].collection[iterations].case`,
			values: tCasesToAdd
		});
		return 'cases added';
	}

	/**
	 * Add attributes for predicted label and for probability. Compute and stash values.
	 * @param iTools
	 * @private
	 */
	private async showPredictedLabels(iTools:{
				logisticModel: any,	// Will compute probabilities
				oneHotData: number[][],
				documents: any,
				tokenArray: any,
				classNames: string[]
			})
	{
		let tOneHotLength = iTools.oneHotData[0].length,
				tPosProbs:number[] = [],
				tNegProbs:number[] = [],
				tMapFromCaseIDToProbability:any = {};

		function findThreshold(): { threshold:number, accuracy:number, kappa:number } {
			// Determine the probability threshold that yields the fewest discrepant classifications
			// First compute the probabilities separating them into two arrays
			iTools.documents.forEach((aDoc:any, iIndex:number)=>{
				let tProbability:number = iTools.logisticModel.transform(iTools.oneHotData[iIndex]),
					tActual = iTools.oneHotData[iIndex][ tOneHotLength - 1];
				if( tActual) {
					tPosProbs.push(tProbability);
				}
				else {
					tNegProbs.push(tProbability);
				}
				// We will have to be able to lookup the probability later
				tMapFromCaseIDToProbability[aDoc.caseID] = tProbability;
			});
			tPosProbs.sort();
			tNegProbs.sort();
			let tCurrValue = tPosProbs[0],
				tNegLength = tNegProbs.length,
				tCurrMinDiscrepancies:number,
				tStartingThreshold:number;

			// Return the index in tNegPros starting as given for the >= target probability
			function findNegIndex( iStarting:number, iTargetProb:number):number {
				while( tNegProbs[iStarting] < iTargetProb && iStarting < tNegLength) {
					iStarting++;
				}
				return iStarting;
			}
			let tNegIndex = tNegProbs.findIndex((v: number) => {
				return v > tCurrValue;
			});
			if(tNegIndex === -1) {
				// Negative and Positive probabilities don't overlap
				tCurrMinDiscrepancies = 0;
				tNegIndex = tNegLength;
				tStartingThreshold = (tNegProbs[tNegLength - 1] + tPosProbs[0]) / 2; // halfway
			}
			else {
				tCurrMinDiscrepancies = Number.MAX_VALUE;
				tStartingThreshold = tPosProbs[0];
			}
			tNegIndex = (tNegIndex === -1) ? tNegLength : tNegIndex;
			let tRecord = {
				posIndex: 0,	// Position at which we start testing for discrepancies
				negIndex: tNegIndex,
				currMinDescrepancies: tCurrMinDiscrepancies,
				threshold: tStartingThreshold
			};
			while(tRecord.negIndex < tNegLength) {
				let tCurrDiscrepancies = tRecord.posIndex + (tNegLength - tRecord.negIndex);
				if( tCurrDiscrepancies < tRecord.currMinDescrepancies) {
					tRecord.currMinDescrepancies = tCurrDiscrepancies;
					tRecord.threshold = tPosProbs[tRecord.posIndex];
				}
				tRecord.posIndex++;
				tRecord.negIndex = findNegIndex( tRecord.negIndex, tPosProbs[tRecord.posIndex]);
			}
			let tNumDocs = iTools.documents.length,
					tObserved = (tNumDocs - tRecord.currMinDescrepancies),
					tExpected = (tPosProbs.length * (tRecord.posIndex + tRecord.negIndex) +
												tNegLength * (tPosProbs.length - tRecord.posIndex + tNegLength - tRecord.negIndex)) / tNumDocs,
					tKappa = (tObserved - tExpected) / (tNumDocs - tExpected),
					tAccuracy = tObserved / tNumDocs;
			return { threshold: tRecord.threshold,
								accuracy: tAccuracy, kappa: tKappa };
		}

		// Create values of predicted label and probability for each document
		let tThresholdResult = findThreshold(),
				tLabelValues: { id: number, values: any	}[] = [];
		iTools.logisticModel.threshold = tThresholdResult.threshold;
		iTools.logisticModel.accuracy = tThresholdResult.accuracy;
		iTools.logisticModel.kappa = tThresholdResult.kappa;
		iTools.documents.forEach((aDoc:any)=>{
			let tProbability:number,
					tPredictedLabel,
					tValues:any = {},
					tProbName = `probability of ${iTools.classNames[1]}`;
			tProbability = tMapFromCaseIDToProbability[aDoc.caseID];
			tPredictedLabel = tProbability >= tThresholdResult.threshold ? iTools.classNames[1] : iTools.classNames[0];
			tValues[this.targetPredictedLabelAttributeName] = tPredictedLabel;
			tValues[tProbName] = tProbability;

			// For each document, stash the case ids of its features so we can link selection
			let tFeatureIDsForThisDoc:number[] = [];
			iTools.tokenArray.forEach((aToken:any)=>{
				if(aDoc.tokens.findIndex((iFeature:any)=>{
					return iFeature === aToken.token;
				})>=0) {
					tFeatureIDsForThisDoc.push(aToken.featureCaseID);
				}
			});
			tValues.featureIDs = JSON.stringify( tFeatureIDsForThisDoc);

			tLabelValues.push( {
				id: aDoc.caseID,
				values: tValues
			})
		});
		// Send the values to CODAP
		await codapInterface.sendRequest( {
			action: 'update',
			resource:`dataContext[${this.targetDatasetName}].collection[${this.targetCollectionName}].case`,
			values: tLabelValues
		});
	}



	private async getTargetCollectionNames(): Promise<string[]> {
		const tListResult:any = await codapInterface.sendRequest(
			{
				action: 'get',
				resource:`dataContext[${this.targetDatasetName}].collectionList`
			}
		)
			.catch(() => { console.log('Error getting collection name')});
		return tListResult.values.map((iValue:{name:string}) => { return iValue.name });
	}

	private async getAttributeNameByIndex(iIndex:number): Promise<string> {
		const tListResult:any = await codapInterface.sendRequest(
			{
				action: 'get',
				resource:`dataContext[${this.targetDatasetName}].collection[${this.targetCollectionName}].attributeList`
			}
		)
			.catch(() => { console.log('Error getting attribute list')});
		if( tListResult.values.length > iIndex)
			return tListResult.values[ iIndex].name;
		else return '';
	}

	private async addAttributesToTarget( iPredictionClass:string) {
		// Add the predicted label and probability attributes to the target collection
		await codapInterface.sendRequest(
			{
				action: 'create',
				resource:`dataContext[${this.targetDatasetName}].collection[${this.targetCollectionName}].attribute`,
				values: [
					{
						name: this.targetPredictedLabelAttributeName,
						description: 'The label predicted by the model'
					},
					{
						name: 'probability of ' + iPredictionClass,
						precision: 5,
						description: 'A computed probability based on the logistic regression model'
					},
					{
						name: 'featureIDs',
						hidden: true
					}
				]
			}
		)
			.catch(() => { console.log('Error showing adding target attributes')});

	}

	private async createFeatureDataset( iTokenArray:any[]) {
		let tModelsDataSetName = this.modelsDatasetName,
				tModelsCollectionName = this.modelCollectionName,
				tModelAttributes = [
					{ name: 'Model', description: 'Name of model. Can be edited.'},
					{ name: 'Training Set', editable: false, description: 'Name of dataset used for training'},
					{ name: 'Iterations', editable: false, description: 'Number of iterations used in training'},
					{ name: 'Frequency Threshold', editable: false, description: 'Number of times something has to appear to be counted as a feature'},
					{ name: 'Accuracy', editable: false, precision: 3,
						description: 'Proportion of correct labels predicted during training'},
					{ name: 'Kappa', editable: false, precision: 3,
						description: 'Proportion of correctly predicted labels accounting for chance'},
					{ name: 'Threshold', editable: false, precision: 4,
						description: 'Probability at which a case is labeled positively'}
				],
				tFeatureCollectionName = this.featureCollectionName,
				tFeatureAttributes = [
					{ name: "feature", description: `A feature is something that comes from the ${this.targetAttributeName} that can help in the classification process` },
					{ name: "type", description: `The kind of feature (unigram, bigram, count, …)` },
					{ name: "frequency", description: `The number of times the feature appears` },
					{ name: "usages", hidden: true },
					{ name: "weight",
						precision: 5,
						description: `A computed value that is proportional to the importance of the feature in the logistic regression classification model`}
				],
				tCollections = [ {
					name: tModelsCollectionName,
					title: tModelsCollectionName,
					parent: '',
					attrs: tModelAttributes
				},
					{
					name: tFeatureCollectionName,
					title: tFeatureCollectionName,
					parent: tModelsCollectionName,
					attrs: tFeatureAttributes
				}];
		if(this.logisticModel.trace)
			tCollections.push({
				name: 'iterations',
				title: 'iterations',
				parent: tFeatureCollectionName,
				attrs: [{name: 'iteration',
								description: 'In each iteration of improving the model\'s fit to the data new weights for the features are computed.'},
								{name:'trialWeight',
								description: 'In each iteration each feature is assigned a new trialWeight to improve the model\'s fit.',
								precision: 5}]
			});
		const tResult: any = await codapInterface.sendRequest(
			{
				action: "create",
				resource: "dataContext",
				values: {
					name: tModelsDataSetName,
					title: tModelsDataSetName,
					collections: tCollections
				}
			})
			.catch(() => {
				console.log(`Error creating feature dataset`);
			});
		this.modelsDatasetID = tResult.values.id;

		const tParentCaseResult: any = await codapInterface.sendRequest(
			{
				action: "create",
				resource: `dataContext[${tModelsDataSetName}].collection[${tModelsCollectionName}].case`,
				values: [{
					values: {
						Model: 'Model 1'
					}
				}]
			}
		)
			.catch((() => {
				console.log('Error creating parent model case')
			}));
		this.modelCurrentParentCaseID = tParentCaseResult.values[0].id;

		await codapInterface.sendRequest({
			action: 'create',
			resource: 'component',
			values: {
				type: 'caseTable',
				name: tModelsDataSetName,
				dataContext: tModelsDataSetName
			}
		});

		// Put together the values that will go into the features dataset
		let tFeaturesValues: any = [];
		iTokenArray.forEach((aToken) => {
			let tValues: any = {
				feature: aToken.token, type: 'unigram',
				frequency: aToken.count,
				usages: JSON.stringify(aToken.caseIDs),
			};

			tFeaturesValues.push({
				parent: this.modelCurrentParentCaseID,
				values: tValues
			});
		});
		this.featureCaseCount = iTokenArray.length;	// For feedback to user
		// Send the data to the feature dataset
		let tFeatureCaseIDs:any = await  codapInterface.sendRequest({
			action: 'create',
			resource: `dataContext[${this.modelsDatasetName}].collection[${this.featureCollectionName}].case`,
			values: tFeaturesValues
		});
		tFeatureCaseIDs = tFeatureCaseIDs.values.map((aResult:any)=> {
			return aResult.id;
		});
		// Add these feature case IDs to their corresponding tokens in the tokenArray
		for(let i = 0; i < tFeatureCaseIDs.length; i++) {
			iTokenArray[i].featureCaseID = tFeatureCaseIDs[i];
		}
	}

	private async updateWeights( iTokens:any, iWeights:number[]) {
		let tFeaturesValues:any[] = [];
		iTokens.forEach((aToken:any, iIndex:number) => {
			let tOneFeatureUpdate: any = {
				id: aToken.featureCaseID,
				values: {
					weight: iWeights[iIndex]
				}
			};
			tFeaturesValues.push( tOneFeatureUpdate);
		});
		codapInterface.sendRequest({
			action: 'update',
			resource: `dataContext[${this.modelsDatasetName}].collection[${this.featureCollectionName}].case`,
			values: tFeaturesValues
		});
	}

	/**
	 * Once we've completed training we can stash model information at the top level of the Models dataset
	 * @private
	 */
	private async updateModelTopLevelInfo() {
		const tModelsDataSetName = this.modelsDatasetName,
					tModelsCollectionName = this.modelCollectionName;
		await codapInterface.sendRequest( {
			action: "update",
			resource: `dataContext[${tModelsDataSetName}].collection[${tModelsCollectionName}].case`,
			values: [{
				id: this.modelCurrentParentCaseID,
				values: {
					"Training Set": this.targetDatasetName,
					"Iterations": this.state.iterations,
					"Frequency Threshold": this.state.frequencyThreshold,
					"Accuracy": this.logisticModel.accuracy,
					"Kappa": this.logisticModel.kappa,
					"Threshold": this.logisticModel.threshold
				}
			}]
		})
			.catch(() => {
				console.log('Error updating current model parent case')
			});
	}

	private async addFeatures( ) {
		this.logisticModel.trace = this.state.showWeightsGraph;
		this.logisticModel.iterations = this.state.iterations;
		this.targetCaseCount = await this.getCaseCount();
		let // tClassifier = this.nbClassifier,
				tDocuments: {example:string, class:string, caseID:number}[] = [],
				tZeroClassName: string,
				tOneClassName:string;
		// Grab the strings in the target collection that are the values of the target attribute.
		// Stash these in an array that can be used to produce a oneHot representation
		for (let i = 0; i < this.targetCaseCount; i++) {
			const tGetResult: any = await codapInterface.sendRequest({
				"action": "get",
				"resource": `dataContext[${this.targetDatasetName}].collection[${this.targetCollectionName}].caseByIndex[${i}]`
			})
				.catch(() => {
					console.log('unable to get case');
				});

			let tCaseID = tGetResult.values.case.id,
				tText: string = tGetResult.values.case.values[this.targetAttributeName],
				tClass: string = tGetResult.values.case.values[this.classAttributeName];
			// tClassifier.learn(tText, tClass);	// NaiveBayes can learn as we go along
			tDocuments.push({example: tText, class: tClass, caseID: tCaseID});
		}
		// Arbitrarily assume the first class name represents the "zero" class and the first
		// different class name represents the "one" class
		this.targetCategories[0] = tZeroClassName = tDocuments[0].class;
		let tDocOfOtherClass:any = tDocuments.find(aDoc=>{
			return aDoc.class !== tZeroClassName;
		});
		this.targetCategories[1] = tOneClassName = tDocOfOtherClass.class;

		// Now that we know the class name we're predicting, we can add attributes to the target dataset
		await this.addAttributesToTarget( tOneClassName);

		// Logistic can't happen until we've isolated the features and produced a oneHot representation
		// Also, the logisticModel.fit function requires that the class value (0 or 1) be the
		// last element of each oneHot.
		let tOneHot = oneHot({frequencyThreshold: this.state.frequencyThreshold - 1},
												tDocuments),
				tData:number[][] = [];
		tOneHot.oneHotResult.forEach(iResult=>{
			iResult.oneHotExample.push( iResult.class === tZeroClassName ? 0 : 1);
			tData.push(iResult.oneHotExample);
		});

		// By creating the features data set now we give the user an indication that something is happening
		await this.createFeatureDataset( tOneHot.tokenArray);
		// We have to stash the tokenArray for use in handleFittingProgress which is a callback
		this.featureTokenArray = tOneHot.tokenArray;

		// Fit a logistic model to the data
		if( this.logisticModel.trace) {
			await this.setupFeedbackDataset(); // So we can display fitting progress as a graph
		}
		let tTrainedModel:any = await this.logisticModel.fit(tData);
		await this.updateWeights(tOneHot.tokenArray, tTrainedModel.theta);

		// In the target dataset we're going to add two attributes: "predicted label" and "probability of clickbait"
		// We pass along some tools that will be needed
		let tPredictionTools = {
			logisticModel: this.logisticModel,
			oneHotData: tData,
			documents: tDocuments,
			tokenArray: tOneHot.tokenArray,
			classNames: [tZeroClassName, tOneClassName]
		}
		await this.showPredictedLabels(tPredictionTools);

		await this.updateModelTopLevelInfo();

		// Clean up a bit
		this.featureTokenArray = [];
	}

	private async addTextComponent() {
		this.textComponentName = 'Selected ' + pluralize(this.targetAttributeName);
		let tResult:any = await codapInterface.sendRequest( {
			action: 'create',
			resource: 'component',
			values: {
				type: 'text',
				name: this.textComponentName,
				title: this.textComponentName,
				dimensions: {
					width: 500,
					height: 150
				},
				position: 'top'
			}
		});
		this.textComponentID = tResult.values.id
		this.clearText();
	}

	private async extract(iTargetDatasetName: string | null) {
		this.targetDatasetName = iTargetDatasetName;
		let tCollectionNames = await this.getTargetCollectionNames();
		// todo: arbitrary assumption that target dataset is initially flat
		if( tCollectionNames.length === 1) {
			this.targetCollectionName = tCollectionNames[0];
			// todo: arbitrary assumption of column positions!
			this.targetAttributeName = await this.getAttributeNameByIndex(0);
			this.classAttributeName = await this.getAttributeNameByIndex(1);
			await this.addFeatures();
			await this.addTextComponent();
			this.setState({count: this.state.count + 1, status: 'finished'});
		}
		else {
			this.setState({count: this.state.count + 1, status:'error'})
		}
	}

	private renderForActiveState() {
		let dataSetControl:any,
				tNumNames = this.datasetNames.length;
		if( tNumNames === 0) {
			dataSetControl = <p>-- No datasets found --</p>
		}
		else if (tNumNames === 1) {
			let this_ = this,
					tName = this.datasetNames[0];
			dataSetControl =
				<button
					className= 'sq-button'
					onClick={() => {
						this_.extract(tName);
					}}
				>Analyze {tName}
				</button>
		}
		else {
			dataSetControl = <DropdownButton as={ButtonGroup} key='Secondary'
																			 title="Choose One" size="sm" variant="secondary">
				{this.datasetNames.map((aName, iIndex) => {
					return <Dropdown.Item as="button" key={String(iIndex)}
																eventKey={aName} onSelect={this.extract}>
						{aName}</Dropdown.Item>
				})}
			</DropdownButton>
		}
		return (<div className='sq-options'>
			<p>Extract features and train model for a dataset.</p>
			<p> {'Iterations: '}
				<input
					className='sq-input'
					type="text"
					value={this.state.iterations}
					onChange={event => this.setState({iterations: Number(event.target.value)})}
				/>
			</p>
			<p> {'Frequency threshold: '}
				<input
					className='sq-input'
					type="text"
					value={this.state.frequencyThreshold}
					onChange={event => this.setState({frequencyThreshold: Number(event.target.value)})}
				/>
			</p>
			<p>
				<input
					type="checkbox"
					value=''
					onChange={event =>
						this.setState({showWeightsGraph: event.target.checked})}
				/>
				{' Show progress graphs'}
			</p>
			Dataset: {dataSetControl}

		</div>)
	}

	private renderForFinishedState() {
		return <div className={'sq-output'}>
			<p>Your analysis is finished!</p>
			<p>In <b>{this.targetDatasetName}</b> identified {this.featureCaseCount} <b>unigrams </b>
				in <b>{this.targetCaseCount} {pluralize(this.targetAttributeName)}</b>.</p>
			<p>Feature weights were computed by a logistic regression model.</p>
			<p>Iterations = {this.state.iterations}</p>
			<p>Frequency threshold = {this.state.frequencyThreshold}</p>
			<p>Accuracy = {Math.round(this.logisticModel.accuracy * 1000)/1000}</p>
			<p>Kappa = {Math.round(this.logisticModel.kappa * 1000)/1000}</p>
			<p>Threshold = {Math.round(this.logisticModel.threshold * 10000)/10000}</p>
		</div>
	}

	private static renderForErrorState() {
		return <div>
			<p>Sorry but something isn't set up correctly.</p>
			<p>Currently we can only handle text analysis with a flat dataset with the text in the first
			column.</p>
		</div>
	}

	public render() {
		switch (this.state.status) {
			case 'error':
				return FeatureManager.renderForErrorState();
			case 'active':
				return this.renderForActiveState();
			case 'finished':
			default:
				return this.renderForFinishedState();
		}
	}
}
