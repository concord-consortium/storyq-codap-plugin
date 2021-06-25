/**
 *
 * @param constantWeight {number}
 * @param weights {number[]}
 * @param thresholdProbability {number}
 * @constructor
 */
export var LogitPrediction = function(constantWeight, weights, thresholdProbability) {
    this.weights = weights.slice();
    this.weights.unshift( constantWeight);  // The zeroth term must be the constant's weight
    this.thresholdProbability = thresholdProbability;
  }

/**
 *
 * @param givensPlusConstant {number[]}
 * @param weights {number[]}
 * @return {number}
 */
LogitPrediction.prototype.prob = function(givensPlusConstant, weights) {
    var gx = 0.0;
    for(var d = 0; d < weights.length; ++d){
      gx += weights[d] * givensPlusConstant[d];
    }
    return 1.0 / (1.0 + Math.exp(-gx));
  }

/**
 *
 * @param given {number[]}
 * @param weights {number[]}
 * @return {number} Probability that the phrase represented by given should is positive
 */
LogitPrediction.prototype.transform = function(given, weights) {
    let x_i = given.slice();
    x_i.unshift(1);
    return this.prob(x_i, weights);
  }

/**
 *
 * @param given {number[]} A one-hot array representing the phrase whose classification is to be predicted
 * @return {{ class:boolean, probability:number}}
 */
LogitPrediction.prototype.predict = function(given) {
  let tProbability = this.transform( given, this.weights);
  return { class: tProbability > this.thresholdProbability, probability: tProbability};
}

