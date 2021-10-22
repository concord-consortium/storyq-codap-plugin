/**
 * The TextFeedbackManager displays phrases in a text component based on user selection of target phrases
 * or features of the model.
 */

import codapInterface, {CODAP_Notification} from "../lib/CodapInterface";
import {ClassLabel, HeadingsManager, HeadingSpec, PhraseTriple} from "./headings_manager";
import {
	getSelectedCasesFrom
} from "../lib/codap-helper";
import {phraseToFeatures, textToObject} from "../utilities/utilities";
import {DomainStore} from "../stores/domain_store";
import {UiStore} from "../stores/ui_store";

export default class TextFeedbackManager {

	domainStore: DomainStore
	uiStore: UiStore
	headingsManager: HeadingsManager
	subscriberIndex: number
	isSelectingFeatures = false
	isSelectingTargetPhrases = false

	constructor(iDomainStore: DomainStore, iUiStore: UiStore) {
		this.handleNotification = this.handleNotification.bind(this)
		this.domainStore = iDomainStore;
		this.uiStore = iUiStore;
		this.headingsManager = new HeadingsManager();
		this.subscriberIndex = codapInterface.on('notify', '*', 'selectCases', this.handleNotification);
	}

	async handleNotification(iNotification: CODAP_Notification) {
		const tTargetDatasetName = this.domainStore.targetStore.targetDatasetInfo.name,
			tTestingDatasetName = this.domainStore.testingStore.testingDatasetInfo.name,
			tFeatureDatasetName = this.domainStore.featureStore.featureDatasetInfo.datasetName

		if (iNotification.action === 'notify' && iNotification.values.operation === 'selectCases') {
			const tDataContextName = iNotification.resource && iNotification.resource.match(/\[(.+)]/)[1];
			if (tDataContextName === tFeatureDatasetName && !this.isSelectingFeatures) {
				this.isSelectingTargetPhrases = true;
				await this.handleFeatureSelection();
				this.isSelectingTargetPhrases = false;
			} else if ([tTestingDatasetName, tTargetDatasetName].includes(tDataContextName) && !this.isSelectingTargetPhrases) {
				this.isSelectingFeatures = true;
				await this.handleTextDatasetSelection();
				this.isSelectingFeatures = false;
			}
		}
	}

	getHeadingsManager(): HeadingsManager {
		if (!this.headingsManager) {
			this.headingsManager = new HeadingsManager();
		}
		this.headingsManager.setupHeadings(this.domainStore.targetStore.getClassName('negative'),
			this.domainStore.targetStore.getClassName('positive'),
			'', 'Actual', 'Predicted')
		return this.headingsManager;
	}

	/**
	 * If the Features dataset has cases selected, for each selected case
	 * 	- Pull out the array of 'usages' - the the case IDs of the cases in the dataset being analyzed
	 * 	- Select these cases in that dataset
	 * 	- Pull the phrase from the target case
	 */
	async handleFeatureSelection() {
		const tUseTestingDataset = this.uiStore.getSelectedPanelTitle() === 'Testing' &&
				this.domainStore.testingStore.testingDatasetInfo.name !== '' &&
				this.domainStore.testingStore.testingAttributeName !== '' &&
				this.domainStore.testingStore.testingResults.testHasBeenRun,
			tStore = tUseTestingDataset ? this.domainStore.testingStore : this.domainStore.targetStore,
			kMaxStatementsToDisplay = 40,
			tDatasetName = tUseTestingDataset ? tStore.testingDatasetInfo.name : tStore.targetDatasetInfo.name,
			tDatasetTitle = tUseTestingDataset ? tStore.testingDatasetInfo.title : tStore.targetDatasetInfo.title,
			tCollectionName = tUseTestingDataset ? tStore.testingCollectionName : tStore.targetCollectionName,
			tAttributeName = tUseTestingDataset ? tStore.testingAttributeName : tStore.targetAttributeName,
			tFeatureDatasetName = this.domainStore.featureStore.featureDatasetInfo.datasetName,
			tClassAttributeName = tUseTestingDataset ? tStore.testingClassAttributeName : tStore.targetClassAttributeName,
			tPredictedLabelAttributeName = this.domainStore.targetStore.targetPredictedLabelAttributeName,
			tColumnFeatureNames = this.domainStore.featureStore.targetColumnFeatureNames,
			tConstructedFeatureNames = this.domainStore.featureStore.features.map(iFeature => iFeature.name),
			tFeatures: string[] = [],
			tUsedIDsSet: Set<number> = new Set(),
			tSelectedCases = await getSelectedCasesFrom(tFeatureDatasetName)
		let tEndPhrase: string;
		tSelectedCases.forEach((iCase: any) => {
			let tUsages = iCase.values.usages;
			if (typeof tUsages === 'string' && tUsages.length > 0) {
				(JSON.parse(tUsages)).forEach((anID: number) => {
					tUsedIDsSet.add(anID);
				});
			}
			tFeatures.push(iCase.values.name);
		});
		let tUsedCaseIDs: number[] = Array.from(tUsedIDsSet);
		await codapInterface.sendRequest({
			action: 'create',
			resource: `dataContext[${tDatasetName}].selectionList`,
			values: tUsedCaseIDs
		});
		const tTriples: { actual: string, predicted: string, phrase: string }[] = [];
		tEndPhrase = (tUsedCaseIDs.length > kMaxStatementsToDisplay) ? 'Not all statements could be displayed' : '';
		const tTargetPhrasesToShow = Math.min(tUsedCaseIDs.length, kMaxStatementsToDisplay);
		// Here is where we put the contents of the text component together
		for (let i = 0; i < tTargetPhrasesToShow; i++) {
			let tGetCaseResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${tDatasetName}].collection[${tCollectionName}].caseByID[${tUsedCaseIDs[i]}]`
			});
			const tActualClass = tGetCaseResult.values.case.values[tClassAttributeName],
				tPredictedClass = tGetCaseResult.values.case.values[tPredictedLabelAttributeName],
				tPhrase = tGetCaseResult.values.case.values[tAttributeName],
				tTriple = {actual: tActualClass, predicted: tPredictedClass, phrase: tPhrase}
			tTriples.push((tTriple));
		}
		await this.retitleTextComponent(`Selected texts in ${tDatasetTitle}`)
		await this.composeText(tTriples, tFeatures, textToObject,
			tColumnFeatureNames.concat(tConstructedFeatureNames), tEndPhrase);
	}

	/**
	 * First, For each selected target phrase, select the cases in the Feature dataset that contain the target
	 * case id.
	 * Second, under headings for the classification, display each selected target phrase as text with
	 * features highlighted and non-features grayed out
	 */
	public async handleTextDatasetSelection() {
		const tUseTestingDataset = this.uiStore.getSelectedPanelTitle() === 'Testing' &&
				this.domainStore.testingStore.testingDatasetInfo.name !== '' &&
				this.domainStore.testingStore.testingAttributeName !== '',
			tStore = tUseTestingDataset ? this.domainStore.testingStore : this.domainStore.targetStore,
			tDatasetName = tUseTestingDataset ? tStore.testingDatasetInfo.name : tStore.targetDatasetInfo.name,
			tDatasetTitle = tUseTestingDataset ? tStore.testingDatasetInfo.title : tStore.targetDatasetInfo.title,
			tAttributeName = tUseTestingDataset ? tStore.testingAttributeName : tStore.targetAttributeName,
			tFeatureDatasetName = this.domainStore.featureStore.featureDatasetInfo.datasetName,
			tClassAttributeName = tUseTestingDataset ? tStore.testingClassAttributeName : tStore.targetClassAttributeName,
			tPredictedLabelAttributeName = this.domainStore.targetStore.targetPredictedLabelAttributeName,
			tColumnFeatureNames = this.domainStore.featureStore.targetColumnFeatureNames,
			tConstructedFeatureNames = this.domainStore.featureStore.features.map(iFeature => iFeature.name)

		let tSelectedCases: any = await getSelectedCasesFrom(tDatasetName),
			tTriples: PhraseTriple[] = [],
			tIDsOfFeaturesToSelect: number[] = [];
		tSelectedCases.forEach((iCase: any) => {
			if (iCase) {
				if (iCase.values.featureIDs) {
					let tFeatureIDs: number[] = JSON.parse(iCase.values.featureIDs);
					tIDsOfFeaturesToSelect = tIDsOfFeaturesToSelect.concat(tFeatureIDs);
				}
				tTriples.push({
					actual: iCase.values[tClassAttributeName],
					predicted: iCase.values[tPredictedLabelAttributeName],
					phrase: iCase.values[tAttributeName]
				});
			}
		});
		if (tIDsOfFeaturesToSelect.length > 0) {
			// Select the features
			await codapInterface.sendRequest({
				action: 'create',
				resource: `dataContext[${tFeatureDatasetName}].selectionList`,
				values: tIDsOfFeaturesToSelect
			});
		}

		let tSelectedFeatureCases: any[] = [],
			tFeatures = new Set<string>(),
			tFeaturesArray: string[] = []
		if (this.domainStore.featureStore.features.length > 0) {
			// Get the features and stash them in a set
			tSelectedFeatureCases = await getSelectedCasesFrom(tFeatureDatasetName)
			tSelectedFeatureCases.forEach((iCase: any) => {
				tFeatures.add(iCase.values.feature);
			});
			tFeatures.forEach(iFeature => {
				tFeaturesArray.push(iFeature);
			});
		}
		await this.retitleTextComponent(`Selected texts in ${tDatasetTitle}`)
		await this.composeText(tTriples, tFeaturesArray,
			phraseToFeatures, tColumnFeatureNames.concat(tConstructedFeatureNames));
	}

	/**
	 * Cause the text component to display phrases with the feature highlighting determined by
	 * 	given function
	 * @param iPhraseTriples  Specifications for the phrases to be displayed
	 * @param iFeatures {string[]}	The features to be highlighted
	 * @param iHighlightFunc {Function}	Function called to do the highlighting
	 * @param iSpecialFeatures {string[]} Typically "column features" true of the phrase, but the strings
	 * 					themselves do not appear in the phrase
	 * @param iEndPhrase {string} The text to display at the bottom of the list of phrases
	 * @public
	 */
	public async composeText(iPhraseTriples: PhraseTriple[], iFeatures: string[], iHighlightFunc: Function,
													 iSpecialFeatures: string[], iEndPhrase?: string) {
		const kHeadingsManager = this.getHeadingsManager();
		const kProps = ['negNeg', 'negPos', 'negBlank', 'posNeg', 'posPos', 'posBlank', 'blankNeg', 'blankPos', 'blankBlank'];
		// @ts-ignore
		const kHeadings: HeadingSpec = kHeadingsManager.headings;
		const tClassItems: { [index: string]: any[] } = {}
		kProps.forEach(iProp => {
			tClassItems[iProp] = []
		})
		let tItems: any = [];


		function addOnePhrase(iTriple: PhraseTriple) {
			// @ts-ignore
			const kLabels: ClassLabel = kHeadingsManager.classLabels;

			let tGroup: string,
				tColor: string;
			switch (iTriple.actual) {
				case kLabels.negLabel:
					switch (iTriple.predicted) {
						case kLabels.negLabel:
							tGroup = 'negNeg';
							// @ts-ignore
							tColor = kHeadingsManager.colors.green;
							break;
						case kLabels.posLabel:
							tGroup = 'negPos';
							// @ts-ignore
							tColor = kHeadingsManager.colors.red;
							break;
						default:
							tGroup = 'negBlank'
							tColor = kHeadingsManager.colors.red
					}
					break;
				case kLabels.posLabel:
					switch (iTriple.predicted) {
						case kLabels.negLabel:
							tGroup = 'posNeg';
							// @ts-ignore
							tColor = kHeadingsManager.colors.red;
							break;
						case kLabels.posLabel:
							tGroup = 'posPos';
							// @ts-ignore
							tColor = kHeadingsManager.colors.green;
							break;
						default:
							tGroup = 'posBlank'
							tColor = kHeadingsManager.colors.green
					}
					break;
				default:
					switch (iTriple.predicted) {
						case kLabels.negLabel:
							tGroup = 'blankNeg';
							tColor = kHeadingsManager.colors.orange;
							break;
						case kLabels.posLabel:
							tGroup = 'blankPos';
							tColor = kHeadingsManager.colors.blue;
							break;
						default:
							tGroup = 'blankBlank'
							tColor = '#FFFF00'
					}
			}
			const tSquare = {
				text: tGroup !== kProps[kProps.length - 1] ? '■ ' : '', // Don't add the square if we're in 'blankBlank'
				color: tColor
			}
			// @ts-ignore
			tClassItems[tGroup].push({
				type: 'list-item',
				children: [tSquare].concat(iHighlightFunc(iTriple.phrase, iFeatures, iSpecialFeatures))
			})
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
		if (iEndPhrase && iEndPhrase !== '') {
			tItems.push({
				"type": "paragraph",
				"children": [
					{
						"text": iEndPhrase
					}
				]
			})
		}
		if (tItems.length === 0)
			this.domainStore.clearText();
		else {
			// Send it all off to the text object
			await codapInterface.sendRequest({
				action: 'update',
				resource: `component[${this.domainStore.textStore.textComponentID}]`,
				values: {
					text: {
						"object": "value",
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
			})
		}

	}

	async retitleTextComponent(iTitle: string) {
		await codapInterface.sendRequest({
			action: 'update',
			resource: `component[${this.domainStore.textStore.textComponentID}]`,
			values: {
				title: iTitle
			}
		})
	}

}

