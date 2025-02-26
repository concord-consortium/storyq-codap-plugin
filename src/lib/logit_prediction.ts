export class LogitPrediction {
	weights: number[] = [];
	thresholdProbability = 0;

	constructor(constantWeight: number, weights: number[], thresholdProbability: number) {
    this.weights = weights.slice();
    this.weights.unshift(constantWeight);  // The zeroth term must be the constant's weight
    this.thresholdProbability = thresholdProbability;
	}

  prob(givensPlusConstant: number[], weights: number[]) {
    let gx = 0.0;
    for (let d = 0; d < weights.length; ++d) {
      gx += weights[d] * givensPlusConstant[d];
    }
    return 1.0 / (1.0 + Math.exp(-gx));
  }

  transform(given: number[], weights: number[]) {
    let x_i = given.slice();
    x_i.unshift(1);
    return this.prob(x_i, weights);
  }

  /**
   *
   * @param given {number[]} A one-hot array representing the phrase whose classification is to be predicted
   * @return {{ class: boolean, probability: number }}
   */
  predict(given: number[]) {
    const probability = this.transform(given, this.weights);
    return { class: probability > this.thresholdProbability, probability };
  }
}
