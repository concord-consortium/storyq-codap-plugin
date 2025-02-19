/**
 * The TextFeedbackManager displays phrases in a text component based on user selection of target phrases
 * or features of the model. Instantiating the class sets up a codap notification handler, after which point
 * there is no need to reference the instance.
 */

import { Descendant } from "@concord-consortium/slate-editor";
import { datasetExists, getCaseValues, getSelectedCasesFrom } from "../lib/codap-helper";
import codapInterface, { CODAP_Notification } from "../lib/CodapInterface";
import { featureStore } from "../stores/feature_store";
import { targetStore } from "../stores/target_store";
import { testingStore } from "../stores/testing_store";
import { textStore } from "../stores/text_store";
import { trainingStore } from "../stores/training_store";
import { uiStore } from "../stores/ui_store";
import { APIRequest, GetCaseByIDResponse, GetSelectionListResponse } from "../types/codap-api-types";
import { HighlightFunction, phraseToFeatures, textToObject } from "../utilities/utilities";
import { ClassLabel, HeadingsManager, PhraseQuadruple } from "./headings_manager";

export function setupTextFeedbackManager() {
	return new TextFeedbackManager();
}

export class TextFeedbackManager {
	headingsManager: HeadingsManager;
	isSelectingFeatures = false;
	isSelectingTargetPhrases = false;

	constructor() {
		this.handleNotification = this.handleNotification.bind(this);
		this.headingsManager = new HeadingsManager();
		codapInterface.on('notify', '*', 'selectCases', this.handleNotification);
	}

	async handleNotification(iNotification: CODAP_Notification) {
		const tTargetDatasetName = targetStore.targetDatasetInfo.name,
			tTestingDatasetName = testingStore.testingDatasetInfo.name,
			tFeatureDatasetName = featureStore.featureDatasetInfo.datasetName;

		const { values } = iNotification;
		const operation = Array.isArray(values) ? values[0].operation : values.operation;
		if (iNotification.action === 'notify' && operation === 'selectCases') {
			try {
				const tDataContextName = iNotification.resource && iNotification.resource.match(/\[(.+)]/)?.[1];
				if (tDataContextName) {
					if (tDataContextName === tFeatureDatasetName && !this.isSelectingFeatures) {
						this.isSelectingTargetPhrases = true;
						await this.handleFeatureSelection();
						this.isSelectingTargetPhrases = false;
					} else if (
						[tTestingDatasetName, tTargetDatasetName].includes(tDataContextName) && !this.isSelectingTargetPhrases
					) {
						this.isSelectingFeatures = true;
						await this.handleTargetDatasetSelection();
						this.isSelectingFeatures = false;
					}
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
		this.headingsManager.setupHeadings(
			targetStore.getClassName('negative'),
			targetStore.getClassName('positive'),
			'', 'Actual', 'Predicted'
		);
		return this.headingsManager;
	}

	async getChildCases(iCaseIDs: number[], iDatasetName: string, iCollectionName: string) {
		const tPromises = iCaseIDs.map(async (iID) => {
			const tResult = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${iDatasetName}].collection[${iCollectionName}].caseByID[${iID}]`
			}).catch(reason => {
				console.log('Unable to get child case because', reason);
			}) as GetCaseByIDResponse;
			return tResult.success && tResult.values ? tResult.values.case.values : {}
		});
		return await Promise.all(tPromises);
	}

	/**
	 * If the Features dataset has cases selected, for each selected case
	 * 	- Pull out the array of 'usages' - the the case IDs of the cases in the dataset being analyzed
	 * 	- Select these cases in that dataset
	 * 	- Pull the phrase from the target case
	 */
	async handleFeatureSelection() {
		const tUseTestingDataset = uiStore.selectedPanelTitle === 'Testing' &&
				testingStore.testingDatasetInfo.name !== '' &&
				testingStore.testingAttributeName !== '' &&
				!testingStore.currentTestingResults.testBeingConstructed,
			tDatasetName = tUseTestingDataset
				? testingStore.testingDatasetInfo.name : targetStore.targetDatasetInfo.name,
			tDatasetTitle = tUseTestingDataset
				? testingStore.testingDatasetInfo.title : targetStore.targetDatasetInfo.title,
			tCollectionName = tUseTestingDataset
				? testingStore.testingCollectionName : targetStore.targetCollectionName,
			tAttributeName = tUseTestingDataset
				? testingStore.testingAttributeName : targetStore.targetAttributeName,
			{ collectionName, datasetName } = featureStore.featureDatasetInfo,
			tClassAttributeName = tUseTestingDataset
				? testingStore.testingClassAttributeName : targetStore.targetClassAttributeName,
			tPredictedLabelAttributeName = targetStore.targetPredictedLabelAttributeName,
			tColumnFeatureNames = featureStore.targetColumnFeatureNames,
			tConstructedFeatureNames = featureStore.features.map(iFeature => iFeature.name),
			tFeaturesMap: Record<number, string> = {},
			tSelectedFeaturesSet: Set<number> = new Set(),
			tUsedIDsSet: Set<number> = new Set(),
			// Get all the selected cases in the Features dataset. Some will be features and some will be weights
			tSelectionListResult = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${datasetName}].selectionList`
			}) as GetSelectionListResponse,
			tCaseRequests: APIRequest[] = [];

		async function handleSelectionInFeaturesDataset() {
			if (tIDsOfFeaturesToSelect.length > 0) {
				// Select the features
				await codapInterface.sendRequest({
					action: 'create',
					resource: `dataContext[${datasetName}].selectionList`,
					values: tIDsOfFeaturesToSelect
				});
			}
		}

		// If we have a testing dataset but no test has been run, we're done
		if (tUseTestingDataset && testingStore.testingResultsArray.length === 0) {
			return;
		}

		// For the features, we just need to record their caseIDs. For the weights, we record a request to get parents
		if (tSelectionListResult.success && tSelectionListResult.values) {
			tSelectionListResult.values.forEach(iValue => {
				if (iValue.collectionName === collectionName) {
					tSelectedFeaturesSet.add(iValue.caseID);
				} else {
					tCaseRequests.push({
						action: 'get',
						resource: `dataContext[${datasetName}].collection[${iValue.collectionName}].caseByID[${iValue.caseID}]`
					});
				}
			})
		}
		// Get the parents
		if (tCaseRequests.length > 0) {
			const tCaseResults = await codapInterface.sendRequest(tCaseRequests) as GetCaseByIDResponse[];
			tCaseResults.forEach(iResult => {
				if (iResult.success && iResult.values?.case.parent) {
					tSelectedFeaturesSet.add(iResult.values.case.parent);
				}
			})
		}
		const tIDsOfFeaturesToSelect = Array.from(tSelectedFeaturesSet)
		// We need all the features as cases so we can get their used caseIDs from the target dataset
		const tFeatureCasesResult = await codapInterface.sendRequest(
			tIDsOfFeaturesToSelect.map(iID => {
				return {
					action: 'get',
					resource: `dataContext[${datasetName}].collection[${collectionName}].caseByID[${iID}]`
				};
			})
		) as GetCaseByIDResponse[];
		// If we're using the testing dataset, we go through each of the target phrases and pull out the case IDs
		// of the cases that use the selected features. We determine this by looking at the featureIDs attribute
		// of each target phrase case and checking whether that array contains any of the selected feature IDs.
		if (tUseTestingDataset) {
			const tTestCases = await getCaseValues(tDatasetName, tCollectionName);
			tTestCases.forEach(iCase => {
				const tFeatureIDs = iCase.values.featureIDs
				if (typeof tFeatureIDs === 'string' && tFeatureIDs.length > 0) {
					const featureIDsJSON = JSON.parse(tFeatureIDs);
					if (Array.isArray(featureIDsJSON)) {
						featureIDsJSON.forEach(anID => {
							if (typeof anID === "number" && tIDsOfFeaturesToSelect.includes(anID)) {
								tUsedIDsSet.add(iCase.id);
							}
						});
					}
				}
			});
		} else {
			// For each selected feature stash its usages and name
			tFeatureCasesResult.forEach(iResult => {
				if (iResult.success && iResult.values) {
					const tUsages = iResult.values.case.values.usages
					if (typeof tUsages === 'string' && tUsages.length > 0) {
						const usagesJSON = JSON.parse(tUsages);
						if (Array.isArray(usagesJSON)) {
							usagesJSON.forEach(anID => {
								if (typeof anID === "number") tUsedIDsSet.add(anID);
							});
						}
						tFeaturesMap[iResult.values.case.id] = String(iResult.values.case.values.name);
						const childID = iResult.values.case.children[0];
						if (childID) tFeaturesMap[childID] = String(iResult.values.case.values.name);
					}
				}
			});
		}

		await handleSelectionInFeaturesDataset();

		// Select the target texts that make use of the selected features
		const tUsedCaseIDs = Array.from(tUsedIDsSet);
		await codapInterface.sendRequest({
			action: 'create',
			resource: `dataContext[${tDatasetName}].selectionList`,
			values: tUsedCaseIDs
		});
		const tQuadruples: PhraseQuadruple[] = [];
		// Here is where we put the contents of the text component together
		tUsedCaseIDs.forEach(async caseId => {
			const tGetCaseResult = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${tDatasetName}].collection[${tCollectionName}].caseByID[${caseId}]`
			}) as GetCaseByIDResponse,
				tFeatureIDs: number[] = [];
			if (tGetCaseResult.success && tGetCaseResult.values) {
				const tFeatureValue = tGetCaseResult.values.case.values.featureIDs;
				if (typeof tFeatureValue === 'string' && tFeatureValue.length > 0) {
					const caseFeatureIDs = JSON.parse(tFeatureValue);
					if (Array.isArray(caseFeatureIDs)) {
						caseFeatureIDs.forEach(iValue => {
							if (typeof iValue === 'number' || typeof iValue === 'string') tFeatureIDs.push(Number(iValue));
						});
					}
				}

				const tChildren = await this.getChildCases(tGetCaseResult.values.case.children, tDatasetName, 'results'),
					tFoundChild = tChildren.find(iChild => iChild['model name'] === trainingStore.firstActiveModelName),
					tPredictedClass = tFoundChild ? tFoundChild[tPredictedLabelAttributeName] : '',
					tActualClass = tGetCaseResult.values.case.values[tClassAttributeName],
					tPhrase = tGetCaseResult.values.case.values[tAttributeName],
					tQuadruple = {
						actual: String(tActualClass), predicted: String(tPredictedClass), phrase: String(tPhrase),
						nonNtigramFeatures: tFeatureIDs.map(anID => tFeaturesMap[anID])
					};
				tQuadruples.push(tQuadruple);
			}
		});
		await this.retitleTextComponent(`Selected texts in ${tDatasetTitle}`);
		await this.composeText(tQuadruples, textToObject, tColumnFeatureNames.concat(tConstructedFeatureNames));
	}

	/**
	 * First, For each selected target phrase, select the cases in the Feature dataset that contain the target
	 * case id.
	 * Second, under headings for the classification, display each selected target phrase as text with
	 * features highlighted and non-features grayed out
	 */
	public async handleTargetDatasetSelection() {
		async function handleSelectionInFeaturesDataset() {
			// Select the features or, possibly, deselect all features
			await codapInterface.sendRequest({
				action: 'create',
				resource: `dataContext[${datasetName}].selectionList`,
				values: tIDsOfFeaturesToSelect
			});

			if (featureStore.features.length > 0) {
				// Get the features and stash them in a set
				const tSelectedFeatureCases = await getSelectedCasesFrom(datasetName, collectionName);
				tSelectedFeatureCases.forEach(iCase => {
					// This used to use the caseId, but the featureIDs saved in the training cases are item ids.
					// I'm using item ids here now, but it's possible they should both use case ids instead.
					const itemId = iCase.children[0];
					if (itemId) tFeaturesMap[Number(itemId)] = String(iCase.values.name);
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

		const tUseTestingDataset = uiStore.selectedPanelTitle === 'Testing' &&
				testingStore.testingDatasetInfo.name !== '' &&
				testingStore.testingAttributeName !== '',
			tDatasetName = tUseTestingDataset
				? testingStore.testingDatasetInfo.name : targetStore.targetDatasetInfo.name,
			tCollectionName = tUseTestingDataset
				? testingStore.testingCollectionName : targetStore.targetCollectionName,
			tDatasetTitle = tUseTestingDataset
				? testingStore.testingDatasetInfo.title : targetStore.targetDatasetInfo.title,
			tAttributeName = tUseTestingDataset
				? testingStore.testingAttributeName : targetStore.targetAttributeName,
			{ collectionName, datasetName } = featureStore.featureDatasetInfo,
			tClassAttributeName = tUseTestingDataset
				? testingStore.testingClassAttributeName : targetStore.targetClassAttributeName,
			tPredictedLabelAttributeName = targetStore.targetPredictedLabelAttributeName,
			tColumnFeatureNames = featureStore.targetColumnFeatureNames,
			tConstructedFeatureNames = featureStore.features.map(iFeature => iFeature.name),
			tFeaturesMap: Record<number, string> = {},
			// Get all the selected cases in the target dataset. Some will be results and some will be texts
			tSelectionListResult = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${tDatasetName}].selectionList`
			}) as GetSelectionListResponse,
			tSelectedTextsSet: Set<number> = new Set(),
			tCaseRequests: APIRequest[] = [],
			tFeatureIDsSet: Set<number> = new Set(),
			tQuadruples: PhraseQuadruple[] = [];


		// For the texts, we just need to record their caseIDs. For the results, we record a request to get parents
		if (tSelectionListResult.success && tSelectionListResult.values) {
			tSelectionListResult.values.forEach(iValue => {
				if (iValue.collectionName === tCollectionName) {
					tSelectedTextsSet.add(iValue.caseID);
				} else {
					tCaseRequests.push({
						action: 'get',
						resource: `dataContext[${tDatasetName}].collection[${iValue.collectionName}].caseByID[${iValue.caseID}]`
					});
				}
			});
		}
		// Get the parents
		if (tCaseRequests.length > 0) {
			const tCaseResults = await codapInterface.sendRequest(tCaseRequests) as GetCaseByIDResponse[];
			tCaseResults.forEach(iResult => {
				if (iResult.success && iResult.values && iResult.values.case.parent != null) {
					tSelectedTextsSet.add(iResult.values.case.parent);
				}
			});
		}
		const tIDsOfTextsToSelect = Array.from(tSelectedTextsSet);
		// We need all the texts as cases so we can get their used caseIDs from the target dataset
		const tTextCasesResult = await codapInterface.sendRequest(
			tIDsOfTextsToSelect.map(iID => {
				return {
					action: 'get',
					resource: `dataContext[${tDatasetName}].collection[${tCollectionName}].caseByID[${iID}]`
				};
			})
		) as GetCaseByIDResponse[];
		// For each selected text stash its list of features, and stash the phrase, actual and predicted
		// labels in tQuadruples
		tTextCasesResult.forEach(async iResult => {
			if (iResult.success && iResult.values) {
				const tCaseValues = iResult.values.case.values,
					tChildIDs = iResult.values.case.children,
					tFeaturesInText = tCaseValues.featureIDs;
				let tFeatureIDsForThisText: (number | string)[] = [],
					tPredictedResult = '';
				if (typeof tFeaturesInText === 'string' && tFeaturesInText.length > 0) {
					const tFeaturesInTextJSON = JSON.parse(tFeaturesInText);
					if (Array.isArray(tFeaturesInTextJSON)) {
						tFeatureIDsForThisText = tFeaturesInTextJSON.map(id => String(id));
						tFeatureIDsForThisText.forEach((anID: string | number) => {
							tFeatureIDsSet.add(Number(anID));
						})
					}
				}
				// If we're using the testing dataset, the predicted value belongs is to be found
				// in tCaseValues
				if (tUseTestingDataset) {
					tPredictedResult = String(tCaseValues[tPredictedLabelAttributeName]) || '';
				} else {
					// The predicted value, if there is one, belongs to the child case that has the correct
					// model name
					if (tChildIDs && tChildIDs.length > 0) {
						const tChildRequests = tChildIDs.map((iID: number) => {
								return {
									action: 'get',
									resource: `dataContext[${tDatasetName}].collection[results].caseByID[${iID}]`
								}
							}),
							tChildRequestResults = await codapInterface.sendRequest(tChildRequests) as GetCaseByIDResponse[],
							tFoundChild = tChildRequestResults.find(iChildResult => {
								return iChildResult.success && iChildResult.values &&
									iChildResult.values.case.values['model name'] === trainingStore.firstActiveModelName;
							})
						if (tFoundChild?.values) {
							tPredictedResult = String(tFoundChild.values.case.values[tPredictedLabelAttributeName]);
						}
					}
				}

				tQuadruples.push({
					phrase: String(tCaseValues[tAttributeName]),
					predicted: tPredictedResult,
					actual: String(tCaseValues[tClassAttributeName]),
					nonNtigramFeatures: tFeatureIDsForThisText	// Numbers for now. Strings later
				});
			}
		});

		const tIDsOfFeaturesToSelect: number[] = Array.from(tFeatureIDsSet),
			tIDsOfParentCasesToSelect: number[] = Array.from(tSelectedTextsSet);
		await handleSelectionInTargetDataset();
		if (await datasetExists(datasetName))
			await handleSelectionInFeaturesDataset();

		// We can now convert each quad's array of feature IDs to features
		tQuadruples.forEach(iQuad => {
			iQuad.nonNtigramFeatures = iQuad.nonNtigramFeatures.map(iID => tFeaturesMap[Number(iID)]);
		});

		await this.retitleTextComponent(`Selected texts in ${tDatasetTitle}`);
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
	public async composeText(
		iPhraseQuadruples: PhraseQuadruple[], iHighlightFunc: HighlightFunction, iSpecialFeatures: string[]
	) {
		const kHeadingsManager = this.getHeadingsManager();
		const kProps =
			['negNeg', 'negPos', 'negBlank', 'posNeg', 'posPos', 'posBlank', 'blankNeg', 'blankPos', 'blankBlank'];
		const tClassItems: Record<string, Descendant[]> = {};
		kProps.forEach(iProp => tClassItems[iProp] = []);
		let tItems: Descendant[] = [];


		function addOnePhrase(iQuadruple: PhraseQuadruple) {
			const kLabels: ClassLabel = kHeadingsManager.classLabels;

			let tGroup: string,
				tColor: string;
			switch (iQuadruple.actual) {
				case kLabels.negLabel:
					switch (iQuadruple.predicted) {
						case kLabels.negLabel:
							tGroup = 'negNeg';
							tColor = kHeadingsManager.colors.green;
							break;
						case kLabels.posLabel:
							tGroup = 'negPos';
							tColor = kHeadingsManager.colors.red;
							break;
						default:
							tGroup = 'negBlank';
							tColor = kHeadingsManager.colors.red;
					}
					break;
				case kLabels.posLabel:
					switch (iQuadruple.predicted) {
						case kLabels.negLabel:
							tGroup = 'posNeg';
							tColor = kHeadingsManager.colors.red;
							break;
						case kLabels.posLabel:
							tGroup = 'posPos';
							tColor = kHeadingsManager.colors.green;
							break;
						default:
							tGroup = 'posBlank';
							tColor = kHeadingsManager.colors.green;
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
							tGroup = 'blankBlank';
							tColor = '#FFFF00';
					}
			}
			const tSquare: Descendant[] = [{
				text: tGroup !== kProps[kProps.length - 1] ? '■ ' : '', // Don't add the square if we're in 'blankBlank'
				color: tColor
			}];
			tClassItems[tGroup].push({
				type: 'list-item',
				children: tSquare.concat(iHighlightFunc(iQuadruple.phrase, iQuadruple.nonNtigramFeatures, iSpecialFeatures))
			});
		}

		iPhraseQuadruples.forEach(iTriple => addOnePhrase(iTriple));

		// The phrases are all in their groups. Create the array of group objects
		kProps.forEach(iProp => {
			const tPhrases = tClassItems[iProp];
			if (tPhrases.length !== 0) {
				const tHeadingItems = [
					kHeadingsManager.getHeading(iProp),
					{
						type: 'bulleted-list',
						children: tPhrases
					}
				];
				tItems = tItems.concat(tHeadingItems);
			}
		});
		if (tItems.length === 0) {
			textStore.clearText();
		} else {
			// Send it all off to the text object
			await codapInterface.sendRequest({
				action: 'update',
				resource: `component[${textStore.textComponentID}]`,
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
			});
		}
	}

	async retitleTextComponent(iTitle: string) {
		await codapInterface.sendRequest({
			action: 'update',
			resource: `component[${textStore.textComponentID}]`,
			values: {
				title: iTitle
			}
		});
	}
}
