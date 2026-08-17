import codapInterface from "../lib/CodapInterface";
import { featureStore } from "../stores/feature_store";
import { targetDatasetStore } from "../stores/target_dataset_store";
import { targetStore } from "../stores/target_store";
import { trainingStore } from "../stores/training_store";
import { APIRequest, CaseInfo } from "../types/codap-api-types";
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
