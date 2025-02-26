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

// This class doesn't seem to be used anywhere in StoryQ
export class LinearRegression {
  iterations: number;
  alpha: number;
  lambda: number;
  trace: boolean;

  dim = 0;
  theta: number[] = [];

  constructor(config?: IRegressionConfig) {
    const { iterations = 1000, alpha = kDefaultAlpha, lambda = kDefaultLambda, trace = false } = config || {};
    this.iterations = iterations;
    this.alpha = alpha;
    this.lambda = lambda;
    this.trace = trace;
  }

  fit(data: number[][]) {
    const X: number[][] = [];
    const Y: number[] = [];
    this.dim = data[0].length;

    data.forEach(row => {
      X.push([1.0, ...row]);
      Y.push(row[row.length - 1]);
    });
    this.theta = new Array(this.dim).fill(0.0);

    for (let k = 0; k < this.iterations; ++k) {
      const Vx = this.grad(X, Y, this.theta);
      for (let d = 0; d < this.dim; ++d) {
        this.theta[d] = this.theta[d] - this.alpha * Vx[d];
      }
      if (this.trace) {
        console.log('cost at iteration ' + k + ': ' + this.cost(X, Y, this.theta));
      }
    }

    return {
      theta: this.theta,
      dim: this.dim,
      cost: this.cost(X, Y, this.theta),
      config: {
        alpha: this.alpha,
        lambda: this.lambda,
        iterations: this.iterations
      }
    };
  }

  grad(X: number[][], Y: number[], theta: number[]) {
    const N = X.length;
    const Vtheta: number[] = [];
    for (let d = 0; d < this.dim; ++d) {
      let g = 0;
      for (let i = 0; i < N; ++i) {
        const x_i = X[i];
        g += (this.h(x_i, theta) - Y[i]) * x_i[d];
      }
      g = (g + this.lambda * theta[d]) / N;
      Vtheta.push(g);
    }
    return Vtheta;
  }

  h(x_i: number[], theta: number[]) {
    let predicted = 0.0;
    for (let d = 0; d < this.dim; ++d) {
      predicted += x_i[d] * theta[d];
    }
    return predicted;
  }

  cost(X: number[][], Y: number[], theta: number[]) {
    const N = X.length;
    let cost = 0;
    for (let i = 0; i < N; ++i) {
      cost += (this.h(X[i], theta) - Y[i]) ** 2;
    }
    for (let d = 0; d < this.dim; ++d) {
      cost += this.lambda * theta[d] * theta[d];
    }
    return cost / (2.0 * N);
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

  fit(data: number[][]) {
    this.dim = data[0].length;

    const X: number[][] = [];
    const Y: number[] = [];
    const constant = this.lockIntercept ? 0 : 1;
    data.forEach(row => {
      X.push([constant, ...row]);
      Y.push(row[row.length - 1]);
    });
    this.theta = new Array(this.dim).fill(0.0);

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

    oneIteration(0);
  }

  grad(X: number[][], Y: number[], theta: number[]) {
    const N = X.length;
    const Vx: number[] = [];
    for (let d = 0; d < this.dim; ++d) {
      let sum = 0.0;
      for (let i = 0; i < N; ++i) {
        var x_i = X[i];
        sum += ((this.h(x_i, theta) - Y[i]) * x_i[d] + this.lambda * theta[d]) / N;
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

// This class doesn't seem to be used anywhere in StoryQ
export class MultiClassLogistic {
  alpha = kDefaultAlpha;
  classes?: number[];
  dim = 0;
  iterations = kDefaultIterations;
  lambda = kDefaultLambda;
  logistics: Record<number, LogisticRegression> = {};

  constructor(config?: IRegressionConfig) {
    const { alpha = kDefaultAlpha, iterations = kDefaultIterations, lambda = kDefaultLambda } = config || {};
    this.alpha = alpha;
    this.lambda = lambda;
    this.iterations = iterations;
  }

  fit(data: number[][], classes?: number[]) {
    this.dim = data[0].length;
    const N = data.length;
  
    if (!classes) {
      const classSet = new Set<number>(data.map(row => row[this.dim - 1]));
      classes = Array.from(classSet);
    }
  
    this.classes = classes;
  
    this.logistics = {};
    const result: Record<number, any> = {};
    this.classes.forEach(c => {
      this.logistics[c] = new LogisticRegression({
        alpha: this.alpha,
        lambda: this.lambda,
        iterations: this.iterations
      });
      const data_c = [];
      for (let i = 0; i < N; ++i) {
        const row: number[] = [];
        for (let j = 0; j < this.dim - 1; ++j) {
          row.push(data[i][j]);
        }
        row.push(data[i][this.dim - 1] === c ? 1 : 0);
        data_c.push(row);
      }
      // FIXME: LogisticRegression.fit does not return anything, so result will be full of undefineds
      result[c] = this.logistics[c].fit(data_c);
    });
    return result;
  };

  transformRow(row: number[]) {
    let max_prob = 0.0;
    let best_c = -1;
    this.classes?.forEach(c => {
      var prob_c = this.logistics[c].transformRow(row);
      if (max_prob < prob_c) {
        max_prob = prob_c;
        best_c = c;
      }
    });
  
    return best_c;
  }

  transform(x: number[][] | number[]) {
    if (typeof x[0] === "number") return this.transformRow(x as number[]);
    
    const predicted_array: number[] = [];
    x.forEach(row => predicted_array.push(this.transformRow(row as number[])));
    return predicted_array;
  }
}
