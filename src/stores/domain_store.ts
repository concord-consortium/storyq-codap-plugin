/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import { getCaseValues, openTable } from "../lib/codap-helper";
import codapInterface from "../lib/CodapInterface";
import { oneHot, wordTokenizer } from "../lib/one_hot";
import { FeatureStore } from "./feature_store";
import { Feature, kPosNegConstants } from "./store_types_and_constants";
import { TargetStore } from "./target_store";
import { TestingStore } from "./testing_store";
import { textStore } from "./text_store";
import { trainingStore } from "./training_store";
import { uiStore } from "./ui_store";

interface Message {
	action:string,
	resource:string
	values:any[]
}

export class DomainStore {
	targetStore: TargetStore
	featureStore: FeatureStore
	testingStore: TestingStore

	constructor() {
		this.targetStore = new TargetStore(() => {
			return this.featureStore.features.map(iFeature => iFeature.name)
		})
		this.featureStore = new FeatureStore(() => this.targetStore.targetDatasetInfo)
		this.testingStore = new TestingStore(this.featureStore.getFeatureDatasetID)
	}

	asJSON(): object {
		return {
			targetStore: this.targetStore.asJSON(),
			featureStore: this.featureStore.asJSON(),
			trainingStore: trainingStore.asJSON(),
			testingStore: this.testingStore.asJSON(),
			textStore: textStore.asJSON()
		}
	}

	async fromJSON(json: { targetStore: object, featureStore: object, trainingStore: object, testingStore: object, textStore: object }) {
		this.targetStore.fromJSON(json.targetStore)
		this.featureStore.fromJSON(json.featureStore)
		trainingStore.fromJSON(json.trainingStore)
		this.testingStore.fromJSON(json.testingStore)
		textStore.fromJSON(json.textStore)

		if (textStore.textComponentID !== -1) {
			await textStore.addTextComponent()	//Make sure it is in the document
		}
		await this.guaranteeFeaturesDataset()
		await this.testingStore.updateCodapInfoForTestingPanel()
	}

	async guaranteeFeaturesDataset(): Promise<boolean> {
		const tFeatureStore = this.featureStore,
			tDatasetName = tFeatureStore.featureDatasetInfo.datasetName,
			tFeatureCollectionName = this.featureStore.featureDatasetInfo.collectionName,
			tWeightsCollectionName = this.featureStore.featureDatasetInfo.weightsCollectionName,
			tTargetStore = this.targetStore

		async function hideWeightsAttributes() {
			const tShowRequests = [{
				action: 'update',
				resource: `dataContext[${tDatasetName}].collection[${tWeightsCollectionName}].attribute[weight]`,
				values: {hidden: true}
			},
				{
					action: 'update',
					resource: `dataContext[${tDatasetName}].collection[${tWeightsCollectionName}].attribute[model name]`,
					values: {hidden: true}
				}]
			await codapInterface.sendRequest(tShowRequests)
		}

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
									{name: 'chosen', type: 'checkbox'},
									{name: tPositiveAttrName},
									{name: tNegativeAttrName},
									{name: 'type', hidden: true},
									/*
																		{name: 'description'},
																		{name: 'formula'},
									*/
									{name: 'usages', hidden: true}
								]
							},
								{
									name: tWeightsCollectionName,
									title: tWeightsCollectionName,
									parent: tFeatureCollectionName,
									attrs: [
										{name: 'model name', type: 'categorical', hidden: false},
										{name: 'weight', precision: 2, hidden: false}
									]
								}]
						}
					})
				if (tCreateResult.success) {
					tFeatureStore.featureDatasetInfo.datasetID = tCreateResult.values.id
					tFeatureStore.featureDatasetInfo.datasetName = tDatasetName
					tFeatureStore.featureDatasetInfo.datasetTitle = tCreateResult.values.title
					await openTable(tDatasetName)
					// The 'model name' and 'weight' attributes were created as visible as a workaround to a bug.
					// Now we can hide them
					await hideWeightsAttributes()
				}
			}
			return true
		}
		return false
	}

	async updateNonNtigramFeaturesDataset() {
		interface UpdateRequest {
			values: {
				features: Feature[]
			}
		}
		const this_ = this,
			tFeatureStore = this.featureStore,
			tNonNgramFeatures = tFeatureStore.features.filter(iFeature => iFeature.info.kind !== 'ngram'),
			tTargetStore = this.targetStore,
			caseUpdateRequests: Record<string, UpdateRequest> = {},
			tTargetDatasetName = tTargetStore.targetDatasetInfo.name,
			tTargetCollectionName = tTargetStore.targetCollectionName
		let featureDatasetResourceString: string = '',
			tFeatureItems: { values: { type: string }, id: string }[] = [],
			tItemsToDelete: { values: object, id: string }[] = [],
			tFeaturesToAdd: Feature[] = [],
			tFeaturesToUpdate: Feature[] = []

		async function getExistingFeatureItems(): Promise<{ values: any, id: string }[]> {
			const tItemsRequestResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `${featureDatasetResourceString}.itemSearch[*]`
			})
			if (tItemsRequestResult.success)
				return tItemsRequestResult.values
			else
				return []
		}

		function featureDoesNotMatchItem(iItem: { [key: string]: any }, iFeature: { [key: string]: any }) {
			return ['name', 'chosen'/*, 'formula', 'description'*/].some(iKey => {
					return String(iItem[iKey]).trim() !== String(iFeature[iKey]).trim()
				}) || iItem[kPosNegConstants.negative.storeKey] !== iFeature[kPosNegConstants.negative.attrKey] ||
				iItem[kPosNegConstants.positive.storeKey] !== iFeature[kPosNegConstants.positive.attrKey]
		}

		async function updateFrequenciesUsagesAndFeatureIDs() {
			const tClassAttrName = this_.targetStore.targetClassAttributeName,
				tChosenClassKey = this_.targetStore.targetChosenClassColumnKey,
				tPosClassLabel = this_.targetStore.targetClassNames[tChosenClassKey]

			tNonNgramFeatures.forEach(iFeature => {
				iFeature.numberInPositive = 0
				iFeature.numberInNegative = 0
				iFeature.usages = []
			})
			/**
			 * We go through each feature
			 * 		For each target case, if the case has the feature, we increment that feature's positive or negative count
			 * 			as appropriate
			 * 		If the feature is present,
			 * 			- we push the case's ID into the feature's usages
			 * 			- 	we add the feature's case ID to the array of feature IDs for that case
			 */
			const countFeaturePromises = tNonNgramFeatures.map(async (iFeature) => {
				const tTargetCases = await this_.targetStore.updateTargetCases(`\`${iFeature.name}\`=true`)
				tTargetCases.forEach(iCase => {
					if (iCase.values[iFeature.name]) {
						if (iCase.values[tClassAttrName] === tPosClassLabel) {
							iFeature.numberInPositive++
						} else {
							iFeature.numberInNegative++
						}
						iFeature.usages.push(iCase.id)
						const iCaseId = `${iCase.id}`
						if (!caseUpdateRequests[iCaseId]) {
							caseUpdateRequests[iCaseId] = { values: { features: [] } }
						}
						caseUpdateRequests[iCaseId].values.features.push(iFeature)
					}
				})
			})
			await Promise.all(countFeaturePromises)
		}

		if (await this.guaranteeFeaturesDataset()) {
			featureDatasetResourceString = `dataContext[${tFeatureStore.featureDatasetInfo.datasetID}]`

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
							resource: `${featureDatasetResourceString}.itemByID[${iItem.id}]`
						}
					})
				)
			}
			if (tFeaturesToAdd.length > 0) {
				const tValues = tFeaturesToAdd.map(iFeature => {
					const tChosenClassKey = this.targetStore.targetChosenClassColumnKey,
						tUnchosenClassKey = tChosenClassKey === 'left' ? 'right' : 'left',
						tPositiveAttrName = kPosNegConstants.positive.attrKey + tTargetStore.targetClassNames[tChosenClassKey],
						tNegativeAttrName = kPosNegConstants.negative.attrKey + tTargetStore.targetClassNames[tUnchosenClassKey]
					let tValuesObject: { values: { [index: string]: {} } } = {
						values: {
							chosen: iFeature.chosen,
							name: iFeature.name,
							type: iFeature.type,
							/*
														formula: iFeature.formula,
														description: iFeature.description,
							*/
							usages: JSON.stringify(iFeature.usages)
						}
					}
					tValuesObject.values[tPositiveAttrName] = iFeature.numberInPositive
					tValuesObject.values[tNegativeAttrName] = iFeature.numberInNegative
					return tValuesObject
				})
				const tCreateResult: any = await codapInterface.sendRequest(
					{
						action: 'create',
						resource: `${featureDatasetResourceString}.collection[${tFeatureStore.featureDatasetInfo.collectionName}].case`,
						values: tValues
					}
				)
				if (tCreateResult.success) {
					tCreateResult.values.forEach(async (iValue: any, iIndex: number) => {
						tFeaturesToAdd[iIndex].caseID = iValue.id
						const tGetItemResult: any = await codapInterface.sendRequest({
							action: 'get',
							resource: `${featureDatasetResourceString}.itemByCaseID[${iValue.id}]`
						})
						tFeaturesToAdd[iIndex].featureItemID = tGetItemResult.values.id
					})
				}
			}
			if (tFeaturesToUpdate.length > 0) {
				await codapInterface.sendRequest(
					tFeaturesToUpdate.map(iFeature => {
						return {
							action: 'update',
							resource: `${featureDatasetResourceString}.itemByID[${iFeature.caseID}]`,
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
			const caseUpdateRequestKeys = Object.keys(caseUpdateRequests)
			if (caseUpdateRequestKeys.length > 0) {
				const tValues = caseUpdateRequestKeys.map(iIndex => {
					const iRequest = caseUpdateRequests[iIndex]
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
		if (this.featureStore.tokenMapAlreadyHasUnigrams())
			return
		const this_ = this
		await this.targetStore.updateTargetCases()
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
				ignorePunctuation: true,
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
						/*
												description: `unigram ${tIgnore ? '' : 'not '}ignoring stop words with frequency threshold of ${tThreshold}`,
						*/
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
					// console.log(`iCase = ${JSON.stringify(toJS(iCase))}`)
					const tTheseFeatureIDs = iCase.values.featureIDs
					const tUpdateValue = {id: iCase.id, values: {featureIDs: tTheseFeatureIDs ? JSON.parse(tTheseFeatureIDs) : []}}
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

	featuresPanelCanBeEnabled() {
		return this.targetStore.targetAttributeName !== ''
			&& this.targetStore.targetClassAttributeName !== ''
			&& this.targetStore.targetChosenClassColumnKey !== ''
	}

	trainingPanelCanBeEnabled() {
		return this.featuresPanelCanBeEnabled() && this.featureStore.features.length > 0
	}

	testingPanelCanBeEnabled() {
		return this.trainingPanelCanBeEnabled() && trainingStore.trainingResults.length > 0
	}

	async setIsActiveForResultAtIndex(iIndex: number, iIsActive: boolean) {
		const tTrainingResults = trainingStore.trainingResults
		let tNumActive = 0
		tTrainingResults[iIndex].isActive = iIsActive
		tTrainingResults.forEach(iResult => {
			tNumActive += iResult.isActive ? 1 : 0
		})
		if (tNumActive === 0) {
			// Always have at least one result active
			let currIndex = iIndex - 1
			if (currIndex < 0)
				currIndex = tTrainingResults.length - 1
			tTrainingResults[currIndex].isActive = true
		}
		const tFirstActiveResult = tTrainingResults.find(iResult=>iResult.isActive),
			tIgnore = tFirstActiveResult ? tFirstActiveResult.ignoreStopWords : true
		await this.syncWeightsAndResultsWithActiveModels()
		await this.recreateUsagesAndFeatureIDs(tIgnore)
	}

	/**
	 * When the user changes activity status of models, we go into the Features and target datasets and set aside
	 * weights and results for all models not currently active.
	 */
	async syncWeightsAndResultsWithActiveModels() {
		if (trainingStore.trainingResults.length === 0) return

		const tTrainingResults = trainingStore.trainingResults,
			tFeatureDatasetName = this.featureStore.featureDatasetInfo.datasetName,
			tMessages: object[] = [],
			tWeightsCollectionName = this.featureStore.featureDatasetInfo.weightsCollectionName
		let tResultIDsToSetaside: number[] = [],
			tWeightIDsToSetaside: number[] = []// Unset-aside all the weights
		await codapInterface.sendRequest({
				action: 'notify',
				resource: `dataContext[${tFeatureDatasetName}]`,
				values: {
					request: "restoreSetasides"
				}
			}
		)

		// Gather all the cases from the weights collection
		const tWeightsRequestResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${tFeatureDatasetName}].collection[${tWeightsCollectionName}].caseFormulaSearch[true]`
			}),
			tWeightNameIDPairs: { modelName: string, id: number }[] = tWeightsRequestResult.success ?
				tWeightsRequestResult.values.map((iValue: { id: number, values: { 'model name': string } }) => {
					return {modelName: iValue.values['model name'], id: iValue.id}
				}) : []

		// Unset-aside results collection for each training result
		const datasetNames = tTrainingResults.map(iResult=>iResult.targetDatasetName)
			.filter(iName=>iName!==null && iName!==undefined),
			datasetNamesSet = new Set(datasetNames),
			uniqueNames = Array.from(datasetNamesSet)
		await codapInterface.sendRequest(uniqueNames.map(iName => {
			return {
				action: 'notify',
				resource: `dataContext[${iName}]`,
				values: {
					request: "restoreSetasides"
				}
			}
		}))
		// All cases are showing. Now figure out which weights and results to set aside
		// First gather all the weight cases with no model name
/*
		const tNoNamePairs = tWeightNameIDPairs.filter(iPair=>iPair.modelName === '')
		tWeightIDsToSetaside = tWeightIDsToSetaside.concat(tNoNamePairs.map(iPair=>iPair.id))
*/
		for (let tIndex = 0; tIndex < tTrainingResults.length; tIndex++) {
			const iResult = tTrainingResults[tIndex]
			// First the weights
			if (!iResult.isActive) {
				const tInactiveWeightPairs = tWeightNameIDPairs.filter(iPair => iPair.modelName === iResult.name),
					tInactiveWeightIDs = tInactiveWeightPairs.map(iPair => iPair.id)
				tWeightIDsToSetaside = tWeightIDsToSetaside.concat(tInactiveWeightIDs)
				tMessages.push({
					action: 'notify',
					resource: `dataContext[${tFeatureDatasetName}]`,
					values: {
						request: 'setAside',
						caseIDs: tWeightIDsToSetaside
					}
				})
				// Now the results
				const tDatasetName = iResult.targetDatasetName
				if( tDatasetName) {
					const tResultsRequestResult: any = await codapInterface.sendRequest({
							action: 'get',
							resource: `dataContext[${tDatasetName}].collection[${'results'}].caseFormulaSearch[true]`
						}),
						tResultNameIDPairs: { modelName: string, id: number }[] = tResultsRequestResult.success ?
							tResultsRequestResult.values.map((iValue: { id: number, values: { 'model name': string } }) => {
								return {modelName: iValue.values['model name'], id: iValue.id}
							}) : []
					const tInactiveResultPairs = tResultNameIDPairs.filter(iPair => iPair.modelName === iResult.name),
						tInactiveResultIDs = tInactiveResultPairs.map(iPair => iPair.id)
					tResultIDsToSetaside = tResultIDsToSetaside.concat(tInactiveResultIDs)
					tMessages.push({
						action: 'notify',
						resource: `dataContext[${tDatasetName}]`,
						values: {
							request: 'setAside',
							caseIDs: tResultIDsToSetaside
						}
					})
				}
			}
		}

		// Do the setting aside all at once
		await codapInterface.sendRequest(tMessages)
	}

	setPanel(iPanelIndex: number) {
		uiStore.setTabPanelSelectedIndex(iPanelIndex);
		this.targetStore.updateFromCODAP();
	}

	/**
	 * The end result will be that
	 * 		* target cases featureIDs will be updated
	 * 		* feature cases usages will be updated
	 * 		* The target store's features will get updated IDs for both cases and items
	 * 	 	* The featureStore's tokenMap's tokens get updated array of case IDs and featureIDs
	 */
	async recreateUsagesAndFeatureIDs(iIgnoreStopwords:boolean) {

		function targetTextHasUnigram(iText:string, iUnigram:string) {
			return wordTokenizer(iText, iIgnoreStopwords, true).indexOf(iUnigram) >= 0
		}

		const tTargetDatasetName = this.targetStore.targetDatasetInfo.name,
			tTargetCollectionName = this.targetStore.targetCollectionName,
			tTargetAttributeName = this.targetStore.targetAttributeName,
			tTargetCases = await getCaseValues(tTargetDatasetName, tTargetCollectionName),
			tFeatureDatasetName = this.featureStore.featureDatasetInfo.datasetName,
			tFeatureCollectionName = this.featureStore.featureDatasetInfo.collectionName,
			tTokenMap = this.featureStore.tokenMap,
			tFeatureCases = await getCaseValues(tFeatureDatasetName, tFeatureCollectionName),
			tUsageResults:{ [index:number]:number[]} = {}, // Contains IDs of target texts that contain a given feature
			tTextResults: {[index:number]:number[]} = {},	// Contains IDs of features found in a given text
			tFeatureItemRequests:{action:'get', resource:string}[] = []
		tFeatureCases.forEach(iFeatureCase=>{
			tFeatureItemRequests.push({action:'get', resource:`dataContext[${tFeatureDatasetName}].itemByCaseID[${iFeatureCase.id}]`})
			const tFeatureName = iFeatureCase.values.name,
				tFeatureType = iFeatureCase.values.type

			tTargetCases.forEach(iTargetCase=>{
				const tTargetHasFeature =
						['constructed', 'column'].includes(tFeatureType) ? iTargetCase.values[tFeatureName] :
							tFeatureType === 'unigram' ? targetTextHasUnigram( iTargetCase.values[tTargetAttributeName], tFeatureName) :
								false
				if( tTargetHasFeature) {
					if( !tUsageResults[iFeatureCase.id])
						tUsageResults[iFeatureCase.id] = []
					tUsageResults[iFeatureCase.id].push( iTargetCase.id)
					if( !tTextResults[iTargetCase.id])
						tTextResults[iTargetCase.id] = []
					tTextResults[iTargetCase.id].push( iFeatureCase.id)
				}
			})
			// We need to store the featureCaseID in the token map while we've got it
			if( tTokenMap[tFeatureName]) {
				tTokenMap[tFeatureName].featureCaseID = iFeatureCase.id
			}
		})
		// Now we can update the target and feature cases
		const tMsgs:Message[] = [
			{
				action: 'update',
				resource: `dataContext[${tTargetDatasetName}].collection[${tTargetCollectionName}].case`,
				values:[]
			},
			{
				action: 'update',
				resource: `dataContext[${tFeatureDatasetName}].collection[${tFeatureCollectionName}].case`,
				values:[]
			}
		]
		for (let tTextResultsKey in tTextResults) {
			tMsgs[0].values.push( {
				id: tTextResultsKey,
				values: { featureIDs: tTextResults[tTextResultsKey]}
			})
		}
		for (let tUsageResultsKey in tUsageResults) {
			tMsgs[1].values.push( {
				id: tUsageResultsKey,
				values: {usages: tUsageResults[tUsageResultsKey]}
			})
		}
		tMsgs[0].values.forEach(iValue=>{
				iValue.values.featureIDs = JSON.stringify(iValue.values.featureIDs)
			})
		tMsgs[1].values.forEach(iValue=>{
				iValue.values.usages = JSON.stringify(iValue.values.usages)
			})
		await codapInterface.sendRequest(tMsgs)

		// Now we update the case and item ids of the stored features
		const tItemResults:any = await codapInterface.sendRequest(tFeatureItemRequests)
		tFeatureCases.forEach((iFeature, iIndex)=>{
			const tStoredFeature = this.featureStore.features.find(iStoredFeature=>{
				return iStoredFeature.name === iFeature.values.name
			})
			if( tStoredFeature) {
				tStoredFeature.featureItemID = tItemResults[iIndex].values.id
				tStoredFeature.caseID = String(iFeature.id)
			}
		})

		// Finally, we update featureStore.tokenMap. Each token has caseIDs corresponding to usages and a featureID
		//	that is the ID of the feature in the features collection.
		for (let tTokenMapKey in tTokenMap) {
			const tToken = tTokenMap[tTokenMapKey],
				tStoredFeature = this.featureStore.features.find(iStoredFeature=>{
					return iStoredFeature.name === tTokenMapKey
				})
			if(tToken && tStoredFeature) {
				tToken.featureCaseID = Number(tStoredFeature.caseID)
				tToken.caseIDs = tUsageResults[Number(tStoredFeature.caseID)]
			}
		}
	}

}

export const domainStore = new DomainStore();
