/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import { makeAutoObservable, toJS } from 'mobx';
import { AIModel, IAIModel } from '../models/ai-model';
import { TrainingResult } from "./store_types_and_constants";

export interface ITrainingStoreSnapshot {
  model: IAIModel;
  trainingResults: TrainingResult[];
}

export class TrainingStore {
  model: AIModel;
  trainingResults: TrainingResult[] = [];
  resultCaseIDs: number[] = [];
  // A training run lives partly in memory: the logistic model's fit loop and the callbacks that drive
  // it are not saved with the document. Reopening a document that was saved mid-run therefore restores
  // a model that says it is training but has nothing left to continue, so the run has to be started
  // over. This is deliberately not part of asJSON(); it describes this session, not the document.
  trainingWasInterrupted = false;

  constructor() {
    makeAutoObservable(this, { resultCaseIDs: false }, { autoBind: true });
    this.model = new AIModel();
  }

  asJSON(): ITrainingStoreSnapshot {
    return {
      model: this.model.asJSON(),
      trainingResults: toJS(this.trainingResults)
    };
  }

  fromJSON(json: ITrainingStoreSnapshot) {
    if (json) {
      this.model.fromJSON(json.model);
      this.setTrainingWasInterrupted(this.model.trainingInProgress);
      this.trainingResults = json.trainingResults || [];
    }
    this.checkForActiveModel();
  }

  setTrainingWasInterrupted(value: boolean) {
    this.trainingWasInterrupted = value;
  }

  inactivateAll() {
    this.trainingResults.forEach(iResult => iResult.isActive = false);
  }

  getTrainingResultByName(iModelName: string) {
    return this.trainingResults.find(iResult => iResult.name === iModelName);
  }

  get firstActiveModelName() {
    return this.trainingResults.find(iResult => iResult.isActive)?.name ?? '';
  }

  checkForActiveModel() {
    if (this.firstActiveModelName === '' && this.trainingResults.length > 0)
      this.trainingResults[0].isActive = true;
  }
}

export const trainingStore = new TrainingStore();
