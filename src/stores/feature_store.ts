/**
 * These store objects are meant to keep track of all the state need by classes and components that needs to
 * be accessed in more than one file or needs to be saved and restored.
 */

import {makeAutoObservable, toJS} from 'mobx'
import {
	Feature, kKindOfThingOptionText,
	NgramDetails,
	SearchDetails, starterFeature, TokenMap
} from "./store_types_and_constants";

export class FeatureStore {
	features: Feature[] = []
	featureUnderConstruction: Feature = Object.assign({}, starterFeature)
	featureDatasetInfo = {
		datasetName: 'Features',
		collectionName: 'features',
		datasetID: -1
	}
	targetColumnFeatureNames: string[] = []
	tokenMap:TokenMap = {}

	constructor() {
		makeAutoObservable(this, {tokenMap: false}, {autoBind: true})
	}

	asJSON() {
		return {
			features: toJS(this.features),
			featureUnderConstruction: toJS(this.featureUnderConstruction),
			targetColumnFeatureNames: toJS(this.targetColumnFeatureNames)
		}
	}

	fromJSON(json: any) {
		if (json) {
			this.features = json.features || []
			this.featureUnderConstruction = json.featureUnderConstruction || starterFeature
			this.targetColumnFeatureNames = json.targetColumnFeatureNames || []
		}
	}

	constructionIsDone() {
		const tFeature = this.featureUnderConstruction
		const tDetails = this.featureUnderConstruction.info.details as SearchDetails
		return (tDetails === null) || ([tFeature.name, tFeature.info.kind, tDetails.where, tDetails.what].every(iString => iString !== '') &&
			((tDetails.what !== kKindOfThingOptionText || tDetails.freeFormText !== '')))
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

	addFeatureUnderConstruction() {
		let tType = 'constructed'
		if (this.featureUnderConstruction.info.kind === 'ngram')
			tType = 'unigram'

		this.featureUnderConstruction.inProgress = false
		this.featureUnderConstruction.chosen = true
		this.featureUnderConstruction.type = tType
		this.featureUnderConstruction.description = this.getDescriptionFor(this.featureUnderConstruction)
		this.features.unshift(this.featureUnderConstruction)
		this.featureUnderConstruction = Object.assign({}, starterFeature)
	}

}
