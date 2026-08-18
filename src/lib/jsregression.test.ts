import golden from "../test/fixtures/golden-weights.json";
import { getDefaultLogisticRegression, LogisticRegression } from "./jsregression";

/**
 * The weights a run produces were captured before this branch started, from the build at the head
 * of master. Giving fit a starting iteration and a starting theta must leave a run that omits both
 * producing them bit for bit.
 */
function buildData() {
  const { seed, rows, columns } = golden.dataset;
  let state = seed;
  const draw = () => {
    state = (state * 48271) % 2147483647;
    return (state - 1) / 2147483646;
  };
  return Array.from({ length: rows }, () => {
    const row = Array.from({ length: columns }, () => draw() < 0.4 ? 1 : 0);
    row.push(draw() < 0.5 ? 1 : 0);
    return row;
  });
}

/**
 * trace true with a step callback that continues immediately is the one configuration that runs a
 * whole fit synchronously, so the assertions need no waiting.
 */
function fitSynchronously(model: LogisticRegression, data: number[][], startIteration?: number, startTheta?: number[]) {
  model.trace = true;
  model.stepModeCallback = (iIteration, iCost, iTheta, iNext) => { iNext(iIteration + 1); };
  if (startIteration === undefined) {
    model.fit(data);
  } else {
    model.fit(data, startIteration, startTheta);
  }
}

describe("LogisticRegression.fit against the pre-change golden weights", () => {
  const data = buildData();

  function modelWith(lockIntercept: boolean) {
    const model = getDefaultLogisticRegression();
    model.lockIntercept = lockIntercept;
    model.iterations = golden.configuration.iterations;
    return model;
  }

  it("produces the same weights with the intercept locked", () => {
    const model = modelWith(true);

    fitSynchronously(model, data);

    expect(model.theta).toEqual(golden.lockedIntercept.theta);
    expect(model.fitResult?.cost).toBe(golden.lockedIntercept.cost);
    expect(model.fitResult?.constantWeightTerm).toBe(golden.lockedIntercept.constantWeightTerm);
  });

  it("produces the same weights with the intercept unlocked", () => {
    const model = modelWith(false);

    fitSynchronously(model, data);

    expect(model.theta).toEqual(golden.unlockedIntercept.theta);
    expect(model.fitResult?.cost).toBe(golden.unlockedIntercept.cost);
    expect(model.fitResult?.constantWeightTerm).toBe(golden.unlockedIntercept.constantWeightTerm);
  });

  it("is unaffected by passing the new parameters their own defaults", () => {
    const model = modelWith(true);

    fitSynchronously(model, data, 0, undefined);

    expect(model.theta).toEqual(golden.lockedIntercept.theta);
  });
});

describe("LogisticRegression.fit picking a run up where it stopped", () => {
  const data = buildData();

  it("reaches the same weights in two calls as it does in one", () => {
    const uninterrupted = getDefaultLogisticRegression();
    uninterrupted.iterations = 20;
    fitSynchronously(uninterrupted, data);

    const interrupted = getDefaultLogisticRegression();
    interrupted.iterations = 8;
    fitSynchronously(interrupted, data);
    const savedTheta = interrupted.theta.slice();

    const resumed = getDefaultLogisticRegression();
    resumed.iterations = 20;
    fitSynchronously(resumed, data, 8, savedTheta);

    expect(resumed.theta).toEqual(uninterrupted.theta);
    expect(resumed.fitResult?.cost).toBe(uninterrupted.fitResult?.cost);
  });

  it("copies the starting weights rather than fitting over the caller's array", () => {
    const model = getDefaultLogisticRegression();
    model.iterations = 3;
    const startTheta = new Array(data[0].length).fill(0.0);

    fitSynchronously(model, data, 1, startTheta);

    expect(startTheta.every(iWeight => iWeight === 0)).toBe(true);
    expect(model.theta).not.toEqual(startTheta);
  });
});
