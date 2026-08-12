import { LogisticRegression } from "../lib/jsregression";
import { AIModel, IAIModel } from "./ai-model";

describe("AIModel", () => {

  it("omits logisticModel from the saved JSON", () => {
    const model = new AIModel();
    expect("logisticModel" in model.asJSON()).toBe(false);
  });

  it("keeps a usable logisticModel after a save/restore round trip", () => {
    const source = new AIModel();
    source.setName("model 1");
    source.setIterations(7);
    const json: IAIModel = source.asJSON();

    const restored = new AIModel();
    const restoredLogisticModel = restored.logisticModel;
    restored.fromJSON(json);

    expect(restored.name).toBe("model 1");
    expect(restored.iterations).toBe(7);
    // The snapshot has no logisticModel, so the restore must leave the working one alone
    expect(restored.logisticModel).toBe(restoredLogisticModel);
    expect(restored.logisticModel).toBeInstanceOf(LogisticRegression);
  });

  it("resets the logisticModel on the instance rather than replacing it", () => {
    const model = new AIModel();
    const logisticModel = model.logisticModel;
    logisticModel.trace = true;
    logisticModel.theta = [1, 2, 3];
    model.setName("model 1");

    model.reset();

    expect(model.name).toBe("");
    expect(model.logisticModel).toBe(logisticModel);
    expect(model.logisticModel.trace).toBe(false);
    expect(model.logisticModel.theta).toEqual([]);
  });

  it("does not let resetting one model disturb another", () => {
    const modelA = new AIModel();
    const modelB = new AIModel();
    modelA.reset();
    modelB.reset();

    modelB.logisticModel.theta = [1, 2, 3];
    modelB.logisticModel.trace = true;

    expect(modelA.logisticModel).not.toBe(modelB.logisticModel);
    expect(modelA.logisticModel.theta).toEqual([]);
    expect(modelA.logisticModel.trace).toBe(false);
  });
});
