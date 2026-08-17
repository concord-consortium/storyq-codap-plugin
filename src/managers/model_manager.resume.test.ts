import codapInterface from "../lib/CodapInterface";
import { featureStore } from "../stores/feature_store";
import { targetDatasetStore } from "../stores/target_dataset_store";
import { targetStore } from "../stores/target_store";
import { trainingStore } from "../stores/training_store";
import { Token } from "../stores/store_types_and_constants";
import {
  buildTargetCases, kColumnFeatureName, kFirstFeatureCaseID, kFirstInterruptedResultCaseID, kFirstWeightCaseID,
  haltRunAfterIteration, kSearchFeatureName, makeSearchFeature, mockCodap, mockReopenedDocument, reopenDocument,
  saveDocument, seedTokenMapWithUnigrams, setUpStores, stopAnyRunInFlight, waitUntil
} from "../test/training-fixtures";
import { APIRequest, CaseInfo, UpdateCaseValue } from "../types/codap-api-types";
import { ModelManager } from "./model_manager";

const kInterruptedModelName = "model C";
const kTokens = ["tokenA", "tokenB", "tokenC"];
const kTargetCaseIDs = [100, 101, 102, 103, 104];
// The completed model's result cases came first, so the interrupted run's are the later child of
// each target case. Its weight cases are missing from a real document, having been set aside when
// the model was inactivated, while its result cases are not.
const kCompletedResultCaseIDs = [200, 201, 202, 203, 204];
const kInterruptedResultCaseIDs = [300, 301, 302, 303, 304];
const kFeatureCaseIDs = [700, 701, 702];
const kWeightCaseIDs = [800, 801, 802];

interface IDocumentOptions {
  featureCases?: CaseInfo[];
  weightCases?: CaseInfo[];
  resultCases?: CaseInfo[];
}

function featureCase(id: number, name: string): CaseInfo {
  return { children: [], id, values: { name } };
}

function weightCase(id: number, parent: number, modelName = kInterruptedModelName): CaseInfo {
  return { children: [], id, parent, values: { "model name": modelName, weight: "" } };
}

function resultCase(id: number, parent: number, modelName: string): CaseInfo {
  return { children: [], id, parent, values: { "model name": modelName } };
}

function defaultFeatureCases() {
  return kFeatureCaseIDs.map((id, index) => featureCase(id, kTokens[index]));
}

function defaultWeightCases() {
  return kWeightCaseIDs.map((id, index) => weightCase(id, kFeatureCaseIDs[index]));
}

function defaultResultCases() {
  return kTargetCaseIDs.flatMap((parent, index) => [
    resultCase(kCompletedResultCaseIDs[index], parent, "model A"),
    resultCase(kInterruptedResultCaseIDs[index], parent, "")
  ]);
}

/**
 * A document that already holds one completed model, which is the only shape that can tell a correct
 * re-acquisition from a wrong one: with a single model there are exactly as many result cases as
 * target cases however they are chosen.
 */
function mockTwoModelDocument(options: IDocumentOptions = {}) {
  const {
    featureCases = defaultFeatureCases(), weightCases = defaultWeightCases(), resultCases = defaultResultCases()
  } = options;
  const requests: APIRequest[] = [];

  jest.spyOn(codapInterface, "sendRequest").mockImplementation((request: APIRequest | APIRequest[]) => {
    const handle = (iRequest: APIRequest) => {
      requests.push(iRequest);
      const { resource } = iRequest;
      if (/collection\[weights]/.test(resource)) return { success: true, values: weightCases };
      if (/collection\[features]/.test(resource)) return { success: true, values: featureCases };
      if (/collection\[results]/.test(resource)) return { success: true, values: resultCases };
      return { success: true, values: [] };
    };
    return Promise.resolve(Array.isArray(request) ? request.map(handle) : handle(request));
  });

  return { requests };
}

describe("ModelManager re-acquiring the case IDs a reopened document does not carry", () => {
  let modelManager: ModelManager;

  beforeEach(() => {
    targetDatasetStore.setTargetDatasetInfo({ name: "reviews", title: "reviews", id: 1 });
    targetStore.setTargetResultsCollectionName("results");
    featureStore.setFeatureDatasetInfo({
      datasetName: "Features",
      datasetTitle: "Features",
      collectionName: "features",
      weightsCollectionName: "weights",
      datasetID: 3
    });
    trainingStore.model.reset();
    modelManager = new ModelManager();
  });

  afterEach(() => jest.restoreAllMocks());

  it("finds the interrupted run's weight case for each token, through the case's parent", async () => {
    mockTwoModelDocument();

    const { ids, complete } = await modelManager.reacquireWeightCaseIDs(kInterruptedModelName, kTokens);

    expect(ids).toEqual({ tokenA: 800, tokenB: 801, tokenC: 802 });
    expect(complete).toBe(true);
  });

  it("backquotes the attribute name and escapes the student's model name", async () => {
    const { requests } = mockTwoModelDocument();

    await modelManager.reacquireWeightCaseIDs("Jie's Model A", kTokens);

    expect(requests[0].resource).toBe(
      "dataContext[Features].collection[weights].caseFormulaSearch[`model name`=='Jie\\'s Model A']"
    );
  });

  it("reports an incomplete set while keeping the weight cases it did resolve", async () => {
    mockTwoModelDocument({ weightCases: defaultWeightCases().slice(0, 2) });

    const { ids, complete } = await modelManager.reacquireWeightCaseIDs(kInterruptedModelName, kTokens);

    expect(ids).toEqual({ tokenA: 800, tokenB: 801 });
    expect(complete).toBe(false);
  });

  it("reports an incomplete set when a token has two weight cases, keeping the rest", async () => {
    mockTwoModelDocument({ weightCases: [...defaultWeightCases(), weightCase(803, kFeatureCaseIDs[0])] });

    const { ids, complete } = await modelManager.reacquireWeightCaseIDs(kInterruptedModelName, kTokens);

    expect(ids).toEqual({ tokenA: 800, tokenB: 801, tokenC: 802 });
    expect(complete).toBe(false);
  });

  it("reports an incomplete set when a weight case's parent is not a feature case", async () => {
    mockTwoModelDocument({ weightCases: [...defaultWeightCases().slice(0, 2), weightCase(802, 999)] });

    const { ids, complete } = await modelManager.reacquireWeightCaseIDs(kInterruptedModelName, kTokens);

    expect(ids).toEqual({ tokenA: 800, tokenB: 801 });
    expect(complete).toBe(false);
  });

  it("takes the newest result case under each target case, in the order the target cases came", async () => {
    mockTwoModelDocument();

    const { ids, complete } = await modelManager.reacquireResultCaseIDs(kTargetCaseIDs);

    expect(ids).toEqual(kInterruptedResultCaseIDs);
    expect(complete).toBe(true);
  });

  it("reports an incomplete set when a target case has no result of its own, keeping the rest", async () => {
    mockTwoModelDocument();

    const { ids, complete } = await modelManager.reacquireResultCaseIDs([...kTargetCaseIDs, 105]);

    expect(ids).toEqual(kInterruptedResultCaseIDs);
    expect(complete).toBe(false);
  });

  it("reports an incomplete set when the search fails", async () => {
    jest.spyOn(codapInterface, "sendRequest").mockResolvedValue({ success: false });

    expect(await modelManager.reacquireResultCaseIDs(kTargetCaseIDs)).toEqual({ ids: [], complete: false });
    expect(await modelManager.reacquireWeightCaseIDs(kInterruptedModelName, kTokens))
      .toEqual({ ids: {}, complete: false });
  });
});

/**
 * A document saved during a run, reopened. The run is validated against the current features and
 * target data before anything is replayed, and a refusal has to leave the document as it found it.
 */
describe("ModelManager validating a restored run", () => {
  const kRows = 40;
  let modelManager: ModelManager;
  let targetCases: CaseInfo[];
  let savedTokens: string[];

  // Runs a model to the point where the document is saved, then reopens the document into stores
  // that hold nothing the session held.
  async function reopenAfterARun(options: { withSearchFeature?: boolean } = {}) {
    jest.useFakeTimers();
    mockCodap();
    targetCases = buildTargetCases({ seed: 20260817, rows: kRows });
    setUpStores({ targetCases, modelName: "model C", withSearchFeature: options.withSearchFeature });
    seedTokenMapWithUnigrams(targetCases);
    await new ModelManager().buildModel();
    // Extraction stamps each token with the case it was written to, and the document keeps that
    Object.values(featureStore.tokenMap).forEach((iToken, iIndex) => {
      iToken.featureCaseID = kFirstFeatureCaseID + iIndex;
    });
    trainingStore.model.setTrainingInProgress(true);
    trainingStore.model.setIteration(4);
    const snapshot = saveDocument();
    jest.restoreAllMocks();
    jest.useRealTimers();

    setUpStores({ targetCases, modelName: "model C", withSearchFeature: options.withSearchFeature });
    reopenDocument(snapshot);
    savedTokens = Object.keys(featureStore.tokenMap);
    modelManager = new ModelManager();
    return snapshot;
  }

  function mockCurrentDocument(options: Partial<Parameters<typeof mockReopenedDocument>[0]> = {}) {
    return mockReopenedDocument({
      tokens: savedTokens,
      targetCaseIDs: targetCases.map(iCase => iCase.id),
      ...options
    });
  }

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("accepts a document this build saved, committing the rebuild for the replay", async () => {
    await reopenAfterARun();
    mockCurrentDocument();

    expect(await modelManager.prepareResume(targetCases)).toBe(true);

    expect(trainingStore.resumeIsPending).toBe(true);
    expect(trainingStore.model.logisticModel._data).toHaveLength(kRows);
    expect(trainingStore.model.trainingRowCount).toBe(kRows);
    expect(featureStore.featureWeightCaseIDs[savedTokens[0]]).toBe(kFirstWeightCaseID);
    expect(trainingStore.resultCaseIDs).toHaveLength(kRows);
  });

  it("resumes a document whose column feature has no Feature object of its own", async () => {
    await reopenAfterARun();
    // Target column features are constructed tokens with no feature behind them, so a check that
    // consulted only the chosen features would refuse every document that uses one.
    featureStore.setFeatures(featureStore.features.filter(iFeature => iFeature.name !== kColumnFeatureName));
    mockCurrentDocument();

    expect(await modelManager.prepareResume(targetCases)).toBe(true);
  });

  it("refuses a document whose saved token map is empty", async () => {
    await reopenAfterARun();
    // An empty map records no column set, so a rebuild that produces no columns either compares
    // equal to it. Without a condition of its own the resume would be approved on nothing at all.
    featureStore.clearTokens();
    featureStore.setFeatures([]);
    featureStore.setTargetColumnFeatureNames([]);
    mockReopenedDocument({ tokens: [], targetCaseIDs: targetCases.map(iCase => iCase.id) });

    expect(await modelManager.prepareResume(targetCases)).toBe(false);
    expect(trainingStore.resumeIsPending).toBe(false);
  });

  it("refuses a document with no target cases left to fit", async () => {
    await reopenAfterARun();
    // The case a run predating the row count falls into: fit reads data[0].length on its first line.
    trainingStore.model.setTrainingRowCount(undefined);
    mockReopenedDocument({ tokens: savedTokens, targetCaseIDs: [] });

    expect(await modelManager.prepareResume([])).toBe(false);
  });

  it("refuses a document whose target row count no longer matches", async () => {
    await reopenAfterARun();
    mockCurrentDocument();

    expect(await modelManager.prepareResume(targetCases.slice(0, kRows - 1))).toBe(false);
  });

  it("refuses a document whose constructed feature was unchosen while it was closed", async () => {
    await reopenAfterARun({ withSearchFeature: true });
    const searchFeature = featureStore.getFeatureByName(kSearchFeatureName);
    if (searchFeature) searchFeature.chosen = false;
    mockCurrentDocument();

    // The token set is identical here, since unchoosing a constructed feature leaves its token in
    // the map, so the column it encodes silently goes to zeros while every other check passes.
    expect(savedTokens).toContain(kSearchFeatureName);
    expect(await modelManager.prepareResume(targetCases)).toBe(false);
  });

  it("refuses a document whose weight cases cannot be resolved one per token", async () => {
    await reopenAfterARun();
    mockCurrentDocument({ missingWeightTokens: [savedTokens[1]] });

    expect(await modelManager.prepareResume(targetCases)).toBe(false);
    // Cancel is the way out of a refusal, so it has to be left the cases the search did resolve
    expect(featureStore.featureWeightCaseIDs[savedTokens[0]]).toBe(kFirstWeightCaseID);
    expect(trainingStore.resultCaseIDs).toHaveLength(kRows);
  });

  it("leaves Cancel able to clear what a refused run wrote", async () => {
    await reopenAfterARun();
    const { requests } = mockCurrentDocument({ missingWeightTokens: [savedTokens[1]] });
    await modelManager.prepareResume(targetCases);

    await modelManager.cancel();

    const updates = requests.filter(iRequest => iRequest.action === "update" && /\.case$/.test(iRequest.resource));
    const weightUpdate = updates.find(iRequest => /collection\[weights]/.test(iRequest.resource));
    const resultUpdate = updates.find(iRequest => /collection\[results]/.test(iRequest.resource));
    // Every weight case the search resolved, which is one short of the token count, and every
    // result case: refusing to clear them would leave the abandoned model's name in the table
    // beside a message telling the student that Cancel starts them over.
    const expectedWeightCaseIDs = savedTokens
      .map((_unused, iIndex) => kFirstWeightCaseID + iIndex)
      .filter((_unused, iIndex) => iIndex !== 1);
    expect((weightUpdate?.values as UpdateCaseValue[]).map(iValue => iValue.id)).toEqual(expectedWeightCaseIDs);
    expect((resultUpdate?.values as UpdateCaseValue[]).map(iValue => iValue.id))
      .toEqual(targetCases.map((_unused, iIndex) => kFirstInterruptedResultCaseID + iIndex));
  });

  it("refuses a document whose result cases cannot be paired with its target cases", async () => {
    await reopenAfterARun();
    mockCurrentDocument({ targetCasesWithoutResults: 1 });

    expect(await modelManager.prepareResume(targetCases)).toBe(false);
    expect(trainingStore.resultCaseIDs).toHaveLength(kRows - 1);
  });

  it("refuses a document whose rebuilt column set differs, and puts the token maps back", async () => {
    await reopenAfterARun();
    // A feature chosen while the document was closed adds a column the saved run never had
    featureStore.setFeatures([...featureStore.features, makeSearchFeature()]);
    trainingStore.model.setIgnoreStopWords(true);
    const expectedTokenMap = JSON.parse(JSON.stringify(featureStore.tokenMap));
    mockCurrentDocument();

    expect(await modelManager.prepareResume(targetCases)).toBe(false);

    expect(featureStore.tokenMap).toEqual(expectedTokenMap);
    Object.values(featureStore.tokenMap).forEach(iToken => {
      expect(featureStore.caseIdTokenMap[Number(iToken.featureCaseID)]).toBe(iToken);
    });
    // The document says one thing and the unigram feature another, which is the case where a
    // validation rebuild that assigned would alter the document it is about to refuse.
    expect(trainingStore.model.ignoreStopWords).toBe(true);
  });

  it("resumes on the rebuilt order when the saved map carries no usable one", async () => {
    await reopenAfterARun();
    Object.values(featureStore.tokenMap).forEach(iToken => { iToken.index = -1; });
    mockCurrentDocument();

    expect(await modelManager.prepareResume(targetCases)).toBe(true);

    // A map of equal indexes sorts into insertion order, which is not the run's ordering and must
    // not be re-imposed as though it were.
    const rebuiltOrder = trainingStore.model.logisticModel._oneHot.tokenArray
      .map((iToken: Token) => iToken.token);
    expect(rebuiltOrder).not.toEqual(savedTokens);
    expect(rebuiltOrder[0]).toBe(kColumnFeatureName);
  });
});

/**
 * The whole round trip: a run interrupted at an iteration, saved, reopened, replayed and finished.
 * It has to land where the uninterrupted run landed, with nothing duplicated on the way.
 */
describe("ModelManager replaying a restored run", () => {
  const kRows = 40;
  const kIterations = 8;
  const kSavedIteration = 4;
  const kModelName = "model C";

  function startDocument() {
    const targetCases = buildTargetCases({ seed: 20260817, rows: kRows });
    setUpStores({ targetCases, modelName: kModelName, iterations: kIterations });
    seedTokenMapWithUnigrams(targetCases);
    trainingStore.model.setTrainingInProgress(true);
    return targetCases;
  }

  // The completion path is unawaited from end to end, and its last act is to reset the model, so a
  // test that waits only for the trained-model entry leaves that reset to land in the next test.
  function hasFinished() {
    return trainingStore.trainingResults.length === 1 && trainingStore.model.name === "";
  }

  function weightsWritten(requests: APIRequest[]) {
    const writes = requests.filter(iRequest =>
      iRequest.action === "update" && /collection\[features]\.case$/.test(iRequest.resource));
    return writes[writes.length - 1]?.values as UpdateCaseValue[];
  }

  function labelsWritten(requests: APIRequest[]) {
    const writes = requests.filter(iRequest =>
      iRequest.action === "update" && /collection\[results]\.case$/.test(iRequest.resource));
    return writes[writes.length - 1]?.values as UpdateCaseValue[];
  }

  async function runToCompletion() {
    const { requests } = mockCodap();
    const targetCases = startDocument();
    await new ModelManager().buildModel();
    await waitUntil(() => hasFinished(), "the run has finished");
    return { requests, targetCases };
  }

  // Runs the same model, halts it partway the way closing the document does, then reopens it.
  async function interruptAndReopen() {
    mockCodap();
    const targetCases = startDocument();
    const interruptedManager = new ModelManager();
    await interruptedManager.buildModel();
    haltRunAfterIteration(kSavedIteration);
    await waitUntil(() => trainingStore.model.iteration === kSavedIteration, "the run has been interrupted");
    Object.values(featureStore.tokenMap).forEach((iToken, iIndex) => {
      iToken.featureCaseID = kFirstFeatureCaseID + iIndex;
    });
    const snapshot = saveDocument();
    jest.restoreAllMocks();

    setUpStores({ targetCases, modelName: kModelName, iterations: kIterations });
    reopenDocument(snapshot);
    const { requests } = mockReopenedDocument({
      tokens: Object.keys(featureStore.tokenMap),
      targetCaseIDs: targetCases.map(iCase => iCase.id)
    });
    return { requests, targetCases };
  }

  afterEach(() => {
    stopAnyRunInFlight();
    jest.restoreAllMocks();
  });

  it("finishes where an uninterrupted run finishes, having written the same values", async () => {
    const uninterrupted = await runToCompletion();
    const expectedResult = { ...trainingStore.trainingResults[0] };
    const expectedWeights = weightsWritten(uninterrupted.requests);
    const expectedLabels = labelsWritten(uninterrupted.requests);
    jest.restoreAllMocks();

    const { requests, targetCases } = await interruptAndReopen();
    const modelManager = new ModelManager();
    expect(await modelManager.prepareResume(targetCases)).toBe(true);
    const requestsBeforeTheReplay = requests.length;
    modelManager.resumeRun();
    await waitUntil(() => hasFinished(), "the resumed run has finished");

    const result = trainingStore.trainingResults[0];
    expect(result.storedModel.storedTokens.map(iToken => iToken.weight))
      .toEqual(expectedResult.storedModel.storedTokens.map(iToken => iToken.weight));
    expect(result.accuracy).toBe(expectedResult.accuracy);
    expect(result.kappa).toBe(expectedResult.kappa);
    expect(result.constantWeightTerm).toBe(expectedResult.constantWeightTerm);
    expect(weightsWritten(requests).map(iValue => iValue.values.weight))
      .toEqual(expectedWeights.map(iValue => iValue.values.weight));
    expect(labelsWritten(requests).map(iValue => iValue.values["predicted sentiment"]))
      .toEqual(expectedLabels.map(iValue => iValue.values["predicted sentiment"]));
    // The same run, not a new one with the same name
    expect(trainingStore.trainingResults).toHaveLength(1);
    expect(requests.slice(requestsBeforeTheReplay).filter(iRequest => iRequest.action === "create")).toEqual([]);
  });

  it("says nothing and writes nothing while it catches up", async () => {
    const { requests, targetCases } = await interruptAndReopen();
    const modelManager = new ModelManager();
    await modelManager.prepareResume(targetCases);
    const requestsBeforeTheReplay = requests.length;

    modelManager.resumeRun();
    const iterationsSeen = new Set<number>();
    await waitUntil(() => {
      if (trainingStore.isRestoringRun) iterationsSeen.add(trainingStore.model.iteration);
      return !trainingStore.isRestoringRun;
    }, "the run has been handed back");

    expect(iterationsSeen).toEqual(new Set([kSavedIteration]));
    expect(requests.slice(requestsBeforeTheReplay)).toEqual([]);
    expect(trainingStore.trainingResults).toHaveLength(0);
  });

  it("advances the run by one iteration when it hands back, in step mode on the student's press", async () => {
    const { targetCases } = await interruptAndReopen();
    trainingStore.model.setTrainingInStepMode(true);
    const modelManager = new ModelManager();
    await modelManager.prepareResume(targetCases);

    modelManager.nextStep();
    expect(trainingStore.isRestoringRun).toBe(true);
    await waitUntil(() => trainingStore.model.iteration > kSavedIteration, "the run has advanced a step");

    expect(trainingStore.model.iteration).toBe(kSavedIteration + 1);
    expect(trainingStore.isRestoringRun).toBe(false);
    expect(modelManager.stepModeContinueCallback).not.toBeNull();
  });

  it("leaves the training state untouched when a catch-up is itself interrupted", async () => {
    const { targetCases } = await interruptAndReopen();
    const modelManager = new ModelManager();
    await modelManager.prepareResume(targetCases);
    const savedModel = trainingStore.model.asJSON();

    modelManager.resumeRun();
    await waitUntil(() => trainingStore.model.logisticModel.theta.some(iWeight => iWeight !== 0),
      "the catch-up has applied a gradient step");
    // Abandoned partway, the way closing the document again abandons it
    stopAnyRunInFlight();

    // A silent replay never advances model.iteration, so the next open replays to the same place
    expect(trainingStore.model.asJSON()).toEqual(savedModel);
    expect(trainingStore.isRestoringRun).toBe(true);
  });

  it("refuses to start a second catch-up on top of the first", async () => {
    const { targetCases } = await interruptAndReopen();
    const modelManager = new ModelManager();
    await modelManager.prepareResume(targetCases);

    modelManager.resumeRun();
    const thetaOfTheFirstCatchUp = trainingStore.model.logisticModel.theta;
    modelManager.resumeRun();

    expect(trainingStore.model.logisticModel.theta).toBe(thetaOfTheFirstCatchUp);
  });

  it("hands the restoring state back rather than freezing the pane when the replay throws", async () => {
    const { targetCases } = await interruptAndReopen();
    const modelManager = new ModelManager();
    await modelManager.prepareResume(targetCases);
    trainingStore.model.logisticModel._data = [];

    modelManager.resumeRun();

    expect(trainingStore.isRestoringRun).toBe(false);
    expect(trainingStore.trainingCouldNotBeResumed).toBe(true);
  });
});

/**
 * Rebuilding is not idempotent: a constructed feature's count is inflated again on every rebuild, so
 * it climbs the sort. Re-imposing the saved ordering on the token array and the data alone is stable
 * only on the first open; writing it back into tokenMap is what makes every open identical.
 */
describe("ModelManager re-imposing a saved ordering across successive opens", () => {
  // Eight documents, the column feature true on four of them, so it starts at a count of 4 and
  // rebuilds to 8, past a unigram sitting at 5.
  const kTexts = [
    "good movie plot", "good movie plot", "good movie", "good film",
    "good story", "movie tale", "plot tale", "film story"
  ];
  let modelManager: ModelManager;
  let targetCases: CaseInfo[];

  function driftingCorpus(): CaseInfo[] {
    return kTexts.map((iText, iIndex) => ({
      children: [],
      id: 100 + iIndex,
      values: {
        text: iText,
        sentiment: iIndex % 2 === 0 ? "pos" : "neg",
        [kColumnFeatureName]: iIndex < 4 ? 1 : 0
      }
    }));
  }

  function encodeAsTheRunDid() {
    const encoded = modelManager.encodeTrainingData(targetCases);
    if (!encoded) throw new Error("the corpus did not encode");
    return encoded;
  }

  // One open: rebuild, re-impose the saved ordering on the array and the data, optionally write it
  // back into the map, then save the document as CODAP would.
  function openRebuildAndCommit(options: { writeTheOrderingBack: boolean }) {
    const savedOrder = Object.values(featureStore.tokenMap)
      .slice()
      .sort((a, b) => a.index - b.index)
      .map(iToken => iToken.token);
    const encoded = encodeAsTheRunDid();
    const positionOf: Record<string, number> = {};
    encoded.oneHot.tokenArray.forEach((iToken: Token, iIndex: number) => { positionOf[iToken.token] = iIndex; });
    if (options.writeTheOrderingBack) {
      savedOrder.forEach((iName, iIndex) => {
        if (featureStore.tokenMap[iName]) featureStore.tokenMap[iName].index = iIndex;
      });
    }
    const data = encoded.data.map(iRow => {
      const row = savedOrder.map(iName => iRow[positionOf[iName]]);
      row.push(iRow[iRow.length - 1]);
      return row;
    });
    featureStore.fromJSON(JSON.parse(JSON.stringify(featureStore.asJSON())));
    return { order: savedOrder, data };
  }

  function fourOpens(options: { writeTheOrderingBack: boolean }) {
    return [1, 2, 3, 4].map(() => openRebuildAndCommit(options));
  }

  let runOrder: string[];
  let runData: number[][];
  let savedDocument: ReturnType<typeof saveDocument>;

  beforeEach(() => {
    targetCases = driftingCorpus();
    setUpStores({ targetCases, modelName: "model C", frequencyThreshold: 2 });
    seedTokenMapWithUnigrams(targetCases, { frequencyThreshold: 1 });
    modelManager = new ModelManager();

    const encoded = encodeAsTheRunDid();
    runOrder = encoded.oneHot.tokenArray.map((iToken: Token) => iToken.token);
    runData = encoded.data;
    trainingStore.model.setTrainingInProgress(true);
    savedDocument = saveDocument();
  });

  it("drifts on this corpus, which is what makes the rest of these assertions worth anything", () => {
    reopenDocument(savedDocument);

    const rebuilt = encodeAsTheRunDid().oneHot.tokenArray.map((iToken: Token) => iToken.token);

    expect(rebuilt).not.toEqual(runOrder);
    expect(rebuilt[0]).toBe(kColumnFeatureName);
    expect(runOrder.indexOf(kColumnFeatureName)).toBe(2);
  });

  it("encodes identically on every open when the ordering is written back", () => {
    reopenDocument(savedDocument);

    fourOpens({ writeTheOrderingBack: true }).forEach(({ order, data }) => {
      expect(order).toEqual(runOrder);
      expect(data).toEqual(runData);
    });
  });

  it("holds for one open and then drifts when the ordering is not written back", () => {
    reopenDocument(savedDocument);

    const opens = fourOpens({ writeTheOrderingBack: false });

    expect(opens[0].order).toEqual(runOrder);
    expect(opens[0].data).toEqual(runData);
    opens.slice(1).forEach(({ order, data }) => {
      expect(order).not.toEqual(runOrder);
      expect(data).not.toEqual(runData);
    });
  });
});

/**
 * The row count is written by a fresh run and re-written by a resumed one, so that a run interrupted
 * twice is checked as fully the second time as the first.
 */
describe("ModelManager recording the row count a run is fitting", () => {

  afterEach(() => {
    stopAnyRunInFlight();
    jest.restoreAllMocks();
  });

  it("carries the count into the document a run is saved into, and re-records it on a resume", async () => {
    jest.useFakeTimers();
    mockCodap();
    const targetCases = buildTargetCases({ seed: 20260817, rows: 40 });
    setUpStores({ targetCases, modelName: "model C" });
    seedTokenMapWithUnigrams(targetCases);
    await new ModelManager().buildModel();
    trainingStore.model.setTrainingInProgress(true);
    const snapshot = saveDocument();
    jest.restoreAllMocks();
    jest.useRealTimers();

    expect(snapshot.trainingStore.model.trainingRowCount).toBe(40);

    // A document saved before the count existed comes back carrying it, so a second interruption is
    // checked against a count rather than against the token set alone.
    setUpStores({ targetCases, modelName: "model C" });
    reopenDocument(snapshot);
    trainingStore.model.setTrainingRowCount(undefined);
    Object.values(featureStore.tokenMap).forEach((iToken, iIndex) => {
      iToken.featureCaseID = kFirstFeatureCaseID + iIndex;
    });
    mockReopenedDocument({
      tokens: Object.keys(featureStore.tokenMap),
      targetCaseIDs: targetCases.map(iCase => iCase.id)
    });

    expect(await new ModelManager().prepareResume(targetCases)).toBe(true);
    expect(trainingStore.model.trainingRowCount).toBe(40);
  });
});
