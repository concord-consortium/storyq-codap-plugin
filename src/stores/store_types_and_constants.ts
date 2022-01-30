import {LogisticRegression} from "../lib/jsregression";
import {makeAutoObservable, toJS} from "mobx";

/**
 * These types and constants are used primarily by the various store classes
 */

export const kStoryQPluginName = "StoryQ Studio"

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

export let featureDescriptors = {
	featureKinds: [{
		key: "N-grams",
		items: [
			{name: "unigrams", value: `{"kind": "ngram", "details": {"n":"uni"}}`}/*,
				{name: "bigrams", value: `{"kind": "ngram", "details": {"n":"bi"}}`}*/
		]
	},
		{
			key: "Rules",
			items: [
				{name: "starts with", value: `{"kind": "search", "details": {"where": "starts with"}}`},
				{name: "contains", value: `{"kind": "search", "details": {"where": "contains"}}`},
				{name: "does not contain", value: `{"kind": "search", "details": {"where": "does not contain"}}`},
				{name: "ends with", value: `{"kind": "search", "details": {"where": "ends with"}}`}
			]
		},
		{
			key: "Column Features",
			items: []
		}],
	containsOptions: ['starts with', 'contains', 'does not contain', 'ends with'],
	kindOfThingContainedOptions: ['any number', 'any from list', 'free form text', 'punctuation mark'/*, 'part of speech'*/],
	caseOptions: ['sensitive', 'insensitive']
}

export const kKindOfThingOptionList = featureDescriptors.kindOfThingContainedOptions[1]
export const kKindOfThingOptionText = featureDescriptors.kindOfThingContainedOptions[2]
export const kKindOfThingOptionPunctuation = featureDescriptors.kindOfThingContainedOptions[3]

export interface SearchDetails {
	where: 'startsWith' | 'contains' | 'notContains' | 'endsWith' | '',
	what: 'any number' | 'any from list' | 'free form text' | 'punctuation mark' | 'part of speech' | '',
	caseOption: 'any' | 'upper' | 'lower' | '',
	freeFormText: string,
	punctuation: string,
	wordList: WordListSpec
}

export const namingAbbreviations:{[index:string]:string} = {
	'starts with': 'startsWith',
	contains: 'contains',
	'does not contain': 'not contains',
	'ends with': 'endsWith'
}

export interface CountDetails {
	what: 'letters' | 'words' | 'sentences' | ''
}

export interface NgramDetails {
	n: 'uni' | 'bi' | ''
}

export interface ColumnDetails {
	columnName:string
}

export interface FeatureDetails {
	kind: 'search' | 'ngram' | 'count' | 'column' | '',
	details: SearchDetails | CountDetails | NgramDetails | ColumnDetails | null,
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
		details: {
			where: '', what: '', caseOption: '', freeFormText: '', punctuation: '',
			wordList: {datasetName: '', firstAttributeName: ''}
		}
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

export interface TrainingResult {
	name: string,
	targetDatasetName: string
	isActive: boolean
	threshold: number
	constantWeightTerm: number
	settings: {
		iterations: number
		locked: boolean
		thresholdAtPoint5: boolean
	}
	accuracy: number
	kappa: number
	featureNames: string[],
	hasNgram: boolean,
	storedModel: StoredModel
}

export interface TestingResult {
	modelName: string,
	targetDatasetName: string,
	targetDatasetTitle: string,
	numPositive: number,
	numNegative: number,
	accuracy: number,
	kappa: number,
	testBeingConstructed: boolean
}

export interface Token {
	token: string,
	type: 'constructed feature' | 'unigram',
	count: number,	// the number of target texts where this token is true (column feature) or found (unigram)
	index: number,
	numPositive: number,
	numNegative: number,
	caseIDs: number[],
	weight: number | null,
	featureCaseID: number | null
}

export interface TokenMap {
	[key: string]: Token}

export class Model {
	[index: string]: any;

	name = ''
	iteration = 0
	iterations = 20
	lockInterceptAtZero = true
	usePoint5AsProbThreshold = true
	frequencyThreshold = 4
	beingConstructed = false
	trainingInProgress = false
	trainingInStepMode = false
	trainingIsComplete = false
	logisticModel: LogisticRegression = new LogisticRegression({
		alpha: 1,
		iterations: 20,
		lambda: 0.0,
		accuracy: 0,
		kappa: 0,
		lockIntercept: true,
		threshold: 0.5,
		trace: false,
		progressCallback: null,
		stepModeCallback: null
	})


	constructor() {
		makeAutoObservable(this, {logisticModel: false}, {autoBind: true})
	}

	reset() {
		this.name = ''
		this.iteration = 0
		this.iterations = 20
		this.lockInterceptAtZero = true
		this.usePoint5AsProbThreshold = true
		this.frequencyThreshold = 4
		this.beingConstructed = false
		this.trainingInProgress = false
		this.trainingInStepMode = false
		this.trainingIsComplete = false
		this.logisticModel && this.logisticModel.reset()
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

export interface StoredModel {
	storedTokens: { featureCaseID: number, name: string, formula: string, weight: number }[],
	positiveClassName: string,
	negativeClassName: string
}

export interface WordListSpec {
	datasetName: string,
	firstAttributeName: string
}

