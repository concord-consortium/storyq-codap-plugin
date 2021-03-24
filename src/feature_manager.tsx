import React, {Component} from 'react';
import pluralize from 'pluralize';
import codapInterface, {CODAP_Notification} from "./lib/CodapInterface";
import {
	addAttributesToTarget, deselectAllCasesIn,
	getCaseCount, getCollectionNames,
	getDatasetNamesWithFilter, isAModel,
	isNotAModel
} from './lib/codap-helper';
import Button from 'devextreme-react/button';
import {Accordion, Item} from 'devextreme-react/accordion';
import {SelectBox} from 'devextreme-react/select-box';
import {oneHot} from "./lib/one_hot";
import './storyq.css';
import {LogisticRegression} from './lib/jsregression';
import TextFeedbackManager, {TFMStorage} from "./text_feedback_manager";
import {ProgressBar} from "./progress_bar";
import {CheckBox} from "devextreme-react/check-box";
import {NumericInput} from "./numeric_input";

// import tf from "@tensorflow/tfjs";

export interface FM_StorageCallbackFuncs {
	createStorageCallback: () => any,
	restoreStorageCallback: (iStorage: any) => void
}

export interface FM_Props {
	status: string,
	setStorageCallbacks: (iCallbacks: FM_StorageCallbackFuncs) => void
}

interface FMStorage {
	textFeedbackManagerStorage: TFMStorage | null,
	datasetName: string | null,
	datasetNames: string[] | null,
	targetCollectionName: string,
	targetCollectionNames: string[],
	targetAttributeName: string,
	targetAttributeNames: string[],
	targetCaseCount: number,
	targetPositiveCategory: string,
	targetCategories: string[],
	targetColumnFeatureNames: string[],
	targetClassAttributeName: string,
	modelsDatasetName: string,
	modelsDatasetID: number,
	featureCollectionName: string,
	modelCurrentParentCaseID: number,
	modelCollectionName: string,
	featureCaseCount: number,
	modelAccuracy: number,
	modelKappa: number,
	modelThreshold: number,
	unigrams: boolean,
	useColumnFeatures: boolean,
	ignoreStopWords: boolean,
	lockIntercept: boolean,
	lockProbThreshold: boolean,
	status: string

}

export class FeatureManager extends Component<FM_Props, {
	status: string,
	count: number,
	unigrams: boolean,
	iterations: number,
	currentIteration: number,
	frequencyThreshold: number,
	useColumnFeatures: boolean,
	ignoreStopWords: boolean,
	lockIntercept: boolean,
	lockProbThreshold: boolean,
	showWeightsGraph: boolean
}> {
	[indexindex: string]: any;

	private updatePercentageFunc: ((p: number) => void) | null;
	public targetDatasetName: string | null = '';
	private datasetNames: string[] = [];
	public targetCollectionName = '';
	public targetCollectionNames: string[] = [];
	public targetAttributeName = '';
	private targetAttributeNames: string[] = [];
	public targetPredictedLabelAttributeName = 'predicted label';
	public targetClassAttributeName = '';
	private targetCaseCount = 0;
	private targetPositiveCategory = '';
	private targetCategories: string[] = [];
	private targetColumnFeatureNames: string[] = [];
	public modelsDatasetName = 'Models';
	private modelsDatasetID = 0;
	private modelCollectionName = 'models';
	private modelCurrentParentCaseID = 0;
	private featureCollectionName = 'features';
	private featureCaseCount = 0;
	private subscriberIndex: number = -1;
	// private nbClassifier: NaiveBayesClassifier;
	// Some flags to prevent recursion in selecting features or target cases
	private isSelectingTargetPhrases = false;
	private isSelectingFeatures = false;
	private featureTokenArray: any[] = [];	// Used during feedback process
	// private logisticModel: tf.Sequential = new tf.Sequential();
	// @ts-ignore
	private logisticModel: LogisticRegression = new LogisticRegression({
		alpha: 1,
		iterations: 100,
		lambda: 0.0,
		accuracy: 0,
		kappa: 0,
		threshold: 0.5,
		trace: false,
		progressCallback: this.progressBar.bind(this),
		feedbackCallback: this.handleFittingProgress.bind(this)
	});
	private feedbackNames = {
		dataContextName: 'FittingFeedback',
		collectionName: 'iterations',
		iterationName: 'iteration',
		costName: 'cost'
	};
	private textFeedbackManager: TextFeedbackManager | null = null;

	private kProbPredAttrNamePrefix = 'probability of ';

	constructor(props: FM_Props) {
		super(props);
		this.state = {
			status: props.status,
			count: 0,
			iterations: 50,
			unigrams: true,
			currentIteration: 0,
			frequencyThreshold: 4,
			useColumnFeatures: false,
			ignoreStopWords: false,
			lockIntercept: false,
			lockProbThreshold: false,
			showWeightsGraph: false
		};
		this.updatePercentageFunc = null;
		this.extract = this.extract.bind(this);
		this.handleNotification = this.handleNotification.bind(this);
		this.createStorage = this.createStorage.bind(this);
		this.restoreStorage = this.restoreStorage.bind(this);
		this.createModelsDataset = this.createModelsDataset.bind(this);
		this.setUpdatePercentageFunc = this.setUpdatePercentageFunc.bind(this);

	}

	public async componentDidMount() {
		this.props.setStorageCallbacks({
			createStorageCallback: this.createStorage,
			restoreStorageCallback: this.restoreStorage
		});
		await this.updateTargetNames();
		this.subscriberIndex = codapInterface.on('notify', '*', '', this.handleNotification);
		// this.nbClassifier = new NaiveBayesClassifier();
		this.setState({count: this.state.count + 1})
	}

	public async componentWillUnmount() {
		codapInterface.off(this.subscriberIndex);
		this.featureTokenArray = [];
		this.getTextFeedbackManager().closeTextComponent();
	}

	public createStorage(): FMStorage {
		return {
			textFeedbackManagerStorage: this.textFeedbackManager ? this.textFeedbackManager.createStorage() : null,
			datasetName: this.targetDatasetName,
			datasetNames: this.datasetNames,
			targetCollectionName: this.targetCollectionName,
			targetCollectionNames: this.targetCollectionNames,
			targetAttributeName: this.targetAttributeName,
			targetAttributeNames: this.targetAttributeNames,
			targetCaseCount: this.targetCaseCount,
			targetPositiveCategory: this.targetPositiveCategory,
			targetCategories: this.targetCategories,
			targetColumnFeatureNames: this.targetColumnFeatureNames,
			targetClassAttributeName: this.targetClassAttributeName,
			modelsDatasetName: this.modelsDatasetName,
			modelsDatasetID: this.modelsDatasetID,
			modelCollectionName: this.modelCollectionName,
			modelCurrentParentCaseID: this.modelCurrentParentCaseID,
			featureCollectionName: this.featureCollectionName,
			featureCaseCount: this.featureCaseCount,
			modelAccuracy: this.logisticModel.accuracy,
			modelKappa: this.logisticModel.kappa,
			modelThreshold: this.logisticModel.threshold,
			unigrams: this.state.unigrams,
			useColumnFeatures: this.state.useColumnFeatures,
			ignoreStopWords: this.state.ignoreStopWords,
			lockIntercept: this.state.lockIntercept,
			lockProbThreshold: this.state.lockProbThreshold,
			status: this.state.status
		}
	}

	public restoreStorage(iStorage: FMStorage) {
		this.targetDatasetName = iStorage.datasetName;
		this.datasetNames = iStorage.datasetNames || [];
		this.targetCollectionName = iStorage.targetCollectionName;
		this.targetCollectionNames = iStorage.targetCollectionNames || [];
		this.targetAttributeName = iStorage.targetAttributeName;
		this.targetAttributeNames = iStorage.targetAttributeNames || [];
		this.targetCaseCount = iStorage.targetCaseCount;
		this.targetPositiveCategory = iStorage.targetPositiveCategory;
		this.targetCategories = iStorage.targetCategories;
		this.targetColumnFeatureNames = iStorage.targetColumnFeatureNames || [];
		this.targetClassAttributeName = iStorage.targetClassAttributeName;
		this.modelsDatasetName = iStorage.modelsDatasetName;
		this.modelsDatasetID = iStorage.modelsDatasetID;
		this.modelCollectionName = iStorage.modelCollectionName;
		this.modelCurrentParentCaseID = iStorage.modelCurrentParentCaseID;
		this.featureCollectionName = iStorage.featureCollectionName;
		this.featureCaseCount = iStorage.featureCaseCount;
		this.logisticModel.accuracy = iStorage.modelAccuracy;
		this.logisticModel.kappa = iStorage.modelKappa;
		this.logisticModel.threshold = iStorage.modelThreshold;
		this.getTextFeedbackManager().restoreStorage(iStorage.textFeedbackManagerStorage);
		this.setState({unigrams: iStorage.unigrams});
		this.setState({useColumnFeatures: iStorage.useColumnFeatures || false});
		this.setState({ignoreStopWords: iStorage.ignoreStopWords || false});
		this.setState({lockIntercept: iStorage.lockIntercept || false});
		this.setState({lockProbThreshold: iStorage.lockProbThreshold || false});
		this.setState({status: iStorage.status || 'active'});
	}

	/**
	 *
	 * @param iNotification    (from CODAP)
	 */
	private async handleNotification(iNotification: CODAP_Notification) {
		if (iNotification.action === 'notify' && iNotification.values.operation === 'dataContextCountChanged') {
			this.datasetNames = await getDatasetNamesWithFilter(isNotAModel);
			if (this.state.status !== 'inProgress') {
				await this.updateTargetNames();
				this.setState({count: this.state.count + 1});
			}
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
		}
	}

	private getTextFeedbackManager(): TextFeedbackManager {
		if (!this.textFeedbackManager) {
			this.textFeedbackManager = new TextFeedbackManager(this.targetCategories, this.targetAttributeName);
		}
		return this.textFeedbackManager;
	}

	private async setupFeedbackDataset() {
		const tContextList: any = await codapInterface.sendRequest({
			action: 'get',
			resource: 'dataContextList'
		});
		let tAlreadyPresent = tContextList.values.findIndex((iValue: any) => {
			return iValue.name === this.feedbackNames.dataContextName;
		}) >= 0;
		if (!tAlreadyPresent) {
			await codapInterface.sendRequest({
				action: 'create',
				resource: 'dataContext',
				values: {
					name: this.feedbackNames.dataContextName,
					collections: [{
						name: this.feedbackNames.collectionName,
						attrs: [
							{
								name: this.feedbackNames.iterationName,
								description: 'For each iteration a new set of weights is computed with the intent of improving the fit as measured by the cost.'
							},
							{
								name: this.feedbackNames.costName,
								description: 'The cost is a measure of how how poorly the model fits the data. Lower cost means better fit.'
							}
						]
					}],
				}
			});
		}
	}

	private async makeFeedbackGraphs(): Promise<string> {
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

	private progressBar(iIteration: number) {
		let tPercentDone = Math.round(100 * iIteration / this.state.iterations);
		if (this.updatePercentageFunc)
			this.updatePercentageFunc(tPercentDone);
		this.setState({currentIteration: iIteration});
		if (iIteration >= this.state.iterations) {
			this.showResults();
		}
	}

	private async handleFittingProgress(iIteration: number, iCost: number, iWeights: number[]): Promise<string> {
		if (this.state.showWeightsGraph) {
			if (iIteration === 3) {
				await this.makeFeedbackGraphs();
			}
			let tCaseValues: any = {};
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
			let tCasesToAdd: any[] = [];
			for (let i = 0; i < iWeights.length && i < this.featureTokenArray.length; i++) {
				tCasesToAdd.push({
					parent: this.featureTokenArray[i].featureCaseID,
					values: {iteration: iIteration, trialWeight: iWeights[i]}
				})
			}
			await codapInterface.sendRequest({
				action: 'create',
				resource: `dataContext[${this.modelsDatasetName}].collection[iterations].case`,
				values: tCasesToAdd
			});
		}
		return `iteration: ${iIteration}`;
	}

	/**
	 * Add attributes for predicted label and for probability. Compute and stash values.
	 * @param iTools
	 * @private
	 */
	private async showPredictedLabels(iTools: {
		logisticModel: any,	// Will compute probabilities
		oneHotData: number[][],
		documents: any,
		tokenArray: any,
		positiveClassName: string,
		negativeClassName: string,
		lockProbThreshold: boolean
	}) {
		let tOneHotLength = iTools.oneHotData[0].length,
			tPosProbs: number[] = [],
			tNegProbs: number[] = [],
			tMapFromCaseIDToProbability: any = {};

		function findThreshold(): { threshold: number, accuracy: number, kappa: number } {
			// Determine the probability threshold that yields the fewest discrepant classifications
			// First compute the probabilities separating them into two arrays
			iTools.documents.forEach((aDoc: any, iIndex: number) => {
				let tProbability: number = iTools.logisticModel.transform(iTools.oneHotData[iIndex]),
					tActual = iTools.oneHotData[iIndex][tOneHotLength - 1];
				if (tActual) {
					tPosProbs.push(tProbability);
				} else {
					tNegProbs.push(tProbability);
				}
				// We will have to be able to lookup the probability later
				tMapFromCaseIDToProbability[aDoc.caseID] = tProbability;
			});
			tPosProbs.sort();
			tNegProbs.sort();
			let tCurrValue = tPosProbs[0],
				tNegLength = tNegProbs.length,
				tPosLength = tPosProbs.length,
				tCurrMinDiscrepancies: number,
				tStartingThreshold: number;

			// Return the index in tNegPros starting as given for the >= target probability
			function findNegIndex(iStarting: number, iTargetProb: number): number {
				while (tNegProbs[iStarting] < iTargetProb && iStarting < tNegLength) {
					iStarting++;
				}
				return iStarting;
			}

			let tRecord: {
				posIndex: number,	// Position at which we start testing for discrepancies
				negIndex: number,
				currMinDescrepancies: number,
				threshold: number
			};
			if (iTools.lockProbThreshold) {
				let tPosIndex = tPosProbs.findIndex((iProb) => {
						return iProb > 0.5;
					}),
					tNegIndex = tNegProbs.findIndex((iProb) => {
						return iProb > 0.5;
					});
				tRecord = {
					posIndex: tPosIndex,
					negIndex: tNegIndex,
					currMinDescrepancies: tPosIndex + (tNegLength - tNegIndex),
					threshold: 0.5
				}
			} else {
				let tNegIndex = tNegProbs.findIndex((v: number) => {
					return v > tCurrValue;
				});
				if (tNegIndex === -1) {
					// Negative and Positive probabilities don't overlap
					tCurrMinDiscrepancies = 0;
					tNegIndex = tNegLength;
					tStartingThreshold = (tNegProbs[tNegLength - 1] + tPosProbs[0]) / 2; // halfway
				} else {
					tCurrMinDiscrepancies = Number.MAX_VALUE;
					tStartingThreshold = tPosProbs[0];
				}

				tNegIndex = (tNegIndex === -1) ? tNegLength : tNegIndex;
				tRecord = {
					posIndex: 0,	// Position at which we start testing for discrepancies
					negIndex: tNegIndex,
					currMinDescrepancies: tCurrMinDiscrepancies,
					threshold: tStartingThreshold
				};
				while (tRecord.negIndex < tNegLength && tRecord.posIndex < tPosLength) {
					let tCurrDiscrepancies = tRecord.posIndex + (tNegLength - tRecord.negIndex);
					if (tCurrDiscrepancies < tRecord.currMinDescrepancies) {
						tRecord.currMinDescrepancies = tCurrDiscrepancies;
						tRecord.threshold = tPosProbs[tRecord.posIndex];
					}
					tRecord.posIndex++;
					tRecord.negIndex = findNegIndex(tRecord.negIndex, tPosProbs[tRecord.posIndex]);
				}
			}
			let tNumDocs = iTools.documents.length,
				tObserved = (tNumDocs - tRecord.currMinDescrepancies),
				tExpected = (tPosProbs.length * (tRecord.posIndex + tRecord.negIndex) +
					tNegLength * (tPosProbs.length - tRecord.posIndex + tNegLength - tRecord.negIndex)) / tNumDocs,
				tKappa = (tObserved - tExpected) / (tNumDocs - tExpected),
				tAccuracy = tObserved / tNumDocs;
			return {
				threshold: tRecord.threshold,
				accuracy: tAccuracy, kappa: tKappa
			};
		}

		// Create values of predicted label and probability for each document
		let tThresholdResult = findThreshold(),
			tLabelValues: { id: number, values: any }[] = [];
		iTools.logisticModel.threshold = tThresholdResult.threshold;
		iTools.logisticModel.accuracy = tThresholdResult.accuracy;
		iTools.logisticModel.kappa = tThresholdResult.kappa;
		iTools.documents.forEach((aDoc: any) => {
			let tProbability: number,
				tPredictedLabel,
				tValues: any = {},
				tProbName = `${this.kProbPredAttrNamePrefix}${iTools.positiveClassName}`;
			tProbability = tMapFromCaseIDToProbability[aDoc.caseID];
			tPredictedLabel = tProbability > tThresholdResult.threshold ? iTools.positiveClassName : iTools.negativeClassName;
			tValues[this.targetPredictedLabelAttributeName] = tPredictedLabel;
			tValues[tProbName] = tProbability;

			// For each document, stash the case ids of its features so we can link selection
			let tFeatureIDsForThisDoc: number[] = [];
			iTools.tokenArray.forEach((aToken: any) => {
				if (aDoc.tokens.findIndex((iFeature: any) => {
					return iFeature === aToken.token;
				}) >= 0) {
					tFeatureIDsForThisDoc.push(aToken.featureCaseID);
				}
			});
			tValues.featureIDs = JSON.stringify(tFeatureIDsForThisDoc);

			tLabelValues.push({
				id: aDoc.caseID,
				values: tValues
			})
		});
		// Send the values to CODAP
		await codapInterface.sendRequest({
			action: 'update',
			resource: `dataContext[${this.targetDatasetName}].collection[${this.targetCollectionName}].case`,
			values: tLabelValues
		});
	}

	/**
	 * We update as many name lists as necessary to be able to display them as choices in the UI.
	 * @private
	 */
	private async updateTargetNames() {
		this.datasetNames = await getDatasetNamesWithFilter(isNotAModel);
		if (this.targetDatasetName === '') {
			if (this.datasetNames.length > 0)
				this.targetDatasetName = this.datasetNames[0];
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
			if (this.targetClassAttributeName !== '') {
				this.targetCategories = await this.getTargetCategories();
				if (this.targetPositiveCategory === '')
					this.targetPositiveCategory = this.targetCategories[0] || '';
			}
		}
	}

	private getPossibleColumnFeatureNames(): string[] {
		let tResult: string[] = [];
		this.targetAttributeNames.forEach((iName) => {
			if ([this.targetAttributeName,
					this.targetClassAttributeName,
					this.targetPredictedLabelAttributeName].indexOf(iName) < 0 &&
				!iName.startsWith(this.kProbPredAttrNamePrefix)) {
				tResult.push(iName)
			}
		});
		return tResult;
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

	private async getTargetCategories(): Promise<string[]> {
		if (this.targetCollectionName === '') {
			if (this.targetClassAttributeName === '')
				return [];
		}
		let tCaseIndex = 0,
			tNumCases = await getCaseCount(this.targetDatasetName, this.targetCollectionName),
			tCategories: string[] = [];
		while (tCategories.length < 2 && tCaseIndex < tNumCases) {
			let tCaseResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${this.targetDatasetName}].collection[${this.targetCollectionName}].caseByIndex[${tCaseIndex}]`
			})
				.catch(() => {
					console.log('Error getting case for category name')
				});
			if (tCaseResult.success) {
				let tCategory = tCaseResult.values.case.values[this.targetClassAttributeName];
				if (tCategory && tCategory !== '' && tCategories.indexOf(tCategory) === -1)
					tCategories.push(tCategory);
			}
			tCaseIndex++;
		}
		return tCategories;
	}

	/**
	 * There may already be a models dataset. If so, we want to create a new one with toplevel info in the "models"
	 * collection with features children of that case
	 * @param iTokenArray
	 * @private
	 */
	private async createModelsDataset(iTokenArray: any[]) {
		let this_ = this;

		async function createNewDataset() {
			let tModelAttributes = [
					{name: 'Model', description: 'Name of model. Can be edited.'},
					{name: 'Training Set', editable: false, description: 'Name of dataset used for training'},
					{name: 'Iterations', editable: false, description: 'Number of iterations used in training'},
					{name: 'Classes', editable: false, description: 'The two classification labels'},
					{name: 'Positive Class', editable: false, description: 'The classification label regarded as positive'},
					{name: 'Column Features', editable: false, description: 'Names of columns treated as model features'},
					{
						name: 'Frequency Threshold',
						editable: false,
						description: 'Number of times something has to appear to be counted as a feature'
					},
					{
						name: 'Ignore Stop Words',
						editable: false,
						description: 'Will very common words be excluded from the model'
					},
					{
						name: 'Constant Weight',
						editable: false,
						description: 'The computed weight of the constant term in the model'
					},
					{
						name: 'Accuracy', editable: false, precision: 3,
						description: 'Proportion of correct labels predicted during training'
					},
					{
						name: 'Kappa', editable: false, precision: 3,
						description: 'Proportion of correctly predicted labels accounting for chance'
					},
					{
						name: 'Threshold', editable: false, precision: 4,
						description: 'Probability at which a case is labeled positively'
					}
				],
				tFeatureCollectionName = this_.featureCollectionName,
				tFeatureAttributes = [
					{
						name: "feature",
						description: `A feature is something that comes from the ${this_.targetAttributeName} that can help in the classification process`
					},
					{name: "type", description: `The kind of feature (unigram, bigram, count, …)`},
					{name: "frequency", description: `The number of times the feature appears`},
					{name: "usages", hidden: true},
					{
						name: "weight",
						precision: 5,
						description: `A computed value that is proportional to the importance of the feature in the logistic regression classification model`
					}
				],
				tCollections = [{
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
			if (this_.state.showWeightsGraph)
				tCollections.push({
					name: 'iterations',
					title: 'iterations',
					parent: tFeatureCollectionName,
					attrs: [{
						name: 'iteration',
						description: 'In each iteration of improving the model\'s fit to the data new weights for the features are computed.'
					},
						{
							name: 'trialWeight',
							description: 'In each iteration each feature is assigned a new trialWeight to improve the model\'s fit.',
							precision: 5
						}]
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
			this_.modelsDatasetID = tResult.values.id;

			await codapInterface.sendRequest({
				action: 'create',
				resource: 'component',
				values: {
					type: 'caseTable',
					name: tModelsDataSetName,
					dataContext: tModelsDataSetName,
					horizontalScrollOffset: 1000
				}
			});
		}

		let tModelsDataContextNames = await getDatasetNamesWithFilter(isAModel),
			tModelsDataSetName = this.modelsDatasetName,
			tModelsCollectionName = this.modelCollectionName,
			tModelDatasetAlreadyExists = tModelsDataContextNames.indexOf(tModelsDataSetName) >= 0,
			tNumPreexistingModels = 0;

		if (tModelDatasetAlreadyExists) {
			tNumPreexistingModels = await getCaseCount(tModelsDataSetName, tModelsCollectionName);
		} else {
			await createNewDataset();
		}

		const tParentCaseResult: any = await codapInterface.sendRequest(
			{
				action: "create",
				resource: `dataContext[${tModelsDataSetName}].collection[${tModelsCollectionName}].case`,
				values: [{
					values: {
						Model: `Model ${tNumPreexistingModels + 1}`
					}
				}]
			}
		)
			.catch((() => {
				console.log('Error creating parent model case')
			}));
		this_.modelCurrentParentCaseID = tParentCaseResult.values[0].id;

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
		let tFeatureCaseIDs: any = await codapInterface.sendRequest({
			action: 'create',
			resource: `dataContext[${this.modelsDatasetName}].collection[${this.featureCollectionName}].case`,
			values: tFeaturesValues
		});
		tFeatureCaseIDs = tFeatureCaseIDs.values.map((aResult: any) => {
			return aResult.id;
		});
		// Add these feature case IDs to their corresponding tokens in the tokenArray
		for (let i = 0; i < tFeatureCaseIDs.length; i++) {
			iTokenArray[i].featureCaseID = tFeatureCaseIDs[i];
		}
	}

	private async updateWeights(iTokens: any, iWeights: number[]) {
		let tFeaturesValues: any[] = [];
		iTokens.forEach((aToken: any, iIndex: number) => {
			let tOneFeatureUpdate: any = {
				id: aToken.featureCaseID,
				values: {
					type: aToken.type,
					weight: iWeights[iIndex]
				}
			};
			tFeaturesValues.push(tOneFeatureUpdate);
		});
		await codapInterface.sendRequest({
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
		await codapInterface.sendRequest({
			action: "update",
			resource: `dataContext[${tModelsDataSetName}].collection[${tModelsCollectionName}].case`,
			values: [{
				id: this.modelCurrentParentCaseID,
				values: {
					"Training Set": this.targetDatasetName,
					"Iterations": this.state.iterations,
					"Frequency Threshold": this.state.frequencyThreshold,
					"Ignore Stop Words": this.state.ignoreStopWords,
					"Classes": JSON.stringify(this.targetCategories),
					"Positive Class": this.targetPositiveCategory,
					"Column Features": this.targetColumnFeatureNames.join(', '),
					"Constant Weight": this.logisticModel.theta[0],
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

	private async buildModel() {
		this.logisticModel.iterations = this.state.iterations;
		this.logisticModel.lockIntercept = this.state.lockIntercept;
		this.targetCaseCount = await getCaseCount(this.targetDatasetName, this.targetCollectionName);
		let tDocuments: { example: string, class: string, caseID: number,
				columnFeatures: {[key:string]:number | boolean} }[] = [],
			tPositiveClassName: string;
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
				tClass: string = tGetResult.values.case.values[this.targetClassAttributeName],
				// We're going to put column features into each document as well so one-hot can include them in the vector
				tColumnFeatures: { [key: string]: number | boolean } = {};
			this.targetColumnFeatureNames.forEach((aName) => {
				let tValue = tGetResult.values.case.values[aName];
				if (tValue)
					tColumnFeatures[aName] = Number(tValue);
			});
			tDocuments.push({example: tText, class: tClass, caseID: tCaseID, columnFeatures: tColumnFeatures});
		}
		tPositiveClassName = this.targetPositiveCategory;

		// Now that we know the class name we're predicting, we can add attributes to the target dataset
		await addAttributesToTarget(tPositiveClassName, this.targetDatasetName || '',
			this.targetCollectionName, this.targetPredictedLabelAttributeName);

		// Logistic can't happen until we've isolated the features and produced a oneHot representation
		let tOneHot = oneHot({
				frequencyThreshold: this.state.frequencyThreshold - 1,
				ignoreStopWords: this.state.ignoreStopWords,
				includeUnigrams: this.state.unigrams
			},
			tDocuments),
			tData: number[][] = [];

		// Column feature results get pushed on after unigrams

		// The logisticModel.fit function requires that the class value (0 or 1) be the
		// last element of each oneHot.
		tOneHot.oneHotResult.forEach(iResult => {
			iResult.oneHotExample.push(iResult.class === tPositiveClassName ? 1 : 0);
			tData.push(iResult.oneHotExample);
		});

		// By creating the features data set now we give the user an indication that something is happening
		await this.createModelsDataset(tOneHot.tokenArray);
		// We have to stash the tokenArray for use in handleFittingProgress which is a callback
		this.featureTokenArray = tOneHot.tokenArray;

		// Fit a logistic model to the data
		if (this.state.showWeightsGraph) {
			await this.setupFeedbackDataset(); // So we can display fitting progress as a graph
		}

		// The fitting process is asynchronous so we fire it off here
		this.logisticModel.fit(tData);
		this.logisticModel._data = tData;
		this.logisticModel._oneHot = tOneHot;
		this.logisticModel._documents = tDocuments;
	}

	/**
	 * We get here from progressBar when we detect that the iterations are completed
	 * @private
	 */
	private async showResults() {
		let tTrainedModel = this.logisticModel.fitResult,
			tData = this.logisticModel._data,
			tOneHot = this.logisticModel._oneHot,
			tDocuments = this.logisticModel._documents;
		await this.updateWeights(tOneHot.tokenArray, tTrainedModel.theta);

		// In the target dataset we're going to add two attributes: "predicted label" and "probability of clickbait"
		// We pass along some tools that will be needed
		let tNegativeClassName = this.targetCategories.find((aCat) => {
			return aCat !== this.targetPositiveCategory;
		}) || '';
		let tPredictionTools = {
			logisticModel: this.logisticModel,
			oneHotData: tData,
			documents: tDocuments,
			tokenArray: tOneHot.tokenArray,
			positiveClassName: this.targetPositiveCategory,
			negativeClassName: tNegativeClassName,
			lockProbThreshold: this.state.lockProbThreshold
		}
		await this.showPredictedLabels(tPredictionTools);

		await this.updateModelTopLevelInfo();

		// Clean up a bit
		delete this.logisticModel._data;
		delete this.logisticModel._oneHot;
		delete this.logisticModel._documents;
		this.featureTokenArray = [];
		await this.getTextFeedbackManager().addTextComponent();
		this.setState({status: 'finished'});
	}

	private async extract(iTargetDatasetName: string | null) {
		this.setState({status: 'inProgress'});
		this.logisticModel.trace = this.state.showWeightsGraph;
		this.targetDatasetName = iTargetDatasetName;
		await deselectAllCasesIn(this.targetDatasetName);
		await this.buildModel();
	}

	private setUpdatePercentageFunc(iFunc: (p: number) => void) {
		this.updatePercentageFunc = iFunc;
	}

	private renderForActiveState() {
		let this_ = this,
			tInProgress = this.state.status === 'inProgress',
			progressIndicator = (tInProgress ?
				<div>
					<ProgressBar
						percentComplete={Math.round(100 * this.state.currentIteration / this.state.iterations)}
						setUpdatePercentage={this.setUpdatePercentageFunc}
					/>
				</div>
				: ''),
			dataSetControl: any = tInProgress ?
				(<p>Training with <strong>{this.targetDatasetName}</strong></p>)
				:
				propertyControl(this.datasetNames,
					'targetDatasetName', 'Training set: ',
					'No training set found');

		function propertyControl(listOfNames: string[], propName: string, prompt: string, noneFoundPrompt: string) {
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

		function getColumnControl() {
			if (tInProgress || this_.targetDatasetName === '')
				return '';
			return (propertyControl(this_.targetAttributeNames,
				'targetAttributeName', 'Column to train on: ', 'No columns found'));
		}

		function getLabelAttributeControl() {
			if (tInProgress || this_.targetDatasetName === '')
				return '';
			return (propertyControl(this_.targetAttributeNames,
				'targetClassAttributeName', 'Column with labels: ', 'No columns found'));
		}

		function getLabelsControl() {
			if (tInProgress || this_.targetDatasetName === '')
				return '';
			return (propertyControl(this_.targetCategories,
				'targetPositiveCategory', 'Positive label: ', 'No labels found'));
		}

		function doItButton() {
			if (tInProgress)
				return '';
			else if (this_.targetDatasetName === '') {
				return (
					<div>
						<p>Cannot train a model without a training set.</p>
					</div>
				);
			} else {
				return (
					<div>
						<br/>
						<Button onClick={() => {
							this_.extract(this_.targetDatasetName);
						}} >Train using {this_.targetDatasetName}</Button>
					</div>
				);
			}

		}

		function checkBox(label: string, checked: boolean, disabled:boolean, setProp: any, key?: number) {
			return (
				<div key={key}>
					<CheckBox
						text={label}
						value={checked && !disabled}
						disabled={disabled}
						onValueChange={
							e => setProp(e)
						}
					/>
				</div>
			)
		}

		function numericInput(label: string, min: number, max: number, get: any, set: any) {
			return (
				<NumericInput
					label={label}
					min={min}
					max={max}
					getter={get}
					setter={set}
				/>
			);
		}

		function columnFeatureCheckboxes() {
			if (!this_.state.useColumnFeatures)
				return '';
			let tCheckboxes: any[] = [];
			this_.getPossibleColumnFeatureNames().forEach((iName, iIndex) => {
					tCheckboxes.push(checkBox(
						iName,
						this_.targetColumnFeatureNames.indexOf(iName) >= 0,
						false,
						(newValue: boolean) => {
							if (newValue) {
								this_.targetColumnFeatureNames.push(iName);
							} else {
								let tIndex = this_.targetColumnFeatureNames.indexOf(iName);
								if (tIndex >= 0)
									this_.targetColumnFeatureNames.splice(tIndex, 1);
							}
							this_.setState({count: this_.state.count + 1})
						},
						iIndex
						)
					)
				}
			);
			if (tCheckboxes.length > 0)
				return (
					<div className='sq-checkboxes'>
						{tCheckboxes}
					</div>);
			else return '';
		}

		return (
			<div className='sq-options'>
				<Accordion
					collapsible={true} multiple={true}>
					<Item
						title='Extraction'>
						<Accordion
							collapsible={true} multiple={true}>
							<Item
								title='Setup'>
								<div>
									{dataSetControl}
									{getColumnControl()}
									{getLabelAttributeControl()}
									{getLabelsControl()}
								</div>
							</Item>
							<Item
								title='Features'>
								<div>
									{checkBox(' Unigrams',
										this.state.unigrams,
										false,
										(newValue: boolean) => {
											this.setState({unigrams: newValue})
										})}
									{checkBox(' Column features',
										this.state.useColumnFeatures,
										this.getPossibleColumnFeatureNames().length === 0,
										(newValue: boolean) => {
											this.setState({useColumnFeatures: newValue})
										})}
									{columnFeatureCheckboxes()}
								</div>
							</Item>
							<Item
								title='Settings'>
								<div>
									{numericInput('Frequency threshold',
										1, 20,
										() => this.state.frequencyThreshold,
										(newValue: number) => {
											this.setState({frequencyThreshold: newValue})
										})}
									{checkBox(' Ignore stop words',
										this.state.ignoreStopWords,
										false,
										(newValue: boolean) => {
											this.setState({ignoreStopWords: newValue})
										})}
								</div>
							</Item>
						</Accordion>
					</Item>
					<Item
						title='Model Setup'>
						<div>
							{numericInput('Iterations: ',
								20, 2000,
								() => this.state.iterations,
								(newValue: number) => {
									this.setState({iterations: newValue})
								})}
							{checkBox(' Lock intercept at zero',
								this.state.lockIntercept,
								false,
								(newValue: boolean) => {
									this.setState({lockIntercept: newValue})
								})}
							{checkBox(' Use 0.5 as probability threshold',
								this.state.lockProbThreshold,
								false,
								(newValue: boolean) => {
									this.setState({lockProbThreshold: newValue})
								})}
							{checkBox(' Show progress graphs',
								this.state.showWeightsGraph,
								false,
								(newValue: boolean) => {
									this.setState({showWeightsGraph: newValue})
								})}
						</div>
					</Item>
				</Accordion>

				{doItButton()}
				{progressIndicator}

			</div>)
	}

	private renderForFinishedState() {
		return <div className={'sq-output'}>
			<p>Your analysis is finished!</p>
			<p>In <b>{this.targetDatasetName}</b> identified {this.featureCaseCount} <b>unigrams </b>
				in <b>{this.targetCaseCount} {pluralize(this.targetAttributeName)}</b>.</p>
			<p>Positive label is {this.targetPositiveCategory}.</p>
			<p>Feature weights were computed by a logistic regression model.</p>
			<p>Iterations = {this.state.iterations}</p>
			<p>Frequency threshold = {this.state.frequencyThreshold}</p>
			<p>Accuracy = {Math.round(this.logisticModel.accuracy * 1000) / 1000}</p>
			<p>Kappa = {Math.round(this.logisticModel.kappa * 1000) / 1000}</p>
			<p>Threshold = {Math.round(this.logisticModel.threshold * 10000) / 10000}</p>
			<br/>
			<Button onClick={() => {
				this.setState({status: 'active'});
			}}>Train Again</Button>
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
			case 'inProgress':
				return this.renderForActiveState();
			case 'finished':
			default:
				return this.renderForFinishedState();
		}
	}
}
