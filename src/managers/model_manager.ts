/**
 * The ModelManager uses information in the domain store to build a model
 */
import { action, runInAction } from "mobx";
import { deselectAllCasesIn } from "../lib/codap-helper";
import codapInterface from "../lib/CodapInterface";
import { LogisticRegression } from "../lib/jsregression";
import { oneHot } from "../lib/one_hot";
import { domainStore } from "../stores/domain_store";
import { featureStore } from "../stores/feature_store";
import { Feature, NgramDetails, StoredAIModel, Token } from "../stores/store_types_and_constants";
import { targetStore } from "../stores/target_store";
import { trainingStore } from "../stores/training_store";
import { computeKappa } from "../utilities/utilities";
import { APIRequest, CaseValues, CreateCaseResponse, CreateCaseValue, GetCaseByIDResponse, GetCaseCountResponse, GetCaseFormulaSearchResponse, GetCollectionListResponse, GetItemSearchResponse, UpdateCaseValue } from "../types/codap-api-types";

export class ModelManager {

	stepModeContinueCallback: ((iIteration: number) => void) | null = null
	stepModeIteration: number = 0

	constructor() {
		this.progressBar = this.progressBar.bind(this)
		this.stepModeCallback = this.stepModeCallback.bind(this)
	}

	guaranteeUniqueModelName(iCandidate: string) {
		function isNotUnique(iName: string) {
			return Boolean(trainingStore.trainingResults.find(iResult => iResult.name === iName))
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

		/**
		 * We test to see if the weight case for each token has an empty model name
		 */
		async function allFirstWeightCasesAreEmpty() {
			const tAttrName = 'name'
			let tIsEmpty = true,
				tFoundOne = false;
			for (let tIndex = 0; tIndex < iTokens.length && tIsEmpty; tIndex++) {
				const tFormula = `${tAttrName}==${iTokens[tIndex].token}`,
					tFirstChildResult = await codapInterface.sendRequest({
						action: 'get',
						resource: `dataContext[${datasetName}].itemSearch[${tFormula}]`
					}) as GetItemSearchResponse;
				if (tFirstChildResult.success && tFirstChildResult.values && tFirstChildResult.values.length > 0) {
					tFoundOne = true
					const tName = tFirstChildResult.values[0].values['model name']
					tIsEmpty = tIsEmpty && (!tName || tName === '')
				}
			}
			return tFoundOne && tIsEmpty
		}

		const { collectionName, datasetName, weightsCollectionName } = featureStore.featureDatasetInfo,
			tUpdatingExistingWeights = await allFirstWeightCasesAreEmpty(),
			tCreationRequests: CreateCaseValue[] = [],
			tUpdateRequests: UpdateCaseValue[] = [],
			tFeatureWeightCaseIDs: Record<string, number> = {},
			tTokenArray: string[] = [],
			tModelName = trainingStore.model.name;

		async function showWeightAttributes() {
			const tShowRequests = [{
				action: 'update',
				resource: `dataContext[${datasetName}].collection[${weightsCollectionName}].attribute[weight]`,
				values: {hidden: false}
			}, {
				action: 'update',
				resource: `dataContext[${datasetName}].collection[${weightsCollectionName}].attribute[model name]`,
				values: {hidden: false}
			}];
			await codapInterface.sendRequest(tShowRequests);
		}

		async function getFeatureWeightCaseIDs() {
			const tFeatureCountResult = await codapInterface.sendRequest({
					action: 'get',
					resource: `dataContext[${datasetName}].collection[${collectionName}].caseCount`
				}) as GetCaseCountResponse,
				tFeatureCount = tFeatureCountResult.success&& tFeatureCountResult.values ? tFeatureCountResult.values : 0,
				tRequests: APIRequest[] = [];
			for (let n = 0; n < tFeatureCount; n++) {
				tRequests.push({
					action: 'get',
					resource: `dataContext[${datasetName}].collection[${collectionName}].caseByIndex[${n}]`
				});
			}
			const tResults = await codapInterface.sendRequest(tRequests) as GetCaseByIDResponse[];
			tResults.forEach(iResult => {
				if (iResult.success && iResult.values) {
					tFeatureWeightCaseIDs[String(iResult.values.case.values.name)] = iResult.values.case.id;
				}
			});
		}

		function generateFeatureRequests() {
			iTokens.forEach(aToken => {
				if (tUpdatingExistingWeights) {
					tUpdateRequests.push({
						id: tFeatureWeightCaseIDs[aToken.token],
						values: {
							'model name': tModelName,
						}
					});
				} else {
					tFeatureWeightCaseIDs[aToken.token] = -1;
					tTokenArray.push(aToken.token);
					tCreationRequests.push({
						parent: aToken.featureCaseID || 0,
						values: {
							'model name': tModelName,
						}
					});
				}
			});
		}

		// Start with features/weights collection
		await showWeightAttributes();
		if (tUpdatingExistingWeights) {
			await getFeatureWeightCaseIDs();
			featureStore.featureWeightCaseIDs = tFeatureWeightCaseIDs;
		}
		generateFeatureRequests()
		if (tUpdatingExistingWeights) {
			await codapInterface.sendRequest({
				action: 'update',
				resource: `dataContext[${datasetName}].collection[${weightsCollectionName}].case`,
				values: tUpdateRequests
			});
		} else {
			const tCreateResults = await codapInterface.sendRequest({
				action: 'create',
				resource: `dataContext[${datasetName}].collection[${weightsCollectionName}].case`,
				values: tCreationRequests
			}) as CreateCaseResponse;
			if (tCreateResults.success && tCreateResults.values) {
				tCreateResults.values.forEach((iValue, iIndex) => {
					tFeatureWeightCaseIDs[tTokenArray[iIndex]] = iValue.id;
				});
			}
			featureStore.featureWeightCaseIDs = tFeatureWeightCaseIDs;
		}
	}

	async prepResultsCollection() {
		/**
		 * The results collection is a child of the target collection and is where we show the predicted labels and
		 * probabilities for each target text for each model
		 */
		async function guaranteeResultsCollection() {
			const tPositiveClassName = targetStore.getClassName('positive'),
				tResultsCollectionName = targetStore.targetResultsCollectionName;
			if (targetStore.targetClassAttributeName !== '' && tPositiveClassName !== '') {
				const collectionListResult  = await codapInterface.sendRequest({
					action: 'get',
					resource: `dataContext[${tTargetDatasetName}].collectionList`
				}) as GetCollectionListResponse;
				if (collectionListResult.success && collectionListResult.values && collectionListResult.values.length === 1) {
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
							unit: '%',
							precision: 3,
							description: 'A computed probability based on the logistic regression model'
						}
					];
					await codapInterface.sendRequest({
						action: 'create',
						resource: `dataContext[${tTargetDatasetName}].collection`,
						values: [{
							name: tResultsCollectionName,
							title: tResultsCollectionName,
							attrs: tAttributeValues
						}]
					}).catch(reason => {
						console.log(`Exception in creating results collection because ${reason}`);
					});

					// This unfortunately installs an empty child case for each parent case. We store their IDs so we can
					// use them later as the place to store model results
					const tCaseIDResult = await codapInterface.sendRequest({
						action: 'get',
						resource: `dataContext[${tTargetDatasetName}].collection[${tResultsCollectionName}].caseFormulaSearch[true]`
					}) as GetCaseFormulaSearchResponse;
					if (tCaseIDResult.success && tCaseIDResult.values) {
						tResultCaseIDsToFill = tCaseIDResult.values.map(iValue => Number(iValue.id));
					}
				} else {	// We add a new case to each parent case for the next set of results
					const tParentCollectionName = targetStore.targetCollectionName,
						tCreateRequests: { parent: number, values: {} }[] = [];
					// First we get the parent case IDs
					const tParentCaseIDResults = await codapInterface.sendRequest({
						action: 'get',
						resource: `dataContext[${tTargetDatasetName}].collection[${tParentCollectionName}].caseFormulaSearch[true]`
					}) as GetCaseFormulaSearchResponse;
					// Formulate the requests for the child cases
					if (tParentCaseIDResults.success && tParentCaseIDResults.values) {
						tParentCaseIDResults.values.forEach(iResult => {
							tCreateRequests.push({
								parent: Number(iResult.id),
								values: {}
							});
						});
					}
					// Send off the requests
					const tChildrenRequestResult = await codapInterface.sendRequest({
						action: 'create',
						resource: `dataContext[${tTargetDatasetName}].collection[${tResultsCollectionName}].case`,
						values: tCreateRequests
					}) as CreateCaseResponse;
					// Store the IDs for the children for later use
					if (tChildrenRequestResult.success && tChildrenRequestResult.values) {
						tResultCaseIDsToFill = tChildrenRequestResult.values.map(iValue => Number(iValue.id));
					}
				}
			}
		}

		const tPredictedLabelAttributeName = targetStore.targetPredictedLabelAttributeName,
			tTargetDatasetName = targetStore.targetDatasetInfo.name;
		let tResultCaseIDsToFill: number[] = [];

		await guaranteeResultsCollection();

		trainingStore.resultCaseIDs = tResultCaseIDsToFill;
	}

	async cancel() {

		async function wipeWeights() {
			const { datasetName, weightsCollectionName } = featureStore.featureDatasetInfo,
				tFeatureWeightCaseIDs = featureStore.featureWeightCaseIDs,
				tUpdateRequests: UpdateCaseValue[] = [];
			for (let featureWeightCaseIDsKey in tFeatureWeightCaseIDs) {
				tUpdateRequests.push({
					id: tFeatureWeightCaseIDs[featureWeightCaseIDsKey],
					values: {
						'model name': '',
						weight: ''
					}
				});
			}
			await codapInterface.sendRequest({
				action: 'update',
				resource: `dataContext[${datasetName}].collection[${weightsCollectionName}].case`,
				values: tUpdateRequests
			});
		}

		async function wipeResultsInTarget() {
			const tTargetDatasetName = targetStore.targetDatasetInfo.name,
				tPredictedLabelAttributeName = targetStore.targetPredictedLabelAttributeName,
				tProbName = `probability of ${targetStore.getClassName('positive')}`,
				tUpdateRequests = trainingStore.resultCaseIDs.map(iID => {
					const tRequest: UpdateCaseValue = {
						id: iID,
						values: {
							'model name': '',
						}
					}
					tRequest.values[tPredictedLabelAttributeName] = ''
					tRequest.values[tProbName] = ''
					return tRequest
				});
			await codapInterface.sendRequest({
				action: 'update',
				resource: `dataContext[${tTargetDatasetName}].collection[${targetStore.targetResultsCollectionName}].case`,
				values: tUpdateRequests,
			});
		}

		const tModel = trainingStore.model,
			tLogisiticModel = tModel.logisticModel;

		tModel.reset();
		tLogisiticModel.reset();
		await wipeWeights();
		await wipeResultsInTarget();
	}

	async buildModel() {
		const this_ = this

		const tTargetDatasetName = targetStore.targetDatasetInfo.name,
			tTargetAttributeName = targetStore.targetAttributeName,
			tTargetColumnFeatureNames = featureStore.targetColumnFeatureNames,
			tNonNgramFeatures = featureStore.getChosenFeatures().filter(iFeature => iFeature.info.kind !== 'ngram'),
			tNgramFeatures = featureStore.getChosenFeatures().filter(iFeature => iFeature.info.kind === 'ngram'),
			tUnigramFeature = tNgramFeatures.find(iFeature => (iFeature.info.details as NgramDetails).n === 'uni'),
			tPositiveClassName = targetStore.getClassName('positive'),
			tDocuments: {
				example: string, class: string, caseID: number,
				columnFeatures: { [key: string]: number | boolean }
			}[] = [],
			tLogisticModel = trainingStore.model.logisticModel

		async function setup() {
			await deselectAllCasesIn(tTargetDatasetName)
			tLogisticModel.reset()
			tLogisticModel.iterations = trainingStore.model.iterations
			tLogisticModel.progressCallback = this_.progressBar
			tLogisticModel.trace = trainingStore.model.trainingInStepMode
			tLogisticModel.stepModeCallback = trainingStore.model.trainingInStepMode ?
				this_.stepModeCallback : null
			tLogisticModel.lockIntercept = trainingStore.model.lockInterceptAtZero
			const tColumnNames = tTargetColumnFeatureNames.concat(
				featureStore.getChosenFeatures().map(iFeature => {
					return iFeature.name;
				})
			);
			// Grab the strings in the target collection that are the values of the target attribute.
			// Stash these in an array that can be used to produce a oneHot representation
			targetStore.targetCases.forEach(iCase => {
				const tCaseID = iCase.id,
					tText = iCase.values[tTargetAttributeName],
					tClass = iCase.values[targetStore.targetClassAttributeName],
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

		await setup()

		const tData: number[][] = [];

		// Logistic can't happen until we've isolated the features and produced a oneHot representation
		const tIgnore = tUnigramFeature && (tUnigramFeature.info.ignoreStopWords === true ||
			tUnigramFeature.info.ignoreStopWords === false) ? tUnigramFeature.info.ignoreStopWords : true;
		trainingStore.model.setIgnoreStopWords(tIgnore);
		let tOneHot = oneHot({
				frequencyThreshold: (tUnigramFeature && (Number(tUnigramFeature.info.frequencyThreshold) - 1)) || 0,
				ignoreStopWords: tIgnore,
				ignorePunctuation: true,
				includeUnigrams: Boolean(tUnigramFeature),
				positiveClass: tPositiveClassName,
				negativeClass: targetStore.getClassName('negative'),
				features: tNonNgramFeatures,
				tokenMap: featureStore.tokenMap
			},
			tDocuments);
		if (!tOneHot) return

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
		const tModel = trainingStore.model,
			tIterations = tModel.iterations,
			this_ = this
		runInAction(async () => {
			tModel.setIteration(iIteration);
			if (iIteration >= tIterations) {
				const tLogisticModel = tModel.logisticModel;

				await this_.computeResults(tModel.logisticModel.fitResult.theta)

				action(() => {
					trainingStore.inactivateAll()

					trainingStore.trainingResults.push({
						name: tModel.name,
						targetDatasetName: targetStore.targetDatasetInfo.name,
						isActive: true,
						threshold: Number(tLogisticModel.threshold),
						constantWeightTerm: tLogisticModel.fitResult.constantWeightTerm,
						ignoreStopWords: tModel.ignoreStopWords,
						settings: {
							iterations: tLogisticModel.iterations,
							locked: tLogisticModel.lockIntercept,
							thresholdAtPoint5: tModel.usePoint5AsProbThreshold
						},
						accuracy: tLogisticModel.accuracy || 0,
						kappa: (tLogisticModel.accuracy === 0) ? 0 : (tLogisticModel.kappa || 0),
						featureNames: featureStore.getChosenFeatureNames(),
						hasNgram: featureStore.hasNgram(),
						storedModel: this.fillOutCurrentStoredModel(tLogisticModel)
					})
				})()

				await domainStore.syncWeightsAndResultsWithActiveModels()
				await domainStore.recreateUsagesAndFeatureIDs(tModel.ignoreStopWords)

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
		const tLogisticModel = trainingStore.model.logisticModel
		tLogisticModel.trace = trainingStore.model.trainingInStepMode
		tLogisticModel.stepModeCallback = trainingStore.model.trainingInStepMode ?
			this.stepModeCallback : null

		this.stepModeContinueCallback && this.stepModeContinueCallback(this.stepModeIteration + 1)
	}

	fillOutCurrentStoredModel(iLogisticModel: LogisticRegression): StoredAIModel {
		const tTokenArray = iLogisticModel._oneHot.tokenArray,
			tWeights = iLogisticModel.fitResult.theta	// toss the constant term

		return {
			storedTokens: tTokenArray.map((iToken: any, iIndex: number) => {
				return {
					featureCaseID: iToken.featureCaseID,
					name: iToken.token,
					formula: iToken.type !== 'unigram' ? featureStore.getFormulaFor(iToken.token) : '',
					weight: tWeights[iIndex]
				}
			}),
			positiveClassName: targetStore.getClassName('positive'),
			negativeClassName: targetStore.getClassName('negative')
		}
	}

	async computeResults(iWeights: number[]) {
		const tModel = trainingStore.model,
			tLogisticModel = tModel.logisticModel,
			tData = tLogisticModel._data,
			tOneHot = tLogisticModel._oneHot,
			tPositiveClassName = targetStore.getClassName('positive'),
			tNegativeClassName = targetStore.getClassName('negative'),
			tDocuments = tLogisticModel._documents;
		await this.updateWeights(tModel.name, tOneHot.tokenArray, iWeights);

		let tPredictionTools = {
			logisticModel: tLogisticModel,
			oneHotData: tData,
			documents: tDocuments,
			tokenArray: tOneHot.tokenArray,
			positiveClassName: tPositiveClassName,
			negativeClassName: tNegativeClassName,
			lockProbThreshold: trainingStore.model.usePoint5AsProbThreshold
		}
		await this.showPredictedLabels(tModel.name, tPredictionTools)
	}

	async updateWeights(iModelName: string, iTokens: any, iWeights: number[]) {
		const { collectionName, datasetName } = featureStore.featureDatasetInfo,
			tFeatures = featureStore.getChosenFeatures(),
			tUpdateRequests: UpdateCaseValue[] = [],
			tFeatureWeightCaseIDs = featureStore.featureWeightCaseIDs

		function generateRequests() {
			iTokens.forEach((aToken: any, iIndex: number) => {
					let tWeight: number | '',
						tFeature: Feature | undefined,
						tFeatureIsChosen: boolean | undefined = false
					if (aToken.type === 'unigram') {
						tWeight = iWeights[iIndex]
					} else {
						tFeature = tFeatures.find(iFeature => aToken.token === iFeature.name)
						tFeatureIsChosen = tFeature && tFeature.chosen
						tWeight = tFeatureIsChosen ? iWeights[iIndex] : ''
					}
					tUpdateRequests.push({
						id: tFeatureWeightCaseIDs[aToken.token],
						values: {
							'model name': iModelName,
							weight: tWeight
						}
					})
					// Also update in stored features
					if (tFeature && tFeatureIsChosen)
						tFeature.weight = tWeight
				}
			)
		}

		generateRequests()

		await codapInterface.sendRequest({
			action: 'update',
			resource: `dataContext[${datasetName}].collection[${collectionName}].case`,
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
			tOneHotLength = iTools.oneHotData[0].length,
			tPosProbs: number[] = [],
			tNegProbs: number[] = [],
			tMapFromCaseIDToProbability: Record<any, number> = {},
			kProbPredAttrNamePrefix = 'probability of ',
			tProbName = `${kProbPredAttrNamePrefix}${iTools.positiveClassName}`,
			tPredictedLabelAttributeName = targetStore.targetPredictedLabelAttributeName,
			tTargetDatasetName = targetStore.targetDatasetInfo.name;

		// Create values of predicted label and probability for each document
		let tThresholdResult = findThreshold(),
			// tWeAreUpdating = tResultCaseIDs.length > 0,
			tLabelValuesForUpdating: UpdateCaseValue[] = [],
			tActualPos = 0,
			tPredictedPos = 0,
			tBothPos = 0,
			tBothNeg = 0;
		iTools.logisticModel.threshold = tThresholdResult;
		iTools.documents.forEach((aDoc: any, iIndex: number) => {
			let tProbability: number,
				tPredictedLabel,
				tActualLabel,
				tValues: CaseValues = {'model name': iModelName};
			tProbability = tMapFromCaseIDToProbability[aDoc.caseID];
			tPredictedLabel = tProbability > tThresholdResult ? iTools.positiveClassName : iTools.negativeClassName;
			tValues[tPredictedLabelAttributeName] = tPredictedLabel;
			tValues[tProbName] = tProbability * 100;	// Convert o %
			tActualLabel = aDoc.class;
			tActualPos += tActualLabel === iTools.positiveClassName ? 1 : 0;
			tPredictedPos += tPredictedLabel === iTools.positiveClassName ? 1 : 0;
			tBothPos += (tActualLabel === iTools.positiveClassName && tPredictedLabel === iTools.positiveClassName) ? 1 : 0;
			tBothNeg += (tActualLabel === iTools.negativeClassName && tPredictedLabel === iTools.negativeClassName) ? 1 : 0;

			// if (tWeAreUpdating) {
			tLabelValuesForUpdating.push({
				id: trainingStore.resultCaseIDs[iIndex],
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
		iTools.logisticModel.kappa = (computedKappa.observed === 0) ? 0 : computedKappa.kappa;

		// Send the values to CODAP
		// if (tWeAreUpdating) {
		// 	tResultCaseIDs.length = 0
		await codapInterface.sendRequest({
			action: 'update',
			resource: `dataContext[${tTargetDatasetName}].collection[${targetStore.targetResultsCollectionName}].case`,
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

