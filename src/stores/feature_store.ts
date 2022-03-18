/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import {makeAutoObservable, toJS} from 'mobx'
import {
	Feature, kKindOfThingOptionText, namingAbbreviations,
	NgramDetails,
	SearchDetails, starterFeature, TokenMap, WordListSpec
} from "./store_types_and_constants";
import codapInterface from "../lib/CodapInterface";

export class FeatureStore {
	features: Feature[] = []
	featureUnderConstruction: Feature = Object.assign({}, starterFeature)
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
	featureWeightCaseIDs: { [index: string]: number } = {}

	constructor() {
		makeAutoObservable(this, {tokenMap: false, featureWeightCaseIDs: false}, {autoBind: true})
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

	fromJSON(json: any) {
		if (json) {
			this.featureDatasetInfo.datasetID = json.featureDatasetID || -1
			this.features = json.features || []
			this.featureUnderConstruction = json.featureUnderConstruction || starterFeature
			this.tokenMap = json.tokenMap || {}
			this.targetColumnFeatureNames = json.targetColumnFeatureNames || []
		}
	}

	constructionIsDone() {
		const tFeature = this.featureUnderConstruction,
			tDetails = this.featureUnderConstruction.info.details as SearchDetails,
			tKindOK = tFeature.info.kind !== '',
			tDoneNgram = tKindOK && tFeature.info.kind === 'ngram',
			tDoneSearch = tKindOK && tFeature.info.kind === 'search' &&
				[tDetails.where, tDetails.what].every(iString => iString !== '') &&
				(tDetails.what !== kKindOfThingOptionText || tDetails.freeFormText !== ''),
			tDoneColumn = tKindOK && tFeature.info.kind === 'column'
		return tDoneNgram || tDoneSearch || tDoneColumn
	}

	constructNameFor( iFeature: Feature) {
		if (iFeature.info.kind === 'search') {
			const tDetails = iFeature.info.details as SearchDetails,
				tFirstPart = namingAbbreviations[tDetails.where],
				tMatch = tDetails.freeFormText.match( /\w+/),
				tSecondPart = tDetails.freeFormText !== '' ? `"${tMatch ? tMatch[0] : ''}"` :
					tDetails.punctuation !== '' ? tDetails.punctuation :
					tDetails.wordList && tDetails.wordList.datasetName !== '' ? tDetails.wordList.datasetName :
					tDetails.what === 'any number' ? 'anyNumber' : ''
			return `${tFirstPart}: ${tSecondPart}`
		} else if (iFeature.info.kind === 'ngram') {
			return `single words with frequency ≥ ${iFeature.info.frequencyThreshold}${iFeature.info.ignoreStopWords ? '; ignoring stopwords': ''}`
		} else if( iFeature.info.kind === 'column')
			return iFeature.name	// already has column name stashed here
		else
			return ''

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
			${iFeature.info.ignoreStopWords ? '' : ' not'} ignoring stop words`
		} else
			return ''
	}

	getChosenFeatureNames() {
		return this.getChosenFeatures().map(iFeature => iFeature.name)
	}

	getChosenFeatures() {
		return this.features.filter(iFeature => iFeature.chosen)
	}

	getFormulaFor(iFeatureName: string) {
		const tFoundObject = this.features.find(iFeature => {
			return iFeature.name === iFeatureName && iFeature.formula !== ''
		})
		return tFoundObject ? tFoundObject.formula : ''
	}

	getFeatureDatasetID() {
		return this.featureDatasetInfo.datasetID
	}

	guaranteeUniqueFeatureName(iCandidate: string) {
		const this_ = this

		function isNotUnique(iName: string) {
			return Boolean(this_.features.find(iFeature => iFeature.name === iName))
		}

		let counter = 1,
			tTest = iCandidate
		while (isNotUnique(tTest)) {
			tTest = `${iCandidate}_${counter}`
			counter++
		}
		return tTest
	}

	getConstructedFeatureNames() {
		return this.features.filter(iFeature => iFeature.info.kind !== 'ngram').map(iFeature => iFeature.name)
	}

	getShouldIgnoreStopwords() {
		const tNtigramFeature = this.features.find(iFeature => iFeature.info.kind === 'ngram')
		return tNtigramFeature ? tNtigramFeature.info.ignoreStopWords : true
	}

	hasNgram() {
		return Boolean(this.features.find(iFeature => iFeature.info.kind === 'ngram'))
	}

	addFeatureUnderConstruction() {
		const tFeature = this.featureUnderConstruction
		let tType
		switch (tFeature.info.kind) {
			case 'ngram':
				tType = 'unigram'
				break
			case 'column':
				tType = 'column'
				break;
			default:
				tType = 'constructed'
		}
		tFeature.name = this.constructNameFor(tFeature)
		tFeature.inProgress = false
		tFeature.chosen = true
		tFeature.type = tType
		tFeature.description = this.getDescriptionFor(tFeature)
		this.features.push(tFeature)
		this.featureUnderConstruction = Object.assign({}, starterFeature)
	}

	tokenMapAlreadyHasUnigrams() {
		return this.tokenMap && Object.values(this.tokenMap).some(iToken => iToken.type === 'unigram')
	}

	deleteUnigramTokens() {
		if( this.tokenMap) {
			for(const [key, token] of Object.entries(this.tokenMap)) {
				if(token.type === 'unigram')
					delete this.tokenMap[key]
			}
		}
	}

	async deleteFeature(iFeature: Feature) {
		const tFoundIndex = this.features.indexOf(iFeature)
		if (tFoundIndex >= 0) {
			this.features.splice(tFoundIndex, 1)
		}
		if( iFeature.type !== 'unigram') {
			await codapInterface.sendRequest({
				action: 'delete',
				resource: `dataContext[${this.featureDatasetInfo.datasetID}].itemByID[${iFeature.featureItemID}]`
			})
		}
		if (iFeature.type === 'unigram') {
			this.deleteUnigramTokens()
			// Delete all the items in the Features dataset that have type equal to 'unigram'
			await codapInterface.sendRequest({
				action: 'delete',
				resource: `dataContext[${this.featureDatasetInfo.datasetName}].itemSearch[type==unigram]`
			})
		}
	}

	async toggleChosenFor(iFeature: Feature) {
		const this_ = this

		async function syncUnigramsInFeaturesDataset(iChosen: boolean) {
			if(!iChosen)
				this_.deleteUnigramTokens()
			// For every case in Features dataset set the 'chosen' attribute to given value
			const tCasesRequestResult: any = await codapInterface.sendRequest({
				action: 'get',
				resource: `dataContext[${this_.featureDatasetInfo.datasetID}].collection[${this_.featureDatasetInfo.collectionName}].caseFormulaSearch[type='unigram']`
			})
			if (tCasesRequestResult.success) {
				const tUpdateRequests: { id: number, values: { chosen: boolean } }[] = tCasesRequestResult.values.map(
					(iValue: { id: number }) => {
						return {id: Number(iValue.id), values: {chosen: iChosen}}
					}
				)
				await codapInterface.sendRequest({
					action: 'update',
					resource: `dataContext[${this_.featureDatasetInfo.datasetID}].collection[${this_.featureDatasetInfo.collectionName}].case`,
					values: tUpdateRequests
				})
			}
		}

		iFeature.chosen = !iFeature.chosen
		if (iFeature.type === 'unigram') {
			await syncUnigramsInFeaturesDataset(iFeature.chosen)

		} else {
			await codapInterface.sendRequest({
				action: 'update',
				resource: `dataContext[${this.featureDatasetInfo.datasetID}].collection[${this.featureDatasetInfo.collectionName}].caseByID[${iFeature.caseID}]`,
				values: {
					values: {
						chosen: iFeature.chosen
					}
				}
			})
		}
	}

	async updateWordListSpecs() {
		this.wordListSpecs = []
		const tContextListResult: any = await codapInterface.sendRequest({
			"action": "get",
			"resource": "dataContextList"
		}).catch((reason) => {
			console.log('unable to get datacontext list because ' + reason);
		})
		if (tContextListResult.success) {
			tContextListResult.values.forEach(async (aValue: any) => {
				let tCollectionsResult: any = await codapInterface.sendRequest({
					action: 'get',
					resource: `dataContext[${aValue.id}].collectionList`
				}).catch((reason) => {
					console.log('unable to get collection list because ' + reason);
				});
				if (tCollectionsResult.values.length === 1) {
					let tAttributesResult: any = await codapInterface.sendRequest({
						action: 'get',
						resource: `dataContext[${aValue.id}].collection[${tCollectionsResult.values[0].id}].attributeList`
					}).catch((reason) => {
						console.log('unable to get attribute list because ' + reason);
					});
					if (tAttributesResult.values.length === 1) {
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
