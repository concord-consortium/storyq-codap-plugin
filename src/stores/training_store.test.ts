import { TrainingStore } from "./training_store";

describe("TrainingStore", () => {

  function snapshotOf(store: TrainingStore) {
    return JSON.parse(JSON.stringify(store.asJSON()));
  }

  it("says a run restored from a document saved mid-training is being restored", () => {
    const saved = new TrainingStore();
    saved.model.setName("model 1");
    saved.model.setBeingConstructed(true);
    saved.model.setTrainingInProgress(true);

    const restored = new TrainingStore();
    restored.fromJSON(snapshotOf(saved));

    expect(restored.model.trainingInProgress).toBe(true);
    expect(restored.isRestoringRun).toBe(true);
    // Nothing has tried to resume the run yet, so nothing can say it could not be
    expect(restored.trainingCouldNotBeResumed).toBe(false);
  });

  it("says neither of a run restored from a document saved between training runs", () => {
    const saved = new TrainingStore();
    saved.model.setName("model 1");

    const restored = new TrainingStore();
    restored.setRestoringRun(true);
    restored.fromJSON(snapshotOf(saved));

    expect(restored.isRestoringRun).toBe(false);
    expect(restored.trainingCouldNotBeResumed).toBe(false);
  });

  it("keeps the session flags out of the saved JSON", () => {
    const store = new TrainingStore();
    store.setTrainingCouldNotBeResumed(true);
    store.setResumeIsPending(true);
    store.setRestoringRun(true);

    const json = store.asJSON();
    expect("trainingCouldNotBeResumed" in json).toBe(false);
    expect("resumeIsPending" in json).toBe(false);
    expect("isRestoringRun" in json).toBe(false);
  });
});
