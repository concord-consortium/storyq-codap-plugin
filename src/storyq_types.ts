import {entityInfo} from "./lib/codap-helper";

/**
 * Types and interfaces for StoryQ
 */

export interface FMStorage {
  datasetName: string | null;
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