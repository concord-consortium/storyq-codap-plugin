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

  it("starts a restore from the document being restored, not from what an earlier one left", () => {
    const saved = new TrainingStore();
    saved.model.setName("model 1");
    saved.model.setBeingConstructed(true);
    saved.model.setTrainingInProgress(true);

    // The state a session is in after an earlier document's resume was refused and left pending
    const restored = new TrainingStore();
    restored.setTrainingCouldNotBeResumed(true);
    restored.setResumeIsPending(true);
    restored.fromJSON(snapshotOf(saved));

    // Carried forward, the refusal would tell a student whose run did resume to cancel it, and the
    // pending resume would divert their first Step into a catch-up on a run that is not theirs
    expect(restored.trainingCouldNotBeResumed).toBe(false);
    expect(restored.resumeIsPending).toBe(false);
    expect(restored.isRestoringRun).toBe(true);
  });

  it("records a training result under a name only once", () => {
    const store = new TrainingStore();
    const result = (name: string, accuracy: number) => ({ name, accuracy } as any);
    store.recordTrainingResult(result("model 1", 0.5));
    store.recordTrainingResult(result("model 2", 0.6));

    // What a run restored from a document saved after the completion path recorded its entry does
    store.recordTrainingResult(result("model 1", 0.7));

    expect(store.trainingResults.map(iResult => iResult.name)).toEqual(["model 1", "model 2"]);
    expect(store.getTrainingResultByName("model 1")?.accuracy).toBe(0.7);
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
