/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import {makeAutoObservable, runInAction, toJS} from 'mobx'
import {
	entityInfo,
	getAttributeNames,
	getCollectionNames,
	getDatasetInfoWithFilter,
	getCaseValues, openTable, scrollCaseTableToRight
} from "../lib/codap-helper";
import {Case} from "../storyq_types";
import codapInterface from "../lib/CodapInterface";
import {containsOptions, featureKinds, kindOfThingContainedOptions} from "../components/old_feature_constructor";
import {SQ} from "../lists/personal-pronouns";

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

	constructor() {
		this.targetStore = new TargetStore()
		this.featureStore = new FeatureStore()
	}

	asJSON(): object {
		return {
			targetStore: this.targetStore.asJSON(),
			featureStore: this.featureStore.asJSON()
		}
	}

	async fromJSON(json: { targetStore: object, featureStore: object }) {
		this.targetStore.fromJSON(json.targetStore)
		this.featureStore.fromJSON(json.featureStore)
		await this.updateFeaturesDataset()
	}

	async updateFeaturesDataset() {
		const this_ = this,
			tDatasetName = 'Features',
			tFeatureStore = this.featureStore,
			tTargetStore = this.targetStore;
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
									{name: 'description'},
									{name: 'formula'}
								]
							}]
						}
					})
					if (tCreateResult.success) {
						tFeatureStore.featureDatasetInfo.datasetID = tCreateResult.values.id
						openTable(tDatasetName)
					}
				}
				return true
			}
			return false
		}

		async function getExistingItems(): Promise<{ values: object, id: string }[]> {
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
				return iItem[iKey] !== iFeature[iKey]
			}) || iItem[kPosNegConstants.negative.attrKey] !== iFeature[kPosNegConstants.negative.storeKey] ||
				iItem[kPosNegConstants.positive.attrKey] !== iFeature[kPosNegConstants.positive.storeKey]
		}

		async function updateFrequencies() {
			const tClassAttrName = this_.targetStore.targetClassAttributeName,
				tPosClassLabel = (this_.targetStore.targetClassNames.find(iName=>iName.positive) || {name: ''}).name
				// tNegClassLabel = (this_.targetStore.targetClassNames.find(iName=>!iName.positive) || {name: ''}).name
			// get all target dataset items
			const tTargetItemsResponse: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${tTargetStore.targetDatasetInfo.name}].itemSearch[*]`
			})
			if (tTargetItemsResponse.success) {
				tFeatureStore.features.forEach(iFeature=>{
					iFeature.numberInPositive = 0
					iFeature.numberInNegative = 0
				})
				tTargetItemsResponse.values.forEach((iItem: { [key: string]: any }) => {
					tFeatureStore.features.forEach(iFeature=>{
						if(iItem.values[iFeature.name]) {
							if (iItem.values[tClassAttrName] === tPosClassLabel) {
								iFeature.numberInPositive++
							}
							else {
								iFeature.numberInNegative++
							}
						}
					})
				})
			}
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

			tItemsInDataset = await getExistingItems()
			await updateFrequencies()
			tItemsToDelete = tItemsInDataset.filter(iItem => {
				return !tFeatureStore.features.find(iFeature => iFeature.caseID === iItem.id)
			})
			tFeaturesToAdd = tFeatureStore.features.filter(iFeature => {
				return !tItemsInDataset.find(iItem => {
					return iFeature.caseID === iItem.id
				})
			})
			tFeaturesToUpdate = tFeatureStore.features.filter(iFeature => {
				const tMatchingItem = tItemsInDataset.find(iItem => {
					return iFeature.caseID === iItem.id
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
								formula: iFeature.formula,
								description: iFeature.description
							}
						})
					}
				)
				console.log('tCreateResult =',tCreateResult)
				if (tCreateResult.success) {
					tCreateResult.caseIDs.forEach((iCaseID: string, iIndex: number) => {
						tFeaturesToAdd[iIndex].caseID = iCaseID
						console.log('tFeaturesToAdd =',toJS(tFeaturesToAdd[iIndex]))
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

			// logArrays()

		}

	}
}

class TargetStore {
	targetDatasetInfo: entityInfo = kEmptyEntityInfo
	datasetInfoArray: entityInfo[] = []
	targetCollectionName: string = ''
	targetAttributeNames: string[] = []
	targetAttributeName: string = ''
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
			targetClassNames: toJS(this.targetClassNames)
		}
	}

	fromJSON(json: any) {
		this.targetDatasetInfo = json.targetDatasetInfo || kEmptyEntityInfo
		this.targetAttributeName = json.targetAttributeName || ''
		this.targetClassAttributeName = json.targetClassAttributeName || ''
		this.targetClassNames = json.targetClassNames || []
	}

	async updateFromCODAP() {
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
		if (this.targetDatasetInfo.name !== '') {
			tCollNames = await getCollectionNames(this.targetDatasetInfo.name)
			tCollName = tCollNames.length > 0 ? tCollNames[0] : ''
			tAttrNames = tCollName !== '' ? await getAttributeNames(this.targetDatasetInfo.name, tCollName) : []
			tCaseValues = this.targetAttributeName !== '' ? await getCaseValues(this.targetDatasetInfo.name,
				tCollName, this.targetAttributeName) : []
			chooseClassNames()
		}
		runInAction(() => {
			this.datasetInfoArray = tDatasetNames
			this.targetCollectionName = tCollName
			this.targetAttributeNames = tAttrNames
			this.targetCases = tCaseValues
			this.targetClassNames = tClassNames
		})
	}

	async addOrUpdateFeatureToTarget(iNewFeature: Feature, iUpdate?:boolean) {
		const this_ = this,
			tTargetAttr = `${this_.targetAttributeName}`

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
				}
				break;
			case featureKinds[1]:	// count feature

				break;
		}
		if (tFormula !== '')
			iNewFeature.formula = tFormula
		if( !iUpdate) {
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
		}
		else {
			const tRequest = `dataContext[${this.targetDatasetInfo.name}].collection[${this.targetCollectionName}].attribute[${iNewFeature.attrID}]`
			console.log('tRequest =', tRequest)
			await codapInterface.sendRequest({
				action: 'update',
				resource: tRequest,
				values: {
					title: iNewFeature.name,
					name: iNewFeature.name
				}
			}).then((iResult:any)=>{
				console.log('result of requesting attribute update', iResult)
			})
		}
	}
}

export const featureDescriptors = {
	kinds: ['"contains" feature', '"count of" feature'],
	containsOptions: ['starts with', 'contains', 'does not contain', 'ends with'],
	kindOfThingContainedOptions: ['any number', 'any from list', 'free form text'/*, 'any date'*/],
	caseOptions: ['sensitive', 'insensitive']
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
	[key:string]:any
	inProgress: boolean
	name: string,
	chosen: boolean,
	info: FeatureDetails,
	description: string
	formula: string
	numberInPositive: number
	numberInNegative: number
	caseID: string		// ID of the feature as a case in the feature table
	attrID: string		// ID of the attribute in the target dataset corresponding to this feature
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
	formula: '',
	numberInNegative: -1,
	numberInPositive: -1,
	caseID: '',
	attrID: ''
}

class FeatureStore {
	features: Feature[] = []
	featureUnderConstruction: Feature = starterFeature
	featureDatasetInfo = {
		datasetName: '',
		datasetID: -1
	}

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true})
		this.featureUnderConstruction = starterFeature
	}

	asJSON() {
		return {
			features: toJS(this.features),
			featureUnderConstruction: toJS(this.featureUnderConstruction)
		}
	}

	fromJSON(json: any) {
		if (json) {
			this.features = json.features || []
			this.featureUnderConstruction = json.featureUnderConstruction || starterFeature
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
		this.featureUnderConstruction.description = this.getDescriptionFor(this.featureUnderConstruction)
		this.features.unshift(this.featureUnderConstruction)
		this.featureUnderConstruction = starterFeature
	}

}