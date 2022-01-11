/**
 * The ModelManager uses information in the domain store to build a model
 */
import {DomainStore} from "../stores/domain_store";
import {deselectAllCasesIn} from "../lib/codap-helper";
import codapInterface from "../lib/CodapInterface";
import {oneHot} from "../lib/one_hot";
import {runInAction} from "mobx";
import {computeKappa} from "../utilities/utilities";
import {NgramDetails, StoredModel, Token} from "../stores/store_types_and_constants";
import {LogisticRegression} from "../lib/jsregression";

export class ModelManager {

	domainStore: DomainStore
	stepModeContinueCallback: ((iIteration: number) => void) | null = null
	stepModeIteration: number = 0

	constructor(iDomainStore: DomainStore) {
		this.domainStore = iDomainStore
		this.progressBar = this.progressBar.bind(this)
		this.stepModeCallback = this.stepModeCallback.bind(this)
	}

	guaranteeUniqueModelName(iCandidate: string) {
		const this_ = this

		function isNotUnique(iName: string) {
			return Boolean(this_.domainStore.trainingStore.trainingResults.find(iResult => iResult.name === iName))
		}

		let counter = 1,
			tTest = iCandidate
		while (isNotUnique(tTest)) {
			tTest = `${iCandidate}_${counter}`
			counter++
		}
		return tTest
	}

	/**
	 * - We make sure both collections have their attributes showing
	 * - If new cases for those collections need to be created, we create them
	 * - We fill in the model name for cases in each collection
	 * - We gather up the caseIDs for both weight and result cases
	 */
	async prepWeightsCollection(iTokens: Token[]) {

		async function emptyFirstChildWeightCaseExists() {
			let tIsEmpty = true;
			const tFirstChildResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${tFeatureDatasetName}].collection[${tWeightsCollectionName}].caseByIndex[0]`
			})
			if (tFirstChildResult.success) {
				const tName = tFirstChildResult.values.case.values['model name']
				tIsEmpty = !tName || tName === ''
			}
			return tIsEmpty
		}

		const tFeatureDatasetName = this.domainStore.featureStore.featureDatasetInfo.datasetName,
			tFeaturesCollectionName = this.domainStore.featureStore.featureDatasetInfo.collectionName,
			tWeightsCollectionName = this.domainStore.featureStore.featureDatasetInfo.weightsCollectionName,
			tUpdatingExistingWeights = await emptyFirstChildWeightCaseExists(),
			tCreationRequests: { parent: number, values: any }[] = [],
			tUpdateRequests: { id: number, values: any }[] = [],
			tFeatureWeightCaseIDs: { [index: string]: number } = {},
			tTokenArray:string[] = [],
			tModelName = this.domainStore.trainingStore.model.name

		async function showWeightAttributes() {
			const tShowRequests = [{
				action: 'update',
				resource: `dataContext[${tFeatureDatasetName}].collection[${tWeightsCollectionName}].attribute[weight]`,
				values: {hidden: false}
			},
				{
					action: 'update',
					resource: `dataContext[${tFeatureDatasetName}].collection[${tWeightsCollectionName}].attribute[model name]`,
					values: {hidden: false}
				}]
			await codapInterface.sendRequest(tShowRequests)
		}

		async function getFeatureWeightCaseIDs() {
			const tFeatureCountResult: any = await codapInterface.sendRequest({
					action: 'get',
					resource: `dataContext[${tFeatureDatasetName}].collection[${tFeaturesCollectionName}].caseCount`
				}),
				tFeatureCount = tFeatureCountResult.success ? tFeatureCountResult.values : 0,
				tRequests: {}[] = []
			for (let n = 0; n < tFeatureCount; n++) {
				tRequests.push({
						action: 'get',
						resource: `dataContext[${tFeatureDatasetName}].collection[${tFeaturesCollectionName}].caseByIndex[${n}]`
					}
				)
			}
			const tResults: any = await codapInterface.sendRequest(tRequests)
			tResults.forEach((iResult: any) => {
				if (iResult.success) {
					tFeatureWeightCaseIDs[iResult.values.case.values.name] = iResult.values.case.id
				}
			})
		}

		function generateRequests() {
			iTokens.forEach((aToken: any) => {
					if (tUpdatingExistingWeights) {
						tUpdateRequests.push({
							id: tFeatureWeightCaseIDs[aToken.token],
							values: {
								'model name': tModelName,
							}
						})
					} else {
						tFeatureWeightCaseIDs[aToken.token] = -1
						tTokenArray.push(aToken.token)
						tCreationRequests.push({
							parent: aToken.featureCaseID,
							values: {
								'model name': tModelName,
							}
						})
					}
				}
			)
		}

		// Start with features/weights collection
		await showWeightAttributes()
		if (tUpdatingExistingWeights) {
			await getFeatureWeightCaseIDs()
			this.domainStore.featureStore.featureWeightCaseIDs = tFeatureWeightCaseIDs
		}
		generateRequests()
		if (tUpdatingExistingWeights) {
			await codapInterface.sendRequest({
				action: 'update',
				resource: `dataContext[${tFeatureDatasetName}].collection[${tWeightsCollectionName}].case`,
				values: tUpdateRequests
			})
		} else {
			const tCreateResults:any = await codapInterface.sendRequest({
				action: 'create',
				resource: `dataContext[${tFeatureDatasetName}].collection[${tWeightsCollectionName}].case`,
				values: tCreationRequests
			})
			tCreateResults.values.forEach((iValue:{id:number}, iIndex:number)=> {
				tFeatureWeightCaseIDs[tTokenArray[iIndex]] = iValue.id
			})
			console.log(tFeatureWeightCaseIDs)
			this.domainStore.featureStore.featureWeightCaseIDs = tFeatureWeightCaseIDs
		}
	}

	async prepResultsCollection() {
		/**
		 * The results collection is a child of the target collection and is where we show the predicted labels and
		 * probabilities for each target text for each model
		 */
		async function guaranteeResultsCollection() {
			const tTargetClassAttributeName = tTargetStore.targetClassAttributeName,
				tPositiveClassName = tTargetStore.getClassName('positive'),
				tResultsCollectionName = tTargetStore.targetResultsCollectionName
			if (tTargetClassAttributeName !== '' && tPositiveClassName !== '') {
				const tCollectionListResult: any = await codapInterface.sendRequest({
					action: 'get',
					resource: `dataContext[${tTargetDatasetName}].collectionList`
				})
				if (tCollectionListResult.values.length === 1) {
					// There is not yet any results collection, so create it
					const tAttributeValues = [
						{
							name: 'model name',
							description: 'The model used for predicting these results'
						},
						{
							name: tPredictedLabelAttributeName,
							description: 'The label predicted by the model'
						},
						{
							name: 'probability of ' + tPositiveClassName,
							precision: 5,
							description: 'A computed probability based on the logistic regression model'
						}
					]
					await codapInterface.sendRequest({
						action: 'create',
						resource: `dataContext[${tTargetDatasetName}].collection`,
						values: [{
							name: tResultsCollectionName,
							title: tResultsCollectionName,
							attrs: tAttributeValues
						}]
					}).catch(reason => {
						console.log(`Exception in creating results collection because ${reason}`)
					})

					// This unfortunately installs an empty child case for each parent case. We store their IDs so we can
					// use them later as the place to store model results
					const tCaseIDResult: any = await codapInterface.sendRequest({
						action: 'get',
						resource: `dataContext[${tTargetDatasetName}].collection[${tResultsCollectionName}].caseFormulaSearch[true]`
					})
					tResultCaseIDsToFill = tCaseIDResult.values.map((iValue: any) => Number(iValue.id))
				}
				else {	// We add a new case to each parent case for the next set of results
					const tParentCollectionName = tTargetStore.targetCollectionName,
						tCreateRequests:{parent:number, values:{}}[] = []
					// First we get the parent case IDs
					const tParentCaseIDResults: any = await codapInterface.sendRequest({
						action: 'get',
						resource: `dataContext[${tTargetDatasetName}].collection[${tParentCollectionName}].caseFormulaSearch[true]`
					})
					// Formulate the requests for the child cases
					tParentCaseIDResults.values.forEach((iResult:{id:number})=>{
						tCreateRequests.push( {
							parent: Number(iResult.id),
							values:{}
						})
					})
					// Send off the requests
					const tChildrenRequestResult:any = await codapInterface.sendRequest( {
						action: 'create',
						resource: `dataContext[${tTargetDatasetName}].collection[${tResultsCollectionName}].case`,
						values: tCreateRequests
					})
					// Store the IDs for the children for later use
					tResultCaseIDsToFill = tChildrenRequestResult.values.map((iValue: any) => Number(iValue.id))
					console.log(tResultCaseIDsToFill)
				}
			}
		}

		const
			this_ = this,
			tTargetStore = this_.domainStore.targetStore,
			tPredictedLabelAttributeName = tTargetStore.targetPredictedLabelAttributeName,
			tTargetDatasetName = tTargetStore.targetDatasetInfo.name
		let tResultCaseIDsToFill: number[] = []

		await guaranteeResultsCollection()

		this.domainStore.trainingStore.resultCaseIDs = tResultCaseIDsToFill
	}

	async cancel() {

		async function wipeWeights() {
			const tFeatureDatasetName = this_.domainStore.featureStore.featureDatasetInfo.datasetName,
				tWeightsCollectionName = this_.domainStore.featureStore.featureDatasetInfo.weightsCollectionName,
				tFeatureWeightCaseIDs = this_.domainStore.featureStore.featureWeightCaseIDs,
				tUpdateRequests: { id: number, values: any }[] = []
			for (let featureWeightCaseIDsKey in tFeatureWeightCaseIDs) {
				tUpdateRequests.push({
					id: tFeatureWeightCaseIDs[featureWeightCaseIDsKey],
					values: {
						'model name': '',
						weight: ''
					}
				})
			}
			await codapInterface.sendRequest({
				action: 'update',
				resource: `dataContext[${tFeatureDatasetName}].collection[${tWeightsCollectionName}].case`,
				values: tUpdateRequests
			})
		}

		async function wipeResultsInTarget() {
			const tTargetStore = this_.domainStore.targetStore,
				tTargetDatasetName = tTargetStore.targetDatasetInfo.name,
				tResultsCollectionName = tTargetStore.targetResultsCollectionName,
				tResultCaseIDs = this_.domainStore.trainingStore.resultCaseIDs,
				tPredictedLabelAttributeName = tTargetStore.targetPredictedLabelAttributeName,
				tProbName = `probability of ${this_.domainStore.targetStore.getClassName('positive')}`,
				tUpdateRequests = tResultCaseIDs.map(iID => {
					const tRequest:any = {
						id: iID,
						values: {
							'model name': '',
						}
					}
					tRequest.values[tPredictedLabelAttributeName] = ''
					tRequest.values[tProbName] = ''
					return tRequest
				})
			await codapInterface.sendRequest({
				action: 'update',
				resource: `dataContext[${tTargetDatasetName}].collection[${tResultsCollectionName}].case`,
				values: tUpdateRequests,
			})
		}

		const this_ = this,
			tTrainingStore = this.domainStore.trainingStore,
			tModel = tTrainingStore.model,
			tLogisiticModel = tModel.logisticModel

		tModel.reset()
		tLogisiticModel.reset()
		await wipeWeights()
		await wipeResultsInTarget()
	}

	async buildModel() {
		const this_ = this

		async function setup() {
			await deselectAllCasesIn(tTargetDatasetName)
			tLogisticModel.reset()
			tLogisticModel.progressCallback = this_.progressBar
			tLogisticModel.trace = this_.domainStore.trainingStore.model.trainingInStepMode
			tLogisticModel.stepModeCallback = this_.domainStore.trainingStore.model.trainingInStepMode ?
				this_.stepModeCallback : null
			tLogisticModel.lockIntercept = this_.domainStore.trainingStore.model.lockInterceptAtZero
			const tCases = this_.domainStore.targetStore.targetCases,
				tColumnNames = tTargetColumnFeatureNames.concat(
					this_.domainStore.featureStore.getChosenFeatures().map(iFeature => {
						return iFeature.name;
					}))
			// Grab the strings in the target collection that are the values of the target attribute.
			// Stash these in an array that can be used to produce a oneHot representation
			tCases.forEach(iCase => {
				const tCaseID = iCase.id,
					tText = iCase.values[tTargetAttributeName],
					tClass = iCase.values[tTargetClassAttributeName],
					tColumnFeatures: { [key: string]: number | boolean } = {};
				// We're going to put column features into each document as well so one-hot can include them in the vector
				tColumnNames.forEach((aName) => {
					let tValue: string | number = iCase.values[aName];
					if (['1', 'true'].indexOf(String(tValue).toLowerCase()) >= 0)
						tValue = 1;
					else
						tValue = 0;
					if (tValue)
						tColumnFeatures[aName] = tValue;
				});
				tDocuments.push({example: tText, class: tClass, caseID: tCaseID, columnFeatures: tColumnFeatures});
			})
		}

		const tTargetDatasetName = this.domainStore.targetStore.targetDatasetInfo.name,
			tTargetAttributeName = this.domainStore.targetStore.targetAttributeName,
			tTargetClassAttributeName = this.domainStore.targetStore.targetClassAttributeName,
			tTargetColumnFeatureNames = this.domainStore.featureStore.targetColumnFeatureNames,
			tNonNgramFeatures = this.domainStore.featureStore.getChosenFeatures().filter(iFeature => iFeature.info.kind !== 'ngram'),
			tNgramFeatures = this.domainStore.featureStore.getChosenFeatures().filter(iFeature => iFeature.info.kind === 'ngram'),
			tUnigramFeature = tNgramFeatures.find(iFeature => (iFeature.info.details as NgramDetails).n === 'uni'),
			tPositiveClassName = this.domainStore.targetStore.getClassName('positive'),
			tDocuments: {
				example: string, class: string, caseID: number,
				columnFeatures: { [key: string]: number | boolean }
			}[] = [],
			tLogisticModel = this.domainStore.trainingStore.model.logisticModel

		await setup()

		const tData: number[][] = [];

		// Logistic can't happen until we've isolated the features and produced a oneHot representation
		const tIgnore = tUnigramFeature && (tUnigramFeature.info.ignoreStopWords === true ||
			tUnigramFeature.info.ignoreStopWords === false) ? tUnigramFeature.info.ignoreStopWords : true
		let tOneHot = oneHot({
				frequencyThreshold: (tUnigramFeature && (Number(tUnigramFeature.info.frequencyThreshold) - 1)) || 0,
				ignoreStopWords: tIgnore,
				includeUnigrams: Boolean(tUnigramFeature),
				positiveClass: tPositiveClassName,
				negativeClass: this.domainStore.targetStore.getClassName('negative'),
				features: tNonNgramFeatures,
				tokenMap: this.domainStore.featureStore.tokenMap
			},
			tDocuments)
		if (!tOneHot)
			return

		// Column feature results get pushed on after unigrams

		// The logisticModel.fit function requires that the class value (0 or 1) be the
		// last element of each oneHot.
		tOneHot.oneHotResult.forEach(iResult => {
			iResult.oneHotExample.push(iResult.class === tPositiveClassName ? 1 : 0);
			tData.push(iResult.oneHotExample);
		});

		// In step mode we'll be repeatedly updating weights and results. Prep for that before we start fitting
		await this.prepWeightsCollection(tOneHot.tokenArray)
		await this.prepResultsCollection()

		// The fitting process is asynchronous so we fire it off here
		// @ts-ignore
		tLogisticModel.fit(tData);
		tLogisticModel._data = tData;
		tLogisticModel._oneHot = tOneHot;
		tLogisticModel._documents = tDocuments;
	}

	async progressBar(iIteration: number) {
		const tTrainingStore = this.domainStore.trainingStore,
			tModel = tTrainingStore.model,
			tIterations = tModel.iterations,
			this_ = this
		runInAction(async () => {
			tModel.iteration = iIteration
			if (iIteration >= tIterations) {
				const tLogisticModel = tModel.logisticModel,
					tTrainingResults = this_.domainStore.trainingStore.trainingResults

				await this_.computeResults(tModel.logisticModel.fitResult.theta)

				tTrainingStore.inactivateAll()

				tTrainingResults.push({
					name: tModel.name,
					isActive: true,
					threshold: Number(tLogisticModel.threshold),
					constantWeightTerm: tLogisticModel.fitResult.constantWeightTerm,
					settings: {
						iterations: tLogisticModel.iterations,
						locked: tLogisticModel.lockIntercept,
						thresholdAtPoint5: tModel.usePoint5AsProbThreshold
					},
					accuracy: tLogisticModel.accuracy || 0,
					kappa: tLogisticModel.kappa || 0,
					featureNames: this.domainStore.featureStore.getChosenFeatureNames(),
					hasNgram: this.domainStore.featureStore.hasNgram(),
					storedModel: this.fillOutCurrentStoredModel(tLogisticModel)
				})

				tModel.reset()
			}
		})
	}

	async stepModeCallback(iIteration: number, iCost: number, iWeights: number[], continueCallback: (iter: number) => void) {
		await this.computeResults(iWeights)
		this.stepModeContinueCallback = continueCallback
		this.stepModeIteration = iIteration
	}

	nextStep() {
		const tLogisticModel = this.domainStore.trainingStore.model.logisticModel
		tLogisticModel.trace = this.domainStore.trainingStore.model.trainingInStepMode
		tLogisticModel.stepModeCallback = this.domainStore.trainingStore.model.trainingInStepMode ?
			this.stepModeCallback : null

		this.stepModeContinueCallback && this.stepModeContinueCallback(this.stepModeIteration + 1)
	}

	fillOutCurrentStoredModel(iLogisticModel: LogisticRegression): StoredModel {
		const this_ = this,
			tTokenArray = iLogisticModel._oneHot.tokenArray,
			tWeights = iLogisticModel.fitResult.theta	// toss the constant term

		return {
			storedTokens: tTokenArray.map((iToken: any, iIndex: number) => {
				return {
					featureCaseID: iToken.featureCaseID,
					name: iToken.token,
					formula: iToken.type !== 'unigram' ? this_.domainStore.featureStore.getFormulaFor(iToken.token) : '',
					weight: tWeights[iIndex]
				}
			}),
			positiveClassName: this.domainStore.targetStore.getClassName('positive'),
			negativeClassName: this.domainStore.targetStore.getClassName('negative')
		}
	}

	async computeResults(iWeights: number[]) {
		const tModel = this.domainStore.trainingStore.model,
			tLogisticModel = tModel.logisticModel,
			tData = tLogisticModel._data,
			tOneHot = tLogisticModel._oneHot,
			tPositiveClassName = this.domainStore.targetStore.getClassName('positive'),
			tNegativeClassName = this.domainStore.targetStore.getClassName('negative'),
			tDocuments = tLogisticModel._documents;
		await this.updateWeights(tModel.name, tOneHot.tokenArray, iWeights);

		let tPredictionTools = {
			logisticModel: tLogisticModel,
			oneHotData: tData,
			documents: tDocuments,
			tokenArray: tOneHot.tokenArray,
			positiveClassName: tPositiveClassName,
			negativeClassName: tNegativeClassName,
			lockProbThreshold: this.domainStore.trainingStore.model.usePoint5AsProbThreshold
		}
		await this.showPredictedLabels(tModel.name, tPredictionTools)
	}

	async updateWeights(iModelName: string, iTokens: any, iWeights: number[]) {

		function generateRequests() {
			iTokens.forEach((aToken: any, iIndex: number) => {
					tUpdateRequests.push({
						id: tFeatureWeightCaseIDs[aToken.token],
						values: {
							'model name': iModelName,
							weight: iWeights[iIndex]
						}
					})
					// Also update in stored features
					let tFoundFeature = tFeatures.find(iFeature => iFeature.name === aToken.token)
					if (tFoundFeature)
						tFoundFeature.weight = iWeights[iIndex]
				}
			)
		}

		const tFeatureDatasetName = this.domainStore.featureStore.featureDatasetInfo.datasetName,
			tWeightsCollectionName = this.domainStore.featureStore.featureDatasetInfo.weightsCollectionName,
			tFeatures = this.domainStore.featureStore.getChosenFeatures(),
			tUpdateRequests: { id: number, values: any }[] = [],
			tFeatureWeightCaseIDs = this.domainStore.featureStore.featureWeightCaseIDs

		generateRequests()

		await codapInterface.sendRequest({
			action: 'update',
			resource: `dataContext[${tFeatureDatasetName}].collection[${tWeightsCollectionName}].case`,
			values: tUpdateRequests
		})
	}

	/**
	 * Add attributes for predicted label and for probability. Compute and stash values.
	 * @param iModelName
	 * @param iTools
	 * @private
	 */
	private async showPredictedLabels(iModelName: string, iTools:
		{
			logisticModel: any,	// Will compute probabilities
			oneHotData: number[][],
			documents: any,
			tokenArray: any,
			positiveClassName: string,
			negativeClassName: string,
			lockProbThreshold: boolean
		}
	) {

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
				if (tNegIndex === -1)
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
			return tRecord.threshold;
		}

		const
			this_ = this,
			tTargetStore = this_.domainStore.targetStore,
			tOneHotLength = iTools.oneHotData[0].length,
			tPosProbs: number[] = [],
			tNegProbs: number[] = [],
			tMapFromCaseIDToProbability: any = {},
			kProbPredAttrNamePrefix = 'probability of ',
			tProbName = `${kProbPredAttrNamePrefix}${iTools.positiveClassName}`,
			tPredictedLabelAttributeName = tTargetStore.targetPredictedLabelAttributeName,
			tTargetDatasetName = tTargetStore.targetDatasetInfo.name,
			tResultsCollectionName = tTargetStore.targetResultsCollectionName,
			tResultCaseIDs = this.domainStore.trainingStore.resultCaseIDs

		// Create values of predicted label and probability for each document
		let tThresholdResult = findThreshold(),
			// tWeAreUpdating = tResultCaseIDs.length > 0,
			// tLabelValuesForCreation: { parent: number, values: any }[] = [],
			tLabelValuesForUpdating: { id: number, values: any }[] = [],
			tActualPos = 0,
			tPredictedPos = 0,
			tBothPos = 0,
			tBothNeg = 0;
		iTools.logisticModel.threshold = tThresholdResult;
		iTools.documents.forEach((aDoc: any, iIndex: number) => {
			let tProbability: number,
				tPredictedLabel,
				tActualLabel,
				tValues: any = {'model name': iModelName};
			tProbability = tMapFromCaseIDToProbability[aDoc.caseID];
			tPredictedLabel = tProbability > tThresholdResult ? iTools.positiveClassName : iTools.negativeClassName;
			tValues[tPredictedLabelAttributeName] = tPredictedLabel;
			tValues[tProbName] = tProbability;
			tActualLabel = aDoc.class;
			tActualPos += tActualLabel === iTools.positiveClassName ? 1 : 0;
			tPredictedPos += tPredictedLabel === iTools.positiveClassName ? 1 : 0;
			tBothPos += (tActualLabel === iTools.positiveClassName && tPredictedLabel === iTools.positiveClassName) ? 1 : 0;
			tBothNeg += (tActualLabel === iTools.negativeClassName && tPredictedLabel === iTools.negativeClassName) ? 1 : 0;

			// if (tWeAreUpdating) {
			tLabelValuesForUpdating.push({
				id: tResultCaseIDs[iIndex],
				values: tValues
			})
			/*
						} else {
							tLabelValuesForCreation.push({
								parent: aDoc.caseID,
								values: tValues
							})
						}
			*/
		});

		let computedKappa = computeKappa(iTools.documents.length, tBothPos, tBothNeg, tActualPos, tPredictedPos);
		iTools.logisticModel.accuracy = computedKappa.observed;
		iTools.logisticModel.kappa = computedKappa.kappa;

		// Send the values to CODAP
		// if (tWeAreUpdating) {
		// 	tResultCaseIDs.length = 0
		await codapInterface.sendRequest({
			action: 'update',
			resource: `dataContext[${tTargetDatasetName}].collection[${tResultsCollectionName}].case`,
			values: tLabelValuesForUpdating,
		})
		/*
				} else {
					await codapInterface.sendRequest({
						action: 'create',
						resource: `dataContext[${tTargetDatasetName}].collection[${tResultsCollectionName}].case`,
						values: tLabelValuesForCreation
					})
				}
		*/
	}

}

