/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import { makeAutoObservable, toJS } from 'mobx'
import {
  entityInfo, getAttributeNames, getCaseValues, getCollectionNames, getDatasetInfoWithFilter, guaranteeAttribute,
  scrollCaseTableToRight
} from "../lib/codap-helper";
import codapInterface from "../lib/CodapInterface";
import { SQ } from "../lists/lists";
import { CaseInfo, CreateAttributeResponse } from '../types/codap-api-types';
import { featureStore } from './feature_store';
import { targetDatasetStore } from './target_dataset_store';
import { testingStore } from './testing_store';
import {
  Feature, getContainFormula, getTargetCaseFormula,  kCodapNumberPattern,  kEmptyEntityInfo, kFeatureKindColumn,
  kFeatureKindNgram, kSearchWhereEndWith, kSearchWhereStartWith, kWhatOptionList, kWhatOptionNumber,
  kWhatOptionPunctuation, kWhatOptionText, SearchDetails
} from "./store_types_and_constants";

type panelModes = 'welcome' | 'create' | 'chosen';
type classColumns = "left" | "right";
type maybeClassColumns = classColumns | undefined;

export function otherClassColumn(column: maybeClassColumns) {
  return column === "left" ? "right" : "left";
}

interface ITargetStore {
  targetPanelMode: panelModes;
  datasetInfoArray: entityInfo[];
  targetCollectionName: string;
  targetAttributeNames: string[];
  targetAttributeName: string;
  targetPredictedLabelAttributeName: string;
  targetResultsCollectionName: string;
  targetFeatureIDsAttributeName: string;
  targetCases: CaseInfo[];
  targetClassAttributeName: string;
  targetClassAttributeValues: string[];
  targetClassNames: Record<classColumns, string>;
  targetColumnFeatureNames: string[];
  targetLeftColumnKey: classColumns;
  targetChosenClassColumnKey: maybeClassColumns;
}
export interface ITargetStoreJSON extends ITargetStore {
  targetDatasetInfo: entityInfo;
}

export class TargetStore {
  targetPanelMode: panelModes = 'welcome'
  datasetInfoArray: entityInfo[] = []
  targetCollectionName: string = ''
  targetAttributeNames: string[] = []
  targetAttributeName: string = ''
  targetPredictedLabelAttributeName = ''
  targetResultsCollectionName = 'results'
  targetFeatureIDsAttributeName = 'featureIDs'
  targetCases: CaseInfo[] = []
  targetClassAttributeName: string = ''
  targetClassAttributeValues: string[] = []
  targetClassNames: Record<classColumns, string> = { left: "", right: "" }
  targetColumnFeatureNames: string[] = []
  targetLeftColumnKey: classColumns = 'left'
  targetChosenClassColumnKey: maybeClassColumns

  constructor() {
    makeAutoObservable(this, { targetLeftColumnKey: false }, { autoBind: true });
  }
  
  setTargetPanelMode(mode: panelModes) {
    this.targetPanelMode = mode;
  }

  setDatasetInfoArray(infoArray: entityInfo[]) {
    this.datasetInfoArray = infoArray;
  }

  setTargetCollectionName(name: string) {
    this.targetCollectionName = name;
  }

  setTargetAttributeNames(names: string[]) {
    this.targetAttributeNames = names;
  }

  setTargetAttributeName(name: string) {
    this.targetAttributeName = name;
  }

  setTargetPredictedLabelAttributeName(name: string) {
    this.targetPredictedLabelAttributeName = name;
  }

  setTargetResultsCollectionName(name: string) {
    this.targetResultsCollectionName = name;
  }

  setTargetFeatureIDsAttributeName(name: string) {
    this.targetFeatureIDsAttributeName = name;
  }

  setTargetCases(cases: CaseInfo[]) {
    this.targetCases = cases;
  }

  setTargetClassAttributeName(name: string) {
    this.targetClassAttributeName = name;
  }

  setTargetClassAttributeValues(values: string[]) {
    this.targetClassAttributeValues = values;
  }

  setTargetClassNames(names: Record<classColumns, string>) {
    this.targetClassNames = names;
  }

  setTargetColumnFeatureNames(names: string[]) {
    this.targetColumnFeatureNames = names;
  }

  setTargetLeftColumnKey(key: classColumns) {
    this.targetLeftColumnKey = key;
  }

  setTargetChosenClassColumnKey(key: maybeClassColumns) {
    this.targetChosenClassColumnKey = key;
  }

  asJSON() {
    return {
      targetPanelMode: toJS(this.targetPanelMode),
      targetDatasetInfo: toJS(this.targetDatasetInfo),
      targetAttributeName: toJS(this.targetAttributeName),
      targetClassAttributeName: toJS(this.targetClassAttributeName),
      targetClassAttributeValues: toJS(this.targetClassAttributeValues),
      targetClassNames: toJS(this.targetClassNames),
      targetPredictedLabelAttributeName: toJS(this.targetPredictedLabelAttributeName),
      targetColumnFeatureNames: toJS(this.targetColumnFeatureNames),
      targetChosenClassColumnKey: toJS(this.targetChosenClassColumnKey)
    }
  }

  fromJSON(json: ITargetStoreJSON) {
    this.setTargetPanelMode(json.targetPanelMode ||
      (json.targetDatasetInfo && json.targetDatasetInfo.name !== '' ? 'chosen' : 'welcome'));
    if (Array.isArray(json.targetClassNames))
      json.targetClassNames = { left: "", right: "" };
    targetDatasetStore.setTargetDatasetInfo(json.targetDatasetInfo || kEmptyEntityInfo);
    this.setTargetAttributeName(json.targetAttributeName || '');
    this.setTargetClassAttributeValues(json.targetClassAttributeValues || []);
    this.setTargetClassAttributeName(json.targetClassAttributeName || '');
    if (json.targetClassNames)
      this.setTargetClassNames(json.targetClassNames);
    this.setTargetPredictedLabelAttributeName(json.targetPredictedLabelAttributeName || '');
    this.setTargetColumnFeatureNames(json.targetColumnFeatureNames || []);
    this.setTargetChosenClassColumnKey(json.targetChosenClassColumnKey);
  }

  getTargetClassName(key: maybeClassColumns) {
    return key ? this.targetClassNames[key] : "";
  }

  get positiveClassName() {
    if (this.targetChosenClassColumnKey) return this.targetClassNames[this.targetChosenClassColumnKey];
    return "";
  }

  get negativeClassName() {
    const otherKey = otherClassColumn(this.targetChosenClassColumnKey);
    if (otherKey) return this.targetClassNames[otherKey];
    return "";
  }

  get targetDatasetInfo() {
    return targetDatasetStore.targetDatasetInfo;
  }

  async updateFromCODAP(args: { targetClassAttributeName?: string } = {}) {
    const { targetClassAttributeName } = args;

    const tDatasetInfo = await getDatasetInfoWithFilter((anInfo: entityInfo) => {
      return anInfo && anInfo.numAttributes ? anInfo.numAttributes > 1 : false
    });

    // Update the target and testing datasets if they have changed
    const datasetChanged = (info1: entityInfo, info2: entityInfo) => {
      return info1.name !== info2.name || info1.title !== info2.title || info1.numAttributes !== info2.numAttributes;
    }
    const targetDatasetInfo = tDatasetInfo.find(info => info.id === targetDatasetStore.targetDatasetInfo.id);
    if (targetDatasetInfo && datasetChanged(targetDatasetInfo, targetDatasetStore.targetDatasetInfo)) {
      targetDatasetStore.setTargetDatasetInfo(targetDatasetInfo);
    }
    const testingDatasetInfo = tDatasetInfo.find(info => info.id === testingStore.testingDatasetInfo.id);
    if (testingDatasetInfo && datasetChanged(testingDatasetInfo, testingStore.testingDatasetInfo)) {
      testingStore.setTestingDatasetInfo(testingDatasetInfo);
    }

    let tCollectionNames: string[] = [];
    let tCollectionName = '';
    let tAttrNames: string[] = [];
    let tCaseValues: CaseInfo[] = [];
    let tPositiveClassName = '';
    let tNegativeClassName = '';
    let tClassNames = { left: '', right: '' };
    let tClassAttributeValues: string[] = [];
    let tColumnFeatureNames: string[] = [];
    const tTargetDatasetName = this.targetDatasetInfo.name;
    if (tTargetDatasetName !== '') {
      tCollectionNames = await getCollectionNames(tTargetDatasetName);
      tCollectionName = tCollectionNames.length > 0 ? tCollectionNames[0] : '';
      tAttrNames = tCollectionName !== '' ? await getAttributeNames(tTargetDatasetName, tCollectionName) : [];
      tAttrNames = tAttrNames.filter(iName => iName !== this.targetFeatureIDsAttributeName);
      tCaseValues = this.targetAttributeName !== ''
        ? await getCaseValues(tTargetDatasetName, tCollectionName) : [];

      // choose class names
      const tTargetClassAttributeName = targetClassAttributeName ?? this.targetClassAttributeName;
      if (tTargetClassAttributeName !== '' && tCaseValues.length > 0) {
        tPositiveClassName = String(tCaseValues[0].values[tTargetClassAttributeName]);
        const tNegativeClassCase =
          tCaseValues.find(iCase => iCase.values[tTargetClassAttributeName] !== tPositiveClassName);
        tNegativeClassName = tNegativeClassCase ? String(tNegativeClassCase.values[tTargetClassAttributeName]) : '';
        tClassNames = { left: tPositiveClassName, right: tNegativeClassName };

        // Also make a set of the unique values of the class attribute
        const tClassAttributeValuesSet: Set<string> = new Set();
        tCaseValues.forEach(iCase => {
          tClassAttributeValuesSet.add(String(iCase.values[tTargetClassAttributeName]));
        })
        tClassAttributeValues = Array.from(tClassAttributeValuesSet);
      }
    }

    // gather column features
    if (
      tAttrNames.length > 0 && this.targetAttributeName !== '' && this.targetClassAttributeName !== ''
    ) {
      tColumnFeatureNames = tAttrNames.filter(iName => {
        return iName !== this.targetAttributeName && iName !== this.targetClassAttributeName &&
          featureStore.features.map(iFeature => iFeature.name).indexOf(iName) < 0;
      });
    }

    this.setDatasetInfoArray(tDatasetInfo);
    this.setTargetCollectionName(tCollectionName);
    this.setTargetAttributeNames(tAttrNames);
    this.setTargetCases(tCaseValues);
    this.setTargetClassNames(tClassNames);
    if (targetClassAttributeName) this.setTargetClassAttributeName(targetClassAttributeName);
    this.setTargetClassAttributeValues(tClassAttributeValues);
    this.setTargetPredictedLabelAttributeName('predicted ' + this.targetClassAttributeName);
    this.setTargetColumnFeatureNames(tColumnFeatureNames);
      
    if (tTargetDatasetName !== '' && this.targetCollectionName !== '') {
      await guaranteeAttribute({ name: this.targetFeatureIDsAttributeName, hidden: true },
        tTargetDatasetName, this.targetCollectionName);
    }
  }

  resetTargetDataForNewTarget() {
    this.targetCollectionName = '';
    this.targetAttributeNames = [];
    this.targetAttributeName = '';
    this.targetPredictedLabelAttributeName = '';
    this.targetCases = [];
    this.targetClassAttributeName = '';
    this.targetClassAttributeValues = [];
    this.targetClassNames = { left: '', right: '' };
    this.targetColumnFeatureNames = [];
    this.targetLeftColumnKey = 'left';
    this.targetChosenClassColumnKey = undefined;
  }

  async updateTargetCases(formula?: string) {
    this.targetCases = this.targetAttributeName !== ''
      ? await getCaseValues(this.targetDatasetInfo.name, this.targetCollectionName, formula)
      : [];

    return this.targetCases;
  }

  /**
   * 'search' features affect the target by adding an attribute. ngrams do not.
   * @param iNewFeature
   * @param iUpdate
   */
  // TODO Clean up this function
  async addOrUpdateFeatureToTarget(iNewFeature: Feature, iUpdate ?: boolean) {
    const this_ = this,
      tTargetAttr = `\`${this_.targetAttributeName}\``;

    if (!this.targetDatasetInfo || [kFeatureKindNgram, kFeatureKindColumn].includes(iNewFeature.info.kind))
      return;

    function freeFormFormula() {
      const option = (iNewFeature.info.details as SearchDetails).where;
      const tBegins = option === kSearchWhereStartWith ? '^' : '';
      const tEnds = option === kSearchWhereEndWith ? '$' : '';
      const text = (iNewFeature.info.details as SearchDetails).freeFormText.trim();
      // note: the multiple slash escaping is due to all the layers between this code and the CODAP formula evaluator
      const escapedText = text
        .replace(/[.*+?^${}()|[\]\\]/g, '\\\\\\\\$&') // escape regex modifiers
        .replace(/\s+/g, '\\\\\\\\s+') // allow multiple spaces between words
        .replace(/['"“”‘’]/g, (match) => { // allow both regular and smart quotes to match each other
          switch (match) {
            case '"':
            case '“':
            case '”':
              return `["“”]`;
            case "'":
            case '‘':
            case '’':
              return `['‘’]`;
            default:
              return match;
          }
        });
      // don't add word boundaries when the user input starts/ends with non-word characters, like ! or , as that would fail matching
      const wordBoundary = `\\\\\\\\b`;
      const maybeStartingWordBoundary = /^\w/.test(text) ? wordBoundary : '';
      const maybeEndingWordBoundary = /\w$/.test(text) ? wordBoundary : '';
      const wordString = `${maybeStartingWordBoundary}${escapedText}${maybeEndingWordBoundary}`;
      const tParamString = `${tTargetAttr},"${tBegins}${wordString}${tEnds}"`;
      return getContainFormula(option, tParamString);
    }

    function anyNumberFormula() {
      const option = (iNewFeature.info.details as SearchDetails).where;
      return getContainFormula(option, `${tTargetAttr}, "${kCodapNumberPattern}"`);
    }

    function punctuationFormula() {
      const tPunc = `\\\\\\\\${(iNewFeature.info.details as SearchDetails).punctuation}`;
      const option = (iNewFeature.info.details as SearchDetails).where;
      return getContainFormula(option, `${tTargetAttr}, "${tPunc}"`);
    }

    function anyListFormula() {
      const searchDetails = iNewFeature.info.details as SearchDetails;
      const kListName = searchDetails.wordList.datasetName;
      const kWords = SQ.lists[kListName];
      if (kWords) {
        const tWhere = searchDetails.where;
        const tCaret = tWhere === kSearchWhereStartWith ? '^' : '';
        const tDollar = tWhere === kSearchWhereEndWith ? '$' : '';
        const tExpression = kWords.map(word => `${tCaret}\\\\\\\\b${word}\\\\\\\\b${tDollar}`).join("|");
        return getContainFormula(tWhere, `${tTargetAttr}, "${tExpression}"`);
      } else {
        const kListAttributeName = searchDetails.wordList.firstAttributeName;
        return `wordListMatches(${tTargetAttr},"${kListName}","${kListAttributeName}")>0`;
      }
    }

    let tFormula = '';
    switch ((iNewFeature.info.details as SearchDetails).what) {
      case kWhatOptionNumber:
        tFormula = anyNumberFormula()
        break;
      case kWhatOptionList:
        tFormula = anyListFormula()
        break;
      case kWhatOptionText:
        tFormula = freeFormFormula()
        break;
      case kWhatOptionPunctuation:
        tFormula = punctuationFormula()
        break;
    }
    if (tFormula !== '') iNewFeature.formula = tFormula;
    iNewFeature.targetCaseFormula = getTargetCaseFormula((iNewFeature.info.details as SearchDetails).where);
    const targetDatasetName = this.targetDatasetInfo.name;
    if (!iUpdate) {
      const tAttributeResponse = await codapInterface.sendRequest({
        action: 'create',
        resource: `dataContext[${targetDatasetName}].collection[${this_.targetCollectionName}].attribute`,
        values: {
          name: iNewFeature.name,
          formula: tFormula
        }
      }) as CreateAttributeResponse;
      if (tAttributeResponse.success && tAttributeResponse.values && tAttributeResponse.values.attrs.length > 0) {
        iNewFeature.attrID = String(tAttributeResponse.values.attrs[0].id);
        await scrollCaseTableToRight(targetDatasetName);
      }
    } else {
      const tResource = 
        `dataContext[${targetDatasetName}].collection[${this_.targetCollectionName}].attribute[${iNewFeature.attrID}]`;
      await codapInterface.sendRequest({
        action: 'update',
        resource: tResource,
        values: {
          title: iNewFeature.name,
          name: iNewFeature.name
        }
      })
    }
    // targetCases are now out of date
  }
}

export const targetStore = new TargetStore();
