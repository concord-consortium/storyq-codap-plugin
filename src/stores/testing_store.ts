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
import { uiStore } from './ui_store';

export interface ITestingStore {
  chosenModelName: string;
  currentTestingResults: TestingResult;
  testingAttributeName: string;
  testingAttributeNames: string[];
  testingClassAttributeName: string;
  testingCollectionName: string;
  testingDatasetInfo: entityInfo;
  testingDatasetInfoArray: entityInfo[];
  testingResultsArray: TestingResult[];
}

export class TestingStore {
  chosenModelName = '';
  currentTestingResults: TestingResult = getEmptyTestingResult();
  testingAttributeName = '';
  testingAttributeNames: string[] = [];
  testingClassAttributeName = '';
  testingCollectionName = '';
  testingDatasetInfo: entityInfo = kEmptyEntityInfo;
  testingDatasetInfoArray: entityInfo[] = [];
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
      this.setChosenModelName(json.chosenModelName ?? '');
      this.setTestingDatasetInfo(json.testingDatasetInfo ?? kEmptyEntityInfo);
      this.setTestingDatasetInfoArray(json.testingDatasetInfoArray ?? []);
      this.setTestingCollectionName(json.testingCollectionName ?? '');
      this.setTestingAttributeNames(json.testingAttributeNames ?? []);
      this.setTestingAttributeName(json.testingAttributeName ?? '');
      this.setTestingClassAttributeName(json.testingClassAttributeName ?? '');
      this.setCurrentTestingResults(json.currentTestingResults ?? getEmptyTestingResult());
      this.setTestingResultsArray(json.testingResultsArray ?? []);
    }
  }

  setChosenModelName(name: string) {
    this.chosenModelName = name;
  }

  setCurrentTestingResults(results: TestingResult) {
    this.currentTestingResults = results;
  }

  setTestingAttributeName(name: string) {
    this.testingAttributeName = name;
  }

  setTestingAttributeNames(names: string[]) {
    this.testingAttributeNames = names;
  }

  setTestingClassAttributeName(name: string) {
    this.testingClassAttributeName = name;
  }

  setTestingCollectionName(name: string) {
    this.testingCollectionName = name;
  }

  setTestingDatasetInfo(info: entityInfo) {
    this.testingDatasetInfo = info;
  }

  setTestingDatasetInfoArray(infoArray: entityInfo[]) {
    this.testingDatasetInfoArray = infoArray;
  }

  setTestingResultsArray(resultsArray: TestingResult[]) {
    this.testingResultsArray = resultsArray;
  }

  async updateCodapInfoForTestingPanel() {
    this.setTestingDatasetInfoArray(
      await getDatasetInfoWithFilter(anInfo => anInfo.id !== featureStore.featureDatasetID)
    );
    this.setTestingCollectionName('');
    this.setTestingAttributeNames([]);

    const tTestingDatasetName = this.testingDatasetInfo.name;
    if (tTestingDatasetName !== '') {
      const tCollectionNames = await getCollectionNames(tTestingDatasetName);
      this.setTestingCollectionName(tCollectionNames.length > 0 ? tCollectionNames[0] : 'cases');
      this.setTestingAttributeNames(this.testingCollectionName !== ''
        ? await getAttributeNames(tTestingDatasetName, this.testingCollectionName) : []);
    }

    guaranteeTableOrCardIsVisibleFor({
      name: tTestingDatasetName,
      title: this.testingDatasetInfo.title,
      id: -1
    });
  }

  get useTestingDataset() {
    return uiStore.selectedPanelTitle === 'Testing' &&
      testingStore.testingDatasetInfo.name !== '' &&
      testingStore.testingAttributeName !== '' &&
      !testingStore.currentTestingResults.testBeingConstructed;
  }
}

export const testingStore = new TestingStore();
