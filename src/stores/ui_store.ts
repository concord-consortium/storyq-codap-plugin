/**
 * These store objects are available to components for the purpose of storing and restoring the state of the ui.
 */

import { makeAutoObservable, toJS } from 'mobx';

const tTitles = ['Target', 'Features', 'Training', 'Testing'];

export interface IUiStoreJSON {
  tabPanelSelectedIndex: number;
  trainingPanelShowsEditor: boolean;
  showStoryQPanel?: boolean;
  showTextPanel?: boolean;
}

export class UiStore {
  tabPanelSelectedIndex = 0;
  trainingPanelShowsEditor = false;
  showStoryQPanel = true;
  showTextPanel = true;

  constructor() {
    makeAutoObservable(this);
  }

  get selectedPanelTitle() {
    return tTitles[this.tabPanelSelectedIndex];
  }

  asJSON(): object {
    return toJS(this);
  }

  fromJSON(json: IUiStoreJSON) {
    if (json) {
      this.tabPanelSelectedIndex = json.tabPanelSelectedIndex ?? 0;
      this.trainingPanelShowsEditor = json.trainingPanelShowsEditor ?? false;
      this.showStoryQPanel = json.showStoryQPanel ?? true;
      this.showTextPanel = json.showTextPanel ?? true;
    }
  }

  setTabPanelSelectedIndex(value: number) {
    this.tabPanelSelectedIndex = value;
  }

  setTrainingPanelShowsEditor(value: boolean) {
    this.trainingPanelShowsEditor = value;
  }

  setShowStoryQPanel(value: boolean) {
    this.showStoryQPanel = value;
  }

  setShowTextPanel(value: boolean) {
    this.showTextPanel = value;
  }
}

export const uiStore = new UiStore();
