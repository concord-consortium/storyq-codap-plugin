/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import { makeAutoObservable, toJS } from 'mobx';
import { getAttributes } from '../lib/codap-helper';
import codapInterface from "../lib/CodapInterface";
import {
  GetCaseFormulaSearchResponse, GetCollectionListResponse, GetDataContextListResponse, GetItemSearchResponse
} from '../types/codap-api-types';
import {
  Feature, FeatureType, getStarterFeature, kAnyNumberKeyword, kFeatureKindColumn, kFeatureKindNgram, kFeatureKindSearch,
  kFeatureTypeConstructed, kFeatureTypeUnigram, kTokenTypeUnigram, kWhatOptionNumber, kWhatOptionText, NgramDetails,
  SearchDetails, Token, TokenMap, WordListSpec
} from "./store_types_and_constants";
import { targetDatasetStore } from './target_dataset_store';

interface IFeatureDatasetInfo {
  datasetName: string;
  datasetTitle: string;
  collectionName: string;
  weightsCollectionName: string;
  datasetID: number;
}
export interface IFeatureStoreJSON {
  featureDatasetID: number
  features: Feature[],
  featureUnderConstruction: Feature,
  tokenMap: TokenMap,
  targetColumnFeatureNames: string[]
}

export class FeatureStore {
  caseIdTokenMap: Record<number, Token> = {}
  features: Feature[] = []
  featureUnderConstruction: Feature = getStarterFeature();
  featureDatasetInfo = {
    datasetName: 'Features',
    datasetTitle: 'Features',
    collectionName: 'features',
    weightsCollectionName: 'weights',
    datasetID: -1
  }
  wordListSpecs: WordListSpec[] = [] // no save/restore
  targetColumnFeatureNames: string[] = []
  tokenMap: TokenMap = {}
  featureWeightCaseIDs: Record<string, number> = {}

  constructor() {
    // It would be better if caseIdTokenMap and tokenMap were observable. However, making tokenMap observable
    // causes serious problems that don't seem like they'd be easy to fix.
    makeAutoObservable(
      this, { caseIdTokenMap: false, tokenMap: false, featureWeightCaseIDs: false }, { autoBind: true }
    );
  }

  setCaseIdTokenMap(map: Record<number, Token>) {
    this.caseIdTokenMap = map;
  }

  setFeatures(features: Feature[]) {
    this.features = features;
  }

  setFeatureUnderConstruction(feature: Feature) {
    this.featureUnderConstruction = feature;
  }

  setFeatureDatasetInfo(info: IFeatureDatasetInfo) {
    this.featureDatasetInfo = info;
  }

  setWordListSpecs(specs: WordListSpec[]) {
    this.wordListSpecs = specs;
  }

  setTargetColumnFeatureNames(names: string[]) {
    this.targetColumnFeatureNames = names;
  }

  setTokenMap(map: TokenMap) {
    this.tokenMap = map;
  }

  setFeatureWeightCaseIDs(ids: Record<string, number>) {
    this.featureWeightCaseIDs = ids;
  }

  asJSON() {
    return {
      featureDatasetID: toJS(this.featureDatasetInfo.datasetID),
      features: toJS(this.features),
      featureUnderConstruction: toJS(this.featureUnderConstruction),
      tokenMap: toJS(this.tokenMap),
      targetColumnFeatureNames: toJS(this.targetColumnFeatureNames)
    }
  }

  fromJSON(json: IFeatureStoreJSON) {
    if (json) {
      this.setFeatureDatasetInfo({ ...this.featureDatasetInfo, datasetID: json.featureDatasetID || -1 });
      this.setFeatures(json.features || []);
      this.setFeatureUnderConstruction(json.featureUnderConstruction || getStarterFeature());
      this.setTokenMap(json.tokenMap || {});
      this.setTargetColumnFeatureNames(json.targetColumnFeatureNames || []);
    }
  }

  async getWordListFromDatasetName(datasetName: string) {
    const attributeName = this.wordListSpecs.find(iSpec => iSpec.datasetName === datasetName)?.firstAttributeName;
    if (!attributeName) return;

    const result = await codapInterface.sendRequest({
      action: 'get',
      resource: `dataContext[${datasetName}].itemSearch[*]`
    }) as GetItemSearchResponse;
    if (result.success && result.values) {
      return result.values.map(item => item.values[attributeName]);
    }
  }

  startConstructingFeature() {
    this.setFeatureUnderConstruction(getStarterFeature());
  }

  constructionIsDone() {
    const tFeature = this.featureUnderConstruction,
      tDetails = this.featureUnderConstruction.info.details as SearchDetails,
      tKindOK = tFeature.info.kind !== '',
      tDoneNgram = tKindOK && tFeature.info.kind === kFeatureKindNgram,
      tDoneSearch = tKindOK && tFeature.info.kind === kFeatureKindSearch &&
        tDetails.where !== '' && tDetails.what !== '' &&
        (tDetails.what !== kWhatOptionText || tDetails.freeFormText !== ''),
      tDoneColumn = tKindOK && tFeature.info.kind === kFeatureKindColumn;
    return tDoneNgram || tDoneSearch || tDoneColumn;
  }

  constructNameFor(iFeature: Feature) {
    if (iFeature.info.kind === kFeatureKindSearch) {
      const tDetails = iFeature.info.details as SearchDetails,
        tFirstPart = tDetails.where,
        tSecondPart = tDetails.freeFormText !== '' ? `"${tDetails.freeFormText.trim()}"` :
          tDetails.punctuation !== '' ? tDetails.punctuation :
          tDetails.wordList && tDetails.wordList.datasetName !== '' ? tDetails.wordList.datasetName :
          tDetails.what === kWhatOptionNumber ? kAnyNumberKeyword : '';
      return `${tFirstPart}: ${tSecondPart}`;
    } else if (iFeature.info.kind === kFeatureKindNgram) {
      const ignoringPart = iFeature.info.ignoreStopWords ? 'ignoring stopwords' : '';
      return `single words with frequency ≥ ${iFeature.info.frequencyThreshold}${ignoringPart}`;
    } else if (iFeature.info.kind === kFeatureKindColumn) {
      return iFeature.name; // already has column name stashed here
    } else {
      return '';
    }
  }

  getDescriptionFor(iFeature: Feature) {
    if (iFeature.info.kind === kFeatureKindSearch) {
      const tDetails = iFeature.info.details as SearchDetails,
        tFirstPart = `${tDetails.where} ${tDetails.what}`,
        tSecondPart = tDetails.freeFormText !== '' ? `"${tDetails.freeFormText}"` : '',
        tThirdPart = tDetails.wordList && tDetails.wordList.datasetName !== '' ?
          ` of ${tDetails.wordList.datasetName}` : '';
      return `${tFirstPart} ${tSecondPart}${tThirdPart}`
    } else if (iFeature.info.kind === kFeatureKindNgram) {
      const n = (iFeature.info.details as NgramDetails).n;
      return `${n}gram with frequency threshold of ${iFeature.info.frequencyThreshold},
      ${iFeature.info.ignoreStopWords ? '' : ' not'} ignoring stop words`;
    } else {
      return '';
    }
  }

  getFeatureByCaseId(caseId: string | number) {
    return this.features.find(feature => feature.caseID === `${caseId}`) ??
      this.features.find(feature => feature.childCaseID === `${caseId}`);
  }

  addToken(name: string, token: Token) {
    this.tokenMap[name] = token;
    if (token.featureCaseID) this.caseIdTokenMap[token.featureCaseID] = token;
  }

  deleteToken(name: string) {
    const token = this.tokenMap[name];
    if (token) {
      delete this.tokenMap[name];
      if (token.featureCaseID != null) delete this.caseIdTokenMap[token.featureCaseID];
    }
  }

  updateTokenCaseId(token: Token, id: number) {
    if (token.featureCaseID) delete this.caseIdTokenMap[token.featureCaseID];
    this.caseIdTokenMap[id] = token;
    token.featureCaseID = id;
  }

  clearTokens() {
    this.setTokenMap({});
    this.setCaseIdTokenMap({});
  }

  getTokenByCaseId(caseId: string | number) {
    const numberId = Number(caseId);
    const caseIdToken = this.caseIdTokenMap[numberId];
    if (caseIdToken) return caseIdToken;

    const token = Object.values(this.tokenMap).find(iToken => iToken.featureCaseID === numberId);
    if (token) this.caseIdTokenMap[numberId] = token;
    return token;
  }

  getFeatureOrTokenByCaseId(caseId: string | number) {
    return this.getFeatureByCaseId(caseId) ?? this.getTokenByCaseId(caseId);
  }

  getFormulaFor(iFeatureName: string) {
    const tFoundObject = this.features.find(iFeature => {
      return iFeature.name === iFeatureName && iFeature.formula !== '';
    })
    return tFoundObject ? tFoundObject.formula : '';
  }

  get chosenFeatureNames() {
    return this.chosenFeatures.map(iFeature => iFeature.name);
  }

  get chosenFeatures() {
    return this.features.filter(iFeature => iFeature.chosen);
  }

  get featureDatasetID() {
    return this.featureDatasetInfo.datasetID;
  }

  get highlightedFeatures() {
    return this.features.filter(feature => feature.highlight);
  }

  get highlights() {
    return [
      ...this.features.map(feature => feature.highlight),
      ...Object.values(this.tokenMap).map(token => token.highlight),
      ...this.features.map(feature => feature.color),
      ...Object.values(this.tokenMap).map(token => token.color)
    ];
  }

  guaranteeUniqueFeatureName(iCandidate: string) {
    const isNotUnique = (iName: string) => !!this.features.find(iFeature => iFeature.name === iName);

    let counter = 1,
      tTest = iCandidate;
    while (isNotUnique(tTest)) {
      tTest = `${iCandidate}_${counter}`;
      counter++;
    }
    return tTest;
  }

  get constructedFeatureNames() {
    return this.features.filter(iFeature => iFeature.info.kind !== kFeatureKindNgram).map(iFeature => iFeature.name);
  }

  get shouldIgnoreStopwords() {
    const tNtigramFeature = this.features.find(iFeature => iFeature.info.kind === kFeatureKindNgram);
    return tNtigramFeature ? tNtigramFeature.info.ignoreStopWords : true;
  }

  get hasNgram() {
    return Boolean(this.features.find(iFeature => iFeature.info.kind === kFeatureKindNgram));
  }

  addFeatureUnderConstruction(tFeature: Feature) {
    const typeMap: Record<string, FeatureType> = {
      [kFeatureKindNgram]: kFeatureTypeUnigram,
      [kFeatureKindColumn]: kFeatureKindColumn
    };
    tFeature.inProgress = false;
    tFeature.chosen = true;
    tFeature.highlight = true;
    tFeature.type = typeMap[tFeature.info.kind] ?? kFeatureTypeConstructed;
    tFeature.description = this.getDescriptionFor(tFeature);
    this.features.push(tFeature);
    this.startConstructingFeature();
  }

  get tokenMapAlreadyHasUnigrams() {
    return this.tokenMap && Object.values(this.tokenMap).some(iToken => iToken.type === kTokenTypeUnigram);
  }

  deleteUnigramTokens() {
    if (this.tokenMap) {
      for (const [key, token] of Object.entries(this.tokenMap)) {
        if (token.type === kTokenTypeUnigram)
          this.deleteToken(key);
      }
    }
  }

  async deleteFeature(iFeature: Feature) {
    // before deleting the feature, get the index of all features with the same name to help with deletion
    const matchingFeatureNameIndexes = this.features.map((feat, index) => feat.name === iFeature.name ? index : -1);

    const tFoundIndex = this.features.indexOf(iFeature);
    if (tFoundIndex >= 0) {
      this.features.splice(tFoundIndex, 1);
    }
    if (iFeature.type !== kFeatureTypeUnigram) {
      const { targetDatasetInfo } = targetDatasetStore;
      if (iFeature.featureItemID && iFeature.featureItemID !== "undefined") {
        await codapInterface.sendRequest({
          action: 'delete',
          resource: `dataContext[${this.featureDatasetID}].itemByID[${iFeature.featureItemID}]`
        });
      } else {
        // featureItemID is missing for saved documents so instead we search for the cases by name,
        // there may be multiple features with the same name so use the index of the feature to delete
        const featureIndexToDelete = matchingFeatureNameIndexes.indexOf(tFoundIndex);
        const tCasesSearchResult = await codapInterface.sendRequest({
          action: 'get',
          resource: `dataContext[${this.featureDatasetID}].collection[${this.featureDatasetInfo.collectionName}].caseFormulaSearch[name=='${iFeature.name}']`
        }) as GetCaseFormulaSearchResponse;
        if (tCasesSearchResult.success && tCasesSearchResult.values?.[featureIndexToDelete]) {
          const caseIDToDelete = tCasesSearchResult.values[featureIndexToDelete].id;
          await codapInterface.sendRequest({
            action: 'delete',
            resource: `dataContext[${this.featureDatasetID}].collection[${this.featureDatasetInfo.collectionName}].caseByID[${caseIDToDelete}]`
          });
        }
      }
      const tCollectionListResult = await codapInterface.sendRequest({
        action: 'get',
        resource: `dataContext[${targetDatasetInfo.id}].collectionList`
      }) as GetCollectionListResponse;
      if (tCollectionListResult.success && tCollectionListResult.values?.length) {
        const tCollectionID = tCollectionListResult.values[0].id;
        await codapInterface.sendRequest({
          action: 'delete',
          resource: `dataContext[${targetDatasetInfo.id}].collection[${tCollectionID}].attribute[${iFeature.attrID}]`
        });
      }
    }
    if (iFeature.type === kFeatureTypeUnigram) {
      this.deleteUnigramTokens();
      // Delete all the items in the Features dataset that have type equal to 'unigram'
      await codapInterface.sendRequest({
        action: 'delete',
        resource: `dataContext[${this.featureDatasetInfo.datasetName}].itemSearch[type==unigram]`
      });
    }
  }

  async toggleChosenFor(iFeature: Feature) {
    const dataContextPart = `dataContext[${this.featureDatasetID}]`;
    const resourcePrefix = `${dataContextPart}.collection[${this.featureDatasetInfo.collectionName}]`;

    const syncUnigramsInFeaturesDataset = async (iChosen: boolean) => {
      if (!iChosen) this.deleteUnigramTokens();
      // For every case in Features dataset set the 'chosen' attribute to given value
      const tCasesRequestResult = await codapInterface.sendRequest({
        action: 'get',
        resource: `${resourcePrefix}.caseFormulaSearch[type='${kFeatureTypeUnigram}']`
      }) as GetCaseFormulaSearchResponse;
      if (tCasesRequestResult.success && tCasesRequestResult.values) {
        const tUpdateRequests: { id: number, values: { chosen: boolean } }[] = tCasesRequestResult.values.map(
          (iValue: { id: number }) => ({ id: Number(iValue.id), values: { chosen: iChosen } })
        );
        await codapInterface.sendRequest({
          action: 'update',
          resource: `${resourcePrefix}.case`,
          values: tUpdateRequests
        });
      }
    }

    iFeature.chosen = !iFeature.chosen;
    if (iFeature.type === kFeatureTypeUnigram) {
      await syncUnigramsInFeaturesDataset(iFeature.chosen);
    } else {
      await codapInterface.sendRequest({
        action: 'update',
        resource: `${resourcePrefix}.caseByID[${iFeature.caseID}]`,
        values: {
          values: {
            chosen: iFeature.chosen
          }
        }
      });
    }
  }

  async updateWordListSpecs() {
    this.setWordListSpecs([]);
    const tContextListResult = await codapInterface.sendRequest({
      "action": "get",
      "resource": "dataContextList"
    }).catch((reason) => {
      console.log('unable to get datacontext list because ' + reason);
    }) as GetDataContextListResponse;
    if (tContextListResult?.success && tContextListResult.values) {
      tContextListResult.values.forEach(async (aValue) => {
        const tCollectionsResult = await codapInterface.sendRequest({
          action: 'get',
          resource: `dataContext[${aValue.id}].collectionList`
        }).catch((reason) => {
          console.log('unable to get collection list because ' + reason);
        }) as GetCollectionListResponse;
        if (tCollectionsResult.success && tCollectionsResult.values?.length) {
          const collectionId = tCollectionsResult.values[tCollectionsResult.values.length - 1].id
          const attributes = await getAttributes(aValue.id, collectionId);
          if (attributes?.length) {
            this.wordListSpecs.push({
              datasetName: aValue.title,
              firstAttributeName: attributes[0].name
            });
          }
        }
      })
    }
  }
}

export const featureStore = new FeatureStore();
