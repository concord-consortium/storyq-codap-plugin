type ProgressCallback = (iIteration: number) => void;
type StepModeCallback =
  (iIteration: number, iCost: number, iTheta: number[], iNext: (iIteration: number) => Promise<void>) => void;
interface IRegressionConfig {
  accuracy?: number;
  iterations: number;
  alpha: number;
  kappa?: number;
  lambda: number;
  threshold?: number;
  trace?: boolean;
  lockIntercept?: boolean;
  progressCallback?: ProgressCallback;
  stepModeCallback?: StepModeCallback;
}

const kDefaultAlpha = 0.001;
const kDefaultIterations = 100;
const kDefaultLambda = 0.0;

interface IFitResultConfig {
  alpha: number;
  lambda: number;
  iterations: number;
}
interface IFitResult {
  theta: number[];
  cost: number;
  constantWeightTerm: number;
  config: IFitResultConfig
}

export class LogisticRegression {
  alpha = kDefaultAlpha;
  dim = 0;
  lambda = kDefaultLambda;
  lockIntercept?: boolean;
  iterations = 20;
  fitResult: IFitResult | undefined;
  _data: any;
  _oneHot: any;
  _documents: any;
  accuracy = 0;
  kappa = 0;
  threshold = 0;
  theta: number[] = [];
  trace = false;
  progressCallback?: ProgressCallback;
  stepModeCallback?: StepModeCallback;

  constructor(config: IRegressionConfig) {
    this.reset()
    this.setup(config)
  }

  setup(config: IRegressionConfig) {
    const {
      alpha = kDefaultAlpha, iterations = kDefaultIterations, lambda = kDefaultLambda, trace = false
    } = config || {};
    this.lockIntercept = config.lockIntercept;
    this.alpha = alpha;
    this.lambda = lambda;
    this.iterations = iterations;
    this.trace = trace;
    this.progressCallback = config.progressCallback;
    this.stepModeCallback = config.stepModeCallback;
  }

  reset() {
    this.iterations = 20;
    this.fitResult = undefined;
    this._data = null;
    this._oneHot = null;
    this._documents = null;
    this.accuracy = 0;
    this.kappa = 0;
    this.threshold = 0;
    this.theta = [];
    this.trace = false;
    this.progressCallback = undefined;
    this.stepModeCallback = undefined;
  }

  /**
   * This returns nothing. The loop it starts is asynchronous, so the fit is not finished when this
   * call is, and the result lands on `this.fitResult` once the last iteration runs. Anything reading
   * a return value here gets `undefined`. (Carried over from a `// FIXME` on `MultiClassLogistic`,
   * which called `fit` as though it answered, and which was the only warning of this in the file.)
   *
   * `iStartIteration` and `iStartTheta` exist so that an interrupted run can be picked up where it
   * stopped. Omitting both is exactly today's behavior: start at iteration 0 from zeroed weights. A
   * resume calls this twice, once to replay silently up to the saved iteration and once to hand
   * control back with the real callbacks attached.
   */
  fit(data: number[][], iStartIteration = 0, iStartTheta?: number[]) {
    this.dim = data[0].length;

    const X: number[][] = [];
    const Y: number[] = [];
    const constant = this.lockIntercept ? 0 : 1;
    data.forEach(row => {
      X.push([constant, ...row]);
      Y.push(row[row.length - 1]);
    });
    // Copied rather than adopted, so the caller's array is not aliased by the loop
    this.theta = iStartTheta ? iStartTheta.slice() : new Array(this.dim).fill(0.0);

    const oneIteration = async (iIteration: number) => {
      if (iIteration < this.iterations) {
        const theta_delta = this.grad(X, Y, this.theta);
        for (let d = 0; d < this.dim; ++d) {
          this.theta[d] = this.theta[d] - this.alpha * theta_delta[d];
        }
        this.progressCallback && await this.progressCallback(iIteration);
        if (this.trace) {
          var tCost = this.cost(X, Y, this.theta);
          if (this.stepModeCallback)
            this.stepModeCallback(iIteration, tCost, this.theta.slice(1), oneIteration);
        } else {
          setTimeout(function () {
            oneIteration(iIteration + 1);
          }, 10);
        }
      } else {
        // Note that the zeroth element of theta is the weight of the constant term. We slice that off
        this.fitResult = {
          theta: this.theta.slice(1),
          cost: this.cost(X, Y, this.theta),
          constantWeightTerm: this.theta[0],
          config: {
            alpha: this.alpha,
            lambda: this.lambda,
            iterations: this.iterations
          }
        }
        this.progressCallback && await this.progressCallback(iIteration);
      }
    }

    oneIteration(iStartIteration);
  }

  grad(X: number[][], Y: number[], theta: number[]) {
    const N = X.length;
    const Vx: number[] = [];
    // h() is a dot product over every dimension and its value does not depend on d, so calling it
    // inside the column loop recomputes each row's prediction once per column, making a gradient
    // pass O(dim² · N) where the work is O(dim · N). Each sum still accumulates the same values in
    // the same order, so the weights are unchanged rather than merely close.
    const tPredictions: number[] = [];
    for (let i = 0; i < N; ++i) {
      tPredictions.push(this.h(X[i], theta));
    }
    for (let d = 0; d < this.dim; ++d) {
      let sum = 0.0;
      for (let i = 0; i < N; ++i) {
        var x_i = X[i];
        sum += ((tPredictions[i] - Y[i]) * x_i[d] + this.lambda * theta[d]) / N;
      }
      Vx.push(sum);
    }
    return Vx;
  }

  h(x_i: number[], theta: number[]) {
    let gx = 0.0;
    for (let d = 0; d < this.dim; ++d) {
      gx += theta[d] * x_i[d];
    }
    return 1.0 / (1.0 + Math.exp(-gx));
  }

  transformRow(row: number[]) {
    return this.h([1.0, ...row], this.theta);
  }

  transform(x: number[][] | number[]) {
    if (typeof x[0] === "number") return this.transformRow(x as number[]);
    
    const predicted_array: number[] = [];
    x.forEach(row => predicted_array.push(this.transformRow(row as number[])));
    return predicted_array;
  }

  cost(X: number[][], Y: number[], theta: number[]) {
    const N = X.length;
    let sum = 0;
    for (let i = 0; i < N; ++i) {
      const likelihood = this.h(X[i], theta);
      sum += -(Y[i] * Math.log(likelihood) + (1 - Y[i]) * Math.log(1 - likelihood)) / N;
    }
    if (this.lambda !== 0) {
      for (let d = 0; d < this.dim; ++d) {
        sum += (this.lambda * theta[d] * theta[d]) / (2.0 * N);
      }
    }
    return sum;
  };
}

export function getDefaultLogisticRegression() {
  return new LogisticRegression({
    alpha: 1,
    iterations: 20,
    lambda: 0.0,
    accuracy: 0,
    kappa: 0,
    lockIntercept: true,
    threshold: 0.5,
    trace: false
  });
}
