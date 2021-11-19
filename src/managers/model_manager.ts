/**
 * The ModelManager uses information in the domain store to build a model
 */
import {DomainStore} from "../stores/domain_store";
import {deselectAllCasesIn} from "../lib/codap-helper";
import codapInterface from "../lib/CodapInterface";
import {oneHot} from "../lib/one_hot";
import {runInAction} from "mobx";
import {computeKappa} from "../utilities/utilities";
import {NgramDetails, StoredModel} from "../stores/store_types_and_constants";
import {LogisticRegression} from "../lib/jsregression";

export class ModelManager {

	domainStore: DomainStore

	constructor(iDomainStore: DomainStore) {
		this.domainStore = iDomainStore
		this.progressBar = this.progressBar.bind(this)
	}

	guaranteeUniqueModelName(iCandidate:string) {
		const this_ = this

		function isNotUnique(iName:string) {
			return Boolean(this_.domainStore.trainingStore.trainingResults.find(iResult=>iResult.name === iName))
		}

		let counter = 1,
			tTest = iCandidate
		while( isNotUnique(tTest)) {
			tTest = `${iCandidate}_${counter}`
			counter++
		}
		return tTest
	}

	async buildModel() {
		const this_ = this

		async function setup() {
			await deselectAllCasesIn(tTargetDatasetName)
			tLogisticModel.reset()
			tLogisticModel.progressCallback = this_.progressBar
			tLogisticModel.lockIntercept = this_.domainStore.trainingStore.model.lockInterceptAtZero
			const tCases = this_.domainStore.targetStore.targetCases,
				tColumnNames = tTargetColumnFeatureNames.concat(
					this_.domainStore.featureStore.features.map(iFeature => {
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
			tNonNgramFeatures = this.domainStore.featureStore.features.filter(iFeature => iFeature.info.kind !== 'ngram'),
			tNgramFeatures = this.domainStore.featureStore.features.filter(iFeature => iFeature.info.kind === 'ngram'),
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

		// The fitting process is asynchronous so we fire it off here
		// @ts-ignore
		tLogisticModel.fit(tData);
		tLogisticModel._data = tData;
		tLogisticModel._oneHot = tOneHot;
		tLogisticModel._documents = tDocuments;
	}

	progressBar(iIteration: number) {
		const tTrainingStore = this.domainStore.trainingStore,
			tModel = tTrainingStore.model,
			tIterations = tModel.iterations,
			this_ = this
		runInAction(async () => {
			tModel.iteration = iIteration
			if (iIteration >= tIterations) {
				const tLogisticModel = tModel.logisticModel,
					tTrainingResults = this_.domainStore.trainingStore.trainingResults

				await this_.computeResults()

				tTrainingStore.inactivateAll()

				tTrainingResults.push({
					name: tModel.name,
					isActive:true,
					threshold: Number(tLogisticModel.threshold),
					constantWeightTerm: tLogisticModel.fitResult.constantWeightTerm,
					accuracy: tLogisticModel.accuracy || 0,
					kappa: tLogisticModel.kappa || 0,
					featureNames: this.domainStore.featureStore.getFeatureNames(),
					hasNgram: this.domainStore.featureStore.hasNgram(),
					storedModel: this.fillOutCurrentStoredModel(tLogisticModel)
				})

				tModel.reset()
			}
		})
	}

	fillOutCurrentStoredModel(iLogisticModel:LogisticRegression): StoredModel {
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

	async computeResults() {
		const tModel = this.domainStore.trainingStore.model,
			tLogisticModel = tModel.logisticModel,
			tFitResult = tLogisticModel.fitResult,
			tData = tLogisticModel._data,
			tOneHot = tLogisticModel._oneHot,
			tPositiveClassName = this.domainStore.targetStore.getClassName('positive'),
			tNegativeClassName = this.domainStore.targetStore.getClassName('negative'),
			tDocuments = tLogisticModel._documents;
		await this.updateWeights(tModel.name, tOneHot.tokenArray, tFitResult.theta);

		let tPredictionTools = {
			logisticModel: tLogisticModel,
			oneHotData: tData,
			documents: tDocuments,
			tokenArray: tOneHot.tokenArray,
			positiveClassName: tPositiveClassName,
			negativeClassName: tNegativeClassName,
			lockProbThreshold: this.domainStore.trainingStore.model.usePoint5AsProbThreshold
		}
		await this.showPredictedLabels(tModel.name, tPredictionTools);
	}

	async updateWeights(iModelName: string, iTokens: any, iWeights: number[]) {
		const tFeaturesValues: any[] = [],
			tFeatureDatasetName = this.domainStore.featureStore.featureDatasetInfo.datasetName,
			tWeightsCollectionName = this.domainStore.featureStore.featureDatasetInfo.weightsCollectionName,
			tFeatures = this.domainStore.featureStore.features,
			tShowRequests = [{
				action: 'update',
				resource: `dataContext[${tFeatureDatasetName}].collection[${tWeightsCollectionName}].attribute[weight]`,
				values: {hidden: false}
			},
				{
					action: 'update',
					resource: `dataContext[${tFeatureDatasetName}].collection[${tWeightsCollectionName}].attribute[model]`,
					values: {hidden: false}
				}]

		// Make sure the 'weight and model name' attributes are not hidden
		await codapInterface.sendRequest(tShowRequests)

		iTokens.forEach((aToken: any, iIndex: number) => {
			const tOneFeatureUpdate = {
				parent: aToken.featureCaseID,
				values: {
					'model name': iModelName,
					weight: iWeights[iIndex]
				}
			};
			tFeaturesValues.push(tOneFeatureUpdate);
			// Also update in stored features
			let tFoundFeature = tFeatures.find(iFeature => iFeature.name === aToken.name)
			if (tFoundFeature)
				tFoundFeature.weight = iWeights[iIndex]
		});
		await codapInterface.sendRequest({
			action: 'create',
			resource: `dataContext[${tFeatureDatasetName}].collection[${tWeightsCollectionName}].case`,
			values: tFeaturesValues
		});
	}

	/**
	 * Add attributes for predicted label and for probability. Compute and stash values.
	 * @param iModelName
	 * @param iTools
	 * @private
	 */
	private async showPredictedLabels(iModelName: string, iTools: {
		logisticModel: any,	// Will compute probabilities
		oneHotData: number[][],
		documents: any,
		tokenArray: any,
		positiveClassName: string,
		negativeClassName: string,
		lockProbThreshold: boolean
	}) {
		const tOneHotLength = iTools.oneHotData[0].length,
			tPosProbs: number[] = [],
			tNegProbs: number[] = [],
			tMapFromCaseIDToProbability: any = {},
			kProbPredAttrNamePrefix = 'probability of ',
			tProbName = `${kProbPredAttrNamePrefix}${iTools.positiveClassName}`,
			tPredictedLabelAttributeName = this.domainStore.targetStore.targetPredictedLabelAttributeName,
			tTargetDatasetName = this.domainStore.targetStore.targetDatasetInfo.name,
			tResultsCollectionName = this.domainStore.targetStore.targetResultsCollectionName

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

		// Create values of predicted label and probability for each document
		let tThresholdResult = findThreshold(),
			tResultCaseIDsToFill = this.domainStore.targetStore.resultCaseIDsToFill,
			tWeAreUpdating = tResultCaseIDsToFill.length > 0,
			tLabelValuesForCreation: { parent: number, values: any }[] = [],
			tLabelValuesForUpdating: { id:number, values: any }[] = [],
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

			if (tWeAreUpdating) {
				tLabelValuesForUpdating.push({
					id: tResultCaseIDsToFill[iIndex],
					values: tValues
				})
			} else {
				tLabelValuesForCreation.push({
					parent: aDoc.caseID,
					values: tValues
				})
			}
		});

		let computedKappa = computeKappa(iTools.documents.length, tBothPos, tBothNeg, tActualPos, tPredictedPos);
		iTools.logisticModel.accuracy = computedKappa.observed;
		iTools.logisticModel.kappa = computedKappa.kappa;

		// Send the values to CODAP
		if (tWeAreUpdating) {
			tResultCaseIDsToFill.length = 0
			await codapInterface.sendRequest({
				action: 'update',
				resource: `dataContext[${tTargetDatasetName}].collection[${tResultsCollectionName}].case`,
				values: tLabelValuesForUpdating,
			})
		} else {
			await codapInterface.sendRequest({
				action: 'create',
				resource: `dataContext[${tTargetDatasetName}].collection[${tResultsCollectionName}].case`,
				values: tLabelValuesForCreation
			})
		}
	}

}

