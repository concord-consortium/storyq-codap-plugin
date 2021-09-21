/**
 * These store objects are available to components for the purpose of storing and restoring the state of the ui.
 */

import { makeAutoObservable } from 'mobx'

export class UiStore {
	tabPanelSelectedIndex:number = 0

	constructor() {
		makeAutoObservable(this)
	}

}