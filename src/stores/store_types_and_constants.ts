import {LogisticRegression} from "../lib/jsregression";
import {makeAutoObservable, toJS} from "mobx";

/**
 * These types and constants are used primarily by the various store classes
 */

export const kEmptyEntityInfo = {name: '', title: '', id: 0},
	kPosNegConstants = {
		positive: {
			storeKey: 'numberInPositive',
			attrKey: 'frequency in '
		},
		negative: {
			storeKey: 'numberInNegative',
			attrKey: 'frequency in '
		}
	}

export const featureDescriptors = {
	featureKinds: [{
		key: "N-grams",
		items: [
			{name: "unigrams", value: `{"kind": "ngram", "details": {"n":"uni"}}`}/*,
			{name: "bigrams", value: `{"kind": "ngram", "details": {"n":"bi"}}`}*/
		]
	},
		{
			key: "Search",
			items: [
				{name: "starts with", value: `{"kind": "search", "details": {"where": "starts with"}}`},
				{name: "contains", value: `{"kind": "search", "details": {"where": "contains"}}`},
				{name: "does not contain", value: `{"kind": "search", "details": {"where": "does not contain"}}`},
				{name: "ends with", value: `{"kind": "search", "details": {"where": "ends with"}}`}
			]
		}],
	containsOptions: ['starts with', 'contains', 'does not contain', 'ends with'],
	kindOfThingContainedOptions: ['any number', 'any from list', 'free form text'/*, 'any date'*/],
	caseOptions: ['sensitive', 'insensitive']
}

export const kKindOfThingOptionText = featureDescriptors.kindOfThingContainedOptions[2]

export interface SearchDetails {
	where: 'startsWith' | 'contains' | 'notContains' | 'endsWith' | '',
	what: 'any number' | 'any from List' | 'free form text' | 'part of speech' | '',
	caseOption: 'any' | 'upper' | 'lower' | '',
	freeFormText: string,
	wordList: WordListSpec
}

export interface CountDetails {
	what: 'letters' | 'words' | 'sentences' | ''
}

export interface NgramDetails {
	n: 'uni' | 'bi' | ''
}

export interface FeatureDetails {
	kind: 'search' | 'ngram' | 'count' | '',
	details: SearchDetails | CountDetails | NgramDetails | null,
	ignoreStopWords?: boolean,
	frequencyThreshold?: number
}

export interface Feature {
	[key: string]: any

	inProgress: boolean
	name: string,
	chosen: boolean,
	infoChoice: string,
	info: FeatureDetails,
	description: string
	type: string
	formula: string
	numberInPositive: number
	numberInNegative: number
	usages: number[]
	caseID: string		// ID of the feature as a case in the feature table
	attrID: string		// ID of the attribute in the target dataset corresponding to this feature
	featureItemID: string	// ID of the item in the feature table corresponding to this feature
	weight: number
}

export interface WordListSpec {
	datasetName: string,
	firstAttributeName: string
}

export const starterFeature: Feature = {
	inProgress: false, name: '', chosen: false,
	infoChoice: '',
	info: {
		kind: '',
		details: null
	},
	description: '',
	type: '',
	formula: '',
	numberInNegative: -1,
	numberInPositive: -1,
	usages: [],
	caseID: '',
	attrID: '',
	featureItemID: '',
	weight: 0
}

export class Model {
	[index: string]: any;

	name = ''
	iteration = 0
	iterations = 20
	lockInterceptAtZero = true
	usePoint5AsProbThreshold = true
	frequencyThreshold = 4
	trainingInProgress = false
	logisticModel: LogisticRegression = new LogisticRegression({
		alpha: 1,
		iterations: 20,
		lambda: 0.0,
		accuracy: 0,
		kappa: 0,
		threshold: 0.5,
		trace: false,
		progressCallback: null,
		feedbackCallback: null
	})


	constructor() {
		makeAutoObservable(this, {logisticModel: false}, {autoBind: true})
	}

	asJSON() {
		const tCopy = Object.assign({}, toJS(this))
		delete tCopy.logisticModel
		return tCopy
	}

	fromJSON(json: any) {
		if (json) {
			for (const [key, value] of Object.entries(json)) {
				this[key] = value
			}
		}
	}

}

export interface TrainingResult {
	name: string,
	accuracy: number
	kappa: number
}

