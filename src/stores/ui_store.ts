/**
 * These store objects are available to components for the purpose of storing and restoring the state of the ui.
 */

import {makeAutoObservable, toJS} from 'mobx'
import {ReactElement} from "react";

export class UiStore {
	[index: string]: any;
	tabPanelSelectedIndex: number = 0
	trainingPanelShowsEditor: boolean = false
	currentInstruction:ReactElement | null = null

	constructor() {
		makeAutoObservable(this)
	}

	getSelectedPanelTitle() {
		const tTitles = ['Target', 'Features', 'Training', 'Testing']
		return tTitles[this.tabPanelSelectedIndex]
	}

	asJSON(): object {
		return toJS(this)
	}

	fromJSON(json: any) {
		if (json) {
			for (const [key, value] of Object.entries(json)) {
				this[key] = value
			}
		}
	}

}