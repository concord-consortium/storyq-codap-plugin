/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import {makeAutoObservable, toJS} from 'mobx'
import {Model, TrainingResult} from "./store_types_and_constants";

export class TrainingStore {
	model: Model
	trainingResults: TrainingResult[] = []

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true})
		this.model = new Model()
	}

	asJSON() {
		return {
			model: this.model.asJSON(),
			trainingResults: toJS(this.trainingResults)
		}
	}

	fromJSON(json: any) {
		if (json) {
			this.model.fromJSON(json.model)
			this.trainingResults = json.trainingResults || []
		}
	}
}
