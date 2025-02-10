import { makeAutoObservable, toJS } from "mobx";
import { getDefaultLogisticRegression, LogisticRegression } from "../lib/jsregression";

/**
 * These types and constants are used primarily by the various store classes
 */

export const kStoryQPluginName = "StoryQ"

export const kEmptyEntityInfo = {name: '', title: '', id: 0},
	kPosNegConstants = {
		positive: {
			getStoreKey: (feature: Feature) => feature.numberInPositive,
			attrKey: 'frequency in '
		},
		negative: {
			getStoreKey: (feature: Feature) => feature.numberInNegative,
			attrKey: 'frequency in '
		}
	}

export const kContainOptionContain = "contain";
export const kContainOptionNotContain = "not contain";
export const kContainOptionStartWith = "start with";
export const kContainOptionEndWith = "end with";
interface FeatureItem {
	disabled?: boolean
	key?: string
	name: string
	value: {
		kind: string
		details: {
			columnName?: string
			n?: string
			where?: string
		}
	}
}
export interface FeatureKind {
	key: string
	items: FeatureItem[]
}
interface FeatureDescriptors {
	featureKinds: FeatureKind[]
	containsOptions: string[]
	kindOfThingContainedOptions: string[]
	caseOptions: string[]
}
export const featureDescriptors: FeatureDescriptors = {
	featureKinds: [
		{
			key: "Extract one feature at a time",
			items: [
				{ name: "contain", value: { kind: "search", details: { where: kContainOptionContain } } },
				{ name: "not contain", value: { kind: "search", details: { where: kContainOptionNotContain } } },
				{ name: "start with", value: { kind: "search", details: { where: kContainOptionStartWith } } },
				{ name: "end with", value: { kind: "search", details: { where: kContainOptionEndWith } } }
			]
		},
		{
			key: "Extract features of the same kind",
			items: [
				{ name: "single words", disabled: false, value: { kind: "ngram", details: { n: "uni" } } }
			]
		},
		{
			key: "Choose other columns as features",
			items: []
		}
	],
	containsOptions: [kContainOptionContain, kContainOptionNotContain, kContainOptionStartWith, kContainOptionEndWith],
	kindOfThingContainedOptions: ['text', 'punctuation', 'any number', 'any item from a list'],
	caseOptions: ['sensitive', 'insensitive']
}

export const kKindOfThingOptionList = featureDescriptors.kindOfThingContainedOptions[3]
export const kKindOfThingOptionText = featureDescriptors.kindOfThingContainedOptions[0]
export const kKindOfThingOptionPunctuation = featureDescriptors.kindOfThingContainedOptions[1]

const whatOptions = ['any number', 'any item from a list', 'text', 'punctuation', 'part of speech', ''];
type whatOption = typeof whatOptions[number];
export function isWhatOption(value: string): value is whatOption {
	return whatOptions.includes(value as whatOption);
}

export interface SearchDetails {
	where: 'startWith' | 'contain' | 'notContain' | 'endWith' | '',
	what: whatOption,
	caseOption: 'any' | 'upper' | 'lower' | '',
	freeFormText: string,
	punctuation: string,
	wordList: WordListSpec
}

export const containOptionAbbreviations: Record<string, string> = {
	[kContainOptionContain]: 'contain',
	[kContainOptionEndWith]: 'endWith',
	[kContainOptionNotContain]: 'notContain',
	[kContainOptionStartWith]: 'startWith',
}

export interface CountDetails {
	what: 'letters' | 'words' | 'sentences' | ''
}

export interface NgramDetails {
	n: 'uni' | 'bi' | ''
}

export interface ColumnDetails {
	columnName: string
}

export interface FeatureDetails {
	details: SearchDetails | CountDetails | NgramDetails | ColumnDetails | null
	frequencyThreshold?: number
	ignoreStopWords?: boolean
	kind: 'search' | 'ngram' | 'count' | 'column' | ''
}
export interface Feature {
	attrID: string // ID of the attribute in the target dataset corresponding to this feature
	caseID: string // ID of the feature as a case in the feature table
	chosen: boolean
	description: string
	featureItemID: string // ID of the item in the feature table corresponding to this feature
	formula: string
	inProgress: boolean
	info: FeatureDetails
	infoChoice: string
	name: string
	numberInNegative: number
	numberInPositive: number
	type: string
	usages: number[]
	weight: number | ''
}

export function getStarterFeature(): Feature {
	return {
		attrID: '',
		caseID: '',
		chosen: false,
		description: '',
		featureItemID: '',
		formula: '',
		inProgress: false,
		info: {
			kind: '',
			details: {
				caseOption: '',
				freeFormText: '',
				punctuation: '',
				where: '',
				what: '',
				wordList: { datasetName: '', firstAttributeName: '' }
			}
		},
		infoChoice: '',
		name: '',
		numberInNegative: -1,
		numberInPositive: -1,
		type: '',
		usages: [],
		weight: 0
	};
}

export interface WordListSpec {
	datasetName: string,
	firstAttributeName: string
}

export interface TrainingResult {
	accuracy: number
	constantWeightTerm: number
	featureNames: string[]
	hasNgram: boolean
	ignoreStopWords: boolean
	isActive: boolean
	kappa: number
	name: string
	settings: {
		iterations: number
		locked: boolean
		thresholdAtPoint5: boolean
	}
	storedModel: StoredModel
	targetDatasetName: string
	threshold: number
}

export interface TestingResult {
	accuracy: number
	kappa: number
	modelName: string
	numNegative: number
	numPositive: number
	targetDatasetName: string
	targetDatasetTitle: string
	testBeingConstructed: boolean
}

export function getEmptyTestingResult() {
	return {
		targetDatasetName: '', targetDatasetTitle: '', modelName: '', numPositive: 0, numNegative: 0,
		accuracy: 0, kappa: 0, testBeingConstructed: false
	};
}

export interface Token {
	caseIDs: number[]
	count: number	// the number of target texts where this token is true (column feature) or found (unigram)
	featureCaseID: number | null
	index: number
	numNegative: number
	numPositive: number
	token: string
	type: 'constructed feature' | 'unigram'
	weight: number | null
}

export type TokenMap = Record<string, Token>

export interface IModel {
	beingConstructed: boolean
	frequencyThreshold: number
	ignoreStopWords: boolean
	iteration: number
	iterations: number
	lockInterceptAtZero: boolean
	logisticModel: LogisticRegression
	name: string
	trainingInProgress: boolean
	trainingInStepMode: boolean
	trainingIsComplete: boolean
	usePoint5AsProbThreshold: boolean
}

export const defaultModel: IModel = {
	beingConstructed: false,
	frequencyThreshold: 4,
	ignoreStopWords: true,
	iteration: 0,
	iterations: 20,
	lockInterceptAtZero: true,
	logisticModel: getDefaultLogisticRegression(),
	name: '',
	trainingInProgress: false,
	trainingInStepMode: false,
	trainingIsComplete: false,
	usePoint5AsProbThreshold: true
}

export class Model {
	beingConstructed = defaultModel.beingConstructed;
	frequencyThreshold = defaultModel.frequencyThreshold;
	ignoreStopWords = defaultModel.ignoreStopWords;
	iteration = defaultModel.iteration;
	iterations = defaultModel.iterations;
	lockInterceptAtZero = defaultModel.lockInterceptAtZero;
	logisticModel: LogisticRegression = getDefaultLogisticRegression();
	name = defaultModel.name;
	trainingInProgress = defaultModel.trainingInProgress;
	trainingInStepMode = defaultModel.trainingInStepMode;
	trainingIsComplete = defaultModel.trainingIsComplete;
	usePoint5AsProbThreshold = defaultModel.usePoint5AsProbThreshold;

	constructor() {
		makeAutoObservable(this, { logisticModel: false }, { autoBind: true })
	}

	import(model: IModel) {
		this.beingConstructed = model.beingConstructed;
		this.frequencyThreshold = model.frequencyThreshold;
		this.ignoreStopWords = model.ignoreStopWords;
		this.iteration = model.iteration;
		this.iterations = model.iterations;
		this.lockInterceptAtZero = model.lockInterceptAtZero;
		this.logisticModel = model.logisticModel;
		this.name = model.name;
		this.trainingInProgress = model.trainingInProgress;
		this.trainingInStepMode = model.trainingInStepMode;
		this.trainingIsComplete = model.trainingIsComplete;
		this.usePoint5AsProbThreshold = model.usePoint5AsProbThreshold;
	}

	reset() {
		defaultModel.logisticModel.reset();
		this.import(defaultModel);
	}

	asJSON() {
		const tCopy: Partial<Model> = Object.assign({}, toJS(this))
		delete tCopy.logisticModel
		return tCopy
	}

	fromJSON(json: IModel) {
		if (json) {
			this.import(json);
		}
	}
}

export interface StoredModel {
	negativeClassName: string
	positiveClassName: string
	storedTokens: { featureCaseID: number, name: string, formula: string, weight: number }[]
}

export interface WordListSpec {
	datasetName: string
	firstAttributeName: string
}

