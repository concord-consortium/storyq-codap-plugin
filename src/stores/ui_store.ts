/**
 * These store objects are available to components for the purpose of storing and restoring the state of the ui.
 */

import { makeAutoObservable, toJS } from 'mobx';

const tTitles = ['Target', 'Features', 'Training', 'Testing'];

export interface IUiStoreJSON {
	tabPanelSelectedIndex: number;
	trainingPanelShowsEditor: boolean;
}

export class UiStore {
	tabPanelSelectedIndex: number = 0;
	trainingPanelShowsEditor: boolean = false;

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
		}
	}

	setTabPanelSelectedIndex(value: number) {
		this.tabPanelSelectedIndex = value;
	}

	setTrainingPanelShowsEditor(value: boolean) {
		this.trainingPanelShowsEditor = value;
	}
}

export const uiStore = new UiStore();
