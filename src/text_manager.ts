import codapInterface, {CODAP_Notification} from "./lib/CodapInterface";
import DataManager from './data_manager';
import {textToObject} from "./utilities";

export const kStoryFeaturesContextName = "Story Measurements";
export const kStoryTextComponentName = 'A New Story';

export class TextManager {

	private textComponentID:number | undefined;
	private dataManager:DataManager;
	private currentStory:string = '';
	private isActive = false;
	private subscriberIndex:number | null = null;

	constructor(iDataManager:DataManager) {
		this.dataManager = iDataManager;
		this.handleNotification = this.handleNotification.bind(this);

	}

	public setIsActive( iIsActive:boolean) {
		this.isActive = iIsActive;
		if( iIsActive) {
			this.subscriberIndex = codapInterface.on('notify', '*', '', this.handleNotification);
		}
		else if( this.subscriberIndex !== null){
			codapInterface.off(this.subscriberIndex);
		}
	}

	public setTextComponentID( iID:number) {
		this.textComponentID = iID;
	}

	/**
	 *
	 * @param iNotification    (from CODAP)
	 */
	private handleNotification(iNotification: CODAP_Notification) {
		if (iNotification.resource === 'undoChangeNotice' && iNotification.values.operation === 'clearRedo') {
			this.checkStory();
		} else if (iNotification.action === 'notify' && iNotification.values.operation === 'selectCases') {
			this.handleSelection( iNotification.resource);
		}
	}

	public async checkStory() {

		function processChild( iChild: { type:string, text:string, children:any[] }) {
			if( iChild.type && iChild.children) {
				iChild.children.forEach( processChild);
				tStory += '\n';
			}
			else if( iChild.text) {
				tStory += iChild.text;
			}
		}

		let tArrayOfChildren:[] = await this.getCurrentStory();
		// console.log( `checkStory: ${ JSON.stringify( tArrayOfChildren)}`);
		let tStory:string = '';
		if( Array.isArray( tArrayOfChildren)) {
			tArrayOfChildren.forEach(processChild);
			if( tStory !== this.currentStory) {
				this.currentStory = tStory;
				this.dataManager.processAndAddData(tStory);
			}
		}
	}

	private async getCurrentStory(): Promise<any> {
		let tRequest = {
			action: 'get',
			resource: `component[${this.textComponentID}]`
		};
		let tResult:any = await codapInterface.sendRequest( tRequest);
		let tChildren = [];
		try {
			tChildren = JSON.parse(tResult.values.apiText).document.children;
		}
		catch {
			console.log('unable to parse story');
		}
		return tChildren;
	}

	private async handleSelection( iResource:string) {
		// @ts-ignore
		let tDataContextName: string = iResource && iResource.match(/\[(.+)]/)[1];
		if (tDataContextName !== kStoryFeaturesContextName)
			return;

		let tResult: any,
				tNewStory: any = [],
				tStoryChildren = await this.getCurrentStory(),
				tSelectedWords:string[] = await this.dataManager.getSelectedWords();

		function processChildRemoveFormatting(iChild: any) {
			if (iChild.type === 'paragraph' && iChild.children) {
				iChild.children.forEach(processChildRemoveFormatting)
			}
			else if (iChild.text) {
				delete iChild.bold;
				delete iChild.underlined;
				delete iChild.color;
			}
		}

		function processChildShowSelection(iChild: any, iIndex: number, iArray: any, top?: any) {
			if (!top)
				top = tNewStory;
			if (iChild.type === 'paragraph' && iChild.children) {
				let tNewNode = {type: 'paragraph', children: []};
				top.push(tNewNode);
				iChild.children.forEach((iChild: any, iChildIndex: number) => {
					processChildShowSelection(iChild, iChildIndex, iChild.children, tNewNode.children);
				});
			}
			else if (iChild.text) {
				textToObject(iChild.text, tSelectedWords).forEach((anObject: any) => {
					top.push(anObject);
				});
			}
		}

		if (tStoryChildren) {
			// Remove bold chunks
			tStoryChildren.forEach(processChildRemoveFormatting);
			// Make bold chunks for the selected words
			tStoryChildren.forEach(processChildShowSelection);

			let tRequest: CODAP_Notification = {
				action: 'update',
				resource: `component[${this.textComponentID}]`,
				values: {
					text: {
						document: {
							children: tNewStory,
							objTypes: {
								paragraph: 'block'
							}
						}
					}
				}
			};
			try {
				tResult = await codapInterface.sendRequest(tRequest);
			}
			catch {
				console.log('Unable to update selection');
			}
			console.log(JSON.stringify(tResult));
		}

	}

	public restoreFromStorage( iStorage: { textComponentID:number }) {
		this.textComponentID = iStorage.textComponentID;
	}

	createStorage():{ textComponentID: number | undefined } {
		return {
			textComponentID: this.textComponentID
		}
	}
}

