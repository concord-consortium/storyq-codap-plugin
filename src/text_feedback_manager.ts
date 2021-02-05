/**
 * The TextFeedbackManager displays phrases in a text component based on user selection of target phrases
 * or features of the model.
 */

import codapInterface from "./lib/CodapInterface";
import {ClassLabel, HeadingsManager, HeadingSpec, PhraseTriple} from "./headings_manager";
import pluralize from "pluralize";

export default class TextFeedbackManager {

	public textComponentName:string = '';
	public textComponentID:number = -1;

	private headingsManager:HeadingsManager;
	private targetCategories:string[];
	private targetAttributeName:string;

	constructor( iTargetCategories:string[], iTargetAttributeName:string) {
		this.targetCategories = iTargetCategories;
		this.targetAttributeName = iTargetAttributeName;
		this.headingsManager = new HeadingsManager(this.targetCategories[0], this.targetCategories[1],
			'Actual', 'Predicted');
	}

	private async clearText() {
		await codapInterface.sendRequest({
			action: 'update',
			resource: `component[${this.textComponentID}]`,
			values: {
				text: {
					document: {
						children: [
							{
								type: "paragraph",
								children: [
									{
										text: `This is where selected ${pluralize(this.targetAttributeName)} appear.`
									}
								]
							}
						],
						objTypes: {
							"paragraph": "block"
						}
					}
				}
			}
		});
	}

	public async addTextComponent() {
		this.textComponentName = 'Selected ' + pluralize(this.targetAttributeName);
		let tResult:any = await codapInterface.sendRequest( {
			action: 'create',
			resource: 'component',
			values: {
				type: 'text',
				name: this.textComponentName,
				title: this.textComponentName,
				dimensions: {
					width: 500,
					height: 150
				},
				position: 'top'
			}
		});
		this.textComponentID = tResult.values.id
		this.clearText();
	}

	/**
	 * Cause the text component to display phrases with the feature highlighting determined by
	 * 	given function
	 * @param iPhraseTriples  Specifications for the phrases to be displayed
	 * @param iFeatures {string[]}	The features to be highlighted
	 * @param iHighlightFunc {Function}	Function called to do the highlighting
	 * @public
	 */
	public async composeText(iPhraseTriples: PhraseTriple[], iFeatures: string[], iHighlightFunc: Function) {
		let this_ = this;
		const kHeadingsManager = this.headingsManager;
		const kProps = ['negNeg', 'negPos', 'posNeg', 'posPos'];
		// @ts-ignore
		const kHeadings: HeadingSpec = kHeadingsManager.headings;
		let tClassItems = {
				negNeg: [],
				negPos: [],
				posNeg: [],
				posPos: []
			},
			tItems: any = [];


		function addOnePhrase(iTriple: PhraseTriple) {
			// @ts-ignore
			const kLabels: ClassLabel = kHeadingsManager.classLabels;

			let tGroup: string,
				tColor:string = '';
			switch (iTriple.actual) {
				case kLabels.negLabel:
					switch (iTriple.predicted) {
						case kLabels.negLabel:
							tGroup = 'negNeg';
							// @ts-ignore
							tColor = this_.headingsManager.colors.green;
							break;
						case kLabels.posLabel:
							tGroup = 'negPos';
							// @ts-ignore
							tColor = this_.headingsManager.colors.red;
					}
					break;
				case kLabels.posLabel:
					switch (iTriple.predicted) {
						case kLabels.negLabel:
							tGroup = 'posNeg';
							// @ts-ignore
							tColor = this_.headingsManager.colors.red;
							break;
						case kLabels.posLabel:
							tGroup = 'posPos';
							// @ts-ignore
							tColor = this_.headingsManager.colors.green;
					}
			}
			const tSquare = {
				text: '■ ',
				color: tColor
			}
			// @ts-ignore
			tClassItems[tGroup].push({
				type: 'list-item',
				children: [tSquare].concat(iHighlightFunc(iTriple.phrase, iFeatures))
			});
		}

		iPhraseTriples.forEach(iTriple => {
			addOnePhrase(iTriple);
		});

		// The phrases are all in their groups. Create the array of group objects
		kProps.forEach(iProp => {
			// @ts-ignore
			let tPhrases = tClassItems[iProp];
			if (tPhrases.length !== 0) {
				let tHeadingItems = [
					// @ts-ignore
					kHeadings[iProp],
					{
						type: 'bulleted-list',
						// @ts-ignore
						children: tClassItems[iProp]
					}];
				tItems = tItems.concat(tHeadingItems);
			}
		});
		if (tItems.length === 0)
			this.clearText();
		else {
			// Send it all off to the text object
			await codapInterface.sendRequest({
				action: 'update',
				resource: `component[${this.textComponentID}]`,
				values: {
					text: {
						document: {
							children: tItems,
							objTypes: {
								'list-item': 'block',
								'bulleted-list': 'block',
								'paragraph': 'block'
							}
						}
					}
				}
			});
		}

	}

}

