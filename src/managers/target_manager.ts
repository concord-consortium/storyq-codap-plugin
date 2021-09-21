import {entityInfo} from "../lib/codap-helper";

/**
 * The TargetManager manages all the data used by the TargetPanel and serves as the source of
 * the target dataset, attribute, and class.
 * It holds model level information to be saved and restored.
 */

export class TargetManager {
	targetDatasetInfo: entityInfo;
	datasetInfoArray: entityInfo[] = [];

	constructor(props:any) {
		this.targetDatasetInfo = {name: '', title: '', id: 0};
	}

	public restoreFromStorage( iStorage: any) {
		if( iStorage) {
			this.targetDatasetInfo = iStorage.targetDatasetInfo;
		}
	}

	createStorage() {
		return {
			targetDatasetInfo: this.targetDatasetInfo
		}
	}
}

