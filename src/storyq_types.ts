import {TFMStorage} from "./managers/text_feedback_manager";
import {FCState} from "./components/old_feature_constructor";
import {entityInfo} from "./lib/codap-helper";

/**
 * Types and interfaces for StoryQ
 */

export interface Case {
	[index: string]: any;
}

export interface StoryqStorage {
	success: boolean,
	values: {
		domainStore: object,
		uiStore: object
	}

}

export interface FMStorage {
	datasetName: string | null;
	textFeedbackManagerStorage: TFMStorage | null,
	featureConstructorStorage: FCState | null,
	targetDatasetInfo: entityInfo | null,
	targetDatasetInfoArray: entityInfo[] | null,
	targetCollectionName: string,
	targetCollectionNames: string[],
	targetAttributeName: string,
	targetAttributeNames: string[],
	targetCaseCount: number,
	targetPositiveCategory: string,
	targetCategories: string[],
	targetColumnFeatureNames: string[],
	targetClassAttributeName: string,
	modelsDatasetName: string,
	modelsDatasetID: number,
	featureCollectionName: string,
	modelCurrentParentCaseID: number,
	modelCollectionName: string,
	featureCaseCount: number,
	frequencyThreshold: number,
	modelAccuracy: number,
	modelKappa: number,
	modelThreshold: number,
	unigrams: boolean,
	useColumnFeatures: boolean,
	ignoreStopWords: boolean,
	lockIntercept: boolean,
	lockProbThreshold: boolean,
	accordianSelection: Record<string, number>,
	status: string
}

export const SQConstants = {
	featureCountThreshold: 4
};