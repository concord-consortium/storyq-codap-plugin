/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import { makeAutoObservable } from "mobx";
import { getCaseValues, openTable } from "../lib/codap-helper";
import codapInterface from "../lib/CodapInterface";
import { oneHot, wordTokenizer } from "../lib/one_hot";
import {
	APIRequest, BasicCaseInfo, CreateCaseResponse, CreateCaseValue, CreateDataContextResponse,
	GetCaseFormulaSearchResponse, GetItemByCaseIDResponse, GetItemSearchResponse, ItemInfo, ItemValues,
	NotifyDataContextRequest, UpdateCaseRequest, UpdateCaseValue
} from "../types/codap-api-types";
import { getFeatureColor, kNoColor } from "../utilities/color-utils";
import { featureStore, IFeatureStoreJSON } from "./feature_store";
import { defaultTargetCaseFormula, Feature, kFeatureKindNgram, kPosNegConstants } from "./store_types_and_constants";
import { ITargetStoreJSON, otherClassColumn, targetStore } from "./target_store";
import { ITestingStore, testingStore } from "./testing_store";
import { ITextStoreJSON, textStore } from "./text_store";
import { ITrainingStoreSnapshot as ITrainingStoreJSON, trainingStore } from "./training_store";
import { uiStore } from "./ui_store";

export interface IDomainStoreJSON {
	featureStore: IFeatureStoreJSON;
	targetStore: ITargetStoreJSON;
	testingStore: ITestingStore;
	textStore: ITextStoreJSON;
	trainingStore: ITrainingStoreJSON;
}

export class DomainStore {
	constructor() {
		makeAutoObservable(this);
	}

	asJSON(): object {
		return {
			targetStore: targetStore.asJSON(),
			featureStore: featureStore.asJSON(),
			trainingStore: trainingStore.asJSON(),
			testingStore: testingStore.asJSON(),
			textStore: textStore.asJSON()
		};
	}

	async fromJSON(json: {
		targetStore: ITargetStoreJSON, featureStore: IFeatureStoreJSON, trainingStore: ITrainingStoreJSON,
		testingStore: ITestingStore, textStore: ITextStoreJSON
	}) {
		targetStore.fromJSON(json.targetStore);
		featureStore.fromJSON(json.featureStore);
		trainingStore.fromJSON(json.trainingStore);
		testingStore.fromJSON(json.testingStore);
		textStore.fromJSON(json.textStore);

		if (textStore.textComponentID !== -1) {
			await textStore.addTextComponent();	//Make sure it is in the document
		}
		await this.guaranteeFeaturesDataset();
		await testingStore.updateCodapInfoForTestingPanel();
	}

	async guaranteeFeaturesDataset(): Promise<boolean> {
		const { collectionName, datasetName, weightsCollectionName } = featureStore.featureDatasetInfo;

		async function hideWeightsAttributes() {
			const tShowRequests = [{
				action: 'update',
				resource: `dataContext[${datasetName}].collection[${weightsCollectionName}].attribute[weight]`,
				values: {hidden: true}
			},
			{
				action: 'update',
				resource: `dataContext[${datasetName}].collection[${weightsCollectionName}].attribute[model name]`,
				values: {hidden: true}
			}];
			await codapInterface.sendRequest(tShowRequests);
		}

		if (featureStore.features.length > 0) {
			if (featureStore.featureDatasetID === -1) {
				const tChosenClassKey = targetStore.targetChosenClassColumnKey,
					tUnchosenClassKey = otherClassColumn(tChosenClassKey),
					tPositiveAttrName = kPosNegConstants.positive.attrKey + targetStore.getTargetClassName(tChosenClassKey),
					tNegativeAttrName = kPosNegConstants.negative.attrKey + targetStore.getTargetClassName(tUnchosenClassKey),
					tCreateResult = await codapInterface.sendRequest({
						action: 'create',
						resource: 'dataContext',
						values: {
							name: datasetName,
							title: datasetName,
							collections: [{
								name: collectionName,
								title: collectionName,
								attrs: [
									{ name: 'name' },
									{ name: 'chosen', type: 'checkbox', hidden: true },
									{ name: 'color', type: 'color' },
									{ name: 'highlight', type: 'checkbox' },
									{ name: tPositiveAttrName },
									{ name: tNegativeAttrName },
									{ name: 'type', hidden: true },
									/*
																		{name: 'description'},
																		{name: 'formula'},
									*/
									{ name: 'usages', hidden: true }
								]
							},
							{
								name: weightsCollectionName,
								title: weightsCollectionName,
								parent: collectionName,
								attrs: [
									{name: 'model name', type: 'categorical', hidden: false},
									{name: 'weight', precision: 2, hidden: false}
								]
							}]
						}
					}) as CreateDataContextResponse;
				if (tCreateResult.success && tCreateResult.values) {
					featureStore.featureDatasetInfo.datasetID = tCreateResult.values.id;
					featureStore.featureDatasetInfo.datasetName = datasetName;
					featureStore.featureDatasetInfo.datasetTitle = tCreateResult.values.title;
					await openTable(datasetName);
					// The 'model name' and 'weight' attributes were created as visible as a workaround to a bug.
					// Now we can hide them
					await hideWeightsAttributes();
				}
			}
			return true;
		}
		return false;
	}

	async updateNonNtigramFeaturesDataset() {
		interface UpdateRequest {
			values: {
				features: Feature[]
			}
		}
		const tNonNgramFeatures = featureStore.features.filter(iFeature => iFeature.info.kind !== kFeatureKindNgram),
			caseUpdateRequests: Record<string, UpdateRequest> = {},
			tTargetDatasetName = targetStore.targetDatasetInfo.name,
			tTargetCollectionName = targetStore.targetCollectionName;
		let featureDatasetResourceString: string = '';

		async function getExistingFeatureItems(): Promise<ItemInfo[]> {
			const tItemsRequestResult = await codapInterface.sendRequest({
				action: 'get',
				resource: `${featureDatasetResourceString}.itemSearch[*]`
			}) as GetItemSearchResponse;
			if (tItemsRequestResult.success && tItemsRequestResult.values) {
				return tItemsRequestResult.values;
			} else {
				return [];
			}
		}

		function featureDoesNotMatchItem(iItem: Feature, iFeature: ItemValues) {
			return iItem.name.trim() !== iFeature.name.trim() ||
				String(iItem.chosen).trim() !== iFeature.chosen.trim() ||
				String(kPosNegConstants.negative.getStoreKey(iItem)) !== iFeature[kPosNegConstants.negative.attrKey] ||
				String(kPosNegConstants.positive.getStoreKey(iItem)) !== iFeature[kPosNegConstants.positive.attrKey];
		}

		async function updateFrequenciesUsagesAndFeatureIDs() {
			const tChosenClassKey = targetStore.targetChosenClassColumnKey;

			tNonNgramFeatures.forEach(iFeature => {
				iFeature.numberInPositive = 0;
				iFeature.numberInNegative = 0;
				iFeature.usages = [];
			})
			/**
			 * We go through each feature
			 * 		For each target case, if the case has the feature, we increment that feature's positive or negative count
			 * 			as appropriate
			 * 		If the feature is present,
			 * 			- we push the case's ID into the feature's usages
			 * 			- 	we add the feature's case ID to the array of feature IDs for that case
			 */
			const countFeaturePromises = tNonNgramFeatures.map(async (iFeature) => {
				const name = `\`${iFeature.name}\``;
				const targetCaseFormula = iFeature.targetCaseFormula ?? defaultTargetCaseFormula;
				const tTargetCases = await targetStore.updateTargetCases(targetCaseFormula(name));
				tTargetCases.forEach(iCase => {
					if (iCase.values[iFeature.name]) {
						if (iCase.values[targetStore.targetClassAttributeName] === targetStore.getTargetClassName(tChosenClassKey)) {
							iFeature.numberInPositive++;
						} else {
							iFeature.numberInNegative++;
						}
						iFeature.usages.push(iCase.id);
						const iCaseId = `${iCase.id}`;
						if (!caseUpdateRequests[iCaseId]) {
							caseUpdateRequests[iCaseId] = { values: { features: [] } };
						}
						caseUpdateRequests[iCaseId].values.features.push(iFeature);
					}
				});
			});
			await Promise.all(countFeaturePromises);
		}

		if (await this.guaranteeFeaturesDataset()) {
			featureDatasetResourceString = `dataContext[${featureStore.featureDatasetID}]`;

			const tFeatureItems = (await getExistingFeatureItems()).filter(iItem => iItem.values.type !== 'unigram');
			await updateFrequenciesUsagesAndFeatureIDs();
			const tItemsToDelete = tFeatureItems.filter(iItem => {
				return !tNonNgramFeatures.find(iFeature => iFeature.featureItemID === iItem.id);
			});
			const tFeaturesToAdd = tNonNgramFeatures.filter(iFeature => {
				return !tFeatureItems.find(iItem => {
					return iFeature.featureItemID === iItem.id;
				});
			});
			const tFeaturesToUpdate = tNonNgramFeatures.filter(iFeature => {
				const tMatchingItem = tFeatureItems.find(iItem => {
					return iFeature.featureItemID === iItem.id;
				});
				return tMatchingItem && featureDoesNotMatchItem(iFeature, tMatchingItem.values);
			});
			if (tItemsToDelete.length > 0) {
				await codapInterface.sendRequest(
					tItemsToDelete.map(iItem => {
						return {
							action: 'delete',
							resource: `${featureDatasetResourceString}.itemByID[${iItem.id}]`
						};
					})
				);
			}
			if (tFeaturesToAdd.length > 0) {
				const tValues = tFeaturesToAdd.map(iFeature => {
					const tChosenClassKey = targetStore.targetChosenClassColumnKey,
						tUnchosenClassKey = otherClassColumn(tChosenClassKey),
						tPositiveAttrName = kPosNegConstants.positive.attrKey + targetStore.getTargetClassName(tChosenClassKey),
						tNegativeAttrName = kPosNegConstants.negative.attrKey + targetStore.getTargetClassName(tUnchosenClassKey);
					let tValuesObject: { values: { [index: string]: {} } } = {
						values: {
							chosen: iFeature.chosen,
							color: iFeature.color ?? getFeatureColor(),
							highlight: !!iFeature.highlight,
							name: iFeature.name,
							type: iFeature.type,
							/*
														formula: iFeature.formula,
														description: iFeature.description,
							*/
							usages: JSON.stringify(iFeature.usages)
						}
					};
					tValuesObject.values[tPositiveAttrName] = iFeature.numberInPositive;
					tValuesObject.values[tNegativeAttrName] = iFeature.numberInNegative;
					return tValuesObject;
				})
				const tCreateResult = await codapInterface.sendRequest(
					{
						action: 'create',
						resource: `${featureDatasetResourceString}.collection[${featureStore.featureDatasetInfo.collectionName}].case`,
						values: tValues
					}
				) as CreateCaseResponse;
				if (tCreateResult.success && tCreateResult.values) {
					tCreateResult.values.forEach(async (iValue: BasicCaseInfo, iIndex: number) => {
						tFeaturesToAdd[iIndex].caseID = String(iValue.id);
						const tGetItemResult = await codapInterface.sendRequest({
							action: 'get',
							resource: `${featureDatasetResourceString}.itemByCaseID[${iValue.id}]`
						}) as GetItemByCaseIDResponse;
						if (tGetItemResult.success && tGetItemResult.values) {
							tFeaturesToAdd[iIndex].featureItemID = tGetItemResult.values.id;
						}
					});
				}
			}
			if (tFeaturesToUpdate.length > 0) {
				await codapInterface.sendRequest(
					tFeaturesToUpdate.map(iFeature => {
						return {
							action: 'update',
							resource: `${featureDatasetResourceString}.itemByID[${iFeature.caseID}]`,
							values: {
								chosen: iFeature.chosen,
								name: iFeature.name,
								'frequency in positive': iFeature.numberInPositive,
								'frequency in negative': iFeature.numberInNegative
							}
						}
					})
				);
			}
			// We've waited until now to update target cases with feature IDs so that we can be sure
			//	features do have caseIDs to stash in target cases
			const caseUpdateRequestKeys = Object.keys(caseUpdateRequests);
			if (caseUpdateRequestKeys.length > 0) {
				const tValues = caseUpdateRequestKeys.map(iIndex => {
					const iRequest = caseUpdateRequests[iIndex];
					return {
						id: iIndex,
						values: {featureIDs: JSON.stringify(iRequest.values.features.map(iFeature => iFeature.caseID))}
					};
				});
				await codapInterface.sendRequest({
					action: 'update',
					resource: `dataContext[${tTargetDatasetName}].collection[${tTargetCollectionName}].case`,
					values: tValues
				});
			}
		}
	}

	async updateNgramFeatures() {
		if (featureStore.tokenMapAlreadyHasUnigrams) return;

		await targetStore.updateTargetCases();
		const tNgramFeatures = featureStore.features.filter(iFeature => iFeature.info.kind === kFeatureKindNgram);
		await this.guaranteeFeaturesDataset();
		for (const iNtgramFeature of tNgramFeatures) {
			const { collectionName, datasetName } = featureStore.featureDatasetInfo,
				tIgnore = iNtgramFeature.info.ignoreStopWords !== undefined ? iNtgramFeature.info.ignoreStopWords : true,
				tThreshold = (iNtgramFeature.info.frequencyThreshold || 4),
				tTargetAttributeName = targetStore.targetAttributeName,
				tDocuments = targetStore.targetCases.map(iCase => {
					return {
						example: iCase.values[tTargetAttributeName],
						class: iCase.values[targetStore.targetClassAttributeName],
						caseID: Number(iCase.id),
						columnFeatures: {}
					}
				}),
				tChosenClassKey = targetStore.targetChosenClassColumnKey,
				tUnchosenClassKey = otherClassColumn(tChosenClassKey),
				tPositiveAttrName = kPosNegConstants.positive.attrKey + targetStore.getTargetClassName(tChosenClassKey),
				tNegativeAttrName = kPosNegConstants.negative.attrKey + targetStore.getTargetClassName(tUnchosenClassKey);
			// tokenize the target texts
			const tOneHotResult = oneHot({
				frequencyThreshold: tThreshold - 1,
				ignoreStopWords: tIgnore,
				ignorePunctuation: true,
				includeUnigrams: true,
				positiveClass: targetStore.getClassName('positive'),
				negativeClass: targetStore.getClassName('negative'),
				features: []
			}, tDocuments);
			if (!tOneHotResult) return;
			const tTokenArray = tOneHotResult.tokenArray;	// Array of unigram features

			featureStore.setTokenMap(tOneHotResult.tokenMap);
			// Stash tokens in feature dataset
			// if (await this.guaranteeFeaturesDataset()) {
			const tUnigramCreateMsgs: CreateCaseValue[] = [];
			tTokenArray.forEach(iFeature => {
				iFeature.color = iFeature.color !== kNoColor ? iFeature.color : getFeatureColor();
				const tCaseValues: CreateCaseValue = {
					values: {
						chosen: true,
						color: iFeature.color,
						highlight: true,
						name: iFeature.token,
						type: 'unigram',
						/*
												description: `unigram ${tIgnore ? '' : 'not '}ignoring stop words with frequency threshold of ${tThreshold}`,
						*/
						usages: JSON.stringify(iFeature.caseIDs)
					}
				};
				tCaseValues.values[tPositiveAttrName] = iFeature.numPositive;
				tCaseValues.values[tNegativeAttrName] = iFeature.numNegative;
				tUnigramCreateMsgs.push(tCaseValues);
			})
			const tCreateResult = await codapInterface.sendRequest({
				action: 'create',
				resource: `dataContext[${datasetName}].collection[${collectionName}].case`,
				values: tUnigramCreateMsgs
			}) as CreateCaseResponse;
			// Stash the resultant feature case IDs where we can get them to update target cases
			// We make a map with featureCaseID as key and usages as value
			if (tCreateResult.success && tCreateResult.values) {
				tCreateResult.values.forEach((iValue, iIndex) => {
					// tUnigramCreateMsgs[iIndex].featureCaseID = iValue.id
					tTokenArray[iIndex].featureCaseID = iValue.id;
				});
				// Put together update messages for the target cases
				const tUpdateMsgs: UpdateCaseValue[] = [];
				targetStore.targetCases.forEach(iCase => {
					const tTheseFeatureIDs = iCase.values.featureIDs;
					const featureIDs: number[] = tTheseFeatureIDs ? JSON.parse(tTheseFeatureIDs) : [];
					tTokenArray.forEach(iFeature => {
						if (iFeature.caseIDs.indexOf(iCase.id) >= 0 && iFeature.featureCaseID != null) {
							featureIDs.push(iFeature.featureCaseID);
						}
					});
					const tUpdateValue: UpdateCaseValue = { id: iCase.id, values: { featureIDs: JSON.stringify(featureIDs) } };
					tUpdateMsgs.push(tUpdateValue);
				})
				await codapInterface.sendRequest({
					action: 'update',
					resource: `dataContext[${targetStore.targetDatasetInfo.name}].collection[${targetStore.targetCollectionName}].case`,
					values: tUpdateMsgs
				});
			}
		}
	}

	featuresPanelCanBeEnabled() {
		return targetStore.targetAttributeName !== '' && targetStore.targetClassAttributeName !== ''
			&& targetStore.targetChosenClassColumnKey;
	}

	trainingPanelCanBeEnabled() {
		return this.featuresPanelCanBeEnabled() && featureStore.features.length > 0;
	}

	testingPanelCanBeEnabled() {
		return this.trainingPanelCanBeEnabled() && trainingStore.trainingResults.length > 0;
	}

	async setIsActiveForResultAtIndex(iIndex: number, iIsActive: boolean) {
		const tTrainingResults = trainingStore.trainingResults;
		let tNumActive = 0;
		tTrainingResults[iIndex].isActive = iIsActive;
		tTrainingResults.forEach(iResult => {
			tNumActive += iResult.isActive ? 1 : 0
		});
		if (tNumActive === 0) {
			// Always have at least one result active
			let currIndex = iIndex - 1;
			if (currIndex < 0) currIndex = tTrainingResults.length - 1;
			tTrainingResults[currIndex].isActive = true;
		}
		const tFirstActiveResult = tTrainingResults.find(iResult => iResult.isActive),
			tIgnore = tFirstActiveResult ? tFirstActiveResult.ignoreStopWords : true;
		await this.syncWeightsAndResultsWithActiveModels();
		await this.recreateUsagesAndFeatureIDs(tIgnore);
	}

	/**
	 * When the user changes activity status of models, we go into the Features and target datasets and set aside
	 * weights and results for all models not currently active.
	 */
	async syncWeightsAndResultsWithActiveModels() {
		const { trainingResults } = trainingStore;
		if (trainingResults.length === 0) return;

		const { datasetName, weightsCollectionName } = featureStore.featureDatasetInfo,
			tMessages: NotifyDataContextRequest[] = [];
		// Unset-aside all the weights
		await codapInterface.sendRequest({
			action: 'notify',
			resource: `dataContext[${datasetName}]`,
			values: {
				request: "restoreSetasides"
			}
		});

		// Gather all the cases from the weights collection
		const getModelNames = async (_datasetName: string, collectionName: string) => {
			const caseSearchResult = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${_datasetName}].collection[${collectionName}].caseFormulaSearch[true]`
			}) as GetCaseFormulaSearchResponse;
			return caseSearchResult.success && caseSearchResult.values
				? caseSearchResult.values.map((iValue) => {
						return { modelName: String(iValue.values['model name']), id: iValue.id };
					})
				: [];
		};
		const tWeightNameIDPairs = await getModelNames(datasetName, weightsCollectionName);

		// Unset-aside results collection for each training result
		const datasetNames = trainingResults.map(iResult => iResult.targetDatasetName).filter(iName => iName != null),
			datasetNamesSet = new Set(datasetNames),
			uniqueNames = Array.from(datasetNamesSet);
		await codapInterface.sendRequest(uniqueNames.map(iName => {
			return {
				action: 'notify',
				resource: `dataContext[${iName}]`,
				values: {
					request: "restoreSetasides"
				}
			};
		}));
		// All cases are showing. Now figure out which weights and results to set aside
		// First gather all the weight cases with no model name
/*
		const tNoNamePairs = tWeightNameIDPairs.filter(iPair=>iPair.modelName === '')
		tWeightIDsToSetaside = tWeightIDsToSetaside.concat(tNoNamePairs.map(iPair=>iPair.id))
*/
		trainingResults.forEach(async iResult => {
			// First the weights
			if (!iResult.isActive) {
				const tInactiveWeightPairs = tWeightNameIDPairs.filter(iPair => iPair.modelName === iResult.name),
					tWeightIDsToSetaside = tInactiveWeightPairs.map(iPair => iPair.id);
				tMessages.push({
					action: 'notify',
					resource: `dataContext[${datasetName}]`,
					values: {
						request: 'setAside',
						caseIDs: tWeightIDsToSetaside
					}
				});
				// Now the results
				const tDatasetName = iResult.targetDatasetName;
				if (tDatasetName) {
					const tResultNameIDPairs = await getModelNames(tDatasetName, 'results');
					const tInactiveResultPairs = tResultNameIDPairs.filter(iPair => iPair.modelName === iResult.name),
						tResultIDsToSetaside = tInactiveResultPairs.map(iPair => iPair.id);
					tMessages.push({
						action: 'notify',
						resource: `dataContext[${tDatasetName}]`,
						values: {
							request: 'setAside',
							caseIDs: tResultIDsToSetaside
						}
					});
				}
			}
		});

		// Do the setting aside all at once
		await codapInterface.sendRequest(tMessages);
	}

	setPanel(iPanelIndex: number) {
		uiStore.setTabPanelSelectedIndex(iPanelIndex);
		targetStore.updateFromCODAP();
	}

	/**
	 * The end result will be that
	 * 		* target cases featureIDs will be updated
	 * 		* feature cases usages will be updated
	 * 		* The target store's features will get updated IDs for both cases and items
	 * 	 	* The featureStore's tokenMap's tokens get updated array of case IDs and featureIDs
	 */
	async recreateUsagesAndFeatureIDs(iIgnoreStopwords: boolean) {
		const tTargetDatasetName = targetStore.targetDatasetInfo.name,
			{ targetAttributeName, targetCollectionName } = targetStore,
			tTargetCases = await getCaseValues(tTargetDatasetName, targetCollectionName),
			{ collectionName, datasetName } = featureStore.featureDatasetInfo,
			tFeatureCases = await getCaseValues(datasetName, collectionName),
			tUsageResults: Record<number, number[]> = {}, // Contains IDs of target texts that contain a given feature
			tTextResults: Record<number, number[]> = {},	// Contains IDs of features found in a given text
			tFeatureItemRequests: APIRequest[] = [];

		function targetTextHasUnigram(iText: string, iUnigram: string) {
			return wordTokenizer(iText, iIgnoreStopwords, true).indexOf(iUnigram) >= 0;
		}

		tFeatureCases.forEach(iFeatureCase => {
			tFeatureItemRequests.push({
				action:'get', resource:`dataContext[${datasetName}].itemByCaseID[${iFeatureCase.id}]`
			});
			const tFeatureName = iFeatureCase.values.name,
				tFeatureType = iFeatureCase.values.type;

			tTargetCases.forEach(iTargetCase => {
				const tTargetHasFeature = ['constructed', 'column'].includes(tFeatureType)
					? iTargetCase.values[tFeatureName]
					: tFeatureType === 'unigram'
					? targetTextHasUnigram(iTargetCase.values[targetAttributeName], tFeatureName)
					: false;
				if (tTargetHasFeature) {
					if (!tUsageResults[iFeatureCase.id]) tUsageResults[iFeatureCase.id] = [];
					tUsageResults[iFeatureCase.id].push(iTargetCase.id);
					if (!tTextResults[iTargetCase.id]) tTextResults[iTargetCase.id] = [];
					tTextResults[iTargetCase.id].push(iFeatureCase.id);
				}
			})
			// We need to store the featureCaseID in the token map while we've got it
			if (featureStore.tokenMap[tFeatureName]) {
				featureStore.tokenMap[tFeatureName].featureCaseID = iFeatureCase.id;
			}
		});
		// Now we can update the target and feature cases
		const tMsgs: UpdateCaseRequest[] = [
			{
				action: 'update',
				resource: `dataContext[${tTargetDatasetName}].collection[${targetCollectionName}].case`,
				values: []
			},
			{
				action: 'update',
				resource: `dataContext[${datasetName}].collection[${collectionName}].case`,
				values: []
			}
		];
		for (let tTextResultsKey in tTextResults) {
			tMsgs[0].values?.push({
				id: tTextResultsKey,
				values: { featureIDs: JSON.stringify(tTextResults[tTextResultsKey]) }
			});
		}
		for (let tUsageResultsKey in tUsageResults) {
			tMsgs[1].values?.push({
				id: tUsageResultsKey,
				values: { usages: JSON.stringify(tUsageResults[tUsageResultsKey]) }
			});
		}
		await codapInterface.sendRequest(tMsgs);

		// Now we update the case and item ids of the stored features
		const tItemResults = await codapInterface.sendRequest(tFeatureItemRequests) as GetItemByCaseIDResponse[];
		tFeatureCases.forEach((iFeature, iIndex) => {
			const tStoredFeature = featureStore.features.find(iStoredFeature => {
				return iStoredFeature.name === iFeature.values.name;
			})
			const result = tItemResults[iIndex];
			if (tStoredFeature && result.success && result.values) {
				tStoredFeature.featureItemID = result.values.id;
				tStoredFeature.caseID = String(iFeature.id);
			}
		})

		// Finally, we update featureStore.tokenMap. Each token has caseIDs corresponding to usages and a featureID
		//	that is the ID of the feature in the features collection.
		for (let tTokenMapKey in featureStore.tokenMap) {
			const tToken = featureStore.tokenMap[tTokenMapKey],
				tStoredFeature = featureStore.features.find(iStoredFeature => {
					return iStoredFeature.name === tTokenMapKey;
				});
			if (tToken && tStoredFeature) {
				tToken.featureCaseID = Number(tStoredFeature.caseID);
				tToken.caseIDs = tUsageResults[tToken.featureCaseID];
			}
		}
	}
}

export const domainStore = new DomainStore();
