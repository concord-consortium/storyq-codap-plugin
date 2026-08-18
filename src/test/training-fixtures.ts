/**
 * Shared setup for tests that drive a real training run: a deterministic corpus, the store state a
 * chosen document would have, the token map ngram extraction leaves behind, and a CODAP mock that
 * answers the requests a run makes.
 */
import codapInterface from "../lib/CodapInterface";
import { AIModel } from "../models/ai-model";
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

const kTargetDatasetName = "reviews";
const kTargetCollectionName = "reviews";
export const kTargetAttributeName = "text";
export const kClassAttributeName = "sentiment";
const kPositiveClassName = "pos";
const kNegativeClassName = "neg";
export const kColumnFeatureName = "long";
export const kSearchFeatureName = 'contain: "good"';
export const kFirstTargetCaseID = 100;
// The cases in the features collection that the update branch of prepWeightsCollection reads its
// case IDs from
const kFeatureCaseCount = 12;

const kVocabulary = ["good", "bad", "sweet", "sour", "creamy", "icy", "rich", "bland", "fresh", "stale"];

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

  // A fresh AIModel, so that a fit still looping from an earlier test cannot reach this one's
  // logistic model. A pending setTimeout cannot be unscheduled, and stopAnyRunInFlight is what
  // stops the old loop touching the stores.
  trainingStore.model = new AIModel();
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

/**
 * The action and resource of each request, with case-by-index resources elided to one shape, which
 * is how the baseline records the traffic a run generates.
 */
export function requestShapes(requests: APIRequest[]) {
  return requests.map(iRequest =>
    `${iRequest.action} ${iRequest.resource.replace(/caseByIndex\[\d+]/, "caseByIndex[N]")}`);
}

/**
 * A CODAP that answers what a fresh training run asks, recording every request in the order it
 * arrives: an empty model name on the weight cases, so prepWeightsCollection updates rather than
 * creates, and a target dataset with no results collection yet, so prepResultsCollection creates one.
 */
export function mockCodap() {
  const requests: APIRequest[] = [];
  let nextCreatedID = 5000;

  function handle(request: APIRequest) {
    const { action, resource } = request;
    requests.push(request);

    if (action === "create") {
      const count = Array.isArray(request.values) ? request.values.length : 1;
      return { success: true, values: Array.from({ length: count }, () => ({ id: nextCreatedID++, itemID: 0 })) };
    }
    if (action !== "get") return { success: true, values: [] };
    if (/\.collectionList$/.test(resource)) {
      return { success: true, values: [{ id: 1, name: kTargetCollectionName, title: kTargetCollectionName }] };
    }
    // The Features dataset before any model has been trained: one item per token, each joining a
    // feature case to its single weight case, and none of them carrying a model name yet.
    if (/itemSearch\[\*]/.test(resource)) {
      return {
        success: true,
        values: Object.keys(featureStore.tokenMap).map((iName, iIndex) => ({
          id: String(iIndex), values: { name: iName, "model name": "" }
        }))
      };
    }
    if (/\.caseCount$/.test(resource)) return { success: true, values: kFeatureCaseCount };
    const byIndex = resource.match(/caseByIndex\[(\d+)]/);
    if (byIndex) {
      const index = Number(byIndex[1]);
      return { success: true, values: { case: { children: [], id: 700 + index, values: { name: `tok${index}` } } } };
    }
    if (/caseFormulaSearch/.test(resource)) {
      return { success: true, values: [101, 102, 103].map(id => ({ children: [], id, values: {} })) };
    }
    return { success: true, values: [] };
  }

  jest.spyOn(codapInterface, "sendRequest").mockImplementation((request: APIRequest | APIRequest[]) => {
    return Promise.resolve(Array.isArray(request) ? request.map(handle) : handle(request));
  });

  return { requests };
}

/**
 * Takes over the mock already installed, so that requests can be left unanswered or refused rather
 * than answered at once. A step's writes are one case per token plus one per row, seconds of them on
 * a real corpus, and the pane's buttons are live throughout; a refusal is what the iframe phone's
 * two second timeout does to a write that is too big to answer in time.
 */
export function interceptCodapRequests() {
  const mock = codapInterface.sendRequest as jest.Mock;
  const answer = mock.getMockImplementation() as (request: APIRequest | APIRequest[]) => unknown;
  const held: Array<() => void> = [];
  let toHold = 0;
  let toFail = 0;
  let failed = 0;

  mock.mockImplementation((request: APIRequest | APIRequest[]) => {
    // Answered first either way, so that a held or refused request is still recorded as sent
    const result = answer(request);
    if (toFail > 0) {
      toFail--;
      failed++;
      return Promise.reject(`handleResponse: CODAP request timed out: ${JSON.stringify(request)}`);
    }
    if (toHold <= 0) return result;
    toHold--;
    return new Promise(resolve => { held.push(() => resolve(result)); });
  });

  return {
    holdNext: (count: number) => { toHold = count; },
    failNext: (count: number) => { toFail = count; },
    heldCount: () => held.length,
    failedCount: () => failed,
    // Oldest first, so that a test holding two can answer the older one on its own
    release: (count?: number) => held.splice(0, count ?? held.length).forEach(iRelease => iRelease())
  };
}

/**
 * The two stores a resume reads back, saved the way CODAP saves them: stringified and parsed, which
 * is what strips the functions.
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
  // Target cases the search finds no result child for, taken from the end of the list.
  targetCasesWithoutResults?: number;
}

export const kFirstFeatureCaseID = 700;
export const kFirstWeightCaseID = 800;
const kFirstCompletedResultCaseID = 200;
export const kFirstInterruptedResultCaseID = 300;

/**
 * A CODAP holding a document that was saved during a run, with one completed model's result cases
 * already under each target case. Answers the two re-acquisition searches and accepts every write.
 */
export function mockReopenedDocument(options: IReopenedDocumentOptions) {
  const { tokens, targetCaseIDs, missingWeightTokens = [], targetCasesWithoutResults = 0 } = options;
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

/**
 * Nothing in the completion path is awaitable: progressBar's body is an unawaited async function
 * inside runInAction, so a resumed run finishes without anything to wait on but its end state.
 */
export function waitUntil(predicate: () => boolean, description: string, timeoutMs = 5000) {
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - startedAt > timeoutMs) return reject(new Error(`Timed out waiting until ${description}`));
      setTimeout(check, 5);
    };
    check();
  });
}

/**
 * Stops a fit that is still running, so that a test's run cannot go on writing while the next test
 * is using the same stores. The trace branch continues the loop only through stepModeCallback, so
 * this is what a halt looks like from the outside.
 */
export function stopAnyRunInFlight() {
  const logisticModel = trainingStore.model.logisticModel;
  logisticModel.progressCallback = undefined;
  logisticModel.stepModeCallback = undefined;
  logisticModel.trace = true;
}

/**
 * Halts a run the way closing the document does, after the callback for the given iteration: the
 * trace branch continues the loop only through stepModeCallback, so trace true with no such
 * callback applies the gradient step and stops without a sign.
 */
export function haltRunAfterIteration(iIteration: number) {
  const logisticModel = trainingStore.model.logisticModel;
  const progressCallback = logisticModel.progressCallback;
  logisticModel.progressCallback = (iCurrent: number) => {
    progressCallback?.(iCurrent);
    if (iCurrent >= iIteration) {
      logisticModel.trace = true;
      logisticModel.stepModeCallback = undefined;
    }
  };
}

/**
 * Halts a run inside the terminal progress callback's own tail. That callback records the final
 * iteration in its first synchronous statement and then awaits seconds of CODAP work before reset()
 * clears trainingInProgress, so a document saved anywhere in there says the run reached its last
 * iteration and says it is still running. This reproduces the earliest point in that window by
 * doing the callback's first statement and none of what follows it.
 */
export function haltRunInsideTheCompletionTail() {
  const logisticModel = trainingStore.model.logisticModel;
  const progressCallback = logisticModel.progressCallback;
  logisticModel.progressCallback = (iCurrent: number) => {
    if (iCurrent < trainingStore.model.iterations) return progressCallback?.(iCurrent);
    trainingStore.model.setIteration(iCurrent);
    logisticModel.progressCallback = undefined;
  };
}
