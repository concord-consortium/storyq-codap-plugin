/**
 * The TextFeedbackManager displays phrases in a text component based on user selection of target phrases
 * or features of the model.
 */

import codapInterface, {CODAP_Notification} from "../lib/CodapInterface";
import {ClassLabel, HeadingsManager, HeadingSpec, PhraseQuadruple} from "./headings_manager";
import {datasetExists, getSelectedCasesFrom} from "../lib/codap-helper";
import {phraseToFeatures, textToObject} from "../utilities/utilities";
import {DomainStore} from "../stores/domain_store";
import {UiStore} from "../stores/ui_store";

export default class TextFeedbackManager {

	domainStore: DomainStore
	uiStore: UiStore
	headingsManager: HeadingsManager
	isSelectingFeatures = false
	isSelectingTargetPhrases = false

	constructor(iDomainStore: DomainStore, iUiStore: UiStore) {
		this.handleNotification = this.handleNotification.bind(this)
		this.domainStore = iDomainStore;
		this.uiStore = iUiStore;
		this.headingsManager = new HeadingsManager();
		codapInterface.on('notify', '*', 'selectCases', this.handleNotification);
	}

	async handleNotification(iNotification: CODAP_Notification) {
		const tTargetDatasetName = this.domainStore.targetStore.targetDatasetInfo.name,
			tTestingDatasetName = this.domainStore.testingStore.testingDatasetInfo.name,
			tFeatureDatasetName = this.domainStore.featureStore.featureDatasetInfo.datasetName

		if (iNotification.action === 'notify' && iNotification.values.operation === 'selectCases'/* &&
			iNotification.values.result.cases*/) {
			try {
				const tDataContextName = iNotification.resource && iNotification.resource.match(/\[(.+)]/)[1];
				if (tDataContextName === tFeatureDatasetName && !this.isSelectingFeatures) {
					this.isSelectingTargetPhrases = true;
					await this.handleFeatureSelection();
					this.isSelectingTargetPhrases = false;
				} else if ([tTestingDatasetName, tTargetDatasetName].includes(tDataContextName) && !this.isSelectingTargetPhrases) {
					this.isSelectingFeatures = true;
					await this.handleTargetDatasetSelection();
					this.isSelectingFeatures = false;
				}
			} finally {
				this.isSelectingFeatures = false
				this.isSelectingTargetPhrases = false
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
		const tPromises = iCaseIDs.map(async (iID) => {
			const tResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${iDatasetName}].collection[${iCollectionName}].caseByID[${iID}]`
			}).catch(reason => {
				console.log('Unable to get child case because', reason)
			})
			return tResult.success ? tResult.values.case.values : {}
		})
		return await Promise.all(tPromises)
	}

	/**
	 * If the Features dataset has cases selected, for each selected case
	 * 	- Pull out the array of 'usages' - the the case IDs of the cases in the dataset being analyzed
	 * 	- Select these cases in that dataset
	 * 	- Pull the phrase from the target case
	 */
	async handleFeatureSelection() {

		async function handleSelectionInFeaturesDataset() {
			if (tIDsOfFeaturesToSelect.length > 0) {
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
			tFeaturesMap: {[index:number]:string} = {},
			tSelectedFeaturesSet: Set<number> = new Set(),
			tUsedIDsSet: Set<number> = new Set(),
			// Get all the selected cases in the Features dataset. Some will be features and some will be weights
			tSelectionListResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${tFeatureDatasetName}].selectionList`
			}),
			tCaseRequests: { action: string, resource: string }[] = []

		// For the features, we just need to record their caseIDs. For the weights, we record a request to get parents
		tSelectionListResult.values.forEach((iValue: any) => {
			if (iValue.collectionName === tFeatureCollectionName) {
				tSelectedFeaturesSet.add(iValue.caseID)
			} else {
				tCaseRequests.push({
					action: 'get',
					resource: `dataContext[${tFeatureDatasetName}].collection[${iValue.collectionName}].caseByID[${iValue.caseID}]`
				})
			}
		})
		// Get the parents
		if (tCaseRequests.length > 0) {
			const tCaseResults: any = await codapInterface.sendRequest(tCaseRequests)
			tCaseResults.forEach((iResult: any) => {
				tSelectedFeaturesSet.add(iResult.values.case.parent)
			})
		}
		const tIDsOfFeaturesToSelect = Array.from(tSelectedFeaturesSet)
		// We need all the features as cases so we can get their used caseIDs from the target dataset
		const tFeatureCasesResult: any = await codapInterface.sendRequest(
			tIDsOfFeaturesToSelect.map(iID => {
				return {
					action: 'get',
					resource: `dataContext[${tFeatureDatasetName}].collection[${tFeatureCollectionName}].caseByID[${iID}]`
				}
			})
		)
		// For each selected feature stash its usages and name
		tFeatureCasesResult.forEach((iResult: any) => {
			const tUsages = iResult.values.case.values.usages
			if (typeof tUsages === 'string' && tUsages.length > 0) {
				(JSON.parse(tUsages)).forEach((anID: number) => {
					tUsedIDsSet.add(anID);
				})
				tFeaturesMap[iResult.values.case.id] = iResult.values.case.values.name
			}
		})

		handleSelectionInFeaturesDataset()
		// Select the target texts that make use of the selected features
		const tUsedCaseIDs: number[] = Array.from(tUsedIDsSet);
		await codapInterface.sendRequest({
			action: 'create',
			resource: `dataContext[${tDatasetName}].selectionList`,
			values: tUsedCaseIDs
		});
		const tQuadruples: PhraseQuadruple[] = [],
			tEndPhrase = (tUsedCaseIDs.length > kMaxStatementsToDisplay) ? 'Not all statements could be displayed' : '';
		const tTargetPhrasesToShow = Math.min(tUsedCaseIDs.length, kMaxStatementsToDisplay);
		// Here is where we put the contents of the text component together
		for (let i = 0; i < tTargetPhrasesToShow; i++) {
			const tGetCaseResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${tDatasetName}].collection[${tCollectionName}].caseByID[${tUsedCaseIDs[i]}]`
			}),
				tFeatureIDs:number[] = []
			if (tGetCaseResult.success && tGetCaseResult.values) {
				const tFeatureValue = tGetCaseResult.values.case.values.featureIDs
				if (typeof tFeatureValue === 'string' && tFeatureValue.length > 0) {
					JSON.parse(tFeatureValue).forEach( (iValue:string | number)=>{
						tFeatureIDs.push(Number(iValue))
					})
				}

				const tChildren = await this.getChildCases(tGetCaseResult.values.case.children, tDatasetName, 'results'),
					tFoundChild = tChildren.find(iChild => iChild['model name'] === tActiveModelName),
					tPredictedClass = tFoundChild ? tFoundChild[tPredictedLabelAttributeName] : '',
					tActualClass = tGetCaseResult.values.case.values[tClassAttributeName],
					tPhrase = tGetCaseResult.values.case.values[tAttributeName],
					tQuadruple = {actual: tActualClass, predicted: tPredictedClass, phrase: tPhrase,
						nonNtigramFeatures: tFeatureIDs.map(anID=>tFeaturesMap[anID])}
				tQuadruples.push((tQuadruple));
			}
		}
		await this.retitleTextComponent(`Selected texts in ${tDatasetTitle}`)
		await this.composeText(tQuadruples, textToObject,
			tColumnFeatureNames.concat(tConstructedFeatureNames), tEndPhrase);
	}

	/**
	 * First, For each selected target phrase, select the cases in the Feature dataset that contain the target
	 * case id.
	 * Second, under headings for the classification, display each selected target phrase as text with
	 * features highlighted and non-features grayed out
	 */
	public async handleTargetDatasetSelection() {
		const this_ = this

		async function handleSelectionInFeaturesDataset() {
			// await deselectAllCasesIn(tFeatureDatasetName)
			if (tIDsOfFeaturesToSelect.length > 0) {
				// Select the features
				await codapInterface.sendRequest({
					action: 'create',
					resource: `dataContext[${tFeatureDatasetName}].selectionList`,
					values: tIDsOfFeaturesToSelect
				});
			}

			let tSelectedFeatureCases: any[] = []
			if (this_.domainStore.featureStore.features.length > 0) {
				// Get the features and stash them in a set
				tSelectedFeatureCases = await getSelectedCasesFrom(tFeatureDatasetName, tFeatureCollectionName)
				tSelectedFeatureCases.forEach((iCase: any) => {
					tFeaturesMap[Number(iCase.id)] = iCase.values.name;
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
			tColumnFeatureNames = this.domainStore.featureStore.targetColumnFeatureNames,
			tConstructedFeatureNames = this.domainStore.featureStore.features.map(iFeature => iFeature.name),
			tFeaturesMap: {[index:number]:string} = {},
			// Get all the selected cases in the target dataset. Some will be results and some will be texts
			tSelectionListResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${tDatasetName}].selectionList`
			}),
			tSelectedTextsSet: Set<number> = new Set(),
			tCaseRequests: { action: string, resource: string }[] = [],
			tFeatureIDsSet: Set<number> = new Set(),
			tQuadruples: PhraseQuadruple[] = []


		// For the texts, we just need to record their caseIDs. For the results, we record a request to get parents
		tSelectionListResult.values.forEach((iValue: any) => {
			if (iValue.collectionName === tCollectionName) {
				tSelectedTextsSet.add(iValue.caseID)
			} else {
				tCaseRequests.push({
					action: 'get',
					resource: `dataContext[${tDatasetName}].collection[${iValue.collectionName}].caseByID[${iValue.caseID}]`
				})
			}
		})
		// Get the parents
		if (tCaseRequests.length > 0) {
			const tCaseResults: any = await codapInterface.sendRequest(tCaseRequests)
			tCaseResults.forEach((iResult: any) => {
				tSelectedTextsSet.add(iResult.values.case.parent)
			})
		}
		const tIDsOfTextsToSelect = Array.from(tSelectedTextsSet)
		// We need all the texts as cases so we can get their used caseIDs from the target dataset
		const tTextCasesResult: any = await codapInterface.sendRequest(
			tIDsOfTextsToSelect.map(iID => {
				return {
					action: 'get',
					resource: `dataContext[${tDatasetName}].collection[${tCollectionName}].caseByID[${iID}]`
				}
			})
		)
		// For each selected text stash its list of features, and stash the phrase, actual and predicted
		// labels in tQuadruples
		tTextCasesResult.forEach(async (iResult: any) => {
			const tCaseValues = iResult.values.case.values,
				tChildIDs = iResult.values.case.children,
				tFeaturesInText = tCaseValues.featureIDs
				let tFeatureIDsForThisText:(number | string)[] = [],
					tPredictedResult = ''
			if (typeof tFeaturesInText === 'string' && tFeaturesInText.length > 0) {
				tFeatureIDsForThisText = JSON.parse(tFeaturesInText)
				tFeatureIDsForThisText.forEach((anID: string | number) => {
					tFeatureIDsSet.add(Number(anID));
				})
			}
			// The predicted value, if there is one, belongs to the child case that has the correct
			// model name
			if (tChildIDs && tChildIDs.length > 0) {
				const tChildRequests = tChildIDs.map((iID: number) => {
						return {
							action: 'get',
							resource: `dataContext[${tDatasetName}].collection[results].caseByID[${iID}]`
						}
					}),
					tChildRequestResults: any = await codapInterface.sendRequest(tChildRequests),
				tFoundChild = tChildRequestResults.find((iChildResult:any)=> {
					return iChildResult.values.case.values['model name'] === tActiveModelName
				})
				tPredictedResult = tFoundChild ? tFoundChild.values.case.values[tPredictedLabelAttributeName] : ''
			}

			tQuadruples.push({
				phrase: tCaseValues[tAttributeName],
				predicted: tPredictedResult,
				actual: tCaseValues[tClassAttributeName],
				nonNtigramFeatures: tFeatureIDsForThisText	// Numbers for now. Strings later
			})
		})


		const tIDsOfFeaturesToSelect: number[] = Array.from(tFeatureIDsSet),
			tIDsOfParentCasesToSelect: number[] = Array.from(tSelectedTextsSet);
		await handleSelectionInTargetDataset()
		if (await datasetExists(tFeatureDatasetName))
			await handleSelectionInFeaturesDataset()

		// We can now convert each quad's array of feature IDs to features
		tQuadruples.forEach(iQuad=>{
			iQuad.nonNtigramFeatures = iQuad.nonNtigramFeatures.map(iID=>{
				return tFeaturesMap[Number(iID)]
			})
		})

		await this.retitleTextComponent(`Selected texts in ${tDatasetTitle}`)
		await this.composeText(tQuadruples, phraseToFeatures, tColumnFeatureNames.concat(tConstructedFeatureNames));
	}

	/**
	 * Cause the text component to display phrases with the feature highlighting determined by
	 * 	given function
	 * @param iPhraseQuadruples  Specifications for the phrases to be displayed
	 * @param iHighlightFunc {Function}	Function called to do the highlighting
	 * @param iSpecialFeatures {string[]} Typically "column features" true of the phrase, but the strings
	 * 					themselves do not appear in the phrase
	 * @param iEndPhrase {string} The text to display at the bottom of the list of phrases
	 * @public
	 */
	public async composeText(iPhraseQuadruples: PhraseQuadruple[], iHighlightFunc: Function,
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


		function addOnePhrase(iQuadruple: PhraseQuadruple) {
			// @ts-ignore
			const kLabels: ClassLabel = kHeadingsManager.classLabels;

			let tGroup: string,
				tColor: string;
			switch (iQuadruple.actual) {
				case kLabels.negLabel:
					switch (iQuadruple.predicted) {
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
					switch (iQuadruple.predicted) {
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
					switch (iQuadruple.predicted) {
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
				children: [tSquare].concat(iHighlightFunc(iQuadruple.phrase, iQuadruple.nonNtigramFeatures, iSpecialFeatures))
			})
		}

		iPhraseQuadruples.forEach(iTriple => {
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

