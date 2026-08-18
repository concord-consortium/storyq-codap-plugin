import codapInterface from "../lib/CodapInterface";
import { Feature } from "../stores/store_types_and_constants";
import { featureStore } from "../stores/feature_store";
import { trainingStore } from "../stores/training_store";
import {
  buildTargetCases, mockCodap, seedTokenMapWithUnigrams, setUpStores, stopAnyRunInFlight, waitUntil
} from "../test/training-fixtures";
import { CaseInfo } from "../types/codap-api-types";
import { ModelManager } from "./model_manager";

/**
 * The training pane keeps one ModelManager and one AIModel for as long as the document is open, and
 * AIModel.reset() resets its logistic model in place rather than replacing it. So a continuation left
 * on the manager by a step-mode run is still there, still pointed at the live logistic model, when
 * the student trains the next model.
 */
describe("ModelManager training a model after a step-mode run in the same session", () => {
  const kIterations = 6;
  const kStepModelName = "step model";
  const kPlainModelName = "plain model";

  /**
   * A page load: fresh stores, one unigram feature and one column feature, and a corpus wide enough
   * that choosing the unigram feature is worth about a dozen columns and choosing the column feature
   * alone is worth one.
   */
  function startSession(options: { stepMode?: boolean } = {}) {
    const targetCases = buildTargetCases({ seed: 20260818, rows: 24 });
    const { ngramFeature } = setUpStores({
      targetCases, modelName: kStepModelName, iterations: kIterations, stepMode: options.stepMode
    });
    return { ngramFeature, targetCases };
  }

  /**
   * The student's first model: the column feature only, stepped once and left between steps. Its rows
   * are narrower than the plain run's below, which is what turns an inherited continuation from
   * double training into arithmetic that reads off the end of the previous run's rows.
   */
  async function stepOnce(modelManager: ModelManager, ngramFeature: Feature) {
    // Unigrams reach a run through the token map that extraction leaves behind, so unchoosing the
    // feature means clearing that map as well
    ngramFeature.chosen = false;
    featureStore.clearTokens();

    trainingStore.model.setTrainingInProgress(true);
    await modelManager.buildModel();
    await waitUntil(() => modelManager.stepModeContinueCallback != null, "the first step has finished");
  }

  /**
   * + New Model with the unigram feature chosen, then Train. The AIModel is the one the session
   * already had, because + New Model resets it rather than replacing it.
   */
  async function trainPlainModel(modelManager: ModelManager, ngramFeature: Feature, targetCases: CaseInfo[]) {
    trainingStore.model.reset();
    ngramFeature.chosen = true;
    featureStore.clearTokens();
    seedTokenMapWithUnigrams(targetCases);
    trainingStore.model.setName(kPlainModelName);
    trainingStore.model.setIterations(kIterations);
    trainingStore.model.setBeingConstructed(true);

    trainingStore.model.setTrainingInProgress(true);
    await modelManager.buildModel();
    // The Train handler makes both calls, and this is the one an inherited continuation rides in on
    modelManager.nextStep();
    // The completion path is unawaited from end to end and its last act resets the model, so a test
    // that waits only for the trained-model entry leaves that reset to land in the next test
    await waitUntil(() => trainingStore.trainingResults.length > 0 && trainingStore.model.name === "",
      "the plain run has finished");

    return trainingStore.trainingResults[0].storedModel.storedTokens
      .map(iToken => ({ name: iToken.name, weight: iToken.weight }));
  }

  /**
   * Holds the next few CODAP requests open instead of answering them, which is what a step's writes
   * are for as long as they take: one case per token plus one per row, seconds of them on a real
   * corpus, throughout which the pane's Cancel button is live.
   */
  function heldCodap() {
    const mock = codapInterface.sendRequest as jest.Mock;
    const answer = mock.getMockImplementation() as (request: any) => any;
    const held: Array<() => void> = [];
    let toHold = 0;
    mock.mockImplementation((request: any) => {
      const result = answer(request);
      if (toHold <= 0) return result;
      toHold--;
      return new Promise(resolve => { held.push(() => resolve(result)); });
    });
    return {
      holdNext: (count: number) => { toHold = count; },
      heldCount: () => held.length,
      release: () => held.splice(0).forEach(iRelease => iRelease())
    };
  }

  beforeEach(() => {
    mockCodap();
  });

  afterEach(() => {
    stopAnyRunInFlight();
    jest.restoreAllMocks();
  });

  it("finishes where a clean run finishes rather than fitting the stepped run's rows into it", async () => {
    const cleanSession = startSession();
    const cleanWeights = await trainPlainModel(new ModelManager(), cleanSession.ngramFeature, cleanSession.targetCases);

    // A second page load, this time with a step-mode model stepped once and abandoned before the
    // plain one is trained
    const { ngramFeature, targetCases } = startSession({ stepMode: true });
    const modelManager = new ModelManager();
    await stepOnce(modelManager, ngramFeature);
    const weights = await trainPlainModel(modelManager, ngramFeature, targetCases);

    // The stepped run's rows are narrower than this run's, so its continuation reads past the end of
    // them and every weight it writes is NaN, which reaches a saved document as a null
    expect(weights.filter(iToken => !Number.isFinite(iToken.weight))).toEqual([]);
    expect(weights).toEqual(cleanWeights);
  });

  it("forgets the step it had reached as well as the continuation", async () => {
    const { ngramFeature, targetCases } = startSession({ stepMode: true });
    const modelManager = new ModelManager();
    await stepOnce(modelManager, ngramFeature);
    // A second press, so that the recorded step is one the next run could visibly resume from
    modelManager.nextStep();
    await waitUntil(() => modelManager.stepModeIteration === 1, "the second step has finished");

    trainingStore.model.reset();
    ngramFeature.chosen = true;
    featureStore.clearTokens();
    seedTokenMapWithUnigrams(targetCases);
    trainingStore.model.setName(kPlainModelName);
    await modelManager.buildModel();

    expect(modelManager.stepModeContinueCallback).toBeNull();
    expect(modelManager.stepModeIteration).toBe(0);
  });

  it("drops the continuation when the stepped run is cancelled", async () => {
    const { ngramFeature } = startSession({ stepMode: true });
    const modelManager = new ModelManager();
    await stepOnce(modelManager, ngramFeature);
    const { logisticModel } = trainingStore.model;

    await modelManager.cancel();
    // Cancel leaves the pane offering to start a run, and the Train handler ends in this call
    modelManager.nextStep();

    // cancel() empties the weight vector, so a continuation that survived it shows up as a gradient
    // step applied over the emptied vector rather than as nothing at all
    expect(logisticModel.theta).toEqual([]);
    expect(modelManager.stepModeContinueCallback).toBeNull();
  });

  it("does not let a step that was still writing hand its continuation back after Cancel", async () => {
    const { ngramFeature } = startSession({ stepMode: true });
    const modelManager = new ModelManager();
    await stepOnce(modelManager, ngramFeature);
    const { logisticModel } = trainingStore.model;
    const codap = heldCodap();

    // A step whose weight write has been issued and not yet answered, which is where a run spends
    // most of a step. The labels are written after it, so holding the first holds the step.
    codap.holdNext(1);
    modelManager.nextStep();
    await waitUntil(() => codap.heldCount() === 1, "the step's weight write has been issued");

    await modelManager.cancel();
    expect(modelManager.stepModeContinueCallback).toBeNull();

    codap.release();
    // The rest of stepModeCallback is a microtask behind the writes it was awaiting, so this is what
    // it takes to see what the step does once they answer
    await new Promise(resolve => setTimeout(resolve, 10));

    // Recording the continuation now would put back exactly what Cancel took away, and nothing runs
    // between here and the next model to take it away again
    expect(modelManager.stepModeContinueCallback).toBeNull();
    expect(modelManager.stepModeIteration).toBe(0);
    modelManager.nextStep();
    expect(logisticModel.theta).toEqual([]);
  });
});
