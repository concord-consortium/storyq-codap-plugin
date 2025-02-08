/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import {makeAutoObservable, toJS} from 'mobx'
import codapInterface from "../lib/CodapInterface";
import { GetAttributeListResponse, GetCaseFormulaSearchResponse, GetCollectionListResponse, GetDataContextListResponse } from '../types/codap-api-types';
import {
	Feature, getStarterFeature, kKindOfThingOptionText, containOptionAbbreviations, NgramDetails, SearchDetails, TokenMap,
	WordListSpec
} from "./store_types_and_constants";
import { targetDatasetStore } from './target_dataset_store';

interface IFeatureDatasetInfo {
	datasetName: string;
	datasetTitle: string;
	collectionName: string;
	weightsCollectionName: string;
	datasetID: number;
}
export interface IFeatureStoreJSON {
	featureDatasetID: number
	features: Feature[],
	featureUnderConstruction: Feature,
	tokenMap: TokenMap,
	targetColumnFeatureNames: string[]
}

export class FeatureStore {
	features: Feature[] = []
	featureUnderConstruction: Feature = getStarterFeature();
	featureDatasetInfo = {
		datasetName: 'Features',
		datasetTitle: 'Features',
		collectionName: 'features',
		weightsCollectionName: 'weights',
		datasetID: -1
	}
	wordListSpecs: WordListSpec[] = []	// no save/restore
	targetColumnFeatureNames: string[] = []
	tokenMap: TokenMap = {}
	featureWeightCaseIDs: Record<string, number> = {}

	constructor() {
		makeAutoObservable(this, { tokenMap: false, featureWeightCaseIDs: false }, { autoBind: true });
	}

	setFeatures(features: Feature[]) {
		this.features = features;
	}

	setFeatureUnderConstruction(feature: Feature) {
		this.featureUnderConstruction = feature;
	}

	setFeatureDatasetInfo(info: IFeatureDatasetInfo) {
		this.featureDatasetInfo = info;
	}

	setWordListSpecs(specs: WordListSpec[]) {
		this.wordListSpecs = specs;
	}

	setTargetColumnFeatureNames(names: string[]) {
		this.targetColumnFeatureNames = names;
	}

	setTokenMap(map: TokenMap) {
		this.tokenMap = map;
	}

	setFeatureWeightCaseIDs(ids: Record<string, number>) {
		this.featureWeightCaseIDs = ids;
	}

	asJSON() {
		return {
			featureDatasetID: toJS(this.featureDatasetInfo.datasetID),
			features: toJS(this.features),
			featureUnderConstruction: toJS(this.featureUnderConstruction),
			tokenMap: toJS(this.tokenMap),
			targetColumnFeatureNames: toJS(this.targetColumnFeatureNames)
		}
	}

	fromJSON(json: IFeatureStoreJSON) {
		if (json) {
			this.setFeatureDatasetInfo({ ...this.featureDatasetInfo, datasetID: json.featureDatasetID || -1 });
			this.setFeatures(json.features || []);
			this.setFeatureUnderConstruction(json.featureUnderConstruction || getStarterFeature());
			this.setTokenMap(json.tokenMap || {});
			this.setTargetColumnFeatureNames(json.targetColumnFeatureNames || []);
		}
	}

	startConstructingFeature() {
		this.setFeatureUnderConstruction(getStarterFeature());
	}

	constructionIsDone() {
		const tFeature = this.featureUnderConstruction,
			tDetails = this.featureUnderConstruction.info.details as SearchDetails,
			tKindOK = tFeature.info.kind !== '',
			tDoneNgram = tKindOK && tFeature.info.kind === 'ngram',
			tDoneSearch = tKindOK && tFeature.info.kind === 'search' &&
				[tDetails.where, tDetails.what].every(iString => iString !== '') &&
				(tDetails.what !== kKindOfThingOptionText || tDetails.freeFormText !== ''),
			tDoneColumn = tKindOK && tFeature.info.kind === 'column';
		return tDoneNgram || tDoneSearch || tDoneColumn;
	}

	constructNameFor(iFeature: Feature) {
		if (iFeature.info.kind === 'search') {
			const tDetails = iFeature.info.details as SearchDetails,
				tFirstPart = containOptionAbbreviations[tDetails.where],
				tSecondPart = tDetails.freeFormText !== '' ? `"${tDetails.freeFormText.trim()}"` :
					tDetails.punctuation !== '' ? tDetails.punctuation :
					tDetails.wordList && tDetails.wordList.datasetName !== '' ? tDetails.wordList.datasetName :
					tDetails.what === 'any number' ? 'anyNumber' : '';
			return `${tFirstPart}: ${tSecondPart}`;
		} else if (iFeature.info.kind === 'ngram') {
			const ignoringPart = iFeature.info.ignoreStopWords ? 'ignoring stopwords' : '';
			return `single words with frequency ≥ ${iFeature.info.frequencyThreshold}${ignoringPart}`;
		} else if (iFeature.info.kind === 'column') {
			return iFeature.name;	// already has column name stashed here
		} else {
			return '';
		}
	}

	getDescriptionFor(iFeature: Feature) {
		if (iFeature.info.kind === 'search') {
			const tDetails = iFeature.info.details as SearchDetails,
				tFirstPart = `${tDetails.where} ${tDetails.what}`,
				tSecondPart = tDetails.freeFormText !== '' ? `"${tDetails.freeFormText}"` : '',
				tThirdPart = tDetails.wordList && tDetails.wordList.datasetName !== '' ?
					` of ${tDetails.wordList.datasetName}` : '';
			return `${tFirstPart} ${tSecondPart}${tThirdPart}`
		} else if (iFeature.info.kind === 'ngram') {
			return `${(iFeature.info.details as NgramDetails).n}gram with frequency threshold of ${iFeature.info.frequencyThreshold},
			${iFeature.info.ignoreStopWords ? '' : ' not'} ignoring stop words`;
		} else {
			return '';
		}
	}

	getChosenFeatureNames() {
		return this.getChosenFeatures().map(iFeature => iFeature.name);
	}

	getChosenFeatures() {
		return this.features.filter(iFeature => iFeature.chosen);
	}

	getFormulaFor(iFeatureName: string) {
		const tFoundObject = this.features.find(iFeature => {
			return iFeature.name === iFeatureName && iFeature.formula !== '';
		})
		return tFoundObject ? tFoundObject.formula : '';
	}

	get featureDatasetID() {
		return this.featureDatasetInfo.datasetID;
	}

	guaranteeUniqueFeatureName(iCandidate: string) {
		const isNotUnique = (iName: string) => !!this.features.find(iFeature => iFeature.name === iName);

		let counter = 1,
			tTest = iCandidate;
		while (isNotUnique(tTest)) {
			tTest = `${iCandidate}_${counter}`;
			counter++;
		}
		return tTest;
	}

	getConstructedFeatureNames() {
		return this.features.filter(iFeature => iFeature.info.kind !== 'ngram').map(iFeature => iFeature.name);
	}

	getShouldIgnoreStopwords() {
		const tNtigramFeature = this.features.find(iFeature => iFeature.info.kind === 'ngram');
		return tNtigramFeature ? tNtigramFeature.info.ignoreStopWords : true;
	}

	hasNgram() {
		return Boolean(this.features.find(iFeature => iFeature.info.kind === 'ngram'));
	}

	addFeatureUnderConstruction(tFeature: Feature) {
		const typeMap: Record<string, string> = { ngram: "unigram", column: "column" };
		tFeature.inProgress = false;
		tFeature.chosen = true;
		tFeature.type = typeMap[tFeature.info.kind] ?? "constructed";
		tFeature.description = this.getDescriptionFor(tFeature);
		this.features.push(tFeature);
		this.startConstructingFeature();
	}

	tokenMapAlreadyHasUnigrams() {
		return this.tokenMap && Object.values(this.tokenMap).some(iToken => iToken.type === 'unigram');
	}

	deleteUnigramTokens() {
		if (this.tokenMap) {
			for (const [key, token] of Object.entries(this.tokenMap)) {
				if (token.type === 'unigram')
					delete this.tokenMap[key];
			}
		}
	}

	async deleteFeature(iFeature: Feature) {
		const tFoundIndex = this.features.indexOf(iFeature);
		if (tFoundIndex >= 0) {
			this.features.splice(tFoundIndex, 1);
		}
		if (iFeature.type !== 'unigram') {
			const { targetDatasetInfo } = targetDatasetStore;
			await codapInterface.sendRequest({
				action: 'delete',
				resource: `dataContext[${this.featureDatasetID}].itemByID[${iFeature.featureItemID}]`
			});
			const tCollectionListResult = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${targetDatasetInfo.id}].collectionList`
			}) as GetCollectionListResponse;
			if (tCollectionListResult.success && tCollectionListResult.values?.length) {
				const tCollectionID = tCollectionListResult.values[0].id;
				await codapInterface.sendRequest({
					action: 'delete',
					resource: `dataContext[${targetDatasetInfo.id}].collection[${tCollectionID}].attribute[${iFeature.attrID}]`
				});
			}
		}
		if (iFeature.type === 'unigram') {
			this.deleteUnigramTokens();
			// Delete all the items in the Features dataset that have type equal to 'unigram'
			await codapInterface.sendRequest({
				action: 'delete',
				resource: `dataContext[${this.featureDatasetInfo.datasetName}].itemSearch[type==unigram]`
			});
		}
	}

	async toggleChosenFor(iFeature: Feature) {
		const dataContextPart = `dataContext[${this.featureDatasetID}]`;
		const resourcePrefix = `${dataContextPart}.collection[${this.featureDatasetInfo.collectionName}]`;

		const syncUnigramsInFeaturesDataset = async (iChosen: boolean) => {
			if (!iChosen) this.deleteUnigramTokens();
			// For every case in Features dataset set the 'chosen' attribute to given value
			const tCasesRequestResult = await codapInterface.sendRequest({
				action: 'get',
				resource: `${resourcePrefix}.caseFormulaSearch[type='unigram']`
			}) as GetCaseFormulaSearchResponse;
			if (tCasesRequestResult.success && tCasesRequestResult.values) {
				const tUpdateRequests: { id: number, values: { chosen: boolean } }[] = tCasesRequestResult.values.map(
					(iValue: { id: number }) => ({ id: Number(iValue.id), values: { chosen: iChosen } })
				);
				await codapInterface.sendRequest({
					action: 'update',
					resource: `${resourcePrefix}.case`,
					values: tUpdateRequests
				});
			}
		}

		iFeature.chosen = !iFeature.chosen;
		if (iFeature.type === 'unigram') {
			await syncUnigramsInFeaturesDataset(iFeature.chosen);
		} else {
			await codapInterface.sendRequest({
				action: 'update',
				resource: `${resourcePrefix}.caseByID[${iFeature.caseID}]`,
				values: {
					values: {
						chosen: iFeature.chosen
					}
				}
			});
		}
	}

	async updateWordListSpecs() {
		this.setWordListSpecs([]);
		const tContextListResult = await codapInterface.sendRequest({
			"action": "get",
			"resource": "dataContextList"
		}).catch((reason) => {
			console.log('unable to get datacontext list because ' + reason);
		}) as GetDataContextListResponse;
		if (tContextListResult?.success && tContextListResult.values) {
			tContextListResult.values.forEach(async (aValue) => {
				const tCollectionsResult = await codapInterface.sendRequest({
					action: 'get',
					resource: `dataContext[${aValue.id}].collectionList`
				}).catch((reason) => {
					console.log('unable to get collection list because ' + reason);
				}) as GetCollectionListResponse;
				if (tCollectionsResult.success && tCollectionsResult.values?.length) {
					const collectionId = tCollectionsResult.values[tCollectionsResult.values.length - 1].id
					const tAttributesResult = await codapInterface.sendRequest({
						action: 'get',
						resource: `dataContext[${aValue.id}].collection[${collectionId}].attributeList`
					}).catch((reason) => {
						console.log('unable to get attribute list because ' + reason);
					}) as GetAttributeListResponse;
					if (tAttributesResult.success && tAttributesResult.values?.length) {
						this.wordListSpecs.push({
							datasetName: aValue.title,
							firstAttributeName: tAttributesResult.values[0].name
						});
					}
				}
			})
		}
	}
}

export const featureStore = new FeatureStore();
