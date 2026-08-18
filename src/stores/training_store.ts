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
  // A run restored from a reopened document is normally rebuilt and replayed. This says that one
  // could not be: the features or the target data changed while the document was closed, or the
  // weight cases the run wrote cannot be identified, so the student is told to start over instead.
  // Deliberately not part of asJSON(); it describes this session, not the document.
  trainingCouldNotBeResumed = false;
  // A restored run has been validated and is waiting for its gradient replay, which a plain run
  // starts at once and a step-mode run pays for on the first Step press.
  resumeIsPending = false;
  // A run is being restored: the validation, and the replay when one follows. Step and Cancel are
  // disabled and the pane says why, until the run is handed back or refused. It covers the whole
  // restore rather than only the replay because a pane that lets a student act on a run whose fate
  // is still undecided acts on the wrong thing.
  isRestoringRun = false;

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
      // Whether an interrupted run can be resumed is not known here: it takes a rebuild against the
      // current features and target data, which happens on the restore path once CODAP has answered.
      // That a run is about to be restored is knowable here and nowhere earlier, and the pane renders
      // before the restore path has issued its first request. All three are assigned rather than only
      // set, so that restoring a document starts from this document's state and never from what an
      // earlier one left: a refusal carried forward would tell a student whose run did resume to
      // cancel it, and a pending resume carried forward would divert their first Step.
      this.setTrainingCouldNotBeResumed(false);
      this.setResumeIsPending(false);
      this.setRestoringRun(this.model.trainingInProgress);
      this.trainingResults = json.trainingResults || [];
    }
    this.checkForActiveModel();
  }

  setTrainingCouldNotBeResumed(value: boolean) {
    this.trainingCouldNotBeResumed = value;
  }

  setResumeIsPending(value: boolean) {
    this.resumeIsPending = value;
  }

  setRestoringRun(value: boolean) {
    this.isRestoringRun = value;
  }

  /**
   * Adds a completed run's entry, replacing any entry already recorded under the same name so that
   * a name is never held by two rows. A fresh run cannot collide, because buildModel makes the name
   * unique before it starts; a run restored from a document saved during the completion tail can,
   * because that document already holds the entry the replay is about to record again.
   */
  recordTrainingResult(result: TrainingResult) {
    const index = this.trainingResults.findIndex(iResult => iResult.name === result.name);
    if (index >= 0) this.trainingResults[index] = result;
    else this.trainingResults.push(result);
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
