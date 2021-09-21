/**
 * The StoryqManager manages all the data used by the TargetPanel and serves as the source of
 * the target dataset, attribute, and class.
 * It holds model level information to be saved and restored.
 */
import {TargetManager} from "./target_manager";

export class StoryqManager {

	targetManager:TargetManager;

	constructor(props:any) {
		this.targetManager = new TargetManager({});
	}

	public restoreFromStorage( iStorage: any) {
		this.targetManager.restoreFromStorage(iStorage.targetManagerStorage);
	}

	createStorage() {
		return {
			targetManagerStorage: this.targetManager.createStorage()
		}
	}
}

