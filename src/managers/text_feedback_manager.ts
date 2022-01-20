/**
 * The TextFeedbackManager displays phrases in a text component based on user selection of target phrases
 * or features of the model.
 */

import codapInterface, {CODAP_Notification} from "../lib/CodapInterface";
import {ClassLabel, HeadingsManager, HeadingSpec, PhraseTriple} from "./headings_manager";
import {Case, datasetExists, deselectAllCasesIn, getSelectedCasesFrom} from "../lib/codap-helper";
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

		if (iNotification.action === 'notify' && iNotification.values.operation === 'selectCases' &&
			iNotification.values.result.cases) {
			const tDataContextName = iNotification.resource && iNotification.resource.match(/\[(.+)]/)[1];
			if (tDataContextName === tFeatureDatasetName && !this.isSelectingFeatures) {
				this.isSelectingTargetPhrases = true;
				await this.handleFeatureSelection(iNotification.values.result.cases);
				this.isSelectingTargetPhrases = false;
			} else if ([tTestingDatasetName, tTargetDatasetName].includes(tDataContextName) && !this.isSelectingTargetPhrases) {
				this.isSelectingFeatures = true;
				await this.handleTargetDatasetSelection(iNotification.values.result.cases);
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

	async getChildCases(iCaseIDs: number[], iDatasetName: string, iCollectionName: string) {
		// console.log(`iCaseIDs = ${iCaseIDs}`)
		const tPromises = iCaseIDs.map(async (iID) => {
			const tResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${iDatasetName}].collection[${iCollectionName}].caseByID[${iID}]`
			}).catch(reason => {
				console.log('Unable to get child case because', reason)
			})
			return tResult.success ? tResult.values.case.values : {}
		})
		// console.log(`In getChildCases, children = ${JSON.stringify(children)}`)
		return await Promise.all(tPromises)
	}

	/**
	 * If the Features dataset has cases selected, for each selected case
	 * 	- Pull out the array of 'usages' - the the case IDs of the cases in the dataset being analyzed
	 * 	- Select these cases in that dataset
	 * 	- Pull the phrase from the target case
	 */
	async handleFeatureSelection(iCases: Case[]) {

		async function getFeatureCaseByID(iID: number) {
			const tResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${tFeatureDatasetName}].collection[${tFeatureCollectionName}].caseByID[${iID}]}`
			})
			return tResult.success && tResult.values && tResult.values.case
		}

		async function handleSelectionInFeaturesDataset() {
			if (tIDsOfFeaturesToSelect.length > 0) {
				await deselectAllCasesIn(tFeatureDatasetName)
				// Select the features
				await codapInterface.sendRequest({
					action: 'create',
					resource: `dataContext[${tFeatureDatasetName}].selectionList`,
					values: tIDsOfFeaturesToSelect
				});
			}
		}

		const tUseTestingDataset = this.uiStore.getSelectedPanelTitle() === 'Testing' &&
				this.domainStore.testingStore.testingDatasetInfo.name !== '' &&
				this.domainStore.testingStore.testingAttributeName !== '' &&
				!this.domainStore.testingStore.currentTestingResults.testBeingConstructed,
			tStore = tUseTestingDataset ? this.domainStore.testingStore : this.domainStore.targetStore,
			kMaxStatementsToDisplay = 40,
			tDatasetName = tUseTestingDataset ? tStore.testingDatasetInfo.name : tStore.targetDatasetInfo.name,
			tDatasetTitle = tUseTestingDataset ? tStore.testingDatasetInfo.title : tStore.targetDatasetInfo.title,
			tCollectionName = tUseTestingDataset ? tStore.testingCollectionName : tStore.targetCollectionName,
			tAttributeName = tUseTestingDataset ? tStore.testingAttributeName : tStore.targetAttributeName,
			tFeatureDatasetName = this.domainStore.featureStore.featureDatasetInfo.datasetName,
			tFeatureCollectionName = this.domainStore.featureStore.featureDatasetInfo.collectionName,
			tClassAttributeName = tUseTestingDataset ? tStore.testingClassAttributeName : tStore.targetClassAttributeName,
			tActiveModelName = this.domainStore.trainingStore.getFirstActiveModelName(),
			tPredictedLabelAttributeName = this.domainStore.targetStore.targetPredictedLabelAttributeName,
			tColumnFeatureNames = this.domainStore.featureStore.targetColumnFeatureNames,
			tConstructedFeatureNames = this.domainStore.featureStore.features.map(iFeature => iFeature.name),
			tFeatures: string[] = [],
			tUsedIDsSet: Set<number> = new Set(),
			tChildOfFeatureIsSelected = Boolean(iCases && iCases.length > 0 && iCases[0].parent),
			tIDsOfFeaturesToSelect: number[] = []
		let tEndPhrase: string;
		for (const iCase of iCases) {
			const tFeatureCase = tChildOfFeatureIsSelected ? await getFeatureCaseByID(Number(iCase.parent)) : iCase,
				tUsages = tFeatureCase && tFeatureCase.values.usages;
			if (tChildOfFeatureIsSelected && tFeatureCase)
				tIDsOfFeaturesToSelect.push(tFeatureCase.id)
			if (typeof tUsages === 'string' && tUsages.length > 0) {
				(JSON.parse(tUsages)).forEach((anID: number) => {
					tUsedIDsSet.add(anID);
				});
			}
			if (tFeatureCase)
				tFeatures.push(tFeatureCase.values.name);
		}
		handleSelectionInFeaturesDataset()
		const tUsedCaseIDs: number[] = Array.from(tUsedIDsSet);
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
			const tGetCaseResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${tDatasetName}].collection[${tCollectionName}].caseByID[${tUsedCaseIDs[i]}]`
			})
			if( tGetCaseResult.success && tGetCaseResult.values) {
				const tChildren = await this.getChildCases(tGetCaseResult.values.case.children, tDatasetName, 'results'),
					tFoundChild = tChildren.find(iChild => iChild['model name'] === tActiveModelName),
					tPredictedClass = tFoundChild ? tFoundChild[tPredictedLabelAttributeName] : '',
					tActualClass = tGetCaseResult.values.case.values[tClassAttributeName],
					tPhrase = tGetCaseResult.values.case.values[tAttributeName],
					tTriple = {actual: tActualClass, predicted: tPredictedClass, phrase: tPhrase}
				tTriples.push((tTriple));
			}
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
	public async handleTargetDatasetSelection(iCases: Case[]) {
		const this_ = this

		async function getTargetCaseByID(iID: number) {
			const tResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${tDatasetName}].collection[${tCollectionName}].caseByID[${iID}]}`
			})
			return tResult.values.case
		}

		async function getMatchingChildCase(iCase: Case) {
			const tCaseByID = await getTargetCaseByID(iCase.id),
				tChildCaseIDs = tCaseByID.children,
				tChildren = tChildCaseIDs ? await this_.getChildCases(tChildCaseIDs, tDatasetName, 'results') : null
			console.log(`In getMatchingChildCase, iCase.id = ${iCase.id}; tChildCaseIDs = ${tChildCaseIDs}`)
			console.log(`In getMatchingChildCase, tChildren = ${JSON.stringify(tChildren)}`)
			if (tChildren)
				return tChildren.find(iCase => iCase['model name'] === tActiveModelName)
		}

		async function handleSelectionInFeaturesDataset() {
			// console.log(`In handleSelectionInFeaturesDataset with ${tFeatureDatasetName}`)
			await deselectAllCasesIn(tFeatureDatasetName)
			if (tIDsOfFeaturesToSelect.length > 0) {
				// Select the features
				await codapInterface.sendRequest({
					action: 'create',
					resource: `dataContext[${tFeatureDatasetName}].selectionList`,
					values: tIDsOfFeaturesToSelect
				});
			}

			let tSelectedFeatureCases: any[] = [],
				tFeatures = new Set<string>()
			if (this_.domainStore.featureStore.features.length > 0) {
				// Get the features and stash them in a set
				tSelectedFeatureCases = await getSelectedCasesFrom(tFeatureDatasetName, tFeatureCollectionName)
				tSelectedFeatureCases.forEach((iCase: any) => {
					tFeatures.add(iCase.values.name);
				});
				tFeatures.forEach(iFeature => {
					tFeaturesArray.push(iFeature);
				});
			}
		}

		async function handleSelectionInTargetDataset() {
			if (tIDsOfParentCasesToSelect.length > 0) {
				await codapInterface.sendRequest({
					action: 'create',
					resource: `dataContext[${tDatasetName}].selectionList`,
					values: tIDsOfParentCasesToSelect
				});
			}
		}

		const tUseTestingDataset = this.uiStore.getSelectedPanelTitle() === 'Testing' &&
				this.domainStore.testingStore.testingDatasetInfo.name !== '' &&
				this.domainStore.testingStore.testingAttributeName !== '',
			tStore = tUseTestingDataset ? this.domainStore.testingStore : this.domainStore.targetStore,
			tDatasetName = tUseTestingDataset ? tStore.testingDatasetInfo.name : tStore.targetDatasetInfo.name,
			tCollectionName = tUseTestingDataset ? tStore.testingCollectionName : tStore.targetCollectionName,
			tDatasetTitle = tUseTestingDataset ? tStore.testingDatasetInfo.title : tStore.targetDatasetInfo.title,
			tActiveModelName = this.domainStore.trainingStore.getFirstActiveModelName(),
			tAttributeName = tUseTestingDataset ? tStore.testingAttributeName : tStore.targetAttributeName,
			tFeatureDatasetName = this.domainStore.featureStore.featureDatasetInfo.datasetName,
			tFeatureCollectionName = this.domainStore.featureStore.featureDatasetInfo.collectionName,
			tClassAttributeName = tUseTestingDataset ? tStore.testingClassAttributeName : tStore.targetClassAttributeName,
			tPredictedLabelAttributeName = this.domainStore.targetStore.targetPredictedLabelAttributeName,
			tChildSelected = Boolean(iCases.length > 0 && iCases[0].parent),
			tColumnFeatureNames = this.domainStore.featureStore.targetColumnFeatureNames,
			tConstructedFeatureNames = this.domainStore.featureStore.features.map(iFeature => iFeature.name),
			tFeaturesArray: string[] = []

		let tTriples: PhraseTriple[] = [],
			tIDsOfFeaturesToSelect: number[] = [],
			tIDsOfParentCasesToSelect: number[] = [];
		for (const iCase of iCases) {
			const tCaseToUseForPhrase = tChildSelected ? await getTargetCaseByID(Number(iCase.parent)) : iCase,
				tCaseToUseForPredicted = tChildSelected ? iCase.values : await getMatchingChildCase(iCase)
			if (tCaseToUseForPhrase) {
				if (tChildSelected) {
					tIDsOfParentCasesToSelect.push(tCaseToUseForPhrase.id)
				}
				if (tCaseToUseForPhrase.values.featureIDs) {
					let tFeatureIDs: number[] = JSON.parse(tCaseToUseForPhrase.values.featureIDs);
					tIDsOfFeaturesToSelect = tIDsOfFeaturesToSelect.concat(tFeatureIDs);
				}
				tTriples.push({
					actual: tCaseToUseForPhrase.values[tClassAttributeName],
					predicted: tCaseToUseForPredicted ? tCaseToUseForPredicted[tPredictedLabelAttributeName] : '',
					phrase: tCaseToUseForPhrase.values[tAttributeName]
				});
			}
		}
		await handleSelectionInTargetDataset()
		if (await datasetExists(tFeatureDatasetName))
			await handleSelectionInFeaturesDataset()
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

