import golden from "../test/fixtures/golden-weights.json";
import { getDefaultLogisticRegression, LogisticRegression } from "./jsregression";

/**
 * The gradient as it was written before the predictions were hoisted: h() called inside the loop
 * over columns. Every equality assertion below compares against this, because the whole argument
 * for the change is that it produces the same numbers rather than numbers that are merely close.
 *
 * Those equality tests guard the arithmetic against a future change, not the presence of this one:
 * with the hoist reverted they pass trivially, since the implementation and the reference become
 * the same code. The call count is what fails if anyone puts h() back inside the column loop.
 */
class UnhoistedLogisticRegression extends LogisticRegression {
  grad(X: number[][], Y: number[], theta: number[]) {
    const N = X.length;
    const Vx: number[] = [];
    for (let d = 0; d < this.dim; ++d) {
      let sum = 0.0;
      for (let i = 0; i < N; ++i) {
        const x_i = X[i];
        sum += ((this.h(x_i, theta) - Y[i]) * x_i[d] + this.lambda * theta[d]) / N;
      }
      Vx.push(sum);
    }
    return Vx;
  }
}

/**
 * MINSTD (Lehmer), so that a corpus is reproducible across engines: every intermediate stays under
 * 2^53, which Math.random and any hashed alternative cannot promise.
 */
function minstd(iSeed: number) {
  let state = iSeed;
  return () => {
    state = (state * 48271) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function buildMatrix(iRows: number, iColumns: number, iSeed: number) {
  const draw = minstd(iSeed);
  return Array.from({ length: iRows }, () => {
    const row = Array.from({ length: iColumns }, () => draw() < 0.4 ? 1 : 0);
    row.push(draw() < 0.5 ? 1 : 0);
    return row;
  });
}

/**
 * The weights a run produces were captured before the resume work started, from the build at the
 * head of master. Giving fit a starting iteration and a starting theta, and hoisting the gradient's
 * predictions, must both leave a run that omits them producing these bit for bit.
 */
function buildGoldenData() {
  const { seed, rows, columns } = golden.dataset;
  return buildMatrix(rows, columns, seed);
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

function gradInputs(iModel: LogisticRegression, iData: number[][]) {
  iModel.dim = iData[0].length;
  const X: number[][] = [];
  const Y: number[] = [];
  iData.forEach(row => {
    X.push([0, ...row]);
    Y.push(row[row.length - 1]);
  });
  return { X, Y, theta: new Array(iModel.dim).fill(0.01) };
}

describe("LogisticRegression.fit against the pre-change golden weights", () => {
  const data = buildGoldenData();

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
  const data = buildGoldenData();

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

// A seed of this suite's own, so the gradient comparisons below are not tied to the golden dataset's
// shape and can pick row and column counts that make the quadratic cost visible.
const kGradSeed = 20260815;

describe("LogisticRegression.grad with each row's prediction computed once", () => {

  it.each([[200, 100], [120, 40], [60, 250]])(
    "returns exactly what the unhoisted gradient returns, at %i rows by %i columns",
    (rows, columns) => {
      const data = buildMatrix(rows, columns, kGradSeed);
      const hoisted = getDefaultLogisticRegression();
      const unhoisted = new UnhoistedLogisticRegression({ alpha: 1, iterations: 20, lambda: 0 });
      const inputs = gradInputs(hoisted, data);
      gradInputs(unhoisted, data);

      expect(hoisted.grad(inputs.X, inputs.Y, inputs.theta))
        .toEqual(unhoisted.grad(inputs.X, inputs.Y, inputs.theta));
    }
  );

  it("computes one prediction per row rather than one per row per column", () => {
    const data = buildMatrix(60, 30, kGradSeed);
    let hoistedCalls = 0;
    let unhoistedCalls = 0;
    const hoisted = getDefaultLogisticRegression();
    const unhoisted = new UnhoistedLogisticRegression({ alpha: 1, iterations: 20, lambda: 0 });
    const inputs = gradInputs(hoisted, data);
    gradInputs(unhoisted, data);
    jest.spyOn(hoisted, "h").mockImplementation(function (this: LogisticRegression, x, theta) {
      hoistedCalls++;
      return LogisticRegression.prototype.h.call(hoisted, x, theta);
    });
    jest.spyOn(unhoisted, "h").mockImplementation(function (x, theta) {
      unhoistedCalls++;
      return LogisticRegression.prototype.h.call(unhoisted, x, theta);
    });

    hoisted.grad(inputs.X, inputs.Y, inputs.theta);
    unhoisted.grad(inputs.X, inputs.Y, inputs.theta);

    // 60 rows, and 31 columns once the constant term is counted: linear rather than quadratic
    expect(hoistedCalls).toBe(60);
    expect(unhoistedCalls).toBe(60 * 31);
  });

  afterEach(() => jest.restoreAllMocks());
});

describe("A whole training run with each row's prediction computed once", () => {

  it.each([[true], [false]])("produces identical weights with lockIntercept %s", (lockIntercept) => {
    const data = buildMatrix(150, 60, kGradSeed);
    const hoisted = getDefaultLogisticRegression();
    hoisted.lockIntercept = lockIntercept;
    const unhoisted = new UnhoistedLogisticRegression({ alpha: 1, iterations: 20, lambda: 0, lockIntercept });
    unhoisted.iterations = 20;

    fitSynchronously(hoisted, data);
    fitSynchronously(unhoisted, data);

    expect(hoisted.theta).toEqual(unhoisted.theta);
    expect(hoisted.fitResult?.cost).toBe(unhoisted.fitResult?.cost);
    expect(hoisted.fitResult?.constantWeightTerm).toBe(unhoisted.fitResult?.constantWeightTerm);
  });
});
