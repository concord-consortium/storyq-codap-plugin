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
export const kContainOptionCount = "count";

export const whereOptions = [
	kContainOptionContain, kContainOptionNotContain, kContainOptionStartWith, kContainOptionEndWith, kContainOptionCount
];
type whereOption = typeof whereOptions[number];

export const kWhatOptionText = "text";
export const kWhatOptionPunctuation = "punctuation";
export const kWhatOptionNumber = "any number";
export const kWhatOptionList = "any item from a list";
export const kWhatOptionPartOfSpeech = "part of speech";

export const whatOptions = [
	kWhatOptionNumber, kWhatOptionList, kWhatOptionText, kWhatOptionPunctuation, kWhatOptionPartOfSpeech, ""
];
type whatOption = typeof whatOptions[number];
export function isWhatOption(value: string): value is whatOption {
	return whatOptions.includes(value as whatOption);
}

export const kFeatureKindSearch = "search";
export const kFeatureKindNgram = "ngram";
export const kFeatureKindCount = "count";
export const kFeatureKindColumn = "column";

export const featureKinds = [
	kFeatureKindSearch, kFeatureKindNgram, kFeatureKindCount, kFeatureKindColumn, ""
];
type featureKind = typeof featureKinds[number];

interface FeatureItem {
	disabled?: boolean
	key?: string
	name: string
	value: {
		kind: string
		details: {
			columnName?: string
			n?: string
			where?: whereOption
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
				{ name: kContainOptionContain, value: { kind: "search", details: { where: kContainOptionContain } } },
				{ name: kContainOptionNotContain, value: { kind: "search", details: { where: kContainOptionNotContain } } },
				{ name: kContainOptionStartWith, value: { kind: "search", details: { where: kContainOptionStartWith } } },
				{ name: kContainOptionEndWith, value: { kind: "search", details: { where: kContainOptionEndWith } } },
				{ name: kContainOptionCount, value: { kind: "search", details: { where: kContainOptionCount } } }
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
	containsOptions: [
		kContainOptionContain, kContainOptionNotContain, kContainOptionStartWith, kContainOptionEndWith,
		kContainOptionCount
	],
	kindOfThingContainedOptions: [
		kWhatOptionText, kWhatOptionPunctuation, kWhatOptionNumber, kWhatOptionList
	],
	caseOptions: ['sensitive', 'insensitive']
}

export const kSearchWhereContain = "contain";
export const kSearchWhereNotContain = "notContain";
export const kSearchWhereStartWith = "startWith";
export const kSearchWhereEndWith = "endWith";
export const kSearchWhereCount = "count";

const searchWhereOptions = [
	kSearchWhereContain, kSearchWhereNotContain, kSearchWhereStartWith, kSearchWhereEndWith, kSearchWhereCount, ""
];
export type searchWhereOption = typeof searchWhereOptions[number];

export interface SearchDetails {
	where: searchWhereOption,
	what: whatOption,
	caseOption: 'any' | 'upper' | 'lower' | '',
	freeFormText: string,
	punctuation: string,
	wordList: WordListSpec
}

export const containOptionAbbreviations: Record<whereOption, searchWhereOption> = {
	[kContainOptionContain]: kSearchWhereContain,
	[kContainOptionCount]: kSearchWhereCount,
	[kContainOptionEndWith]: kSearchWhereEndWith,
	[kContainOptionNotContain]: kSearchWhereNotContain,
	[kContainOptionStartWith]: kSearchWhereStartWith,
}

type containsFormulaType = (args: string) => string;
const containsFormula = (args: string) => `patternMatches(${args})>0`;
export const containFormula: Record<searchWhereOption, containsFormulaType> = {
	[kSearchWhereContain]: containsFormula,
	[kSearchWhereNotContain]: (args: string) => `patternMatches(${args})=0`,
	[kSearchWhereStartWith]: containsFormula,
	[kSearchWhereEndWith]: containsFormula,
	[kSearchWhereCount]: (args: string) => `patternMatches(${args})`
};
export function getContainFormula(option: searchWhereOption, args: string): string {
	return (containFormula[option] ?? containsFormula)(args);
}

type caseFormulaType = (args: string) => string;
export const defaultTargetCaseFormula = (attrName: string) => `${attrName}=true`;
const targetCaseFormulas: Record<searchWhereOption, caseFormulaType> = {
	[kSearchWhereContain]: defaultTargetCaseFormula,
	[kSearchWhereNotContain]: defaultTargetCaseFormula,
	[kSearchWhereStartWith]: defaultTargetCaseFormula,
	[kSearchWhereEndWith]: defaultTargetCaseFormula,
	[kSearchWhereCount]: (attrName: string) => `${attrName}>0`
};
export function getTargetCaseFormula(option: searchWhereOption) {
	return targetCaseFormulas[option] ?? defaultTargetCaseFormula;
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
	kind: featureKind
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
	targetCaseFormula?: (attrName: string) => string
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
	storedModel: StoredAIModel
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

export type TokenMap = Record<string, Token>;

export interface StoredAIModel {
  negativeClassName: string
  positiveClassName: string
  storedTokens: { featureCaseID: number, name: string, formula: string, weight: number }[]
}

export interface WordListSpec {
	datasetName: string
	firstAttributeName: string
}
