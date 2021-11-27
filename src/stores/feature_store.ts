/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import {makeAutoObservable, toJS} from 'mobx'
import {
	Feature, kKindOfThingOptionText,
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
	wordListSpecs:WordListSpec[] = []	// no save/restore
	targetColumnFeatureNames: string[] = []
	tokenMap: TokenMap = {}

	constructor() {
		makeAutoObservable(this, {tokenMap: false}, {autoBind: true})
	}

	tokenMapIsFilledOut() {
		return this.tokenMap && Object.keys(this.tokenMap).length > 0
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
			tNameAndKindOK = [tFeature.name, tFeature.info.kind].every(iString => iString !== ''),
			tDoneNgram = tNameAndKindOK && tFeature.info.kind === 'ngram',
			tDoneSearch = tNameAndKindOK && tFeature.info.kind === 'search' &&
				[tDetails.where, tDetails.what].every(iString => iString !== '') &&
				(tDetails.what !== kKindOfThingOptionText || tDetails.freeFormText !== ''),
			tDoneColumn = tNameAndKindOK && tFeature.info.kind === 'column'
		return tDoneNgram || tDoneSearch || tDoneColumn
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
		return this.features.filter(iFeature=>iFeature.chosen)
	}

	getFormulaFor(iFeatureName:string) {
		const tFoundObject = this.features.find(iFeature=>{
			return iFeature.name === iFeatureName && iFeature.formula !== ''
		})
		return tFoundObject ? tFoundObject.formula : ''
	}

	guaranteeUniqueFeatureName(iCandidate:string) {
		const this_ = this

		function isNotUnique(iName:string) {
			return Boolean(this_.features.find(iFeature=>iFeature.name === iName))
		}

		let counter = 1,
			tTest = iCandidate
		while( isNotUnique(tTest)) {
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
		let tType
		switch (this.featureUnderConstruction.info.kind) {
			case 'ngram':
				tType = 'unigram'
				break
			case 'column':
				tType = 'column'
				break;
			default:
				tType = 'constructed'
		}
		this.featureUnderConstruction.inProgress = false
		this.featureUnderConstruction.chosen = true
		this.featureUnderConstruction.type = tType
		this.featureUnderConstruction.description = this.getDescriptionFor(this.featureUnderConstruction)
		this.features.unshift(this.featureUnderConstruction)
		this.featureUnderConstruction = Object.assign({}, starterFeature)
	}

	async deleteFeature(iFeature:Feature) {
		const tFoundIndex = this.features.indexOf(iFeature)
		if( tFoundIndex >= 0) {
			this.features.splice(tFoundIndex, 1)
			await codapInterface.sendRequest({
				action: 'delete',
				resource: `dataContext[${this.featureDatasetInfo.datasetID}].itemByID[${iFeature.featureItemID}]`
			})
		}
	}

	async toggleChosenFor(iFeature:Feature) {
		iFeature.chosen = !iFeature.chosen
		const tResult =  await codapInterface.sendRequest({
			action: 'update',
			resource: `dataContext[${this.featureDatasetInfo.datasetID}].collection[${this.featureDatasetInfo.collectionName}].caseByID[${iFeature.caseID}]`,
			values: {
				values: {
					chosen: iFeature.chosen
				}
			}
		})
		console.log(`tResult = ${JSON.stringify(tResult)}`)
	}

	async updateWordListSpecs() {
		this.wordListSpecs = []
		const tContextListResult: any = await codapInterface.sendRequest({
			"action": "get",
			"resource": "dataContextList"
		}).catch((reason) => {
			console.log('unable to get datacontext list because ' + reason);
		})
		if(tContextListResult.success) {
			tContextListResult.values.forEach(async (aValue:any)=> {
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
