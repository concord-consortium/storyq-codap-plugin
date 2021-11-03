/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import {makeAutoObservable, runInAction, toJS} from 'mobx'
import {
	entityInfo,
	getAttributeNames,
	getCollectionNames,
	getDatasetInfoWithFilter, guaranteeTableOrCardIsVisibleFor
} from "../lib/codap-helper";
import {
	kEmptyEntityInfo, TestingResult
} from "./store_types_and_constants";
import {FeatureStore} from "./feature_store";

export class TestingStore {
	[index: string]: any;
	featureStore:FeatureStore
	chosenModelName: string = ''
	testingDatasetInfo: entityInfo = kEmptyEntityInfo
	testingDatasetInfoArray: entityInfo[] = []
	testingCollectionName: string = ''
	testingAttributeNames: string[] = []
	testingAttributeName: string = ''
	testingClassAttributeName: string = ''
	currentTestingResults:TestingResult
	testingResultsArray:TestingResult[] = []

	constructor(iFeatureStore:FeatureStore) {
		makeAutoObservable(this, {featureStore: false}, {autoBind: true})
		this.featureStore = iFeatureStore
		this.currentTestingResults = this.emptyTestingResults()
	}

	emptyTestingResults():TestingResult {
		return {
			targetDatasetName: '', targetDatasetTitle: '', modelName: '', numPositive: 0, numNegative: 0,
			accuracy: 0, kappa: 0, testBeingConstructed: false
		}
	}

	prepareForConstruction() {
		this.currentTestingResults = this.emptyTestingResults()
		this.currentTestingResults.testBeingConstructed = true
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

	async updateCodapInfoForTestingPanel() {
		const this_ = this
		const tDatasetEntityInfoArray = await getDatasetInfoWithFilter(
			(anInfo) => {
				return anInfo.id !== this_.featureStore.featureDatasetInfo.datasetID
			}),
			tTestingDatasetName = this.testingDatasetInfo.name
		let tCollectionNames: string[] = [],
			tCollectionName: string,
			tAttributeNames: string[] = []
		if (tTestingDatasetName !== '') {
			tCollectionNames = await getCollectionNames(tTestingDatasetName)
			tCollectionName = tCollectionNames.length > 0 ? tCollectionNames[0] : 'cases'
			tAttributeNames = tCollectionName !== '' ? await getAttributeNames(tTestingDatasetName, tCollectionName) : []
		}
		runInAction(() => {
			this.testingDatasetInfoArray = tDatasetEntityInfoArray
			this.testingCollectionName = tCollectionName
			this.testingAttributeNames = tAttributeNames
		})
		guaranteeTableOrCardIsVisibleFor({name: tTestingDatasetName,
			title: this.testingDatasetInfo.title, id: -1})
	}

}