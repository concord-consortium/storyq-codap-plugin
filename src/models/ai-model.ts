import { makeAutoObservable, toJS } from "mobx";
import { getDefaultLogisticRegression, LogisticRegression } from "../lib/jsregression";

export interface IAIModel {
  beingConstructed: boolean
  frequencyThreshold: number
  ignoreStopWords: boolean
  iteration: number
  iterations: number
  lockInterceptAtZero: boolean
  logisticModel: LogisticRegression
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
  logisticModel: getDefaultLogisticRegression(),
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

  setLogisticModel(value: LogisticRegression) {
    this.logisticModel = value;
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
    this.setLogisticModel(model.logisticModel);
    this.setName(model.name);
    this.setTrainingInProgress(model.trainingInProgress);
    this.setTrainingInStepMode(model.trainingInStepMode);
    this.setTrainingIsComplete(model.trainingIsComplete);
    this.setUsePoint5AsProbThreshold(model.usePoint5AsProbThreshold);
  }

  reset() {
    defaultModel.logisticModel.reset();
    this.import(defaultModel);
  }

  asJSON() {
    const tCopy: Partial<AIModel> = Object.assign({}, toJS(this))
    delete tCopy.logisticModel
    return tCopy
  }

  fromJSON(json: IAIModel) {
    if (json) {
      this.import(json);
    }
  }
}
