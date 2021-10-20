/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import {openTable} from "../lib/codap-helper";
import codapInterface from "../lib/CodapInterface";
import TextFeedbackManager from "../managers/text_feedback_manager";
import {oneHot} from "../lib/one_hot";
import {Feature, kPosNegConstants} from "./store_types_and_constants";
import {TargetStore} from "./target_store";
import {FeatureStore} from "./feature_store";
import {TrainingStore} from "./training_store";
import {TestingStore} from "./testing_store";
import {TextStore} from "./text_store";

export class DomainStore {
	targetStore: TargetStore
	featureStore: FeatureStore
	trainingStore: TrainingStore
	testingStore: TestingStore
	textStore: TextStore
	textFeedbackManager: TextFeedbackManager

	constructor() {
		this.targetStore = new TargetStore()
		this.featureStore = new FeatureStore()
		this.trainingStore = new TrainingStore()
		this.testingStore = new TestingStore(this.featureStore)
		this.textStore = new TextStore()
		this.textFeedbackManager = new TextFeedbackManager(this)
	}

	asJSON(): object {
		return {
			targetStore: this.targetStore.asJSON(),
			featureStore: this.featureStore.asJSON(),
			trainingStore: this.trainingStore.asJSON(),
			testingStore: this.testingStore.asJSON(),
			textStore: this.textStore.asJSON()
		}
	}

	async fromJSON(json: { targetStore: object, featureStore: object, trainingStore: object, testingStore: object, textStore: object }) {
		this.targetStore.fromJSON(json.targetStore)
		this.featureStore.fromJSON(json.featureStore)
		this.trainingStore.fromJSON(json.trainingStore)
		this.testingStore.fromJSON(json.testingStore)
		this.textStore.fromJSON(json.textStore)

		if (this.textStore.textComponentID !== -1) {
			this.addTextComponent()	//Make sure it is in the document
		}
	}

	async guaranteeFeaturesDataset(): Promise<boolean> {
		const tFeatureStore = this.featureStore,
			tDatasetName = tFeatureStore.featureDatasetInfo.datasetName,
			tFeatureCollectionName = this.featureStore.featureDatasetInfo.collectionName,
			tTargetStore = this.targetStore

		if (tFeatureStore.features.length > 0) {
			if (tFeatureStore.featureDatasetInfo.datasetID === -1) {
				const tChosenClassKey = this.targetStore.targetChosenClassColumnKey,
					tUnchosenClassKey = tChosenClassKey === 'left' ? 'right' : 'left',
					tPositiveAttrName = kPosNegConstants.positive.attrKey + tTargetStore.targetClassNames[tChosenClassKey],
					tNegativeAttrName = kPosNegConstants.negative.attrKey + tTargetStore.targetClassNames[tUnchosenClassKey],
					tCreateResult: any = await codapInterface.sendRequest({
						action: 'create',
						resource: 'dataContext',
						values: {
							name: tDatasetName,
							title: tDatasetName,
							collections: [{
								name: tFeatureCollectionName,
								title: tFeatureCollectionName,
								attrs: [
									{name: 'name'},
									{name: 'chosen'},
									{name: tPositiveAttrName},
									{name: tNegativeAttrName},
									{name: 'type'},
									{name: 'description'},
									{name: 'formula'},
									{name: 'weight'},
									{name: 'usages', hidden: true}
								]
							}]
						}
					})
				if (tCreateResult.success) {
					tFeatureStore.featureDatasetInfo.datasetID = tCreateResult.values.id
					tFeatureStore.featureDatasetInfo.datasetName = tDatasetName
					tFeatureStore.featureDatasetInfo.datasetTitle = tCreateResult.values.title
					openTable(tDatasetName)
				}
			}
			return true
		}
		return false
	}

	async updateNonNtigramFeaturesDataset() {
		const this_ = this,
			tFeatureStore = this.featureStore,
			tNonNgramFeatures = tFeatureStore.features.filter(iFeature => iFeature.info.kind !== 'ngram'),
			tTargetStore = this.targetStore,
			caseUpdateRequests: { values: { features: Feature[] } }[] = [],
			tTargetDatasetName = tTargetStore.targetDatasetInfo.name,
			tTargetCollectionName = tTargetStore.targetCollectionName
		let resourceString: string = '',
			tFeatureItems: { values: { type: string }, id: string }[] = [],
			tItemsToDelete: { values: object, id: string }[] = [],
			tFeaturesToAdd: Feature[] = [],
			tFeaturesToUpdate: Feature[] = []

		async function getExistingFeatureItems(): Promise<{ values: any, id: string }[]> {
			const tItemsRequestResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `${resourceString}.itemSearch[*]`
			})
			if (tItemsRequestResult.success)
				return tItemsRequestResult.values
			else
				return []
		}

		function featureDoesNotMatchItem(iItem: { [key: string]: any }, iFeature: { [key: string]: any }) {
			return ['name', 'chosen', 'formula', 'description'].some(iKey => {
					return String(iItem[iKey]).trim() !== String(iFeature[iKey]).trim()
				}) || iItem[kPosNegConstants.negative.storeKey] !== iFeature[kPosNegConstants.negative.attrKey] ||
				iItem[kPosNegConstants.positive.storeKey] !== iFeature[kPosNegConstants.positive.attrKey]
		}

		async function updateFrequenciesUsagesAndFeatureIDs() {
			const tClassAttrName = this_.targetStore.targetClassAttributeName,
				tChosenClassKey = this_.targetStore.targetChosenClassColumnKey,
				tPosClassLabel = this_.targetStore.targetClassNames[tChosenClassKey],
				tTargetCases = await this_.targetStore.updateTargetCases()

			tNonNgramFeatures.forEach(iFeature => {
				iFeature.numberInPositive = 0
				iFeature.numberInNegative = 0
				iFeature.usages = []
			})
			/**
			 * We go through each target case
			 * 		For each feature, if the case has the feature, we increment that feature's positive or negative count
			 * 			as appropriate
			 * 		If the feature is present,
			 * 			- we push the case's ID into the feature's usages
			 * 			- 	we add the feature's case ID to the array of feature IDs for that case
			 */
			tTargetCases.forEach((iCase) => {
				tNonNgramFeatures.forEach((iFeature) => {
					if (iCase.values[iFeature.name]) {
						if (iCase.values[tClassAttrName] === tPosClassLabel) {
							iFeature.numberInPositive++
						} else {
							iFeature.numberInNegative++
						}
						iFeature.usages.push(iCase.id)
						if (!caseUpdateRequests[iCase.id]) {
							caseUpdateRequests[iCase.id] = {values: {features: []}}
						}
						caseUpdateRequests[iCase.id].values.features.push(iFeature)
					}
				})
			})
		}

		if (await this.guaranteeFeaturesDataset()) {
			resourceString = `dataContext[${tFeatureStore.featureDatasetInfo.datasetID}]`

			tFeatureItems = (await getExistingFeatureItems()).filter(iItem => iItem.values.type !== 'unigram')
			await updateFrequenciesUsagesAndFeatureIDs()
			tItemsToDelete = tFeatureItems.filter(iItem => {
				return !tNonNgramFeatures.find(iFeature => iFeature.featureItemID === iItem.id)
			})
			tFeaturesToAdd = tNonNgramFeatures.filter(iFeature => {
				return !tFeatureItems.find(iItem => {
					return iFeature.featureItemID === iItem.id
				})
			})
			tFeaturesToUpdate = tNonNgramFeatures.filter(iFeature => {
				const tMatchingItem = tFeatureItems.find(iItem => {
					return iFeature.featureItemID === iItem.id
				})
				return tMatchingItem && featureDoesNotMatchItem(iFeature, tMatchingItem.values)
			})
			if (tItemsToDelete.length > 0) {
				await codapInterface.sendRequest(
					tItemsToDelete.map(iItem => {
						return {
							action: 'delete',
							resource: `${resourceString}.itemByID[${iItem.id}]`
						}
					})
				)
			}
			if (tFeaturesToAdd.length > 0) {
				const tCreateResult: any = await codapInterface.sendRequest(
					{
						action: 'create',
						resource: `${resourceString}.item`,
						values: tFeaturesToAdd.map(iFeature => {
							return {
								chosen: iFeature.chosen,
								name: iFeature.name,
								'frequency in positive': iFeature.numberInPositive,
								'frequency in negative': iFeature.numberInNegative,
								type: iFeature.type,
								formula: iFeature.formula,
								description: iFeature.description,
								usages: JSON.stringify(iFeature.usages)
							}
						})
					}
				)
				if (tCreateResult.success) {
					tCreateResult.caseIDs.forEach((iCaseID: string, iIndex: number) => {
						tFeaturesToAdd[iIndex].caseID = iCaseID
						tFeaturesToAdd[iIndex].featureItemID = tCreateResult.itemIDs[iIndex]
					})
				}
			}
			if (tFeaturesToUpdate.length > 0) {
				await codapInterface.sendRequest(
					tFeaturesToUpdate.map(iFeature => {
						return {
							action: 'update',
							resource: `${resourceString}.itemByID[${iFeature.caseID}]`,
							values: {
								chosen: iFeature.chosen,
								name: iFeature.name,
								'frequency in positive': iFeature[kPosNegConstants.positive.storeKey],
								'frequency in negative': iFeature[kPosNegConstants.negative.storeKey]
							}
						}
					})
				)
			}
			// We've waited until now to update target cases with feature IDs so that we can be sure
			//	features do have caseIDs to stash in target cases
			if (caseUpdateRequests.length > 0) {
				const tValues = caseUpdateRequests.map((iRequest, iIndex) => {
					return {
						id: iIndex,
						values: {featureIDs: JSON.stringify(iRequest.values.features.map(iFeature => iFeature.caseID))}
					}
				})
				await codapInterface.sendRequest({
					action: 'update',
					resource: `dataContext[${tTargetDatasetName}].collection[${tTargetCollectionName}].case`,
					values: tValues
				})
			}
		}
	}

	async updateNgramFeatures() {
		if( this.featureStore.tokenMapIsFilledOut())
			return
		const this_ = this
		const tNgramFeatures = this.featureStore.features.filter(iFeature => iFeature.info.kind === 'ngram')
		await this.guaranteeFeaturesDataset()
		for (const iNtgramFeature of tNgramFeatures) {
			const
				tTargetStore = this.targetStore,
				tFeatureDatasetName = this.featureStore.featureDatasetInfo.datasetName,
				tFeatureCollectionName = this.featureStore.featureDatasetInfo.collectionName,
				tIgnore = iNtgramFeature.info.ignoreStopWords !== undefined ? iNtgramFeature.info.ignoreStopWords : true,
				tThreshold = (iNtgramFeature.info.frequencyThreshold || 4),
				tTargetCases = tTargetStore.targetCases,
				tTargetAttributeName = tTargetStore.targetAttributeName,
				tTargetClassAttributeName = this.targetStore.targetClassAttributeName,
				tDocuments = tTargetCases.map(iCase => {
					return {
						example: iCase.values[tTargetAttributeName],
						class: iCase.values[tTargetClassAttributeName],
						caseID: Number(iCase.id),
						columnFeatures: {}
					}
				}),
				tChosenClassKey = tTargetStore.targetChosenClassColumnKey,
				tUnchosenClassKey = tChosenClassKey === 'left' ? 'right' : 'left',
				tPositiveAttrName = kPosNegConstants.positive.attrKey + tTargetStore.targetClassNames[tChosenClassKey],
				tNegativeAttrName = kPosNegConstants.negative.attrKey + tTargetStore.targetClassNames[tUnchosenClassKey]
			// tokenize the target texts
			const tOneHotResult = oneHot({
				frequencyThreshold: tThreshold - 1,
				ignoreStopWords: tIgnore,
				includeUnigrams: true,
				positiveClass: this.targetStore.getClassName('positive'),
				negativeClass: this.targetStore.getClassName('negative'),
				features: []
			}, tDocuments)
			if (!tOneHotResult)
				return
			const tTokenArray = tOneHotResult.tokenArray	// Array of unigram features

			this_.featureStore.tokenMap = tOneHotResult.tokenMap
			// Stash tokens in feature dataset
			// if (await this.guaranteeFeaturesDataset()) {
			const tUnigramCreateMsgs: any[] = []
			tTokenArray.forEach(iFeature => {
				const tCaseValues: { [index: string]: any } = {
					values: {
						chosen: true,
						name: iFeature.token,
						type: 'unigram',
						description: `unigram ${tIgnore ? '' : 'not '}ignoring stop words with frequency threshold of ${tThreshold}`,
						usages: JSON.stringify(iFeature.caseIDs)
					}
				}
				tCaseValues.values[tPositiveAttrName] = iFeature.numPositive
				tCaseValues.values[tNegativeAttrName] = iFeature.numNegative
				tUnigramCreateMsgs.push(tCaseValues)
			})
			const tCreateResult: any = await codapInterface.sendRequest({
				action: 'create',
				resource: `dataContext[${tFeatureDatasetName}].collection[${tFeatureCollectionName}].case`,
				values: tUnigramCreateMsgs
			})
			// Stash the resultant feature case IDs where we can get them to update target cases
			// We make a map with featureCaseID as key and usages as value
			if (tCreateResult.success) {
				tCreateResult.values.forEach((iValue: { id: number }, iIndex: number) => {
					tUnigramCreateMsgs[iIndex].featureCaseID = iValue.id
					tTokenArray[iIndex].featureCaseID = iValue.id
				})
				// Put together update messages for the target cases
				const tUpdateMsgs: { id: number, values: { featureIDs: number[] | string } }[] = []
				tTargetCases.forEach(iCase => {
					const tUpdateValue = {id: iCase.id, values: {featureIDs: []}}
					tTokenArray.forEach(iFeature => {
						if (iFeature.caseIDs.indexOf(iCase.id) >= 0) {
							// @ts-ignore
							tUpdateValue.values.featureIDs.push(iFeature.featureCaseID)
						}
					})
					// @ts-ignore
					tUpdateValue.values.featureIDs = JSON.stringify(tUpdateValue.values.featureIDs)
					tUpdateMsgs.push(tUpdateValue)
				})
				await codapInterface.sendRequest({
					action: 'update',
					resource: `dataContext[${tTargetStore.targetDatasetInfo.name}].collection[${tTargetStore.targetCollectionName}].case`,
					values: tUpdateMsgs
				})
			}
		}
	}

	async addTextComponent() {
		await this.textStore.addTextComponent(this.targetStore.targetAttributeName)
		await this.clearText()
	}

	async clearText() {
		await this.textStore.clearText(this.targetStore.targetAttributeName)
	}

	featuresPanelCanBeEnabled() {
		return this.targetStore.targetAttributeName !== ''
			&& this.targetStore.targetClassAttributeName !== ''
	}

	trainingPanelCanBeEnabled() {
		return this.featuresPanelCanBeEnabled() && this.featureStore.features.length > 0
	}

	testingPanelCanBeEnabled() {
		return this.trainingPanelCanBeEnabled() && this.trainingStore.trainingResults.length > 0
	}

}

