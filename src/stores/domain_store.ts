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
	getCaseValues
} from "../lib/codap-helper";
import {Case} from "../storyq_types";
// import codapInterface from "../lib/CodapInterface";

const kEmptyEntityInfo = {name: '', title: '', id: 0}

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

	fromJSON(json: { targetStore: object, featureStore: object }) {
		this.targetStore.fromJSON(json.targetStore)
		this.featureStore.fromJSON(json.featureStore)
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

}
export const featureDescriptors = {
	kinds: ['"contains" feature', '"count of" feature'],
	containsOptions: ['starts with', 'contains', 'does not contain', 'ends with'],
	kindOfThingContainedOptions: ['any number', 'any from list', 'free form text'/*, 'any date'*/],
	caseOptions: ['sensitive', 'insensitive']
}
interface Feature {
	inProgress:boolean
	name:string
	kind:string
}

const starterFeature = { inProgress: false, name: '', kind: '' }

class FeatureStore {
	features:Feature[] = []
	featureUnderConstruction: Feature

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

	fromJSON(json:any) {
		if(json) {
			this.features = json.features || []
			this.featureUnderConstruction = json.featureUnderConstruction || starterFeature
		}
	}

	constructionIsDone() {
		const tFeature = this.featureUnderConstruction
		return tFeature.name !== '' && tFeature.kind !== ''
	}

	pushFeatureUnderConstruction() {
		this.features.push(this.featureUnderConstruction)
		this.featureUnderConstruction = starterFeature
	}

}