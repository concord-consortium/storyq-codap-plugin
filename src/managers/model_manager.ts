/**
 * The ModelManager uses information in the domain store to build a model
 */
import {DomainStore} from "../stores/domain_store";
import {addAttributesToTarget, deselectAllCasesIn, getCaseCount} from "../lib/codap-helper";
import codapInterface from "../lib/CodapInterface";
import {oneHot} from "../lib/one_hot";
import {runInAction} from "mobx";
import {computeKappa} from "../utilities/utilities";

export class ModelManager {

	domainStore: DomainStore

	constructor(iDomainStore: DomainStore) {
		this.domainStore = iDomainStore
		this.progressBar = this.progressBar.bind(this)
	}

	async buildModel() {
		const this_ = this

		async function setup() {
			await deselectAllCasesIn(tTargetDatasetName)
			tLogisticModel.progressCallback = this_.progressBar
			// Grab the strings in the target collection that are the values of the target attribute.
			// Stash these in an array that can be used to produce a oneHot representation
			for (let i = 0; i < tTargetCaseCount; i++) {
				const tGetResult: any = await codapInterface.sendRequest({
					"action": "get",
					"resource": `dataContext[${tTargetDatasetName}].collection[${tTargetCollectionName}].caseByIndex[${i}]`
				})
					.catch(() => {
						console.log('unable to get case');
					});

				let tCaseID = tGetResult.values.case.id,
					tText: string = tGetResult.values.case.values[tTargetAttributeName],
					tClass: string = tGetResult.values.case.values[tTargetClassAttributeName],
					tColumnNames = tTargetColumnFeatureNames.concat(
						this_.domainStore.featureStore.features.map(iFeature => {
							return iFeature.name;
						})),
					tColumnFeatures: { [key: string]: number | boolean } = {};
				// We're going to put column features into each document as well so one-hot can include them in the vector
				tColumnNames.forEach((aName) => {
					let tValue = tGetResult.values.case.values[aName];
					if (['1', 'true'].indexOf(String(tValue).toLowerCase()) >= 0)
						tValue = 1;
					else
						tValue = 0;
					if (tValue)
						tColumnFeatures[aName] = tValue;
				});
				tDocuments.push({example: tText, class: tClass, caseID: tCaseID, columnFeatures: tColumnFeatures});
			}
			this_.domainStore.targetStore.targetPredictedLabelAttributeName = 'predicted ' + tTargetClassAttributeName;
			await addAttributesToTarget(tPositiveClassName, tTargetDatasetName,
				tTargetCollectionName, this_.domainStore.targetStore.targetPredictedLabelAttributeName);
		}

		const tTargetDatasetName = this.domainStore.targetStore.targetDatasetInfo.name,
			tTargetCollectionName = this.domainStore.targetStore.targetCollectionName,
			tTargetAttributeName = this.domainStore.targetStore.targetAttributeName,
			tTargetClassAttributeName = this.domainStore.targetStore.targetClassAttributeName,
			tTargetColumnFeatureNames = this.domainStore.featureStore.targetColumnFeatureNames,
			tFeatures = this.domainStore.featureStore.features,
			tPositiveObject = this.domainStore.targetStore.targetClassNames.find(iObject => iObject.positive),
			tPositiveClassName = tPositiveObject ? tPositiveObject.name : '',
			tTargetCaseCount = await getCaseCount(tTargetDatasetName, tTargetCollectionName),
			tDocuments: {
				example: string, class: string, caseID: number,
				columnFeatures: { [key: string]: number | boolean }
			}[] = [],
			tLogisticModel = this.domainStore.trainingStore.model.logisticModel

		await setup()

		const tData: number[][] = [];

		// Logistic can't happen until we've isolated the features and produced a oneHot representation
		let tOneHot = oneHot({
				frequencyThreshold: 4,
				ignoreStopWords: true,
				includeUnigrams: false,
				features: tFeatures
			},
			tDocuments)

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
		const tIterations = this.domainStore.trainingStore.model.iterations,
			this_ = this
		runInAction(async ()=> {
			this.domainStore.trainingStore.model.iteration = iIteration
			if (iIteration >= tIterations) {
				const tModel = this_.domainStore.trainingStore.model,
					tLogisticModel = tModel.logisticModel,
					tTrainingResults = this_.domainStore.trainingStore.trainingResults

				await this_.computeResults()

				tTrainingResults.push({
					name: tModel.name,
					accuracy: tLogisticModel.accuracy,
					kappa: tLogisticModel.kappa
				})

				this_.domainStore.trainingStore.model.trainingInProgress = false
			}
		})
	}

	async computeResults() {
		const tModel = this.domainStore.trainingStore.model,
			tLogisticModel = tModel.logisticModel,
			tFitResult = tLogisticModel.fitResult,
			tData = tLogisticModel._data,
			tOneHot = tLogisticModel._oneHot,
			tPositiveObject = this.domainStore.targetStore.targetClassNames.find(iObject => iObject.positive),
			tPositiveClassName = tPositiveObject ? tPositiveObject.name : '',
			tNegativeObject = this.domainStore.targetStore.targetClassNames.find(iObject => !iObject.positive),
			tNegativeClassName = tNegativeObject ? tNegativeObject.name : '',
			tDocuments = tLogisticModel._documents;
		await this.updateWeights(tOneHot.tokenArray, tFitResult.theta);

		let tPredictionTools = {
			logisticModel: tLogisticModel,
			oneHotData: tData,
			documents: tDocuments,
			tokenArray: tOneHot.tokenArray,
			positiveClassName: tPositiveClassName,
			negativeClassName: tNegativeClassName,
			lockProbThreshold: this.domainStore.trainingStore.model.usePoint5AsProbThreshold
		}
		await this.showPredictedLabels(tPredictionTools);

		// await this.updateModelTopLevelInfo();

		// Clean up a bit
		delete tLogisticModel._data;
		delete tLogisticModel._oneHot;
		delete tLogisticModel._documents;
		// await this.getTextFeedbackManager().addTextComponent();
	}

	async updateWeights(iTokens: any, iWeights: number[]) {
		console.log('weights', iWeights)
		const tFeaturesValues: any[] = [],
			tFeatureDatasetName = this.domainStore.featureStore.featureDatasetInfo.datasetName,
			tCollectionName = 'features'
		iTokens.forEach((aToken: any, iIndex: number) => {
			const tOneFeatureUpdate: any = {
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
			resource: `dataContext[${tFeatureDatasetName}].collection[${tCollectionName}].case`,
			values: tFeaturesValues
		});
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
	})
	{
		const tOneHotLength = iTools.oneHotData[0].length,
			tPosProbs: number[] = [],
			tNegProbs: number[] = [],
			tMapFromCaseIDToProbability: any = {},
			kProbPredAttrNamePrefix = 'probability of '

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
				tProbName = `${kProbPredAttrNamePrefix}${iTools.positiveClassName}`,
				tPredictedLabelAttributeName = this.domainStore.targetStore.targetPredictedLabelAttributeName;
			tProbability = tMapFromCaseIDToProbability[aDoc.caseID];
			tPredictedLabel = tProbability > tThresholdResult ? iTools.positiveClassName : iTools.negativeClassName;
			tValues[tPredictedLabelAttributeName] = tPredictedLabel;
			tValues[tProbName] = tProbability;
			tActualLabel = aDoc.class;
			tActualPos += tActualLabel === iTools.positiveClassName ? 1 : 0;
			tPredictedPos += tPredictedLabel === iTools.positiveClassName ? 1 : 0;
			tBothPos += (tActualLabel === iTools.positiveClassName && tPredictedLabel === iTools.positiveClassName) ? 1 : 0;
			tBothNeg += (tActualLabel === iTools.negativeClassName && tPredictedLabel === iTools.negativeClassName) ? 1 : 0;

			// For each document, stash the case ids of its features so we can link selection
			const tFeatureIDsForThisDoc: number[] = [];
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
		const tTargetDatasetName = this.domainStore.targetStore.targetDatasetInfo.name,
			tTargetCollectionName = this.domainStore.targetStore.targetCollectionName
		await codapInterface.sendRequest({
			action: 'update',
			resource: `dataContext[${tTargetDatasetName}].collection[${tTargetCollectionName}].case`,
			values: tLabelValues
		});
	}

}

