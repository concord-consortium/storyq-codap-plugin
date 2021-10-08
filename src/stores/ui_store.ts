/**
 * These store objects are available to components for the purpose of storing and restoring the state of the ui.
 */

import {makeAutoObservable, toJS} from 'mobx'

export class UiStore {
	[index: string]: any;
	tabPanelSelectedIndex: number = 0
	trainingPanelShowsEditor: boolean = false
	currentPromptKey:string

	constructor() {
		makeAutoObservable(this)
		this.currentPromptKey = 'blank'
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