import React, {Component} from 'react';
import pluralize from 'pluralize';
import codapInterface, {CODAP_Notification} from "./lib/CodapInterface";
import {
	addAttributesToTarget,
	deselectAllCasesIn,
	entityInfo,
	getCaseCount,
	getCollectionNames,
	getDatasetInfoWithFilter,
	isAModel,
	isNotAModel,
	scrollCaseTableToRight
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
import {
	containsOptions,
	FC_StorageCallbackFuncs,
	FCState,
	FeatureConstructor,
	featureKinds,
	kindOfThingContainedOptions
} from "./feature_constructor";
import FeatureConstructorBridge, {ConstructedFeature, ContainsDetails} from "./feature_constructor_bridge";
import {SQ} from "./lists/personal-pronouns";
import {stopWords} from "./lib/stop_words";
import {computeKappa} from "./utilities";

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
	datasetName: string | null;
	textFeedbackManagerStorage: TFMStorage | null,
	featureConstructorStorage: FCState | null,
	targetDatasetInfo: entityInfo | null,
	targetDatasetInfoArray: entityInfo[] | null,
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
	frequencyThreshold: number,
	modelAccuracy: number,
	modelKappa: number,
	modelThreshold: number,
	unigrams: boolean,
	useColumnFeatures: boolean,
	ignoreStopWords: boolean,
	lockIntercept: boolean,
	lockProbThreshold: boolean,
	accordianSelection: Record<string, number>,
	status: string
}

const outerNames = ['Extraction', 'Model Setup'],
	innerNames = ['Setup', 'Features', 'Settings'];

export class FeatureManager extends Component<FM_Props, {
	status: string,
	count: number,
	accordianSelection: Record<string, number>,
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
	public targetDatasetInfo: entityInfo = {name: '', title: '', id: -1};
	private targetDatasetInfoArray: entityInfo[] = [];
	public targetCollectionName = '';
	public targetCollectionNames: string[] = [];
	public targetAttributeName = '';
	private targetAttributeNames: string[] = [];
	public targetPredictedLabelAttributeName = '';
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
	private fcBridge: FeatureConstructorBridge;
	private featureConstructorCreateStorage: any;
	private featureConstructorRestoreStorage: any;
	private stashedFeatureConstructorStorage: any;
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
			accordianSelection: {outer: 0, inner: 0},
			iterations: 20,
			unigrams: false,
			currentIteration: 0,
			frequencyThreshold: 4,
			useColumnFeatures: false,
			ignoreStopWords: true,
			lockIntercept: true,
			lockProbThreshold: true,
			showWeightsGraph: false
		};
		this.updatePercentageFunc = null;
		this.forceUpdate = this.forceUpdate.bind(this);
		this.extract = this.extract.bind(this);
		this.handleNotification = this.handleNotification.bind(this);
		this.createStorage = this.createStorage.bind(this);
		this.restoreStorage = this.restoreStorage.bind(this);
		this.createModelsDataset = this.createModelsDataset.bind(this);
		this.setUpdatePercentageFunc = this.setUpdatePercentageFunc.bind(this);
		this.setFeatureConstructorStorageCallbacks = this.setFeatureConstructorStorageCallbacks.bind(this);
		this.newFeatureAdded = this.newFeatureAdded.bind(this);
		this.fcBridge = new FeatureConstructorBridge(this.newFeatureAdded);
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
		await this.getTextFeedbackManager().closeTextComponent();
	}

	public createStorage(): FMStorage {
		return {
			datasetName: null,
			textFeedbackManagerStorage: this.textFeedbackManager ? this.textFeedbackManager.createStorage() : null,
			featureConstructorStorage: this.featureConstructorCreateStorage ? this.featureConstructorCreateStorage() : null,
			targetDatasetInfo: this.targetDatasetInfo,
			targetDatasetInfoArray: this.targetDatasetInfoArray,
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
			frequencyThreshold: this.state.frequencyThreshold,
			modelAccuracy: this.logisticModel.accuracy,
			modelKappa: this.logisticModel.kappa,
			modelThreshold: this.logisticModel.threshold,
			unigrams: this.state.unigrams,
			useColumnFeatures: this.state.useColumnFeatures,
			ignoreStopWords: this.state.ignoreStopWords,
			lockIntercept: this.state.lockIntercept,
			lockProbThreshold: this.state.lockProbThreshold,
			accordianSelection: this.state.accordianSelection,
			status: this.state.status
		}
	}

	public restoreStorage(iStorage: FMStorage) {
		if( typeof iStorage.datasetName === 'string') // backward compatibility
			iStorage.targetDatasetInfo = {name: iStorage.datasetName, title: iStorage.datasetName, id: -1};
		if( iStorage.targetDatasetInfo)
			this.targetDatasetInfo = iStorage.targetDatasetInfo;
		this.targetDatasetInfoArray = iStorage.targetDatasetInfoArray || [];
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
		this.stashedFeatureConstructorStorage = iStorage.featureConstructorStorage;
		if (this.featureConstructorRestoreStorage && this.stashedFeatureConstructorStorage) {
			this.featureConstructorRestoreStorage(this.stashedFeatureConstructorStorage);
			this.stashedClassificationManagerStorage = null;
		}
		this.setState({unigrams: iStorage.unigrams});
		this.setState({frequencyThreshold: iStorage.frequencyThreshold || 4});
		this.setState({useColumnFeatures: iStorage.useColumnFeatures || false});
		this.setState({ignoreStopWords: iStorage.ignoreStopWords || false});
		this.setState({lockIntercept: iStorage.lockIntercept || false});
		this.setState({lockProbThreshold: iStorage.lockProbThreshold || false});
		this.setState({accordianSelection: iStorage.accordianSelection || {inner: 0, outer: 0}});
		this.setState({status: iStorage.status || 'active'});
	}

	public forceUpdate() {
		this.setState({count: this.state.count + 1})
	}

	public setFeatureConstructorStorageCallbacks(iCallbackFuncs: FC_StorageCallbackFuncs) {
		this.featureConstructorCreateStorage = iCallbackFuncs.createStorageCallback;
		this.featureConstructorRestoreStorage = iCallbackFuncs.restoreStorageCallback;
		if (this.stashedFeatureConstructorStorage) {
			this.featureConstructorRestoreStorage(this.stashedFeatureConstructorStorage);
		}
	}

	/**
	 *
	 * @param iNotification    (from CODAP)
	 */
	private async handleNotification(iNotification: CODAP_Notification) {
		let tTargetDatasetInfo = this.targetDatasetInfo,
				tTargetDatasetName = this.targetDatasetInfo.name;
		if (iNotification.action === 'notify' && this.state.status !== 'inProgress') {
			let tOperation = iNotification.values.operation;
			if (tOperation === 'dataContextCountChanged') {
				await this.updateTargetNames();
				this.setState({count: this.state.count + 1});
			} else if (tOperation === 'selectCases') {
				// @ts-ignore
				let tDataContextName: string = iNotification.resource && iNotification.resource.match(/\[(.+)]/)[1];
				if (tDataContextName === this.modelsDatasetName && !this.isSelectingFeatures) {
					console.log('about to call handleFeatureSelection');
					this.isSelectingTargetPhrases = true;
					await this.getTextFeedbackManager().handleFeatureSelection(this);
					this.isSelectingTargetPhrases = false;
				} else if (tTargetDatasetInfo && tDataContextName === tTargetDatasetInfo.name &&
						this.targetDatasetInfoArray.findIndex(iInfo => iInfo.name === tTargetDatasetName) >= 0 &&
						!this.isSelectingTargetPhrases) {
					this.isSelectingFeatures = true;
					await this.getTextFeedbackManager().handleTargetSelection(this);
					this.isSelectingFeatures = false;
				}
			} else if (tOperation === 'createAttributes' || tOperation === 'updateAttributes') {
				this.targetAttributeNames = await this.getTargetAttributeNames();
				this.forceUpdate();
			} else if (tOperation === 'titleChange') {
				const kFrom = iNotification.values.from,
					kTo = iNotification.values.to;
				let tFoundEntry = this.targetDatasetInfoArray.find(entry=>entry.title === kFrom);
				if( tFoundEntry)
					tFoundEntry.title = kTo;
				if(this.targetDatasetInfo.title === kFrom)
					this.targetDatasetInfo.title = kTo;
				this.forceUpdate();
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

		function findThreshold(): number {
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
				if( tNegIndex === -1)
					tNegIndex = tNegLength;
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
			return  tRecord.threshold;
		}

		// Create values of predicted label and probability for each document
		let tThresholdResult = findThreshold(),
			tLabelValues: { id: number, values: any }[] = [],
			tActualPos = 0,
			tPredictedPos = 0,
			tBothPos = 0,
			tBothNeg = 0;
		iTools.logisticModel.threshold = tThresholdResult;
		iTools.documents.forEach((aDoc: any) => {
			let tProbability: number,
				tPredictedLabel,
				tActualLabel,
				tValues: any = {},
				tProbName = `${this.kProbPredAttrNamePrefix}${iTools.positiveClassName}`;
			tProbability = tMapFromCaseIDToProbability[aDoc.caseID];
			tPredictedLabel = tProbability > tThresholdResult ? iTools.positiveClassName : iTools.negativeClassName;
			tValues[this.targetPredictedLabelAttributeName] = tPredictedLabel;
			tValues[tProbName] = tProbability;
			tActualLabel = aDoc.class;
			tActualPos += tActualLabel === iTools.positiveClassName ? 1 : 0;
			tPredictedPos += tPredictedLabel === iTools.positiveClassName ? 1 : 0;
			tBothPos += (tActualLabel === iTools.positiveClassName && tPredictedLabel === iTools.positiveClassName) ? 1 : 0;
			tBothNeg += (tActualLabel === iTools.negativeClassName && tPredictedLabel === iTools.negativeClassName) ? 1 : 0;

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

		let computedKappa = computeKappa(iTools.documents.length, tBothPos, tBothNeg, tActualPos, tPredictedPos);
		iTools.logisticModel.accuracy = computedKappa.observed;
		iTools.logisticModel.kappa = computedKappa.kappa;

		// Send the values to CODAP
		await codapInterface.sendRequest({
			action: 'update',
			resource: `dataContext[${this.targetDatasetInfo.name}].collection[${this.targetCollectionName}].case`,
			values: tLabelValues
		});
	}

	/**
	 * We update as many name lists as necessary to be able to display them as choices in the UI.
	 * @private
	 */
	private async updateTargetNames() {
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
			if (this.targetClassAttributeName === '' && this.targetAttributeNames.length > 1)
				this.targetClassAttributeName = this.targetAttributeNames[1];
			if (this.targetClassAttributeName !== '') {
				this.targetCategories = await this.getTargetCategories();
				if (this.targetCategories.indexOf(this.targetPositiveCategory) < 0)
					this.targetPositiveCategory = this.targetCategories[0];
			}
		}
	}

	private getPossibleColumnFeatureNames(): string[] {
		let tResult: string[] = [],
			tConstructedFeatures = this.fcBridge.getConstructedFeaturesList(),
			tConstructedFeatureNames = tConstructedFeatures.map(iFeature => {
				return iFeature.name;
			});
		this.targetAttributeNames.forEach((iName) => {
			if ([this.targetAttributeName,
					this.targetClassAttributeName,
					this.targetPredictedLabelAttributeName].indexOf(iName) < 0 &&
				tConstructedFeatureNames.indexOf(iName) < 0 &&
				!iName.startsWith(this.kProbPredAttrNamePrefix)) {
				tResult.push(iName)
			}
		});
		return tResult;
	}

	private async getTargetCollectionNames(): Promise<string[]> {
		return await getCollectionNames(this.targetDatasetInfo.name);
	}

	public getConstructedFeatureNames(): string[] {
		return this.fcBridge.getConstructedFeaturesList().map(iFeature => iFeature.name);
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
				resource: `dataContext[${this.targetDatasetInfo.name}].collection[${this.targetCollectionName}].attributeList`
			}
		)
			.catch((reason) => {
				console.log('Error getting attribute names because', reason);
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
			tTargetDatasetName = this.targetDatasetInfo.name,
			tTargetCollectionName = this.targetCollectionName,
			tNumCases = await getCaseCount(tTargetDatasetName, tTargetCollectionName),
			tCategories: string[] = [];
		while (tCategories.length < 2 && tCaseIndex < tNumCases) {
			let tCaseResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${tTargetDatasetName}].collection[${tTargetCollectionName}].caseByIndex[${tCaseIndex}]`
			})
				.catch(() => {
					console.log('Error getting case for category name')
				});
			if (tCaseResult.success) {
				let tCategory = (tCaseResult.values.case.values[this.targetClassAttributeName]).toString();
				if (tCategory !== '' && tCategories.indexOf(tCategory) === -1)
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
					{name: 'Predicted Column Name', editable: false, description: 'The name of the column with predictions'},
					{name: 'Target Class', editable: false, description: 'The classification label regarded as the target. Chosen when prob of positive is greater than threshold.'},
					{name: 'Column Features', editable: false, description: 'Names of columns treated as model features'},
					{name: 'Constructed Features', editable: false, description: 'Names of features created for this model'},
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

		let tModelsDatasetInfoArray = await getDatasetInfoWithFilter(isAModel),
			tModelsDataSetName = this.modelsDatasetName,
			tModelsCollectionName = this.modelCollectionName,
			tModelDatasetAlreadyExists = tModelsDatasetInfoArray.findIndex(iInfo=>iInfo.name === tModelsDataSetName) >= 0,
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
			tModelsCollectionName = this.modelCollectionName,
			tConstructedFeatureNames = this.fcBridge.getConstructedFeaturesList().map(iFeature => {
				return iFeature.name;
			});
		await codapInterface.sendRequest({
			action: "update",
			resource: `dataContext[${tModelsDataSetName}].collection[${tModelsCollectionName}].case`,
			values: [{
				id: this.modelCurrentParentCaseID,
				values: {
					"Training Set": this.targetDatasetInfo.title,
					"Iterations": this.state.iterations,
					"Frequency Threshold": this.state.unigrams ? this.state.frequencyThreshold : '',
					"Ignore Stop Words": this.state.unigrams ? this.state.ignoreStopWords : '',
					"Classes": JSON.stringify(this.targetCategories),
					"Predicted Column Name": this.targetPredictedLabelAttributeName,
					"Target Class": this.targetPositiveCategory,
					"Column Features": this.state.useColumnFeatures ? this.targetColumnFeatureNames.join(', ') : '',
					"Constructed Features": tConstructedFeatureNames.length > 0 ? tConstructedFeatureNames.join(', ') : '',
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
		this.targetCaseCount = await getCaseCount(this.targetDatasetInfo.name, this.targetCollectionName);
		let tDocuments: {
				example: string, class: string, caseID: number,
				columnFeatures: { [key: string]: number | boolean }
			}[] = [],
			tPositiveClassName: string;
		// Grab the strings in the target collection that are the values of the target attribute.
		// Stash these in an array that can be used to produce a oneHot representation
		for (let i = 0; i < this.targetCaseCount; i++) {
			const tGetResult: any = await codapInterface.sendRequest({
				"action": "get",
				"resource": `dataContext[${this.targetDatasetInfo.name}].collection[${this.targetCollectionName}].caseByIndex[${i}]`
			})
				.catch(() => {
					console.log('unable to get case');
				});

			let tCaseID = tGetResult.values.case.id,
				tText: string = tGetResult.values.case.values[this.targetAttributeName],
				tClass: string = tGetResult.values.case.values[this.targetClassAttributeName],
				tColumnNames = this.targetColumnFeatureNames.concat(
					this.fcBridge.getConstructedFeaturesList().map(iFeature => {
						return iFeature.name;
					})),
				tColumnFeatures: { [key: string]: number | boolean } = {};
			// We're going to put column features into each document as well so one-hot can include them in the vector
			tColumnNames.forEach((aName) => {
				let tValue = tGetResult.values.case.values[aName];
				if(['1', 'true'].indexOf(String(tValue).toLowerCase()) >= 0)
					tValue = 1;
				else
					tValue = 0;
				if (tValue)
					tColumnFeatures[aName] = tValue;
			});
			tDocuments.push({example: tText, class: tClass, caseID: tCaseID, columnFeatures: tColumnFeatures});
		}
		tPositiveClassName = this.targetPositiveCategory;

		// Now that we know the class name we're predicting, we can add attributes to the target dataset
		this.targetPredictedLabelAttributeName = 'predicted ' + this.targetClassAttributeName;
		await addAttributesToTarget(tPositiveClassName, this.targetDatasetInfo.name,
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

	private async extract(iTargetDatasetInfo: entityInfo) {
		this.setState({status: 'inProgress'});
		this.logisticModel.trace = this.state.showWeightsGraph;
		this.targetDatasetInfo = iTargetDatasetInfo;
		await deselectAllCasesIn(this.targetDatasetInfo.name);
		await this.buildModel();
	}

	private setUpdatePercentageFunc(iFunc: (p: number) => void) {
		this.updatePercentageFunc = iFunc;
	}

	private async newFeatureAdded(iNewFeature: ConstructedFeature) {
		const this_ = this,
			tTargetAttr = `${this_.targetAttributeName}`;

		function freeFormFormula() {
			const option = (iNewFeature.info.details as ContainsDetails).containsOption;
			const tBegins = option === containsOptions[0] ? '^' : '';
			const tEnds = option === containsOptions[3] ? '$' : '';
			const tParamString = `${this_.targetAttributeName},"${tBegins}\\\\\\\\b${(iNewFeature.info.details as ContainsDetails).freeFormText}\\\\\\\\b${tEnds}"`;
			let tResult = '';
			switch (option) {//['starts with', 'contains', 'does not contain', 'ends with']
				case containsOptions[0]:	// starts with
					tResult = `patternMatches(${tParamString})>0`
					break;
				case containsOptions[1]:	// contains
					tResult = `patternMatches(${tParamString})>0`
					break;
				case containsOptions[2]:	// does not contain
					tResult = `patternMatches(${tParamString})=0`
					break;
				case containsOptions[3]:	// ends with
					tResult = `patternMatches(${tParamString})>0`
					break;
			}
			return tResult;
		}

		function anyNumberFormula() {
			const kNumberPattern = `[0-9]+`;
			let tExpression = '';
			switch ((iNewFeature.info.details as ContainsDetails).containsOption) {//['starts with', 'contains', 'does not contain', 'ends with']
				case containsOptions[0]:	// starts with
					tExpression = `patternMatches(${tTargetAttr}, "^${kNumberPattern}")>0`
					break;
				case containsOptions[1]:	// contains
					tExpression = `patternMatches(${tTargetAttr}, "${kNumberPattern}")>0`
					break;
				case containsOptions[2]:	// does not contain
					tExpression = `patternMatches(${tTargetAttr}, "${kNumberPattern}")=0`
					break;
				case containsOptions[3]:	// ends with
					tExpression = `patternMatches(${tTargetAttr}, "${kNumberPattern}$")>0`
					break;
			}
			return tExpression;
		}

		/*function anyDateFormula() {
			const kDigit = `\\\\\\\\d`,
				kSlash = `\\\\\\\\/`,
				kDatePattern = `^((0?[13578]|10|12)(-|${kSlash})(([1-9])|(0[1-9])|([12])([0-9]?)|(3[01]?))(-|${kSlash})((19)([2-9])(${kDigit}{1})|(20)([01])(${kDigit}{1})|([8901])(${kDigit}{1}))|(0?[2469]|11)(-|${kSlash})(([1-9])|(0[1-9])|([12])([0-9]?)|(3[0]?))(-|${kSlash})((19)([2-9])(${kDigit}{1})|(20)([01])(${kDigit}{1})|([8901])(${kDigit}{1})))$`;
			let tExpression = '';
			switch ((iNewFeature.info.details as ContainsDetails).containsOption) {//['starts with', 'contains', 'does not contain', 'ends with']
				case containsOptions[0]:	// starts with
					tExpression = `patternMatches(${tTargetAttr}, "^${kDatePattern}")>0`
					break;
				case containsOptions[1]:	// contains
					tExpression = `patternMatches(${tTargetAttr}, "${kDatePattern}")>0`
					break;
				case containsOptions[2]:	// does not contain
					tExpression = `patternMatches(${tTargetAttr}, "${kDatePattern}")=0`
					break;
				case containsOptions[3]:	// ends with
					tExpression = `patternMatches(${tTargetAttr}, "${kDatePattern}$")>0`
					break;
			}
			return tExpression;
		}*/

		function anyListFormula() {
			let tExpression;
			const kListName = (iNewFeature.info.details as ContainsDetails).wordList.datasetName,
				kListAttributeName = (iNewFeature.info.details as ContainsDetails).wordList.firstAttributeName,
				kWords = SQ.lists[kListName];
			if (kWords) {
				tExpression = kWords.reduce((iSoFar, iWord) => {
					return iSoFar === '' ? `\\\\\\\\b${iWord}\\\\\\\\b` : iSoFar + `|\\\\\\\\b${iWord}\\\\\\\\b`;
				}, '');
				switch ((iNewFeature.info.details as ContainsDetails).containsOption) {//['starts with', 'contains', 'does not contain', 'ends with']
					case containsOptions[0]:	// starts with
						tExpression = `patternMatches(${tTargetAttr}, "^${tExpression}")>0`;
						break;
					case containsOptions[1]:	// contains
						tExpression = `patternMatches(${tTargetAttr}, "${tExpression}")>0`;
						break;
					case containsOptions[2]:	// does not contain
						tExpression = `patternMatches(${tTargetAttr}, "${tExpression}")=0`;
						break;
					case containsOptions[3]:	// ends with
						tExpression = `patternMatches(${tTargetAttr}, "${tExpression}$")>0`;
						break;
				}
			} else {
				tExpression = `wordListMatches(${tTargetAttr},"${kListName}","${kListAttributeName}")>0`
			}
			return tExpression;
		}

		if (!this.targetDatasetInfo)
			return;
		let tFormula = '';
		switch (iNewFeature.info.kind) {
			case featureKinds[0]:	// contains feature
				switch ((iNewFeature.info.details as ContainsDetails).kindOption) {
					case kindOfThingContainedOptions[0]: // 'any number'
						tFormula = anyNumberFormula();
						break;
					case kindOfThingContainedOptions[1]: // 'any from list'
						tFormula = anyListFormula();
						break;
					case kindOfThingContainedOptions[2]: // 'any free form text'
						tFormula = freeFormFormula();
						break;
					/*
										case kindOfThingContainedOptions[3]: // 'any date'
											tFormula = anyDateFormula();
											break;
					*/
				}
				break;
			case featureKinds[1]:	// count feature

				break;
		}
		if (tFormula !== '')
			await codapInterface.sendRequest({
				action: 'create',
				resource: `dataContext[${this.targetDatasetInfo.name}].collection[${this.targetCollectionName}].attribute`,
				values: {
					name: iNewFeature.name,
					formula: tFormula
				}
			});
		await scrollCaseTableToRight(this.targetDatasetInfo.name);
		this.forceUpdate();
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
				(<p>Training with <strong>{this.targetDatasetInfo.title}</strong></p>)
				:
				entityPropertyControl(this.targetDatasetInfoArray,
					'targetDatasetInfo', 'Training set: ',
					'No training set found');

		function entityPropertyControl(entityInfoArray: entityInfo[], propName: string, prompt: string, noneFoundPrompt: string) {
			if (entityInfoArray.length === 1)
				this_[propName] = entityInfoArray[0];
			if (entityInfoArray.length === 0) {
				return (
					<p>{prompt}<em>{noneFoundPrompt}</em></p>
				)
			} else {
				return (
					<label>
						<span>{prompt}</span>
						<SelectBox
							dataSource={entityInfoArray.map(iInfo=>iInfo.title)}
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
		function getColumnControl() {
			if (tInProgress || this_.targetDatasetInfo.name === '')
				return '';
			return (stringPropertyControl(this_.targetAttributeNames,
				'targetAttributeName', 'Column to train on: ', 'No columns found'));
		}

		function getLabelAttributeControl() {
			if (tInProgress || this_.targetDatasetInfo.name === '')
				return '';
			return (stringPropertyControl(this_.targetAttributeNames,
				'targetClassAttributeName', 'Column with labels: ', 'No columns found'));
		}

		function getLabelsControl() {
			if (tInProgress || this_.targetDatasetInfo.name === '')
				return '';
			return (stringPropertyControl(this_.targetCategories,
				'targetPositiveCategory', 'Target label: ', 'No labels found'));
		}

		function doItButton() {
			if (tInProgress)
				return '';
			else if (this_.targetDatasetInfo.name === '') {
				return (
					<div>
						<p>Cannot train a model without a training set.</p>
					</div>
				);
			} else if(!this_.state.unigrams &&
				!(this_.state.useColumnFeatures && this_.targetColumnFeatureNames.length > 0) &&
				this_.fcBridge.getConstructedFeaturesList().filter(iItem=>iItem.chosen).length === 0) {
				return (
					<div>
						<p>Cannot train a model without specifying at least one feature.</p>
					</div>
				);
			} else {
				return (
					<div>
						<br/>
						<Button onClick={() => {
							this_.extract(this_.targetDatasetInfo);
						}}>Train using {this_.targetDatasetInfo.title}</Button>
					</div>
				);
			}

		}

		function checkBox(label: string, checked: boolean, disabled: boolean, setProp: any, key?: number, hint?:string) {
			return (
				<div key={key}>
					<CheckBox
						text={label}
						value={checked && !disabled}
						disabled={disabled}
						hint={hint}
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

		function constructedFeatureCheckboxes() {
			let tCheckboxes: any[] = [],
				tConstructedFeatureList = this_.fcBridge.getConstructedFeaturesList();
			tConstructedFeatureList.forEach((iFeature, iIndex) => {
					tCheckboxes.push(checkBox(
						`${iFeature.name}—${iFeature.description || ''}`,
						iFeature.chosen,
						false,
						(newValue: boolean) => {
							iFeature.chosen = newValue;
							this_.forceUpdate();
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

		function handleSelectionChanged(obj: any, key: string, names: string[]) {
			const addedItems = obj.addedItems,
				addedItem = addedItems.length > 0 ? addedItems[0] : null,
				addedItemTitle = addedItem ? addedItem.title : '',
				addedItemIndex = names.indexOf(addedItemTitle);
			let newAccordionState = Object.assign({}, this_.state.accordianSelection);
			newAccordionState[key] = addedItemIndex;
			this_.setState({accordianSelection: newAccordionState});
		}

		function outerSelectionChanged(obj: any) {
			handleSelectionChanged(obj, 'outer', outerNames);
		}

		function innerSelectionChanged(obj: any) {
			handleSelectionChanged(obj, 'inner', innerNames);
		}

		return (
			<div className='sq-options'>
				<Accordion
					collapsible={true} multiple={false}
					onSelectionChanged={outerSelectionChanged}
					selectedIndex={this.state.accordianSelection.outer}
				>
					<Item
						title='Extraction'>
						<Accordion
							collapsible={true} multiple={false}
							onSelectionChanged={innerSelectionChanged}
							selectedIndex={this.state.accordianSelection.inner}>
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
									<FeatureConstructor
										fcBridge={this.fcBridge}
										setStorageCallbacks={this.setFeatureConstructorStorageCallbacks}
									/>
									{constructedFeatureCheckboxes()}
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
										},
									1,
									Object.keys(stopWords).join(', '))}
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
			<p>In <b>{this.targetDatasetInfo.title}</b> identified {this.featureCaseCount} <b>features </b>
				in <b>{this.targetCaseCount} {pluralize(this.targetAttributeName)}</b>.</p>
			<p>Target label is {this.targetPositiveCategory}.</p>
			<p>Feature weights were computed by a logistic regression model.</p>
			<p>Iterations = {this.state.iterations}</p>
			<p>Frequency threshold = {this.state.frequencyThreshold}</p>
			<p>Accuracy = {this.logisticModel.accuracy !== undefined ? Number(this.logisticModel.accuracy.toFixed(3)) : ''}</p>
			<p>Kappa = {this.logisticModel.kappa !== undefined ? Number(this.logisticModel.kappa.toFixed(3)) : ''}</p>
			<p>Threshold = {this.logisticModel.threshold !== undefined ? Number(this.logisticModel.threshold.toFixed(4)) : ''}</p>
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
