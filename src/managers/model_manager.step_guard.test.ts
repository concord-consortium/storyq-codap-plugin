import { trainingStore } from "../stores/training_store";
import {
  buildTargetCases, interceptCodapRequests, mockCodap, seedTokenMapWithUnigrams, setUpStores, stopAnyRunInFlight,
  waitUntil
} from "../test/training-fixtures";
import { ModelManager } from "./model_manager";

/**
 * A step is not over when its gradient work is: it ends when the CODAP writes that follow have been
 * answered, and only then does the run record which iteration it reached. Presses that arrive in
 * between are what these cover.
 */
describe("ModelManager stepping while a step is still writing to CODAP", () => {
  const kIterations = 8;

  async function startStepModeRun(modelManager: ModelManager) {
    const targetCases = buildTargetCases({ seed: 20260818, rows: 24 });
    setUpStores({ targetCases, modelName: "step model", iterations: kIterations, stepMode: true });
    seedTokenMapWithUnigrams(targetCases);

    trainingStore.model.setTrainingInProgress(true);
    await modelManager.buildModel();
    // buildModel's own fit takes the first step, so the run arrives here between steps
    await waitUntil(() => modelManager.stepModeContinueCallback != null, "the first step has finished");
  }

  /**
   * + New Model in the same session, taken as far as its own first step. The AIModel is the one the
   * session already had, because + New Model resets it rather than replacing it.
   */
  async function startNextStepModeRun(modelManager: ModelManager, iName: string) {
    trainingStore.model.reset();
    trainingStore.model.setName(iName);
    trainingStore.model.setTrainingInStepMode(true);
    trainingStore.model.setTrainingInProgress(true);
    await modelManager.buildModel();
    await waitUntil(() => modelManager.stepModeContinueCallback != null, `${iName}'s first step has finished`);
  }

  beforeEach(() => {
    mockCodap();
  });

  afterEach(() => {
    stopAnyRunInFlight();
    jest.restoreAllMocks();
  });

  it("ignores a Step press made while the previous step is still writing", async () => {
    const modelManager = new ModelManager();
    await startStepModeRun(modelManager);
    const { logisticModel } = trainingStore.model;
    const gradientSteps = jest.spyOn(logisticModel, "grad");
    // What the progress bar is told, which is what a student sees jump backwards
    const iterationsReported: number[] = [];
    const progressCallback = logisticModel.progressCallback as (iIteration: number) => Promise<void>;
    logisticModel.progressCallback = (iIteration: number) => {
      iterationsReported.push(iIteration);
      return progressCallback(iIteration);
    };

    const codap = interceptCodapRequests();
    codap.holdNext(1);
    modelManager.nextStep();
    await waitUntil(() => codap.heldCount() === 1, "the step's weight write has been issued");

    modelManager.nextStep();

    // The run has not recorded iteration 1 yet, so an unguarded press re-enters the loop at 1 a
    // second time: another gradient step, and the bar sent back to where it already is
    expect(gradientSteps).toHaveBeenCalledTimes(1);
    expect(iterationsReported).toEqual([1]);

    codap.release();
    await waitUntil(() => modelManager.stepModeIteration === 1, "the step has finished");
    expect(trainingStore.model.iteration).toBe(1);
    expect(gradientSteps).toHaveBeenCalledTimes(1);
  });

  it("keeps Step working after a step whose writes were refused", async () => {
    const modelManager = new ModelManager();
    await startStepModeRun(modelManager);
    const codap = interceptCodapRequests();

    // fit calls stepModeCallback without awaiting it, so a refused write rejects with nobody holding
    // the promise. nextStep hands the logistic model whatever this property holds, so catching here
    // keeps the runner from failing the test over a rejection the code leaves to the console.
    const stepModeCallback = modelManager.stepModeCallback;
    modelManager.stepModeCallback = (...iArgs: Parameters<typeof stepModeCallback>) =>
      stepModeCallback(...iArgs).catch(() => undefined);

    const { logisticModel } = trainingStore.model;
    const beforeTheRefusedStep = logisticModel.theta.slice();

    codap.failNext(1);
    modelManager.nextStep();
    await waitUntil(() => codap.failedCount() === 1, "the step's weight write has been refused");
    const afterTheRefusedStep = logisticModel.theta.slice();

    // The run recorded nothing for the refused step, so this press re-enters at the same index
    modelManager.nextStep();
    await waitUntil(() => modelManager.stepModeIteration === 1, "the repeated step has finished");

    // Step works again, which is what the finally is for
    expect(trainingStore.model.iteration).toBe(1);

    // What that press costs, pinned rather than fixed. oneIteration moves theta before anything can
    // fail and nothing puts it back, so the refused step trained the model and the press after it
    // trained the model again from where the first left off: two gradient steps under an iteration
    // count that says one. Pre-existing, unchanged by this branch, and a fix for it has to change
    // these expectations.
    expect(afterTheRefusedStep).not.toEqual(beforeTheRefusedStep);
    expect(logisticModel.theta).not.toEqual(afterTheRefusedStep);
  });

  it("does not let an abandoned run's late write release the guard a newer run is holding", async () => {
    const modelManager = new ModelManager();
    await startStepModeRun(modelManager);
    const codap = interceptCodapRequests();

    // A step of the first run, left writing, and then the run abandoned under it
    codap.holdNext(1);
    modelManager.nextStep();
    await waitUntil(() => codap.heldCount() === 1, "the abandoned run's write has been issued");
    await modelManager.cancel();

    // A second run, far enough along to have a continuation of its own, with a step of its own
    // writing when the first run's write finally answers
    await startNextStepModeRun(modelManager, "second model");
    const { logisticModel } = trainingStore.model;
    codap.holdNext(1);
    modelManager.nextStep();
    await waitUntil(() => codap.heldCount() === 2, "the second run's write has been issued");

    codap.release(1);
    await new Promise(resolve => setTimeout(resolve, 10));

    // The second run's step is still writing, so its guard has to still be up
    const gradientSteps = jest.spyOn(logisticModel, "grad");
    modelManager.nextStep();
    expect(gradientSteps).not.toHaveBeenCalled();
  });

  it("advances one iteration per press once each step's writes are answered", async () => {
    const modelManager = new ModelManager();
    await startStepModeRun(modelManager);

    for (const iExpected of [1, 2, 3]) {
      modelManager.nextStep();
      await waitUntil(() => modelManager.stepModeIteration === iExpected, `step ${iExpected} has finished`);
      expect(trainingStore.model.iteration).toBe(iExpected);
    }
  });
});
