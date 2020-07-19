import codapInterface from "./lib/CodapInterface";
import DataManager from './data_manager';
import {string} from "prop-types";

export class TextManager {

	private textComponentID:number | undefined;
	private dataManager:DataManager;
	private currentStory:string = '';

	constructor(iDataManager:DataManager) {
		this.dataManager = iDataManager;
		this.handleNotification = this.handleNotification.bind(this);

		codapInterface.on('notify', '*', '', this.handleNotification);
	}

	public setTextComponentID( iID:number) {
		this.textComponentID = iID;
	}

	/**
	 *
	 * @param iNotification    the Command resulting from the user action
	 */
	private async handleNotification(iNotification: any): Promise<any> {
		if (iNotification.resource === 'undoChangeNotice' && iNotification.values.operation==='clearRedo') {
			this.checkStory();
		} else if( iNotification.action === 'notify' && iNotification.values.operation === 'selectCases') {
			this.handleSelection( iNotification.values.result.cases);
		}
	}

	private async checkStory() {

		function processChild( iChild:any) {
			if( iChild.type === 'paragraph' && iChild.children) {
				iChild.children.forEach( processChild)
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

	private async handleSelection( iCases:any) {
		let selectedWords: any = [],
				tResult: any,
				tNewStory: any = [];
		iCases = iCases || [];

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

		function processChildShowSelection(iChild: any, iIndex:number, iArray:any, top?: any) {
			let segment = '';
			if( !top)
				top = tNewStory;
			if (iChild.type === 'paragraph' && iChild.children) {
				let tNewNode = {type: 'paragraph', children: []};
				top.push(tNewNode);
				iChild.children.forEach((iChild:any, iChildIndex:number) => {
					processChildShowSelection( iChild, iChildIndex, iChild.children, tNewNode.children);
				});
			}
			else if (iChild.text) {
				let words:RegExpMatchArray | [] = iChild.text.match(/[^ ]+/g) || [];
				words.forEach((iWord) => {
					let tRawWordArray = iWord.match(/\w+/),
							tRawWord = (tRawWordArray && tRawWordArray.length > 0 ? tRawWordArray[0] : '').toLowerCase();
					if (selectedWords.indexOf(tRawWord) >= 0) {
						if (segment !== '') {
							top.push({
								text: segment
							});
							segment = '';
						}
						top.push({
							text: iWord, bold: true, underlined: true, color: "#0432ff"
						})
						top.push({
							text: ' '
						})
					}
					else {
						segment += iWord + ' ';
					}
				});
			}
			if( segment !== '')
				top.push({ text: segment })
		}

		iCases.forEach((iCase: any) => {
			selectedWords.push(iCase.values.word);
		});

		let tStoryChildren = await this.getCurrentStory();
		if( tStoryChildren) {
			// Remove bold chunks
			tStoryChildren.forEach(processChildRemoveFormatting);
			// Make bold chunks for the selected words
			tStoryChildren.forEach(processChildShowSelection);

			let tRequest: any = {
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
}

