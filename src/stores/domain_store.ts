/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import {makeAutoObservable, runInAction, toJS} from 'mobx'
import {
	entityInfo,
	getAttributeNames,
	getCaseValues,
	getCollectionNames,
	getDatasetInfoWithFilter,
	guaranteeAttribute,
	openTable,
	scrollCaseTableToRight
} from "../lib/codap-helper";
import {Case} from "../storyq_types";
import codapInterface from "../lib/CodapInterface";
import {SQ} from "../lists/personal-pronouns";
import {LogisticRegression} from "../lib/jsregression";
import pluralize from "pluralize";
import TextFeedbackManager from "../managers/text_feedback_manager";

export const featureDescriptors = {
	featureKinds: ['"contains" feature', '"count of" feature'],
	containsOptions: ['starts with', 'contains', 'does not contain', 'ends with'],
	kindOfThingContainedOptions: ['any number', 'any from list', 'free form text'/*, 'any date'*/],
	caseOptions: ['sensitive', 'insensitive']
}

const kEmptyEntityInfo = {name: '', title: '', id: 0},
	kPosNegConstants = {
		positive: {
			storeKey: 'numberInPositive',
			attrKey: 'frequency in positive'
		},
		negative: {
			storeKey: 'numberInNegative',
			attrKey: 'frequency in negative'
		}
	}

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
		this.testingStore = new TestingStore()
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

	async updateFeaturesDataset() {
		// console.log('Begin updateFeaturesDataset')
		const this_ = this,
			tDatasetName = 'Features',
			tFeatureStore = this.featureStore,
			tTargetStore = this.targetStore,
			caseUpdateRequests: { values: { features: Feature[] } }[] = [],
			tTargetDatasetName = tTargetStore.targetDatasetInfo.name,
			tTargetCollectionName = tTargetStore.targetCollectionName
		let resourceString: string = '',
			tItemsInDataset: { values: object, id: string }[] = [],
			tItemsToDelete: { values: object, id: string }[] = [],
			tFeaturesToAdd: Feature[] = [],
			tFeaturesToUpdate: Feature[] = []

		async function guaranteeFeaturesDataset(): Promise<boolean> {
			if (tFeatureStore.features.length > 0) {
				if (tFeatureStore.featureDatasetInfo.datasetID === -1) {
					const tCreateResult: any = await codapInterface.sendRequest({
						action: 'create',
						resource: 'dataContext',
						values: {
							name: tDatasetName,
							title: tDatasetName,
							collections: [{
								name: 'features',
								title: 'features',
								attrs: [
									{name: 'chosen'},
									{name: 'name'},
									{name: kPosNegConstants.positive.attrKey},
									{name: kPosNegConstants.negative.attrKey},
									{name: 'type'},
									{name: 'description'},
									{name: 'formula'},
									{name: 'weight'},
									{name: 'usages', hidden: false}
								]
							}]
						}
					})
					if (tCreateResult.success) {
						tFeatureStore.featureDatasetInfo.datasetID = tCreateResult.values.id
						tFeatureStore.featureDatasetInfo.datasetName = tDatasetName
						openTable(tDatasetName)
					}
				}
				return true
			}
			return false
		}

		async function getExistingFeatureItems(): Promise<{ values: object, id: string }[]> {
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
			/*
						console.log('matching iItem', toJS(iItem), ' with feature ', iFeature)
						console.log('storeKey = ', kPosNegConstants.negative.storeKey,
							'iItem[kPosNegConstants.negative.storeKey] =', iItem[kPosNegConstants.negative.storeKey])
						console.log('attrKey = ', kPosNegConstants.negative.attrKey,
							'iFeature[kPosNegConstants.negative.attrKey] =', iFeature[kPosNegConstants.negative.attrKey])
			*/
			return ['name', 'chosen', 'formula', 'description'].some(iKey => {
					return String(iItem[iKey]).trim() !== String(iFeature[iKey]).trim()
				}) || iItem[kPosNegConstants.negative.storeKey] !== iFeature[kPosNegConstants.negative.attrKey] ||
				iItem[kPosNegConstants.positive.storeKey] !== iFeature[kPosNegConstants.positive.attrKey]
		}

		async function updateFrequenciesUsagesAndFeatureIDs() {
			// console.trace('Begin updateFrequenciesUsagesAndFeatureIDs')
			const tClassAttrName = this_.targetStore.targetClassAttributeName,
				tPosClassLabel = this_.targetStore.getClassName('positive')
			console.log(`tTargetCollectionName = ${tTargetCollectionName}`)
			// get all target dataset items
			let tTargetCasesResponse: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${tTargetDatasetName}].collection[${tTargetCollectionName}].caseFormulaSearch[true]`
			}).catch(reason => {
				console.log(`Failed to get ${tTargetDatasetName}(${tTargetCollectionName}) because ${reason}`)
			})
			if (tTargetCasesResponse.success) {
				tFeatureStore.features.forEach(iFeature => {
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
				tTargetCasesResponse.values.forEach((iCase: { [key: string]: any }) => {
					tFeatureStore.features.forEach((iFeature) => {
						if (iCase.values[iFeature.name]) {
							if (iCase.values[tClassAttrName] === tPosClassLabel) {
								iFeature.numberInPositive++
								iFeature.usages.push(iCase.id)
							} else {
								iFeature.numberInNegative++
							}
							if (!caseUpdateRequests[iCase.id]) {
								caseUpdateRequests[iCase.id] = {values: {features: []}}
							}
							caseUpdateRequests[iCase.id].values.features.push(iFeature)
						}
					})
				})
				tTargetCasesResponse = null	// free up memory
			}
			// console.log('End updateFrequenciesUsagesAndFeatureIDs')
		}

		/*
						function logArrays() {
							console.log(`itemsInDataset = ${JSON.stringify(tItemsInDataset)}`)
							console.log(`tItemsToDelete = ${JSON.stringify(tItemsToDelete)}`)
							console.log(`tFeaturesToAdd = ${JSON.stringify(tFeaturesToAdd)}`)
							console.log(`tFeaturesToUpdate = ${JSON.stringify(tFeaturesToUpdate)}`)
						}
		*/

		if (await guaranteeFeaturesDataset()) {
			resourceString = `dataContext[${tFeatureStore.featureDatasetInfo.datasetID}]`

			tItemsInDataset = await getExistingFeatureItems()
			await updateFrequenciesUsagesAndFeatureIDs()
			tItemsToDelete = tItemsInDataset.filter(iItem => {
				return !tFeatureStore.features.find(iFeature => iFeature.featureItemID === iItem.id)
			})
			tFeaturesToAdd = tFeatureStore.features.filter(iFeature => {
				return !tItemsInDataset.find(iItem => {
					return iFeature.featureItemID === iItem.id
				})
			})
			tFeaturesToUpdate = tFeatureStore.features.filter(iFeature => {
				const tMatchingItem = tItemsInDataset.find(iItem => {
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
			// logArrays()
		}
		// console.log('End updateFeaturesDataset')

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

class TargetStore {
	targetDatasetInfo: entityInfo = kEmptyEntityInfo
	datasetInfoArray: entityInfo[] = []
	targetCollectionName: string = ''
	targetAttributeNames: string[] = []
	targetAttributeName: string = ''
	targetPredictedLabelAttributeName: string = ''
	targetFeatureIDsAttributeName = 'featureIDs'
	targetCases: Case[] = []
	targetClassAttributeName: string = ''
	targetClassNames: { name: string, positive: boolean }[] = []

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true})
	}

	asJSON() {
		return {
			targetDatasetInfo: toJS(this.targetDatasetInfo),
			targetAttributeName: toJS(this.targetAttributeName),
			targetClassAttributeName: toJS(this.targetClassAttributeName),
			targetClassNames: toJS(this.targetClassNames),
			targetPredictedLabelAttributeName: toJS(this.targetPredictedLabelAttributeName)
		}
	}

	fromJSON(json: any) {
		this.targetDatasetInfo = json.targetDatasetInfo || kEmptyEntityInfo
		this.targetAttributeName = json.targetAttributeName || ''
		this.targetClassAttributeName = json.targetClassAttributeName || ''
		this.targetClassNames = json.targetClassNames || []
		this.targetPredictedLabelAttributeName = json.targetPredictedLabelAttributeName || ''
	}

	getClassName(iClass: string) {
		const tClassObj = this.targetClassNames.find(iObj => {
			return iClass === 'positive' ? iObj.positive : !iObj.positive
		})
		return tClassObj ? tClassObj.name : ''
	}

	async updateFromCODAP() {
		// console.log('Begin updateFromCODAP')
		const this_ = this

		function chooseClassNames() {
			if (this_.targetClassAttributeName !== '') {
				tPositiveClassName = this_.targetClassNames.length === 1 ?
					this_.targetClassNames[0].name :
					tCaseValues[0][this_.targetClassAttributeName]
				const tNegativeClassCase = tCaseValues.find(iCase => iCase[this_.targetClassAttributeName] !== tPositiveClassName)
				tNegativeClassName = tNegativeClassCase ? tNegativeClassCase[this_.targetClassAttributeName] : ''
				tClassNames = [
					{name: tPositiveClassName, positive: true},
					{name: tNegativeClassName, positive: false}
				]
			}
		}

		const tDatasetNames = await getDatasetInfoWithFilter(() => true);
		let tCollNames: string[] = []
		let tCollName = ''
		let tAttrNames: string[] = []
		let tCaseValues: Case[] = []
		let tPositiveClassName: string = ''
		let tNegativeClassName: string = ''
		let tClassNames: { name: string, positive: boolean }[] = []
		const tTargetDatasetName = this.targetDatasetInfo.name
		if (tTargetDatasetName !== '') {
			// console.log('Before getCollectionNames')
			tCollNames = await getCollectionNames(tTargetDatasetName)
			// console.log('After getCollectionNames')
			tCollName = tCollNames.length > 0 ? tCollNames[0] : ''
			// console.log('Before getAttributeNames')
			tAttrNames = tCollName !== '' ? await getAttributeNames(tTargetDatasetName, tCollName) : []
			// console.log('After getAttributeNames')
			tCaseValues = this.targetAttributeName !== '' ? await getCaseValues(tTargetDatasetName,
				tCollName) : []
			chooseClassNames()
		}
		// console.log('Before runInAction')
		runInAction(() => {
			this.datasetInfoArray = tDatasetNames
			this.targetCollectionName = tCollName
			// console.log('Set targetCollectionName to', tCollName)
			this.targetAttributeNames = tAttrNames
			this.targetCases = tCaseValues
			this.targetClassNames = tClassNames
		})
		// console.log('After runInAction')
		if (tTargetDatasetName !== '' && this.targetCollectionName !== '') {
			await guaranteeAttribute({name: this.targetFeatureIDsAttributeName, hidden: false},
				tTargetDatasetName, this.targetCollectionName)
		}
		// console.log('End updateFromCODAP')
	}

	async addOrUpdateFeatureToTarget(iNewFeature: Feature, iUpdate ?: boolean) {
		const this_ = this,
			tTargetAttr = `${this_.targetAttributeName}`

		function freeFormFormula() {
			const option = (iNewFeature.info.details as ContainsDetails).containsOption;
			const tBegins = option === featureDescriptors.containsOptions[0] ? '^' : '';
			const tEnds = option === featureDescriptors.containsOptions[3] ? '$' : '';
			const tParamString = `${this_.targetAttributeName},"${tBegins}\\\\\\\\b${(iNewFeature.info.details as ContainsDetails).freeFormText}\\\\\\\\b${tEnds}"`;
			let tResult = '';
			switch (option) {//['starts with', 'contains', 'does not contain', 'ends with']
				case featureDescriptors.containsOptions[0]:	// starts with
					tResult = `patternMatches(${tParamString})>0`
					break;
				case featureDescriptors.containsOptions[1]:	// contains
					tResult = `patternMatches(${tParamString})>0`
					break;
				case featureDescriptors.containsOptions[2]:	// does not contain
					tResult = `patternMatches(${tParamString})=0`
					break;
				case featureDescriptors.containsOptions[3]:	// ends with
					tResult = `patternMatches(${tParamString})>0`
					break;
			}
			return tResult;
		}

		function anyNumberFormula() {
			const kNumberPattern = `[0-9]+`;
			let tExpression = '';
			switch ((iNewFeature.info.details as ContainsDetails).containsOption) {//['starts with', 'contains', 'does not contain', 'ends with']
				case featureDescriptors.containsOptions[0]:	// starts with
					tExpression = `patternMatches(${tTargetAttr}, "^${kNumberPattern}")>0`
					break;
				case featureDescriptors.containsOptions[1]:	// contains
					tExpression = `patternMatches(${tTargetAttr}, "${kNumberPattern}")>0`
					break;
				case featureDescriptors.containsOptions[2]:	// does not contain
					tExpression = `patternMatches(${tTargetAttr}, "${kNumberPattern}")=0`
					break;
				case featureDescriptors.containsOptions[3]:	// ends with
					tExpression = `patternMatches(${tTargetAttr}, "${kNumberPattern}$")>0`
					break;
			}
			return tExpression;
		}

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
					case featureDescriptors.containsOptions[0]:	// starts with
						tExpression = `patternMatches(${tTargetAttr}, "^${tExpression}")>0`;
						break;
					case featureDescriptors.containsOptions[1]:	// contains
						tExpression = `patternMatches(${tTargetAttr}, "${tExpression}")>0`;
						break;
					case featureDescriptors.containsOptions[2]:	// does not contain
						tExpression = `patternMatches(${tTargetAttr}, "${tExpression}")=0`;
						break;
					case featureDescriptors.containsOptions[3]:	// ends with
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
			case featureDescriptors.featureKinds[0]:	// contains feature
				switch ((iNewFeature.info.details as ContainsDetails).kindOption) {
					case featureDescriptors.kindOfThingContainedOptions[0]: // 'any number'
						tFormula = anyNumberFormula();
						break;
					case featureDescriptors.kindOfThingContainedOptions[1]: // 'any from list'
						tFormula = anyListFormula();
						break;
					case featureDescriptors.kindOfThingContainedOptions[2]: // 'any free form text'
						tFormula = freeFormFormula();
						break;
				}
				break;
			case featureDescriptors.featureKinds[1]:	// count feature

				break;
		}
		if (tFormula !== '')
			iNewFeature.formula = tFormula
		if (!iUpdate) {
			const tAttributeResponse: any = await codapInterface.sendRequest({
				action: 'create',
				resource: `dataContext[${this.targetDatasetInfo.name}].collection[${this.targetCollectionName}].attribute`,
				values: {
					name: iNewFeature.name,
					formula: tFormula
				}
			});
			if (tAttributeResponse.success) {
				iNewFeature.attrID = tAttributeResponse.values.attrs[0].id
				await scrollCaseTableToRight(this.targetDatasetInfo.name);
			}
		} else {
			const tRequest = `dataContext[${this.targetDatasetInfo.name}].collection[${this.targetCollectionName}].attribute[${iNewFeature.attrID}]`
			await codapInterface.sendRequest({
				action: 'update',
				resource: tRequest,
				values: {
					title: iNewFeature.name,
					name: iNewFeature.name
				}
			}).then((iResult: any) => {
				console.log('result of requesting attribute update', iResult)
			})
		}
	}
}

export const kKindOfThingOptionText = featureDescriptors.kindOfThingContainedOptions[2]

export interface ContainsDetails {
	containsOption: string,
	kindOption: string,
	caseOption: string,
	freeFormText: string,
	wordList: WordListSpec
}

export interface CountDetails {
	what: string
}

export interface FeatureDetails {
	kind: string,
	details: ContainsDetails | CountDetails
}

export interface Feature {
	[key: string]: any

	inProgress: boolean
	name: string,
	chosen: boolean,
	info: FeatureDetails,
	description: string
	type: string
	formula: string
	numberInPositive: number
	numberInNegative: number
	usages: number[]
	caseID: string		// ID of the feature as a case in the feature table
	attrID: string		// ID of the attribute in the target dataset corresponding to this feature
	featureItemID: string	// ID of the item in the feature table corresponding to this feature
}

export interface WordListSpec {
	datasetName: string,
	firstAttributeName: string
}

const starterContainsDetails = {
	containsOption: '',
	kindOption: '',
	caseOption: '',
	freeFormText: '',
	wordList: {
		datasetName: '', firstAttributeName: ''
	}
}

const starterFeature: Feature = {
	inProgress: false, name: '', chosen: false,
	info: {
		kind: '',
		details: starterContainsDetails
	},
	description: '',
	type: '',
	formula: '',
	numberInNegative: -1,
	numberInPositive: -1,
	usages: [],
	caseID: '',
	attrID: '',
	featureItemID: ''
}

class FeatureStore {
	features: Feature[] = []
	featureUnderConstruction: Feature = starterFeature
	featureDatasetInfo = {
		datasetName: 'Features',
		datasetID: -1
	}
	targetColumnFeatureNames: string[] = []

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true})
		this.featureUnderConstruction = starterFeature
	}

	asJSON() {
		return {
			features: toJS(this.features),
			featureUnderConstruction: toJS(this.featureUnderConstruction),
			targetColumnFeatureNames: toJS(this.targetColumnFeatureNames)
		}
	}

	fromJSON(json: any) {
		if (json) {
			this.features = json.features || []
			this.featureUnderConstruction = json.featureUnderConstruction || starterFeature
			this.targetColumnFeatureNames = json.targetColumnFeatureNames || []
		}
	}

	constructionIsDone() {
		const tFeature = this.featureUnderConstruction
		const tDetails = this.featureUnderConstruction.info.details as ContainsDetails
		return [tFeature.name, tFeature.info.kind, tDetails.containsOption, tDetails.kindOption].every(iString => iString !== '') &&
			(tDetails.kindOption !== kKindOfThingOptionText || tDetails.freeFormText !== '')
	}

	getDescriptionFor(iFeature: Feature) {
		const tDetails = iFeature.info.details as ContainsDetails,
			tFirstPart = `${tDetails.containsOption} ${tDetails.kindOption}`,
			tSecondPart = tDetails.freeFormText !== '' ? `"${tDetails.freeFormText}"` : '',
			tThirdPart = tDetails.wordList && tDetails.wordList.datasetName !== '' ?
				` of ${tDetails.wordList.datasetName}` : '';
		return `${tFirstPart} ${tSecondPart}${tThirdPart}`
	}

	addFeatureUnderConstruction() {
		this.featureUnderConstruction.inProgress = false
		this.featureUnderConstruction.chosen = true
		this.featureUnderConstruction.type = 'constructed'
		this.featureUnderConstruction.description = this.getDescriptionFor(this.featureUnderConstruction)
		this.features.unshift(this.featureUnderConstruction)
		this.featureUnderConstruction = starterFeature
	}

}

class Model {
	[index: string]: any;

	name = ''
	iteration = 0
	iterations = 20
	lockInterceptAtZero = true
	usePoint5AsProbThreshold = true
	frequencyThreshold = 4
	trainingInProgress = false
	logisticModel: LogisticRegression = new LogisticRegression({
		alpha: 1,
		iterations: 20,
		lambda: 0.0,
		accuracy: 0,
		kappa: 0,
		threshold: 0.5,
		trace: false,
		progressCallback: null,
		feedbackCallback: null
	})


	constructor() {
		makeAutoObservable(this, {logisticModel: false}, {autoBind: true})
	}

	asJSON() {
		const tCopy = Object.assign({}, toJS(this))
		delete tCopy.logisticModel
		return tCopy
	}

	fromJSON(json: any) {
		if (json) {
			for (const [key, value] of Object.entries(json)) {
				this[key] = value
			}
		}
	}

}

export interface TrainingResult {
	name: string,
	accuracy: number
	kappa: number
}

class TrainingStore {
	model: Model
	trainingResults: TrainingResult[] = []

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true})
		this.model = new Model()
	}

	asJSON() {
		return {
			model: this.model.asJSON(),
			trainingResults: toJS(this.trainingResults)
		}
	}

	fromJSON(json: any) {
		if (json) {
			this.model.fromJSON(json.model)
			this.trainingResults = json.trainingResults || []
		}
	}
}

class TestingStore {
	[index: string]: any;
	chosenModelName: string = ''
	testingDatasetInfo: entityInfo = kEmptyEntityInfo
	testingDatasetInfoArray: entityInfo[] = []
	testingCollectionName: string = ''
	testingAttributeNames: string[] = []
	testingAttributeName: string = ''

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true})
	}

	async updateCodapInfoForTestingPanel() {
		const tDatasetEntityInfoArray = await getDatasetInfoWithFilter(() => true),
			tTestingDatasetName = this.testingDatasetInfo.name
		let tCollectionNames: string[] = [],
			tCollectionName:string,
			tAttributeNames: string[] = []
		if (tTestingDatasetName !== '') {
			tCollectionNames = await getCollectionNames(tTestingDatasetName)
			tCollectionName = tCollectionNames.length > 0 ? tCollectionNames[0] : ''
			// console.log('Before getAttributeNames')
			tAttributeNames = tCollectionName !== '' ? await getAttributeNames(tTestingDatasetName, tCollectionName) : []
		}
		// console.log('Before runInAction')
		runInAction(() => {
			this.testingDatasetInfoArray = tDatasetEntityInfoArray
			this.testingCollectionName = tCollectionName
			this.testingAttributeNames = tAttributeNames
		})
	}

	asJSON() {
		return toJS(this)
	}

	fromJSON(json: any) {
		if (json) {
			for (const [key, value] of Object.entries(json)) {
				this[key] = value
			}
		}
	}
}

class TextStore {
	textComponentName: string = ''
	textComponentID: number = -1

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true})
	}

	asJSON() {
		return {
			textComponentName: this.textComponentName,
			textComponentID: this.textComponentID
		}
	}

	fromJSON(json: any) {
		if (json) {
			this.textComponentName = json.textComponentName || ''
			this.textComponentID = json.textComponentID || -1
		}
	}

	/**
	 * Only add a text component if one with the designated name does not already exist.
	 */
	async addTextComponent(iAttributeName: string) {
		let tFoundIt = false
		this.textComponentName = 'Selected ' + pluralize(iAttributeName);
		const tListResult: any = await codapInterface.sendRequest(
			{
				action: 'get',
				resource: `componentList`
			}
		)
			.catch(() => {
				console.log('Error getting component list')
			});

		if (tListResult.success) {
			const tFoundValue = tListResult.values.find((iValue: any) => {
				return iValue.type === 'text' && iValue.title === this.textComponentName;
			});
			if (tFoundValue) {
				this.textComponentID = tFoundValue.id;
				tFoundIt = true
			}
		}
		if (!tFoundIt) {
			let tResult: any = await codapInterface.sendRequest({
				action: 'create',
				resource: 'component',
				values: {
					type: 'text',
					name: this.textComponentName,
					title: this.textComponentName,
					dimensions: {
						width: 500,
						height: 150
					},
					position: 'top',
					cannotClose: true
				}
			});
			this.textComponentID = tResult.values.id
		}
	}

	async clearText(iAttributeName: string) {
		await codapInterface.sendRequest({
			action: 'update',
			resource: `component[${this.textComponentID}]`,
			values: {
				text: {
					"object": "value",
					"document": {
						"children": [
							{
								"type": "paragraph",
								"children": [
									{
										"text": `This is where selected ${pluralize(iAttributeName)} appear.`
									}
								]
							}
						],
						"objTypes": {
							"paragraph": "block"
						}
					}
				}
			}
		});
	}

	async closeTextComponent() {
		// this.textComponentName = 'Selected ' + pluralize(this.targetAttributeName);
		await codapInterface.sendRequest({
			action: 'delete',
			resource: `component[${this.textComponentName}]`
		});
	}

}