/**
 * The TestingManager uses information in the domain store to classify texts in a user-chosen dataset
 */
import {action} from "mobx";
import { attributeExists, deselectAllCasesIn, getCaseValues } from "../lib/codap-helper";
import codapInterface from "../lib/CodapInterface";
import {LogitPrediction} from "../lib/logit_prediction";
import {wordTokenizer} from "../lib/one_hot";
import { domainStore } from "../stores/domain_store";
import {TestingResult} from "../stores/store_types_and_constants";
import {computeKappa} from "../utilities/utilities";

export class TestingManager {
	kNonePresent: string

	constructor(iNonePresentPrompt: string) {
		this.kNonePresent = iNonePresentPrompt;
	}

	async classify(iStoreTest:boolean) {
		const this_ = this,
			tChosenModelName = domainStore.testingStore.chosenModelName,
			tTrainingResult = domainStore.trainingStore.getTrainingResultByName(tChosenModelName),
			tStoredModel = tTrainingResult ? tTrainingResult.storedModel : null,
			tPositiveClassName = tStoredModel ? tStoredModel.positiveClassName : '',
			tNegativeClassName = tStoredModel ? tStoredModel.negativeClassName : '',
			tTokens = tStoredModel ? tStoredModel.storedTokens : [],
			kProbPredAttrNamePrefix = 'probability of ',
			tTestingStore = domainStore.testingStore,
			tTestingDatasetName = tTestingStore.testingDatasetInfo.name,
			tTestingDatasetTitle = tTestingStore.testingDatasetInfo.title,
			tTestingCollectionName = tTestingStore.testingCollectionName,
			tTestingAttributeName = tTestingStore.testingAttributeName,
			tClassAttributeName = tTestingStore.testingClassAttributeName,
			tTargetPredictedProbabilityName = kProbPredAttrNamePrefix + tPositiveClassName,
			tTargetPredictedLabelAttributeName = domainStore.targetStore.targetPredictedLabelAttributeName,
			tTargetFeatureIDsAttributeName = domainStore.targetStore.targetFeatureIDsAttributeName,
			tLabelValues:{id:number, values:any}[] = [],
			tMatrix = {posPos: 0, negPos: 0, posNeg: 0, negNeg: 0},
			tTestingResult: TestingResult = {
				targetDatasetName: tTestingDatasetName,
				targetDatasetTitle: tTestingDatasetTitle,
				modelName: tChosenModelName,
				numPositive: 0,
				numNegative: 0,
				accuracy: 0,
				kappa: 0,
				testBeingConstructed: false
			},
			tWeights = tTokens.map(iToken => iToken.weight),
			tPredictor = tTrainingResult ?
				new LogitPrediction(tTrainingResult.constantWeightTerm, tWeights, tTrainingResult.threshold) : null
		let tPhraseCount = 0

		async function installFeatureAndPredictionAttributes() {
			const tAttributeRequests: object[] = []
			if (tTokens) {
				tTokens.forEach(async (iToken) => {
					if (iToken.formula !== '') {
						const tAttributeAlreadyExists = await attributeExists(tTestingDatasetName, tTestingCollectionName, iToken.name)
						if (!tAttributeAlreadyExists)
							tAttributeRequests.push({
								name: iToken.name,
								title: iToken.name,
								formula: iToken.formula
							})
					}
				})
				const tLabelExists = await attributeExists(tTestingDatasetName, tTestingCollectionName,
					tTargetPredictedLabelAttributeName)
				if (!tLabelExists) {
					tAttributeRequests.push(
						{
							name: tTargetPredictedLabelAttributeName,
							description: 'The label predicted by the model'
						})
					tAttributeRequests.push(
						{
							name: tTargetPredictedProbabilityName,
							description: 'The probability predicted by the model that the classification is positive',
							unit: '%',
							precision: 3
						})
				}
				const tFeatureIDsAttributeExists = await attributeExists(tTestingDatasetName, tTestingCollectionName,
					domainStore.targetStore.targetFeatureIDsAttributeName)
				if (!tFeatureIDsAttributeExists)
					tAttributeRequests.push(
						{
							name: tTargetFeatureIDsAttributeName,
							hidden: true
						})

				await codapInterface.sendRequest({
					action: 'create',
					resource: `dataContext[${tTestingDatasetName}].collection[${tTestingCollectionName}].attribute`,
					values: tAttributeRequests
				})
			}
		}

		async function classifyEachPhrase() {
			if (!tStoredModel || !tPredictor)
				return
			const tTestCases = await getCaseValues(tTestingDatasetName, tTestingCollectionName)
			tPhraseCount = tTestCases.length
			tTestCases.forEach(iCase => {
				let tPhraseID = iCase.id,
					tPhrase = iCase.values[tTestingAttributeName],
					tActual = tClassAttributeName === this_.kNonePresent ? '' :
						iCase.values[tClassAttributeName],
					tGiven = Array(tTokens.length).fill(0),
					tFeatureIDs: number[] = [];
				if (tTrainingResult && tTrainingResult.hasNgram) {
					// Find the index of each feature in the phrase
					wordTokenizer(tPhrase, false, true).forEach((iWord) => {
						let tIndex = tTokens.findIndex(iToken => iToken.name === iWord);
						if (tIndex >= 0) {	// We've found a feature
							// Mark it in the array
							tGiven[tIndex] = 1;
							// Add the case ID to the list of featureIDs for this phrase
							tFeatureIDs.push(tStoredModel.storedTokens[tIndex].featureCaseID);
							// tModel.usages[tIndex].push(tPhraseID);
						}
					})
				}
				// The column features are names of attributes we expect to find having values true or false
				tTokens.forEach((iToken, iIndex) => {
					if (iToken.formula !== '') {
						if (iCase.values[iToken.name]) {
							// Mark it in the array
							tGiven[iIndex] = 1;
							// Add the case ID to the list of featureIDs for this phrase
							tFeatureIDs.push(iToken.featureCaseID);
							// tModel.usages[tIndex].push(tPhraseID);
						}
					}
				});
				let tCaseValues: { [key: string]: string | number } = {},
					tPrediction = tPredictor.predict(tGiven);
				tCaseValues[tTargetPredictedLabelAttributeName] = tPrediction.class ?
					tPositiveClassName : tNegativeClassName;
				tCaseValues[tTargetPredictedProbabilityName] = tPrediction.probability * 100;	// Convert to %
				tCaseValues[tTargetFeatureIDsAttributeName] = JSON.stringify(tFeatureIDs);
				tLabelValues.push({
					id: tPhraseID,
					values: tCaseValues
				});
				// Increment results
				let tActualBool = tActual === tPositiveClassName;
				if (tPrediction.class) {
					tTestingResult.numPositive++;
					if (tActualBool)
						tMatrix.posPos++;
					else
						tMatrix.negPos++;
				} else {
					tTestingResult.numNegative++;
					if (tActualBool)
						tMatrix.posNeg++;
					else
						tMatrix.negNeg++;
				}
			})
		}

		async function updateTargetAndFeatures() {
			await codapInterface.sendRequest({
				action: 'update',
				resource: `dataContext[${tTestingDatasetName}].collection[${tTestingCollectionName}].case`,
				values: tLabelValues
			});
			// Add the usages to each feature case
/*
			let tFeatureUpdates = tModel.caseIDs.map((iID, iIndex) => {
				return {
					id: iID,
					values: {usages: JSON.stringify(tModel.usages[iIndex])}
				}
			});
			await codapInterface.sendRequest({
				action: 'update',
				resource: `dataContext[${tFeatureDatasetName}].collection[${tFeatureCollectionName}].case`,
				values: tFeatureUpdates
			});
*/
			if (tClassAttributeName !== '') {
				let computedKappa = computeKappa(tPhraseCount, tMatrix.posPos, tMatrix.negNeg,
					tMatrix.posPos + tMatrix.posNeg, tMatrix.posPos + tMatrix.negPos);
				tTestingResult.accuracy = Number(computedKappa.observed.toFixed(3));
				tTestingResult.kappa = (computedKappa.observed === 0) ? 0 : Number(computedKappa.kappa.toFixed(3));
			}
		}

		if (!tTrainingResult) {
			console.log(`Unable to use ${tChosenModelName} to classify ${tTestingDatasetName}`)
			return
		}
		await deselectAllCasesIn(tTestingDatasetName)
		await installFeatureAndPredictionAttributes()
		await classifyEachPhrase()
		await updateTargetAndFeatures()
		action(() => {
			if( iStoreTest) {
				tTestingStore.testingResultsArray.push(tTestingResult)
			}
			else {
				tTestingStore.testingResultsArray.pop()
				tTestingStore.testingResultsArray.push(tTestingResult)
			}
/*
			tTestingStore.currentTestingResults = tTestingStore.emptyTestingResult()
			tTestingStore.testingDatasetInfo.name = ''
			tTestingStore.testingDatasetInfo.title = ''
			tTestingStore.chosenModelName = ''
			tTestingStore.testingCollectionName = ''
			tTestingStore.testingAttributeName = ''
			tTestingStore.testingClassAttributeName = ''
*/
		})()
	}
}

