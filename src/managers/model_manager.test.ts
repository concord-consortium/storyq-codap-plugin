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
