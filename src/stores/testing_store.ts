/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import { makeAutoObservable, toJS } from 'mobx'
import {
	entityInfo, getAttributeNames, getCollectionNames, getDatasetInfoWithFilter, guaranteeTableOrCardIsVisibleFor
} from "../lib/codap-helper";
import { featureStore } from './feature_store';
import { getEmptyTestingResult, kEmptyEntityInfo, TestingResult } from "./store_types_and_constants";

export interface ITestingStore {
	chosenModelName: string;
	testingDatasetInfo: entityInfo;
	testingDatasetInfoArray: entityInfo[];
	testingCollectionName: string;
	testingAttributeNames: string[];
	testingAttributeName: string;
	testingClassAttributeName: string;
	currentTestingResults: TestingResult;
	testingResultsArray: TestingResult[];
}

export class TestingStore {
	chosenModelName = '';
	testingDatasetInfo: entityInfo = kEmptyEntityInfo;
	testingDatasetInfoArray: entityInfo[] = [];
	testingCollectionName = '';
	testingAttributeNames: string[] = [];
	testingAttributeName = '';
	testingClassAttributeName = '';
	currentTestingResults: TestingResult = getEmptyTestingResult();
	testingResultsArray: TestingResult[] = [];

	constructor() {
		makeAutoObservable(this, {}, { autoBind: true });
	}

	prepareForConstruction() {
		this.currentTestingResults = getEmptyTestingResult();
		this.currentTestingResults.testBeingConstructed = true;
	}

	asJSON() {
		return toJS(this);
	}

	fromJSON(json: ITestingStore) {
		if (json) {
			this.chosenModelName = json.chosenModelName ?? '';
			this.testingDatasetInfo = json.testingDatasetInfo ?? kEmptyEntityInfo;
			this.testingDatasetInfoArray = json.testingDatasetInfoArray ?? [];
			this.testingCollectionName = json.testingCollectionName ?? '';
			this.testingAttributeNames = json.testingAttributeNames ?? [];
			this.testingAttributeName = json.testingAttributeName?? '';
			this.testingClassAttributeName = json.testingClassAttributeName ?? '';
			this.currentTestingResults = json.currentTestingResults ?? getEmptyTestingResult();
			this.testingResultsArray = json.testingResultsArray ?? [];
		}
	}

	setChosenModelName(name: string) {
		this.chosenModelName = name;
	}

	setTestingDatasetInfo(info: entityInfo) {
		this.testingDatasetInfo = info;
	}

	setTestingAttributeName(name: string) {
		this.testingAttributeName = name;
	}

	setTestingClassAttributeName(name: string) {
		this.testingClassAttributeName = name;
	}

	async updateCodapInfoForTestingPanel() {
		this.testingDatasetInfoArray =
			await getDatasetInfoWithFilter(anInfo => anInfo.id !== featureStore.featureDatasetID);
		this.testingCollectionName = '';
		this.testingAttributeNames = [];

		const tTestingDatasetName = this.testingDatasetInfo.name;
		if (tTestingDatasetName !== '') {
			const tCollectionNames = await getCollectionNames(tTestingDatasetName);
			this.testingCollectionName = tCollectionNames.length > 0 ? tCollectionNames[0] : 'cases';
			this.testingAttributeNames = this.testingCollectionName !== ''
				? await getAttributeNames(tTestingDatasetName, this.testingCollectionName) : [];
		}

		guaranteeTableOrCardIsVisibleFor({
			name: tTestingDatasetName,
			title: this.testingDatasetInfo.title,
			id: -1
		});
	}
}

export const testingStore = new TestingStore();
