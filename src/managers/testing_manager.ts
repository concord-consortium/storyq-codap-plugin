/**
 * The TestingManager uses information in the domain store to classify texts in a user-chosen dataset
 */
import {DomainStore} from "../stores/domain_store";
import {
	attributeExists,
	deselectAllCasesIn,
	getCaseValues
} from "../lib/codap-helper";
import codapInterface from "../lib/CodapInterface";
import {action} from "mobx";
import {LogitPrediction} from "../lib/logit_prediction";
import {wordTokenizer} from "../lib/one_hot";
import {TestingResult} from "../stores/store_types_and_constants";
import {computeKappa} from "../utilities/utilities";

interface ClassificationModel {
	features: string[],
	weights: number[],
	caseIDs: number[],
	usages: number[][],
	labels: string[],
	positiveLabel: string,
	modelColumnFeatures: string[],
	threshold: number,
	constantWeightTerm: number,
	predictor: any
}

export class TestingManager {

	domainStore: DomainStore
	kNonePresent: string

	constructor(iDomainStore: DomainStore, iNonePresentPrompt: string) {
		this.domainStore = iDomainStore
		this.kNonePresent = iNonePresentPrompt
	}

	async classify() {
		const this_ = this,
			tModel: ClassificationModel = {
				features: [],
				weights: [],
				caseIDs: [],
				labels: [],
				positiveLabel: '',
				modelColumnFeatures: [],
				usages: [],
				threshold: 0.5,
				constantWeightTerm: 0,
				predictor: null
			},
			tLabelValues: { id: number, values: any }[] = []

		const
			kProbPredAttrNamePrefix = 'probability of ',
			tTestingDatasetName = this.domainStore.testingStore.testingDatasetInfo.name,
			tTestingCollectionName = this.domainStore.testingStore.testingCollectionName,
			tChosenModelName = this.domainStore.testingStore.chosenModelName,
			tTestingAttributeName = this.domainStore.testingStore.testingAttributeName,
			tClassAttributeName = this.domainStore.testingStore.testingClassAttributeName,
			tFeatureDatasetName = this_.domainStore.featureStore.featureDatasetInfo.datasetName,
			tFeatureCollectionName = this_.domainStore.featureStore.featureDatasetInfo.collectionName,
			tFeatures = this.domainStore.featureStore.features,
			tPositiveClassName = this.domainStore.targetStore.getClassName('positive'),
			tNegativeClassName = this.domainStore.targetStore.getClassName('negative'),
			tPredictedLabelAttributeName = this_.domainStore.targetStore.targetPredictedLabelAttributeName,
			tTargetPredictedProbabilityName = kProbPredAttrNamePrefix + tPositiveClassName,
			tMatrix = {posPos: 0, negPos: 0, posNeg: 0, negNeg: 0},
			tTestingResults:TestingResult ={
				targetTitle: tTestingDatasetName,
				modelName: tChosenModelName,
				numPositive: 0,
				numNegative: 0,
				accuracy: 0,
				kappa: 0
			}
		let	tPhraseCount = 0

		async function installFeatureAndPredictionAttributes() {
			const tAttributeRequests: object[] = []
			tFeatures.forEach(async (iFeature) => {
				const tAttributeAlreadyExists = await attributeExists(tTestingDatasetName, tTestingCollectionName, iFeature.name)
				if (iFeature.formula !== '' && !tAttributeAlreadyExists) {
					tAttributeRequests.push({
						name: iFeature.name,
						title: iFeature.name,
						formula: iFeature.formula
					})
				}
			})
			const tLabelExists = await attributeExists(tTestingDatasetName, tTestingCollectionName,
				this_.domainStore.targetStore.targetPredictedLabelAttributeName)
			if (!tLabelExists) {
				tAttributeRequests.push(
					{
						name: tPredictedLabelAttributeName,
						description: 'The label predicted by the model'
					})
				tAttributeRequests.push(
					{
						name: tTargetPredictedProbabilityName,
						description: 'The probability predicted by the model that the classification is positive',
						precision: 5
					})
			}
			const tFeatureIDsAttributeExists = await attributeExists(tTestingDatasetName, tTestingCollectionName,
				this_.domainStore.targetStore.targetFeatureIDsAttributeName)
			if( !tFeatureIDsAttributeExists)
				tAttributeRequests.push(
					{
						name: this_.domainStore.targetStore.targetFeatureIDsAttributeName,
						hidden: true
					})

			await codapInterface.sendRequest({
				action: 'create',
				resource: `dataContext[${tTestingDatasetName}].collection[${tTestingCollectionName}].attribute`,
				values: tAttributeRequests
			})
		}

		async function initializeModel() {
			const tFeatureCases = await getCaseValues( tFeatureDatasetName, tFeatureCollectionName)
			tFeatureCases.forEach(iFeatureCase=>{
				tModel.features.push(iFeatureCase.values['name'])
				tModel.weights.push(Number(iFeatureCase.values['weight']))
				tModel.caseIDs.push(iFeatureCase.id)
				tModel.usages.push([]);
			})
			Object.assign(tModel, {
				labels: [tNegativeClassName, tPositiveClassName],
				positiveLabel: tPositiveClassName,
				modelColumnFeatures: this_.domainStore.featureStore.getConstructedFeatureNames(),
				threshold: tModel.threshold,
				constantWeightTerm: tModel.constantWeightTerm,
				predictor: new LogitPrediction(tModel.constantWeightTerm, tModel.weights, tModel.threshold)
			})
		}

		async function classifyEachPhrase() {
			const tTestCases = await getCaseValues(tTestingDatasetName, tTestingCollectionName)
			tPhraseCount = tTestCases.length
			tTestCases.forEach(iCase => {
				let tPhraseID = iCase.id,
					tPhrase = iCase.values[tTestingAttributeName],
					tActual = tClassAttributeName === this_.kNonePresent ? '' :
						iCase.values[tClassAttributeName],
					tGiven = Array(tModel.features.length).fill(0),
					tFeatureIDs: number[] = [];
				// Find the index of each feature the phrase
				wordTokenizer(tPhrase, Boolean(this_.domainStore.featureStore.getShouldIgnoreStopwords())).forEach((iFeature) => {
					let tIndex = tModel.features.indexOf(iFeature);
					if (tIndex >= 0) {	// We've found a feature
						// Mark it in the array
						tGiven[tIndex] = 1;
						// Add the case ID to the list of featureIDs for this phrase
						tFeatureIDs.push(tModel.caseIDs[tIndex]);
						tModel.usages[tIndex].push(tPhraseID);
					}
				});
				// The column features are names of attributes we expect to find having values true or false
				tModel.modelColumnFeatures.forEach(iFeature => {
					if (iCase.values[iFeature]) {
						let tIndex = tModel.features.indexOf(iFeature);
						if (tIndex >= 0) {
							// Mark it in the array
							tGiven[tIndex] = 1;
							// Add the case ID to the list of featureIDs for this phrase
							tFeatureIDs.push(tModel.caseIDs[tIndex]);
							tModel.usages[tIndex].push(tPhraseID);
						}
					}
				});
				let tCaseValues: { [key: string]: string } = {},
					tPrediction = tModel.predictor.predict(tGiven);
				tCaseValues[tPredictedLabelAttributeName] = tPrediction.class ?
					tPositiveClassName : tNegativeClassName;
				tCaseValues[tTargetPredictedProbabilityName] = tPrediction.probability;
				tCaseValues[this_.domainStore.targetStore.targetFeatureIDsAttributeName] = JSON.stringify(tFeatureIDs);
				tLabelValues.push({
					id: iCase.id,
					values: tCaseValues
				});
				// Increment results
				let tActualBool = tActual === tModel.positiveLabel;
				if (tPrediction.class) {
					tTestingResults.numPositive++;
					if (tActualBool)
						tMatrix.posPos++;
					else
						tMatrix.negPos++;
				} else {
					tTestingResults.numNegative++;
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
			if (tClassAttributeName !== '') {
				let computedKappa = computeKappa( tPhraseCount, tMatrix.posPos, tMatrix.negNeg,
					tMatrix.posPos + tMatrix.posNeg, tMatrix.posPos + tMatrix.negPos);
				tTestingResults.accuracy = Number(computedKappa.observed.toFixed(3));
				tTestingResults.kappa = Number(computedKappa.kappa.toFixed(3));
			}
			console.log(`tTestingResults = ${JSON.stringify(tTestingResults)}; tMatrix = ${JSON.stringify(tMatrix)}`)
		}

		await deselectAllCasesIn(tTestingDatasetName)
		await installFeatureAndPredictionAttributes()
		initializeModel()
		await classifyEachPhrase()
		await updateTargetAndFeatures()
		action(()=>{
			this.domainStore.testingStore.testingResults = tTestingResults
			console.log(`In action: tTestingResults = ${JSON.stringify(tTestingResults)}`)
		})()
	}
}

