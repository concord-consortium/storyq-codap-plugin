/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import { makeAutoObservable } from 'mobx'

class RootStore {
	targetStore:TargetStore

	constructor() {
		this.targetStore = new TargetStore()
	}
}

class TargetStore {
	constructor() {
		makeAutoObservable(this)
	}

}