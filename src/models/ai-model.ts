import { makeAutoObservable } from "mobx";
import { getDefaultLogisticRegression, LogisticRegression } from "../lib/jsregression";

/**
 * The serializable state of an AIModel. It deliberately excludes logisticModel, which is a live object
 * carrying callbacks rather than data, and so is neither saved nor restored.
 */
export interface IAIModel {
  beingConstructed: boolean
  frequencyThreshold: number
  ignoreStopWords: boolean
  iteration: number
  iterations: number
  lockInterceptAtZero: boolean
  name: string
  trainingInProgress: boolean
  trainingInStepMode: boolean
  trainingIsComplete: boolean
  usePoint5AsProbThreshold: boolean
}

export const defaultModel: IAIModel = {
  beingConstructed: false,
  frequencyThreshold: 4,
  ignoreStopWords: true,
  iteration: 0,
  iterations: 20,
  lockInterceptAtZero: true,
  name: '',
  trainingInProgress: false,
  trainingInStepMode: false,
  trainingIsComplete: false,
  usePoint5AsProbThreshold: true
}

export class AIModel {
  beingConstructed = defaultModel.beingConstructed;
  frequencyThreshold = defaultModel.frequencyThreshold;
  ignoreStopWords = defaultModel.ignoreStopWords;
  iteration = defaultModel.iteration;
  iterations = defaultModel.iterations;
  lockInterceptAtZero = defaultModel.lockInterceptAtZero;
  logisticModel: LogisticRegression = getDefaultLogisticRegression();
  name = defaultModel.name;
  trainingInProgress = defaultModel.trainingInProgress;
  trainingInStepMode = defaultModel.trainingInStepMode;
  trainingIsComplete = defaultModel.trainingIsComplete;
  usePoint5AsProbThreshold = defaultModel.usePoint5AsProbThreshold;

  constructor() {
    makeAutoObservable(this, { logisticModel: false }, { autoBind: true });
  }

  setBeingConstructed(value: boolean) {
    this.beingConstructed = value;
  }

  setFrequencyThreshold(value: number) {
    this.frequencyThreshold = value;
  }

  setIgnoreStopWords(value: boolean) {
    this.ignoreStopWords = value;
  }

  setIteration(value: number) {
    this.iteration = value;
  }

  setIterations(value: number) {
    this.iterations = value;
  }

  setLockInterceptAtZero(value: boolean) {
    this.lockInterceptAtZero = value;
  }

  setName(value: string) {
    this.name = value;
  }

  setTrainingInProgress(value: boolean) {
    this.trainingInProgress = value;
  }

  setTrainingInStepMode(value: boolean) {
    this.trainingInStepMode = value;
  }

  setTrainingIsComplete(value: boolean) {
    this.trainingIsComplete = value;
  }

  setUsePoint5AsProbThreshold(value: boolean) {
    this.usePoint5AsProbThreshold = value;
  }

  import(model: IAIModel) {
    this.setBeingConstructed(model.beingConstructed);
    this.setFrequencyThreshold(model.frequencyThreshold);
    this.setIgnoreStopWords(model.ignoreStopWords);
    this.setIteration(model.iteration);
    this.setIterations(model.iterations);
    this.setLockInterceptAtZero(model.lockInterceptAtZero);
    this.setName(model.name);
    this.setTrainingInProgress(model.trainingInProgress);
    this.setTrainingInStepMode(model.trainingInStepMode);
    this.setTrainingIsComplete(model.trainingIsComplete);
    this.setUsePoint5AsProbThreshold(model.usePoint5AsProbThreshold);
  }

  reset() {
    // The instance's logistic model is reset in place, never replaced, so that references held
    // elsewhere (ModelManager grabs one at the start of a training run) stay pointed at the model in use.
    this.logisticModel.reset();
    this.import(defaultModel);
  }

  // The snapshot is an explicit literal so TypeScript checks every IAIModel field is present and
  // rejects anything extra: a live object or a field that only makes sense in this session cannot
  // reach the saved document.
  asJSON(): IAIModel {
    return {
      beingConstructed: this.beingConstructed,
      frequencyThreshold: this.frequencyThreshold,
      ignoreStopWords: this.ignoreStopWords,
      iteration: this.iteration,
      iterations: this.iterations,
      lockInterceptAtZero: this.lockInterceptAtZero,
      name: this.name,
      trainingInProgress: this.trainingInProgress,
      trainingInStepMode: this.trainingInStepMode,
      trainingIsComplete: this.trainingIsComplete,
      usePoint5AsProbThreshold: this.usePoint5AsProbThreshold
    }
  }

  fromJSON(json: IAIModel) {
    if (json) {
      this.import(json);
    }
  }
}
