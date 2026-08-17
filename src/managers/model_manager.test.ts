import codapInterface from "../lib/CodapInterface";
import { trainingStore } from "../stores/training_store";
import { ModelManager } from "./model_manager";

/**
 * Regression coverage for STORYQ-86: reopening a saved CODAP document must leave
 * trainingStore.model.logisticModel intact so the Training pane's buttons work.
 */
describe("ModelManager in a reopened document", () => {
  let modelManager: ModelManager;

  beforeEach(() => {
    jest.spyOn(codapInterface, "sendRequest").mockResolvedValue({ success: true, values: [] });

    // Round-trip the training store the way saving and reopening a document does, from a clean
    // slate so that nothing an earlier test left behind ends up in the snapshot
    trainingStore.model.reset();
    trainingStore.trainingResults = [];
    trainingStore.resultCaseIDs = [];
    const snapshot = JSON.parse(JSON.stringify(trainingStore.asJSON()));
    trainingStore.fromJSON(snapshot);

    modelManager = new ModelManager();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("has a usable logistic model to train with", () => {
    expect(trainingStore.model.logisticModel).toBeDefined();
  });

  it("can start a training run, configuring the logistic model rather than throwing", async () => {
    trainingStore.model.setName("model 1");
    trainingStore.model.setTrainingInProgress(true);

    // buildModel goes on to ask CODAP for the target cases, which do not exist here, so it still
    // rejects. All we check is that it gets past setting up the logistic model.
    await modelManager.buildModel().catch(() => null);

    const { logisticModel } = trainingStore.model;
    expect(logisticModel.progressCallback).toBeDefined();
    expect(logisticModel.lockIntercept).toBe(trainingStore.model.lockInterceptAtZero);
  });

  it("clears every flag a restored run left as soon as a new run starts", async () => {
    trainingStore.setTrainingCouldNotBeResumed(true);
    trainingStore.setResumeIsPending(true);
    trainingStore.setRestoringRun(true);
    trainingStore.model.setName("model 1");

    await modelManager.buildModel().catch(() => null);

    expect(trainingStore.trainingCouldNotBeResumed).toBe(false);
    expect(trainingStore.resumeIsPending).toBe(false);
    expect(trainingStore.isRestoringRun).toBe(false);
  });

  it("makes the model's name unique before starting a run, whatever the name field did", async () => {
    // The TextBox does this on blur, which covers the student who types a name and nothing else: not
    // a hand-edited document, not a second plugin instance on the same dataset. A duplicate name
    // leaves two rows in the results table that nothing downstream can tell apart.
    trainingStore.trainingResults = [{ name: "model 1" } as any];
    trainingStore.model.setName("model 1");

    await modelManager.buildModel().catch(() => null);

    expect(trainingStore.model.name).toBe("model 1_1");
  });

  it("clears every flag a restored run left when the run is cancelled", async () => {
    trainingStore.setTrainingCouldNotBeResumed(true);
    trainingStore.setResumeIsPending(true);
    trainingStore.setRestoringRun(true);

    await modelManager.cancel();

    expect(trainingStore.trainingCouldNotBeResumed).toBe(false);
    expect(trainingStore.resumeIsPending).toBe(false);
    expect(trainingStore.isRestoringRun).toBe(false);
  });

  it("can step without throwing", () => {
    trainingStore.model.setTrainingInProgress(true);
    trainingStore.model.setTrainingInStepMode(true);

    expect(() => modelManager.nextStep()).not.toThrow();
    expect(trainingStore.model.logisticModel.trace).toBe(true);
  });

  it("can cancel without throwing, leaving the model reset and usable", async () => {
    trainingStore.model.setName("model 1");
    trainingStore.model.setTrainingInProgress(true);
    trainingStore.setTrainingCouldNotBeResumed(true);
    const { logisticModel } = trainingStore.model;
    logisticModel.trace = true;
    logisticModel.theta = [1, 2, 3];

    await expect(modelManager.cancel()).resolves.toBeUndefined();

    expect(trainingStore.model.name).toBe("");
    expect(trainingStore.model.trainingInProgress).toBe(false);
    expect(trainingStore.trainingCouldNotBeResumed).toBe(false);
    expect(trainingStore.model.logisticModel).toBe(logisticModel);
    expect(logisticModel.trace).toBe(false);
    expect(logisticModel.theta).toEqual([]);
  });
});

/**
 * prepWeightsCollection asks whether the weight cases are still unnamed, and that answer decides
 * between updating the existing cases and creating a second set. The searches are batched into one
 * request, so these cover both that the verdict is unchanged and that it costs one round trip.
 */
describe("ModelManager deciding whether to update or create weight cases", () => {
  const tokens = ["good", "bad", "sweet", "sour"].map(token => ({ token } as any));

  function mockFeatureDataset(options: { namedModel?: string, missingTokens?: string[] } = {}) {
    const requests: any[] = [];
    jest.spyOn(codapInterface, "sendRequest").mockImplementation((request: any) => {
      requests.push(request);
      const answer = (iRequest: any) => {
        if (/itemSearch/.test(iRequest.resource)) {
          const token = iRequest.resource.match(/name==([^\]]+)/)[1];
          if (options.missingTokens?.includes(token)) return { success: true, values: [] };
          return { success: true, values: [{ id: "1", values: { "model name": options.namedModel ?? "" } }] };
        }
        if (/caseCount/.test(iRequest.resource)) return { success: true, values: tokens.length };
        if (/caseByIndex\[(\d+)]/.test(iRequest.resource)) {
          const index = Number(iRequest.resource.match(/caseByIndex\[(\d+)]/)[1]);
          return { success: true, values: { case: { id: 700 + index, values: { name: tokens[index].token } } } };
        }
        return { success: true, values: [] };
      };
      return Promise.resolve(Array.isArray(request) ? request.map(answer) : answer(request));
    });
    return { requests };
  }

  function searchRequests(requests: any[]) {
    return requests.filter(request =>
      (Array.isArray(request) ? request : [request]).some((iRequest: any) => /itemSearch/.test(iRequest.resource)));
  }

  afterEach(() => jest.restoreAllMocks());

  it("asks about every token in a single round trip rather than one at a time", async () => {
    const { requests } = mockFeatureDataset();

    await new ModelManager().prepWeightsCollection(tokens);

    const searches = searchRequests(requests);
    expect(searches).toHaveLength(1);
    expect(searches[0]).toHaveLength(tokens.length);
    expect(searches[0].map((iRequest: any) => iRequest.resource)).toEqual(
      tokens.map(iToken => `dataContext[Features].itemSearch[name==${iToken.token}]`)
    );
  });

  it("updates the existing weight cases when none of them carries a model name", async () => {
    const { requests } = mockFeatureDataset();

    await new ModelManager().prepWeightsCollection(tokens);

    const writes = requests.filter(request => !Array.isArray(request) && /weights].case$/.test(request.resource));
    expect(writes.map(request => request.action)).toEqual(["update"]);
  });

  it("creates a new set when a weight case already carries one", async () => {
    const { requests } = mockFeatureDataset({ namedModel: "model A" });

    await new ModelManager().prepWeightsCollection(tokens);

    const writes = requests.filter(request => !Array.isArray(request) && /weights].case$/.test(request.resource));
    expect(writes.map(request => request.action)).toEqual(["create"]);
  });

  it("creates a new set when no weight case can be found at all, as it did before", async () => {
    const { requests } = mockFeatureDataset({ missingTokens: tokens.map(iToken => iToken.token) });

    await new ModelManager().prepWeightsCollection(tokens);

    const writes = requests.filter(request => !Array.isArray(request) && /weights].case$/.test(request.resource));
    expect(writes.map(request => request.action)).toEqual(["create"]);
  });
});
