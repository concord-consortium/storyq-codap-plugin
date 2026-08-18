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

    codap.failNext(1);
    modelManager.nextStep();
    await waitUntil(() => codap.failedCount() === 1, "the step's weight write has been refused");

    // The run never recorded the refused step, so this press repeats it rather than skipping it
    modelManager.nextStep();
    await waitUntil(() => modelManager.stepModeIteration === 1, "the repeated step has finished");

    expect(trainingStore.model.iteration).toBe(1);
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
