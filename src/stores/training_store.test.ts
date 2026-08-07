import { TrainingStore } from "./training_store";

describe("TrainingStore", () => {

  function snapshotOf(store: TrainingStore) {
    return JSON.parse(JSON.stringify(store.asJSON()));
  }

  it("flags a run restored from a document saved mid-training", () => {
    const saved = new TrainingStore();
    saved.model.setName("model 1");
    saved.model.setBeingConstructed(true);
    saved.model.setTrainingInProgress(true);

    const restored = new TrainingStore();
    restored.fromJSON(snapshotOf(saved));

    expect(restored.model.trainingInProgress).toBe(true);
    expect(restored.trainingWasInterrupted).toBe(true);
  });

  it("does not flag a run restored from a document saved between training runs", () => {
    const saved = new TrainingStore();
    saved.model.setName("model 1");

    const restored = new TrainingStore();
    restored.fromJSON(snapshotOf(saved));

    expect(restored.trainingWasInterrupted).toBe(false);
  });

  it("keeps trainingWasInterrupted out of the saved JSON", () => {
    const store = new TrainingStore();
    store.setTrainingWasInterrupted(true);

    expect("trainingWasInterrupted" in store.asJSON()).toBe(false);
  });
});
