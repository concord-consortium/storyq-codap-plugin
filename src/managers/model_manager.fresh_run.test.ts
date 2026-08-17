import golden from "../../specs/STORYQ-87-resume-interrupted-training-run/golden-fresh-run.json";
import { featureStore } from "../stores/feature_store";
import { Token } from "../stores/store_types_and_constants";
import { trainingStore } from "../stores/training_store";
import {
  buildTargetCases, kFirstTargetCaseID, mockCodap, seedTokenMapWithUnigrams, setUpStores
} from "../test/training-fixtures";
import { ModelManager } from "./model_manager";

/**
 * The encoding a fresh run produces was captured before this branch started, from the build at the
 * head of master. Sharing that encoding with a resume must leave every one of these unchanged.
 */
describe("A fresh training run against the pre-change baseline", () => {
  let modelManager: ModelManager;
  let requests: string[];

  beforeEach(async () => {
    // The fit loop continues through a 10 ms timeout, so faking timers leaves it at its first
    // iteration rather than running on into the completion path while later tests are running.
    jest.useFakeTimers();
    ({ requests } = mockCodap());
    const targetCases = buildTargetCases({ seed: golden.dataset.seed, rows: golden.dataset.rows });
    setUpStores({ targetCases, modelName: golden.dataset.settings.modelName });
    seedTokenMapWithUnigrams(targetCases);

    modelManager = new ModelManager();
    await modelManager.buildModel();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("extracts the same tokens, in the same order, with the same counts", () => {
    const tokenArray = trainingStore.model.logisticModel._oneHot.tokenArray as Token[];

    expect(tokenArray.map(({ token, index, count, type }) => ({ token, index, count, type })))
      .toEqual(golden.expected.tokenArray);
  });

  it("encodes the same matrix, over documents carrying the same case IDs", () => {
    const { _data: data, _documents: documents } = trainingStore.model.logisticModel;

    // The baseline pins these only implicitly, inside the case IDs its token map records, so a run
    // that numbered its documents differently would match every headline figure and still be wrong.
    expect(documents.map((iDocument: { caseID: number }) => iDocument.caseID))
      .toEqual(Array.from({ length: golden.dataset.rows }, (_unused, iIndex) => kFirstTargetCaseID + iIndex));
    expect(data).toEqual(golden.expected.data);
  });

  it("records the row count it is fitting, and takes ignoreStopWords from the unigram feature", () => {
    expect(trainingStore.model.trainingRowCount).toBe(golden.expected.documentsCount);
    expect(trainingStore.model.ignoreStopWords).toBe(false);
  });

  it("takes the same branch through each prep step, gathering the same case IDs", () => {
    expect(featureStore.featureWeightCaseIDs).toEqual(golden.expected.featureWeightCaseIDs);
    expect(trainingStore.resultCaseIDs).toEqual(golden.expected.resultCaseIDs);
  });

  it("makes the same CODAP requests, in the same order", () => {
    expect(requests).toEqual(golden.expected.requestShape);
  });
});
