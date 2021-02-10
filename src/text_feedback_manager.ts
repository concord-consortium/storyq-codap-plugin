/**
 * The TextFeedbackManager displays phrases in a text component based on user selection of target phrases
 * or features of the model.
 */

import codapInterface from "./lib/CodapInterface";
import {ClassLabel, HeadingsManager, HeadingSpec, PhraseTriple} from "./headings_manager";
import pluralize from "pluralize";
import {getSelectedCasesFrom} from "./lib/codap-helper";
import {phraseToFeatures, textToObject} from "./utilities";
import {ClassificationManager} from "./classification_manager";
import {FeatureManager} from "./feature_manager";

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
			'','Actual', 'Predicted');
	}

	/**
	 * If the Features dataset has cases selected, for each selected case
	 * 	- Pull out the array of 'usages' - the the case IDs of the cases in the dataset being analyzed
	 * 	- Select these cases in that dataset
	 * 	- Pull the phrase from the target case
	 */
	public async handleFeatureSelection(aManager:ClassificationManager | FeatureManager) {
		let tSelectedCases = await getSelectedCasesFrom(aManager.modelsDatasetName);
		let tFeatures: string[] = [],
			tUsedIDsSet: Set<number> = new Set();
		tSelectedCases.forEach((iCase: any) => {
			let tUsages = iCase.values.usages;
			if( typeof tUsages === 'string' && tUsages.length > 0) {
				(JSON.parse( tUsages)).forEach((anID: number) => {
					tUsedIDsSet.add(anID);
				});
			}
			tFeatures.push(iCase.values.feature);
		});
		let tUsedCaseIDs: number[] = Array.from(tUsedIDsSet);
		await codapInterface.sendRequest({
			action: 'create',
			resource: `dataContext[${aManager.targetDatasetName}].selectionList`,
			values: tUsedCaseIDs
		});
		let tTriples:{ actual:string, predicted:string, phrase:string}[] = [];
		const tTargetPhrasesToShow = Math.min( tUsedCaseIDs.length, 20);
		// Here is where we put the contents of the text component together
		for (let i = 0; i < tTargetPhrasesToShow; i++) {
			let tGetCaseResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${aManager.targetDatasetName}].collection[${aManager.targetCollectionName}].caseByID[${tUsedCaseIDs[i]}]`
			});
			let tActualClass = tGetCaseResult.values.case.values[aManager.targetClassAttributeName];
			let tPredictedClass = tGetCaseResult.values.case.values[aManager.targetPredictedLabelAttributeName];
			let tPhrase = tGetCaseResult.values.case.values[this.targetAttributeName];
			tTriples.push({actual: tActualClass, predicted: tPredictedClass, phrase: tPhrase});
		}
		await this.composeText(tTriples, tFeatures, textToObject);
	}

	/**
	 * First, For each selected target phrase, select the cases in the Feature dataset that contain the target
	 * case id.
	 * Second, under headings for the classification, display each selected target phrase as text with
	 * features highlighted and non-features grayed out
	 */
	public async handleTargetSelection(aManager:ClassificationManager | FeatureManager) {
		let tSelectedTargetCases:any = await getSelectedCasesFrom(aManager.targetDatasetName),
			tTargetTriples:PhraseTriple[] = [],
			tIDsOfFeaturesToSelect:number[] = [];
		tSelectedTargetCases.forEach((iCase:any)=> {
			let tFeatureIDs:number[] = JSON.parse(iCase.values.featureIDs);
			tIDsOfFeaturesToSelect = tIDsOfFeaturesToSelect.concat(tFeatureIDs);
			tTargetTriples.push({
				actual: iCase.values[aManager.targetClassAttributeName],
				predicted: iCase.values[aManager.targetPredictedLabelAttributeName],
				phrase: iCase.values[aManager.targetAttributeName]
			});
		});
		// Select the features
		await codapInterface.sendRequest({
			action: 'create',
			resource: `dataContext[${aManager.modelsDatasetName}].selectionList`,
			values: tIDsOfFeaturesToSelect
		});
		// Get the features and stash them in a set
		let tSelectedFeatureCases:any = await getSelectedCasesFrom(aManager.modelsDatasetName),
			tFeatures = new Set<string>(),
			tFeaturesArray:string[] = [];
		tSelectedFeatureCases.forEach((iCase:any)=>{
			tFeatures.add(iCase.values.feature);
		});
		tFeatures.forEach(iFeature=>{
			tFeaturesArray.push(iFeature);
		});
		await this.composeText( tTargetTriples, tFeaturesArray, phraseToFeatures);
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

	public async closeTextComponent() {
		// this.textComponentName = 'Selected ' + pluralize(this.targetAttributeName);
		await codapInterface.sendRequest( {
			action: 'delete',
			resource: `component[${this.textComponentName}]`
			});
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
		const kProps = ['negNeg', 'negPos', 'posNeg', 'posPos', 'blankNeg', 'blankPos'];
		// @ts-ignore
		const kHeadings: HeadingSpec = kHeadingsManager.headings;
		let tClassItems = {
				negNeg: [],
				negPos: [],
				posNeg: [],
				posPos: [],
				blankNeg: [],
				blankPos: []
			},
			tItems: any = [];


		function addOnePhrase(iTriple: PhraseTriple) {
			// @ts-ignore
			const kLabels: ClassLabel = kHeadingsManager.classLabels;

			let tGroup: string = 'blankPos',
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
					break;
				default:
					switch (iTriple.predicted) {
						case kLabels.negLabel:
							tGroup = 'blankNeg';
							tColor = this_.headingsManager.colors.orange;
							break;
						case kLabels.posLabel:
							tGroup = 'blankPos';
							tColor = this_.headingsManager.colors.blue;
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

