/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import { makeAutoObservable, toJS } from 'mobx';
import { AIModel } from '../models/ai-model';
import { TrainingResult } from "./store_types_and_constants";

export interface ITrainingStoreSnapshot {
  model: AIModel;
  trainingResults: TrainingResult[];
}

export class TrainingStore {
  model: AIModel;
  trainingResults: TrainingResult[] = [];
  resultCaseIDs: number[] = [];

  constructor() {
    makeAutoObservable(this, { resultCaseIDs: false }, { autoBind: true });
    this.model = new AIModel();
  }

  asJSON() {
    return {
      model: this.model.asJSON(),
      trainingResults: toJS(this.trainingResults)
    };
  }

  fromJSON(json: ITrainingStoreSnapshot) {
    if (json) {
      this.model.fromJSON(json.model);
      this.trainingResults = json.trainingResults || [];
    }
    this.checkForActiveModel();
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
