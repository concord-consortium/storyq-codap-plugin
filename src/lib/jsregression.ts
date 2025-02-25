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
  trace: boolean;
  lockIntercept?: boolean;
  progressCallback?: ProgressCallback;
  stepModeCallback?: StepModeCallback;
}

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

export class LinearRegression {
  iterations: number;
  alpha: number;
  lambda: number;
  trace: boolean;

  dim = 0;
  theta: number[] = [];

  constructor(config?: IRegressionConfig) {
    const { iterations = 1000, alpha = 0.001, lambda = 0.0, trace = false } = config || {};
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
  alpha = 0.001;
  dim = 0;
  lambda = 0;
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
    const { alpha = 0.001, iterations = 100, lambda = 0, trace = false } = config || {};
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

export class MultiClassLogistic {
  alpha = 0.001;
  iterations = 100;
  lambda = 0;

  constructor(config?: IRegressionConfig) {
    const { alpha, iterations, lambda } = config || {};
}

export var MultiClassLogistic = function (config) {
  config = config || {};
  if (!config.alpha) {
    config.alpha = 0.001;
  }
  if (!config.iterations) {
    config.iterations = 100;
  }
  if (!config.lambda) {
    config.lambda = 0;
  }
  this.alpha = config.alpha;
  this.lambda = config.lambda;
  this.iterations = config.iterations;
};

MultiClassLogistic.prototype.fit = function (data, classes) {
  this.dim = data[0].length;
  var N = data.length;

  if (!classes) {
    classes = [];
    for (var i = 0; i < N; ++i) {
      var found = false;
      var label = data[i][this.dim - 1];
      for (var j = 0; j < classes.length; ++j) {
        // eslint-disable-next-line
        if (label == classes[j]) {
          found = true;
          break;
        }
      }
      if (!found) {
        classes.push(label);
      }
    }
  }

  this.classes = classes;

  this.logistics = {};
  var result = {};
  for (var k = 0; k < this.classes.length; ++k) {
    var c = this.classes[k];
    this.logistics[c] = new LogisticRegression({
      alpha: this.alpha,
      lambda: this.lambda,
      iterations: this.iterations
    });
    var data_c = [];
    for (i = 0; i < N; ++i) {
      var row = [];
      for (j = 0; j < this.dim - 1; ++j) {
        row.push(data[i][j]);
      }
      // eslint-disable-next-line
      row.push(data[i][this.dim - 1] == c ? 1 : 0);
      data_c.push(row);
    }
    result[c] = this.logistics[c].fit(data_c);
  }
  return result;
};

MultiClassLogistic.prototype.transform = function (x) {
  if (x[0].length) { // x is a matrix
    var predicted_array = [];
    for (var i = 0; i < x.length; ++i) {
      var predicted = this.transform(x[i]);
      predicted_array.push(predicted);
    }
    return predicted_array;
  }


  var max_prob = 0.0;
  var best_c = '';
  for (var k = 0; k < this.classes.length; ++k) {
    var c = this.classes[k];
    var prob_c = this.logistics[c].transform(x);
    if (max_prob < prob_c) {
      max_prob = prob_c;
      best_c = c;
    }
  }

  return best_c;
}
