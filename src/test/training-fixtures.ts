/**
 * Shared setup for tests that drive a real training run: a deterministic corpus, the store state a
 * chosen document would have, the token map ngram extraction leaves behind, and a CODAP mock that
 * answers the requests a run makes.
 */
import codapInterface from "../lib/CodapInterface";
import { Document, oneHot } from "../lib/one_hot";
import { featureStore } from "../stores/feature_store";
import {
  ColumnDetails, Feature, getStarterFeature, kFeatureKindColumn, kFeatureKindNgram, kFeatureKindSearch,
  kFeatureTypeColumn, kFeatureTypeConstructed, kFeatureTypeUnigram, kSearchWhereContain, kWhatOptionText,
  NgramDetails, SearchDetails
} from "../stores/store_types_and_constants";
import { targetDatasetStore } from "../stores/target_dataset_store";
import { targetStore } from "../stores/target_store";
import { trainingStore } from "../stores/training_store";
import { APIRequest, CaseInfo } from "../types/codap-api-types";

export const kTargetDatasetName = "reviews";
export const kTargetCollectionName = "reviews";
export const kTargetAttributeName = "text";
export const kClassAttributeName = "sentiment";
export const kPositiveClassName = "pos";
export const kNegativeClassName = "neg";
export const kColumnFeatureName = "long";
export const kSearchFeatureName = 'contain: "good"';
export const kFirstTargetCaseID = 100;

export const kVocabulary = ["good", "bad", "sweet", "sour", "creamy", "icy", "rich", "bland", "fresh", "stale"];

/**
 * MINSTD (Lehmer), so that a corpus is reproducible across engines: every intermediate stays under
 * 2^53, which Math.random and any hashed alternative cannot promise.
 */
function minstd(iSeed: number) {
  let state = iSeed;
  return () => {
    state = (state * 48271) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

interface ICorpusOptions {
  seed: number;
  rows: number;
  wordsPerRow?: number;
  vocabulary?: string[];
  longerThan?: number;
}

/**
 * Target cases as CODAP would hand them back: a text of words drawn from the vocabulary, a class,
 * one column feature that is true for the longer texts and one search feature's column. A feature's
 * column is read only when the feature is chosen, so carrying both costs a run that uses one
 * nothing.
 */
export function buildTargetCases(options: ICorpusOptions): CaseInfo[] {
  const { seed, rows, wordsPerRow = 6, vocabulary = kVocabulary, longerThan = 28 } = options;
  const draw = minstd(seed);
  const cases: CaseInfo[] = [];
  for (let iRow = 0; iRow < rows; iRow++) {
    const words: string[] = [];
    for (let iWord = 0; iWord < wordsPerRow; iWord++) {
      words.push(vocabulary[Math.floor(draw() * vocabulary.length)]);
    }
    const text = words.join(" ");
    cases.push({
      children: [],
      id: kFirstTargetCaseID + iRow,
      values: {
        [kTargetAttributeName]: text,
        [kClassAttributeName]: draw() < 0.5 ? kPositiveClassName : kNegativeClassName,
        [kColumnFeatureName]: text.length > longerThan ? 1 : 0,
        [kSearchFeatureName]: text.includes("good") ? 1 : 0
      }
    });
  }
  return cases;
}

function makeNgramFeature(frequencyThreshold: number, ignoreStopWords: boolean): Feature {
  const feature = getStarterFeature();
  feature.name = `single words with frequency ≥ ${frequencyThreshold}`;
  feature.caseID = "600";
  feature.chosen = true;
  feature.type = kFeatureTypeUnigram;
  const details: NgramDetails = { n: "uni" };
  feature.info = { kind: kFeatureKindNgram, details, frequencyThreshold, ignoreStopWords };
  return feature;
}

function makeColumnFeature(name: string): Feature {
  const feature = getStarterFeature();
  feature.name = name;
  feature.caseID = "601";
  feature.chosen = true;
  feature.type = kFeatureTypeColumn;
  const details: ColumnDetails = { columnName: name };
  feature.info = { kind: kFeatureKindColumn, details };
  return feature;
}

/**
 * A constructed feature that is not one of the target's own columns. Exported so a test can add one
 * to a reopened document that did not have it, which is what changes the rebuilt column set.
 */
export function makeSearchFeature(name = kSearchFeatureName): Feature {
  const feature = getStarterFeature();
  feature.name = name;
  feature.caseID = "602";
  feature.chosen = true;
  feature.type = kFeatureTypeConstructed;
  const details = feature.info.details as SearchDetails;
  details.where = kSearchWhereContain;
  details.what = kWhatOptionText;
  details.freeFormText = "good";
  feature.info.kind = kFeatureKindSearch;
  return feature;
}

interface IStoreOptions {
  targetCases: CaseInfo[];
  modelName?: string;
  iterations?: number;
  stepMode?: boolean;
  frequencyThreshold?: number;
  ignoreStopWords?: boolean;
  // A constructed feature that is not one of the target's own columns, which is the only kind whose
  // token outlives being unchosen.
  withSearchFeature?: boolean;
}

/**
 * The state a document arrives in with its target chosen, one unigram feature and one column
 * feature. Returns the features so a test can unchoose or delete one.
 */
export function setUpStores(options: IStoreOptions) {
  const {
    targetCases, modelName = "baseline model", iterations = 20, stepMode = false, frequencyThreshold = 4,
    ignoreStopWords = false, withSearchFeature = false
  } = options;

  targetDatasetStore.setTargetDatasetInfo({ name: kTargetDatasetName, title: kTargetDatasetName, id: 1 });
  targetStore.setTargetCollectionName(kTargetCollectionName);
  targetStore.setTargetAttributeName(kTargetAttributeName);
  targetStore.setTargetClassAttributeName(kClassAttributeName);
  targetStore.setTargetClassNames({ left: kPositiveClassName, right: kNegativeClassName });
  targetStore.setTargetChosenClassColumnKey("left");
  targetStore.setTargetPredictedLabelAttributeName("predicted sentiment");
  targetStore.setTargetColumnFeatureNames([kColumnFeatureName]);
  targetStore.setTargetCases(targetCases);

  const ngramFeature = makeNgramFeature(frequencyThreshold, ignoreStopWords);
  const columnFeature = makeColumnFeature(kColumnFeatureName);
  const searchFeature = makeSearchFeature(kSearchFeatureName);
  const features = withSearchFeature ? [ngramFeature, columnFeature, searchFeature] : [ngramFeature, columnFeature];
  featureStore.setFeatures(features);
  featureStore.setTargetColumnFeatureNames([kColumnFeatureName]);
  featureStore.setFeatureDatasetInfo({
    datasetName: "Features",
    datasetTitle: "Features",
    collectionName: "features",
    weightsCollectionName: "weights",
    datasetID: 3
  });
  featureStore.setFeatureWeightCaseIDs({});
  featureStore.clearTokens();

  trainingStore.model.reset();
  trainingStore.trainingResults = [];
  trainingStore.resultCaseIDs = [];
  trainingStore.setTrainingCouldNotBeResumed(false);
  trainingStore.setResumeIsPending(false);
  trainingStore.setRestoringRun(false);
  trainingStore.model.setName(modelName);
  trainingStore.model.setBeingConstructed(true);
  trainingStore.model.setIterations(iterations);
  trainingStore.model.setTrainingInStepMode(stepMode);

  return { ngramFeature, columnFeature, searchFeature };
}

/**
 * The tokens ngram extraction leaves in the map before a run starts. Without this a run silently
 * fits a one-column model, because buildModel's oneHot call adds constructed-feature tokens only.
 */
export function seedTokenMapWithUnigrams(targetCases: CaseInfo[], options: { frequencyThreshold?: number } = {}) {
  const documents: Document[] = targetCases.map(iCase => ({
    example: String(iCase.values[kTargetAttributeName]),
    class: String(iCase.values[kClassAttributeName]),
    caseID: iCase.id,
    columnFeatures: {}
  }));
  oneHot({
    frequencyThreshold: options.frequencyThreshold ?? 3,
    ignoreStopWords: false,
    ignorePunctuation: true,
    includeUnigrams: true,
    positiveClass: kPositiveClassName,
    negativeClass: kNegativeClassName,
    features: [],
    newTokenMap: true
  }, documents);
}

interface ICodapMockOptions {
  // The number of cases in the features collection, which is what the update branch of
  // prepWeightsCollection reads its case IDs from.
  featureCaseCount?: number;
  // Whether the weight cases already carry a model name, which is what sends prepWeightsCollection
  // down its create branch.
  weightCasesAreNamed?: boolean;
  // The result cases a search of the results collection finds.
  resultCases?: CaseInfo[];
  // Whether the target dataset already has a results collection.
  resultsCollectionExists?: boolean;
}

/**
 * A CODAP that answers what a training run asks, recording every request in the order it arrives.
 * Case-by-index resources are recorded with their index elided, since a run issues one per feature.
 */
export function mockCodap(options: ICodapMockOptions = {}) {
  const {
    featureCaseCount = 12, weightCasesAreNamed = false, resultCases, resultsCollectionExists = false
  } = options;
  const requests: string[] = [];
  let nextCreatedID = 5000;

  function handle(request: APIRequest) {
    const { action, resource } = request;
    requests.push(`${action} ${resource.replace(/caseByIndex\[\d+]/, "caseByIndex[N]")}`);

    if (action === "create") {
      const count = Array.isArray(request.values) ? request.values.length : 1;
      return { success: true, values: Array.from({ length: count }, () => ({ id: nextCreatedID++, itemID: 0 })) };
    }
    if (action !== "get") return { success: true, values: [] };
    if (/\.collectionList$/.test(resource)) {
      const collections = [{ id: 1, name: kTargetCollectionName, title: kTargetCollectionName }];
      if (resultsCollectionExists) collections.push({ id: 2, name: "results", title: "results" });
      return { success: true, values: collections };
    }
    if (/itemSearch\[name==/.test(resource)) {
      return { success: true, values: [{ id: "1", values: { "model name": weightCasesAreNamed ? "model A" : "" } }] };
    }
    if (/\.caseCount$/.test(resource)) return { success: true, values: featureCaseCount };
    const byIndex = resource.match(/caseByIndex\[(\d+)]/);
    if (byIndex) {
      const index = Number(byIndex[1]);
      return { success: true, values: { case: { children: [], id: 700 + index, values: { name: `tok${index}` } } } };
    }
    if (/caseFormulaSearch/.test(resource)) {
      const defaultResultCases = [101, 102, 103].map(id => ({ children: [], id, values: {} }));
      return { success: true, values: resultCases ?? defaultResultCases };
    }
    return { success: true, values: [] };
  }

  jest.spyOn(codapInterface, "sendRequest").mockImplementation((request: APIRequest | APIRequest[]) => {
    return Promise.resolve(Array.isArray(request) ? request.map(handle) : handle(request));
  });

  return { requests };
}

/**
 * The document as CODAP would save it, with the functions stripped the way getPluginStore strips
 * them.
 */
export function saveDocument() {
  return JSON.parse(JSON.stringify({
    featureStore: featureStore.asJSON(),
    trainingStore: trainingStore.asJSON()
  }));
}

/**
 * Reopening drops everything a session held and never saved: the weight and result case IDs, and
 * the token map's companion id map, which fromJSON never touches.
 */
export function reopenDocument(snapshot: ReturnType<typeof saveDocument>) {
  featureStore.fromJSON(snapshot.featureStore);
  featureStore.setFeatureWeightCaseIDs({});
  featureStore.setCaseIdTokenMap({});
  trainingStore.fromJSON(snapshot.trainingStore);
  trainingStore.resultCaseIDs = [];
}

interface IReopenedDocumentOptions {
  // The tokens the saved run recorded, one weight case each.
  tokens: string[];
  targetCaseIDs: number[];
  // Tokens whose weight case the search does not find, so the set is no longer one per token.
  missingWeightTokens?: string[];
  // A token the search finds twice, which is the other way the set stops being one per token.
  duplicateWeightToken?: string;
  // Target cases the search finds no result child for, taken from the end of the list.
  targetCasesWithoutResults?: number;
}

export const kFirstFeatureCaseID = 700;
export const kFirstWeightCaseID = 800;
export const kFirstCompletedResultCaseID = 200;
export const kFirstInterruptedResultCaseID = 300;

/**
 * A CODAP holding a document that was saved during a run, with one completed model's result cases
 * already under each target case. Answers the two re-acquisition searches and accepts every write.
 */
export function mockReopenedDocument(options: IReopenedDocumentOptions) {
  const {
    tokens, targetCaseIDs, missingWeightTokens = [], duplicateWeightToken, targetCasesWithoutResults = 0
  } = options;
  const requests: APIRequest[] = [];

  const featureCases: CaseInfo[] = tokens.map((iToken, iIndex) => ({
    children: [], id: kFirstFeatureCaseID + iIndex, values: { name: iToken }
  }));
  const weightCases: CaseInfo[] = [];
  tokens.forEach((iToken, iIndex) => {
    if (missingWeightTokens.includes(iToken)) return;
    weightCases.push({
      children: [],
      id: kFirstWeightCaseID + iIndex,
      parent: kFirstFeatureCaseID + iIndex,
      values: { "model name": trainingStore.model.name, weight: "" }
    });
  });
  if (duplicateWeightToken) {
    const index = tokens.indexOf(duplicateWeightToken);
    weightCases.push({
      children: [],
      id: kFirstWeightCaseID + tokens.length,
      parent: kFirstFeatureCaseID + index,
      values: { "model name": trainingStore.model.name, weight: "" }
    });
  }
  const resultCases: CaseInfo[] = [];
  targetCaseIDs.slice(0, targetCaseIDs.length - targetCasesWithoutResults).forEach((iID, iIndex) => {
    resultCases.push({
      children: [], id: kFirstCompletedResultCaseID + iIndex, parent: iID, values: { "model name": "model A" }
    });
    resultCases.push({
      children: [], id: kFirstInterruptedResultCaseID + iIndex, parent: iID, values: { "model name": "" }
    });
  });

  jest.spyOn(codapInterface, "sendRequest").mockImplementation((request: APIRequest | APIRequest[]) => {
    const handle = (iRequest: APIRequest) => {
      requests.push(iRequest);
      const { action, resource } = iRequest;
      if (action !== "get") return { success: true, values: [] };
      if (/collection\[weights]/.test(resource)) return { success: true, values: weightCases };
      if (/collection\[features]/.test(resource)) return { success: true, values: featureCases };
      if (/collection\[results]/.test(resource)) return { success: true, values: resultCases };
      return { success: true, values: [] };
    };
    return Promise.resolve(Array.isArray(request) ? request.map(handle) : handle(request));
  });

  return { requests, weightCases, resultCases };
}
