export class LinearRegression {
  constructor(config) {
    config = config || {};
    if (!config.iterations) {
      config.iterations = 1000;
    }
    if (!config.alpha) {
      config.alpha = 0.001;
    }
    if (!config.lambda) {
      config.lambda = 0.0;
    }
    if (!config.trace) {
      config.trace = false;
    }
    this.iterations = config.iterations;
    this.alpha = config.alpha;
    this.lambda = config.lambda;
    this.trace = config.trace;
  }

  fit(data) {
    var N = data.length, X = [], Y = [];
    this.dim = data[0].length;
    for (var i = 0; i < N; ++i) {
      var row = data[i];
      var x_i = [];
      var y_i = row[row.length - 1];
      x_i.push(1.0);
      for (var j = 0; j < row.length - 1; ++j) {
        x_i.push(row[j]);
      }
      Y.push(y_i);
      X.push(x_i);
    }
    this.theta = [];
    for (var d = 0; d < this.dim; ++d) {
      this.theta.push(0.0);
    }
    for (var k = 0; k < this.iterations; ++k) {
      var Vx = this.grad(X, Y, this.theta);
      for (d = 0; d < this.dim; ++d) {
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

  grad(X, Y, theta) {
    var N = X.length;
    var Vtheta = [];
    for (var d = 0; d < this.dim; ++d) {
      var g = 0;
      for (var i = 0; i < N; ++i) {
        var x_i = X[i];
        var y_i = Y[i];
        var predicted = this.h(x_i, theta);
        g += (predicted - y_i) * x_i[d];
      }
      g = (g + this.lambda * theta[d]) / N;
      Vtheta.push(g);
    }
    return Vtheta;
  }

  h(x_i, theta) {
    var predicted = 0.0;
    for (var d = 0; d < this.dim; ++d) {
      predicted += x_i[d] * theta[d];
    }
    return predicted;
  }

  cost(X, Y, theta) {
    var N = X.length;
    var cost = 0;
    for (var i = 0; i < N; ++i) {
      var x_i = X[i];
      var predicted = this.h(x_i, theta);
      cost += (predicted - Y[i]) * (predicted - Y[i]);
    }
    for (var d = 0; d < this.dim; ++d) {
      cost += this.lambda * theta[d] * theta[d];
    }
    return cost / (2.0 * N);
  }

  transform(x) {
    if (x[0].length) { // x is a matrix
      var predicted_array = [];
      for (var i = 0; i < x.length; ++i) {
        var predicted = this.transform(x[i]);
        predicted_array.push(predicted);
      }
      return predicted_array;
    }
    // x is a row vector
    var x_i = [];
    x_i.push(1.0);
    for (var j = 0; j < x.length; ++j) {
      x_i.push(x[j]);
    }
    return this.h(x_i, this.theta);
  }
}


export var LogisticRegression = function(config) {
    config = config || {};
    if(!config.alpha){
      config.alpha = 0.001;
    }
    if(!config.iterations) {
      config.iterations = 100;
    }
    if(!config.lambda) {
      config.lambda = 0;
    }
    if (!config.trace) { config.trace = false;}
    this.lockIntercept = config.lockIntercept;
    this.alpha = config.alpha;
    this.lambda = config.lambda;
    this.iterations = config.iterations;
    this.trace = config.trace;
    this.progressCallback = config.progressCallback;
    this.feedbackCallback = config.feedbackCallback;
  }

  LogisticRegression.prototype.fit = async function(data) {
    var this_ = this;
    this.dim = data[0].length;
    var N = data.length;

    var X = [];
    var Y = [];
    var constant = this.lockIntercept ? 0 : 1;
    for(var i=0; i < N; ++i){
      var row = data[i];
      var x_i = [];
      var y_i = row[row.length-1];
      x_i.push(constant);
      for(var j=0; j < row.length-1; ++j){
        x_i.push(row[j]);
      }
      X.push(x_i);
      Y.push(y_i);
    }

    this.theta = [];
    for(var d = 0; d < this.dim; ++d){
      this.theta.push(0.0);
    }

    async function oneIteration(iIteration) {
      if( iIteration < this_.iterations) {
        var theta_delta = this_.grad(X, Y, this_.theta);
        for(var d = 0; d < this_.dim; ++d){
          this_.theta[d] = this_.theta[d] - this_.alpha * theta_delta[d];
        }
        if( this_.progressCallback)
          await this_.progressCallback(iIteration);
        if(this_.trace) {
          var tCost = this_.cost(X, Y, this_.theta);
          if( this_.feedbackCallback)
            await this_.feedbackCallback(iIteration, tCost, this_.theta.slice(1));
        }
        setTimeout(function() {
          oneIteration(iIteration + 1);
        },10);
      }
      else {
        // Note that the zeroth element of theta is the weight of the constant term. We slice that off
        this_.fitResult = {
          theta: this_.theta.slice(1),
          cost: this_.cost(X, Y, this_.theta),
          config: {
            alpha: this_.alpha,
            lambda: this_.lambda,
            iterations: this_.iterations
          }
        }
        this_.progressCallback(iIteration);
      }
    }

    oneIteration(0);

  };

  LogisticRegression.prototype.grad = function(X, Y, theta) {
    var N = X.length;
    var Vx = [];
    for(var d = 0; d < this.dim; ++d) {
      var sum = 0.0;
      for(var i = 0; i < N; ++i){
        var x_i = X[i];
        var predicted = this.h(x_i, theta);
        sum += ((predicted - Y[i]) * x_i[d] + this.lambda * theta[d]) / N;
      }
      Vx.push(sum);
    }

    return Vx;

  }

  LogisticRegression.prototype.h = function(x_i, theta) {
    var gx = 0.0;
    for(var d = 0; d < this.dim; ++d){
      gx += theta[d] * x_i[d];
    }
    return 1.0 / (1.0 + Math.exp(-gx));
  }

  LogisticRegression.prototype.transform = function(x) {
    if(x[0].length){ // x is a matrix
      var predicted_array = [];
      for(var i=0; i < x.length; ++i){
        var predicted = this.transform(x[i]);
        predicted_array.push(predicted);
      }
      return predicted_array;
    }

    var x_i = [];
    x_i.push(1.0);
    for(var j=0; j < x.length; ++j){
      x_i.push(x[j]);
    }
    return this.h(x_i, this.theta);
  }

  LogisticRegression.prototype.cost = function(X, Y, theta) {
    var N = X.length;
    var sum = 0;
    for(var i = 0; i < N; ++i){
      var y_i = Y[i];
      var x_i = X[i];
      var likelihood = this.h(x_i, theta);
      sum += - (y_i * Math.log(likelihood) + (1-y_i) * Math.log(1 - likelihood)) / N;
    }
    if( this.lambda !== 0) {
      for (var d = 0; d < this.dim; ++d) {
        sum += (this.lambda * theta[d] * theta[d]) / (2.0 * N);
      }
    }
    return sum;
  };


  export var MultiClassLogistic = function(config){
    config = config || {};
    if(!config.alpha){
      config.alpha = 0.001;
    }
    if(!config.iterations) {
      config.iterations = 100;
    }
    if(!config.lambda) {
      config.lambda = 0;
    }
    this.alpha = config.alpha;
    this.lambda = config.lambda;
    this.iterations = config.iterations;
  };

  MultiClassLogistic.prototype.fit = function(data, classes) {
    this.dim = data[0].length;
    var N = data.length;

    if(!classes){
      classes = [];
      for(var i=0; i < N; ++i){
        var found = false;
        var label = data[i][this.dim-1];
        for(var j=0; j < classes.length; ++j){
          if(label == classes[j]){
            found = true;
            break;
          }
        }
        if(!found){
          classes.push(label);
        }
      }
    }

    this.classes = classes;

    this.logistics = {};
    var result = {};
    for(var k = 0; k < this.classes.length; ++k){
      var c = this.classes[k];
      this.logistics[c] = new LogisticRegression({
        alpha: this.alpha,
        lambda: this.lambda,
        iterations: this.iterations
      });
      var data_c = [];
      for(i=0; i < N; ++i){
        var row = [];
        for(j=0; j < this.dim-1; ++j){
          row.push(data[i][j]);
        }
        row.push(data[i][this.dim-1] == c ? 1 : 0);
        data_c.push(row);
      }
      result[c] = this.logistics[c].fit(data_c);
    }
    return result;
  };

  MultiClassLogistic.prototype.transform = function(x) {
    if(x[0].length){ // x is a matrix
      var predicted_array = [];
      for(var i=0; i < x.length; ++i){
        var predicted = this.transform(x[i]);
        predicted_array.push(predicted);
      }
      return predicted_array;
    }



    var max_prob = 0.0;
    var best_c = '';
    for(var k = 0; k < this.classes.length; ++k) {
      var c = this.classes[k];
      var prob_c = this.logistics[c].transform(x);
      if(max_prob < prob_c){
        max_prob = prob_c;
        best_c = c;
      }
    }

    return best_c;
  }
