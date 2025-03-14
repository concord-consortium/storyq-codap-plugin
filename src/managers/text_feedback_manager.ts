/**
 * The TextFeedbackManager displays phrases in the text pane based on user selection of target/test phrases
 * or features of the model. Instantiating the class sets up a codap notification handler, after which point
 * there is no need to reference the instance.
 */

import { datasetExists, getCaseValues, getSelectedCasesFrom } from "../lib/codap-helper";
import codapInterface, { CODAP_Notification } from "../lib/CodapInterface";
import { featureStore } from "../stores/feature_store";
import { FeatureOrToken, ITextSectionText } from "../stores/store_types_and_constants";
import { targetStore } from "../stores/target_store";
import { testingStore } from "../stores/testing_store";
import { textStore } from "../stores/text_store";
import { trainingStore } from "../stores/training_store";
import { APIRequest, GetCaseByIDResponse, GetSelectionListResponse } from "../types/codap-api-types";
import { highlightFeatures } from "../utilities/utilities";
import { ClassLabel, HeadingsManager, NonNtigramFeature, PhraseQuadruple } from "./headings_manager";

export let textFeedbackManager: TextFeedbackManager | undefined;
export function setupTextFeedbackManager() {
  textFeedbackManager = new TextFeedbackManager();
}

export class TextFeedbackManager {
  headingsManager: HeadingsManager;
  isSelectingFeatures = false;
  isSelectingTargetPhrases = false;
  lastSelectionType: "features" | "targetDataset" = "features";

  constructor() {
    this.handleNotification = this.handleNotification.bind(this);
    this.headingsManager = new HeadingsManager();
    codapInterface.on('notify', '*', 'selectCases', this.handleNotification);
  }

  async handleNotification(iNotification: CODAP_Notification) {
    if (this.isSelectingFeatures || this.isSelectingTargetPhrases) return;

    const tTargetDatasetName = targetStore.targetDatasetInfo.name,
      tTestingDatasetName = testingStore.testingDatasetInfo.name,
      tFeatureDatasetName = featureStore.featureDatasetInfo.datasetName;

    const { values } = iNotification;
    const operation = Array.isArray(values) ? values[0].operation : values.operation;
    if (iNotification.action === 'notify' && operation === 'selectCases') {
      const tDataContextName = iNotification.resource && iNotification.resource.match(/\[(.+)]/)?.[1];
      if (tDataContextName) {
        let updatePane = false;
        if (tDataContextName === tFeatureDatasetName) {
          this.lastSelectionType = "features";
          updatePane = true;
        } else if ([tTestingDatasetName, tTargetDatasetName].includes(tDataContextName)) {
          this.lastSelectionType = "targetDataset";
          updatePane = true;
        }
        if (updatePane) await this.updateTextPane();
      }
    }
  }

  async updateTextPane() {
    try {
      if (this.lastSelectionType === "features" && !this.isSelectingFeatures) {
        this.isSelectingTargetPhrases = true;
        await this.handleFeatureSelection();
        this.isSelectingTargetPhrases = false;
      } else if (this.lastSelectionType === "targetDataset" && !this.isSelectingTargetPhrases) {
        this.isSelectingFeatures = true;
        await this.handleTargetDatasetSelection();
        this.isSelectingFeatures = false;
      }
    } finally {
      this.isSelectingFeatures = false;
      this.isSelectingTargetPhrases = false;
    }
  }

  getHeadingsManager(): HeadingsManager {
    if (!this.headingsManager) {
      this.headingsManager = new HeadingsManager();
    }
    return this.headingsManager;
  }

  async getChildCases(iCaseIDs: number[], iDatasetName: string, iCollectionName: string) {
    const tPromises = iCaseIDs.map(async (iID) => {
      const tResult = await codapInterface.sendRequest({
        action: 'get',
        resource: `dataContext[${iDatasetName}].collection[${iCollectionName}].caseByID[${iID}]`
      }).catch(reason => {
        console.log('Unable to get child case because', reason);
      }) as GetCaseByIDResponse;
      return tResult.success && tResult.values ? tResult.values.case.values : {}
    });
    return await Promise.all(tPromises);
  }

  getBasicInfo() {
    const conditionalInfo = testingStore.useTestingDataset
      ? {
        tDatasetName: testingStore.testingDatasetInfo.name,
        tCollectionName: testingStore.testingCollectionName,
        tAttributeName: testingStore.testingAttributeName,
        tClassAttributeName: testingStore.testingClassAttributeName
      } : {
        tDatasetName: targetStore.targetDatasetInfo.name,
        tCollectionName: targetStore.targetCollectionName,
        tAttributeName: targetStore.targetAttributeName,
        tClassAttributeName: targetStore.targetClassAttributeName
      };
    const { collectionName, datasetName } = featureStore.featureDatasetInfo;
    return {
      tPredictedLabelAttributeName: targetStore.targetPredictedLabelAttributeName,
      collectionName, datasetName,
      ...conditionalInfo
    };
  }

  /**
   * If the Features dataset has cases selected, for each selected case
   *   - Pull out the array of 'usages' - the the case IDs of the cases in the dataset being analyzed
   *   - Select these cases in that dataset
   *   - Pull the phrase from the target case
   */
  async handleFeatureSelection() {
    const { useTestingDataset } = testingStore,
      {
        tDatasetName, tCollectionName, tAttributeName, tClassAttributeName, tPredictedLabelAttributeName,
        collectionName, datasetName
      } = this.getBasicInfo(),
      tFeaturesMap: Record<number, string> = {},
      tCaseRequests: APIRequest[] = [];


    // If we have a testing dataset but no test has been run, we're done
    if (useTestingDataset && testingStore.testingResultsArray.length === 0) return;

    // Get all the selected cases in the Features dataset. Some will be features and some will be weights
    // For the features, we just need to record their caseIDs. For the weights, we record a request to get parents
    const tSelectedFeaturesSet: Set<number> = new Set();
    const weightParents: Record<number, number> = {};
    const tSelectionListResult = await codapInterface.sendRequest({
      action: 'get',
      resource: `dataContext[${datasetName}].selectionList`
    }) as GetSelectionListResponse;
    if (tSelectionListResult.success && tSelectionListResult.values) {
      tSelectionListResult.values.forEach(iValue => {
        if (iValue.collectionName === collectionName) {
          tSelectedFeaturesSet.add(iValue.caseID);
        } else {
          tCaseRequests.push({
            action: 'get',
            resource: `dataContext[${datasetName}].collection[${iValue.collectionName}].caseByID[${iValue.caseID}]`
          });
        }
      });
    }
    // Get the parents
    if (tCaseRequests.length > 0) {
      const tCaseResults = await codapInterface.sendRequest(tCaseRequests) as GetCaseByIDResponse[];
      tCaseResults.forEach(iResult => {
        if (iResult.success && iResult.values?.case.parent) {
          tSelectedFeaturesSet.add(iResult.values.case.parent);
          weightParents[iResult.values.case.id] = iResult.values.case.parent;
        }
      })
    }
    const tIDsOfFeaturesToSelect = Array.from(tSelectedFeaturesSet);

    // We need all the features as cases so we can get their used caseIDs from the target dataset
    const tFeatureCasesResult = await codapInterface.sendRequest(
      tIDsOfFeaturesToSelect.map(iID => {
        return {
          action: 'get',
          resource: `dataContext[${datasetName}].collection[${collectionName}].caseByID[${iID}]`
        };
      })
    ) as GetCaseByIDResponse[];

    function addToFeatureMap(value: string, id: number, childIDs?: number[]) {
      tFeaturesMap[id] = value;
      if (childIDs) childIDs.forEach(childID => tFeaturesMap[childID] = value);
    }
    const tUsedIDsSet: Set<number> = new Set();
    // If we're using the testing dataset, we go through each of the target phrases and pull out the case IDs
    // of the cases that use the selected features. We determine this by looking at the featureIDs attribute
    // of each target phrase case and checking whether that array contains any of the selected feature IDs.
    if (useTestingDataset) {
      const tTestCases = await getCaseValues(tDatasetName, tCollectionName);
      tTestCases.forEach(iCase => {
        const tFeatureIDs = iCase.values.featureIDs;
        if (typeof tFeatureIDs === 'string' && tFeatureIDs.length > 0) {
          const featureIDsJSON = JSON.parse(tFeatureIDs);
          if (Array.isArray(featureIDsJSON)) {
            featureIDsJSON.forEach(anID => {
              if (typeof anID === "number" && (tIDsOfFeaturesToSelect.includes(anID) || weightParents[anID])) {
                tUsedIDsSet.add(iCase.id);
                const feature = featureStore.getFeatureOrTokenByCaseId(anID);
                const token = "name" in feature ? feature.name : "token" in feature ? feature.token : undefined;
                if (token) addToFeatureMap(String(token), anID);
              }
            });
          }
        }
      });
    } else {
      // For each selected feature stash its usages and name
      tFeatureCasesResult.forEach(iResult => {
        if (iResult.success && iResult.values) {
          const tUsages = iResult.values.case.values.usages
          if (typeof tUsages === 'string' && tUsages.length > 0) {
            const usagesJSON = JSON.parse(tUsages);
            if (Array.isArray(usagesJSON)) {
              usagesJSON.forEach(anID => {
                if (typeof anID === "number") tUsedIDsSet.add(anID);
              });
            }
            const aCase = iResult.values.case;
            addToFeatureMap(String(aCase.values.name), aCase.id, aCase.children);
          }
        }
      });
    }

    // Select the target texts that make use of the selected features
    const tUsedCaseIDs = Array.from(tUsedIDsSet);
    await codapInterface.sendRequest({
      action: 'create',
      resource: `dataContext[${tDatasetName}].selectionList`,
      values: tUsedCaseIDs
    });
    
    // Here is where we put the contents of the text component together
    const tQuadruples: PhraseQuadruple[] = [];
    for (const index in tUsedCaseIDs) {
      const caseId = tUsedCaseIDs[index];
      const tGetCaseResult = await codapInterface.sendRequest({
        action: 'get',
        resource: `dataContext[${tDatasetName}].collection[${tCollectionName}].caseByID[${caseId}]`
      }) as GetCaseByIDResponse;
      const features: NonNtigramFeature[] = [];
      if (tGetCaseResult.success && tGetCaseResult.values) {
        const tFeatureValue = tGetCaseResult.values.case.values.featureIDs;
        if (typeof tFeatureValue === 'string' && tFeatureValue.length > 0) {
          const caseFeatureIDs = JSON.parse(tFeatureValue);
          if (Array.isArray(caseFeatureIDs)) {
            caseFeatureIDs.forEach(iValue => {
              const featureOrToken: FeatureOrToken | undefined =
                featureStore.getFeatureByCaseId(iValue) ?? featureStore.getTokenByCaseId(iValue);
              if ((typeof iValue === 'number' || typeof iValue === 'string') && featureOrToken?.highlight) {
                features.push({ word: Number(iValue), feature: featureOrToken });
              }
            });
          }
        }

        const tChildren = await this.getChildCases(tGetCaseResult.values.case.children, tDatasetName, 'results');
        const tFoundChild = tChildren.find(iChild => iChild['model name'] === trainingStore.firstActiveModelName);
        const tPredictedClass = tFoundChild ? tFoundChild[tPredictedLabelAttributeName] : '';
        const tActualClass = tGetCaseResult.values.case.values[tClassAttributeName];
        const tPhrase = tGetCaseResult.values.case.values[tAttributeName];
        const tQuadruple = {
          actual: String(tActualClass),
          predicted: String(tPredictedClass),
          phrase: String(tPhrase),
          nonNtigramFeatures: features.map(feature => ({
            word: tFeaturesMap[Number(feature.word)],
            feature: feature.feature
          })),
          index: tGetCaseResult.values.caseIndex
        };
        tQuadruples.push(tQuadruple);
      }
    }
    textStore.setTitleDataset(useTestingDataset ? "testing" : "target");
    await this.composeText(tQuadruples);
  }

  /**
   * First, For each selected target phrase, select the cases in the Feature dataset that contain the target
   * case id.
   * Second, under headings for the classification, display each selected target phrase as text with
   * features highlighted and non-features grayed out
   */
  public async handleTargetDatasetSelection() {
    const { useTestingDataset } = testingStore,
      {
        tDatasetName, tCollectionName, tAttributeName, tClassAttributeName, tPredictedLabelAttributeName,
        collectionName, datasetName
      } = this.getBasicInfo(),
      tFeaturesMap: Record<number, string> = {},
      // Get all the selected cases in the target dataset. Some will be results and some will be texts
      tSelectionListResult = await codapInterface.sendRequest({
        action: 'get',
        resource: `dataContext[${tDatasetName}].selectionList`
      }) as GetSelectionListResponse,
      tSelectedTextsSet: Set<number> = new Set(),
      tCaseRequests: APIRequest[] = [],
      tFeatureIDsSet: Set<number> = new Set(),
      tQuadruples: PhraseQuadruple[] = [];

    async function handleSelectionInFeaturesDataset() {
      // Select the features or, possibly, deselect all features
      await codapInterface.sendRequest({
        action: 'create',
        resource: `dataContext[${datasetName}].selectionList`,
        values: tIDsOfFeaturesToSelect
      });

      if (featureStore.features.length > 0) {
        // Get the features and stash them in a set
        const tSelectedFeatureCases = await getSelectedCasesFrom(datasetName, collectionName);
        tSelectedFeatureCases.forEach(iCase => {
          // It would be better if this were just the caseId, but child ids are used throughout the StoryQ codebase,
          // so it's better to just include all ids in this dictionary.
          tFeaturesMap[iCase.id] = String(iCase.values.name);
          iCase.children.forEach(childCaseId => {
            if (childCaseId) tFeaturesMap[Number(childCaseId)] = String(iCase.values.name);
          });
        });
      }
    }

    async function handleSelectionInTargetDataset() {
      if (tIDsOfParentCasesToSelect.length > 0) {
        await codapInterface.sendRequest({
          action: 'create',
          resource: `dataContext[${tDatasetName}].selectionList`,
          values: tIDsOfParentCasesToSelect
        });
      }
    }

    // For the texts, we just need to record their caseIDs. For the results, we record a request to get parents
    if (tSelectionListResult.success && tSelectionListResult.values) {
      tSelectionListResult.values.forEach(iValue => {
        if (iValue.collectionName === tCollectionName) {
          tSelectedTextsSet.add(iValue.caseID);
        } else {
          tCaseRequests.push({
            action: 'get',
            resource: `dataContext[${tDatasetName}].collection[${iValue.collectionName}].caseByID[${iValue.caseID}]`
          });
        }
      });
    }
    // Get the parents
    if (tCaseRequests.length > 0) {
      const tCaseResults = await codapInterface.sendRequest(tCaseRequests) as GetCaseByIDResponse[];
      tCaseResults.forEach(iResult => {
        if (iResult.success && iResult.values && iResult.values.case.parent != null) {
          tSelectedTextsSet.add(iResult.values.case.parent);
        }
      });
    }
    const tIDsOfTextsToSelect = Array.from(tSelectedTextsSet);
    // We need all the texts as cases so we can get their used caseIDs from the target dataset
    const tTextCasesResult = await codapInterface.sendRequest(
      tIDsOfTextsToSelect.map(iID => {
        return {
          action: 'get',
          resource: `dataContext[${tDatasetName}].collection[${tCollectionName}].caseByID[${iID}]`
        };
      })
    ) as GetCaseByIDResponse[];
    // For each selected text stash its list of features, and stash the phrase, actual and predicted
    // labels in tQuadruples
    tTextCasesResult.forEach(async iResult => {
      if (iResult.success && iResult.values) {
        const tCaseValues = iResult.values.case.values,
          tChildIDs = iResult.values.case.children,
          tFeaturesInText = tCaseValues.featureIDs;
        let tFeatureIDsForThisText: (number | string)[] = [],
          tPredictedResult = '';
        if (typeof tFeaturesInText === 'string' && tFeaturesInText.length > 0) {
          const tFeaturesInTextJSON = JSON.parse(tFeaturesInText);
          if (Array.isArray(tFeaturesInTextJSON)) {
            tFeatureIDsForThisText = tFeaturesInTextJSON.map(id => String(id));
            tFeatureIDsForThisText.forEach((anID: string | number) => {
              tFeatureIDsSet.add(Number(anID));
            })
          }
        }
        // If we're using the testing dataset, the predicted value belongs is to be found
        // in tCaseValues
        if (useTestingDataset) {
          tPredictedResult = String(tCaseValues[tPredictedLabelAttributeName]) || '';
        } else {
          // The predicted value, if there is one, belongs to the child case that has the correct
          // model name
          if (tChildIDs && tChildIDs.length > 0) {
            const tChildRequests = tChildIDs.map((iID: number) => {
                return {
                  action: 'get',
                  resource: `dataContext[${tDatasetName}].collection[results].caseByID[${iID}]`
                }
              }),
              tChildRequestResults = await codapInterface.sendRequest(tChildRequests) as GetCaseByIDResponse[],
              tFoundChild = tChildRequestResults.find(iChildResult => {
                return iChildResult.success && iChildResult.values &&
                  iChildResult.values.case.values['model name'] === trainingStore.firstActiveModelName;
              })
            if (tFoundChild?.values) {
              tPredictedResult = String(tFoundChild.values.case.values[tPredictedLabelAttributeName]);
            }
          }
        }

        const possibleNonNtigramFeatures = tFeatureIDsForThisText.map(id => {
          const featureOrToken: FeatureOrToken | undefined =
            featureStore.getFeatureByCaseId(Number(id)) ?? featureStore.getTokenByCaseId(Number(id));
          if (featureOrToken?.highlight) {
            return {
              // We save the id in the word section just to get the types to match.
              // After handling selection, we use the id to look up the word in the feature map.
              word: String(id),
              feature: featureOrToken
            };
          }
          return undefined;
        });
        const nonNtigramFeatures: NonNtigramFeature[] =
          possibleNonNtigramFeatures.filter(iFeature => !!iFeature) as NonNtigramFeature[];
        tQuadruples.push({
          phrase: String(tCaseValues[tAttributeName]),
          predicted: tPredictedResult,
          actual: String(tCaseValues[tClassAttributeName]),
          nonNtigramFeatures,
          index: iResult.values.caseIndex
        });
      }
    });

    const tIDsOfFeaturesToSelect: number[] = Array.from(tFeatureIDsSet),
      tIDsOfParentCasesToSelect: number[] = Array.from(tSelectedTextsSet);
    await handleSelectionInTargetDataset();
    if (await datasetExists(datasetName))
      await handleSelectionInFeaturesDataset();

    // We can now convert each quad's array of feature IDs to features
    tQuadruples.forEach(iQuad => {
      iQuad.nonNtigramFeatures = iQuad.nonNtigramFeatures
        .map(feature => ({ ...feature, word: tFeaturesMap[Number(feature.word)] }));
    });

    textStore.setTitleDataset(useTestingDataset ? "testing" : "target");
    await this.composeText(tQuadruples);
  }

  /**
   * Update the text pane's displayed phrases
   * @param iPhraseQuadruples  Specifications for the phrases to be displayed
   * @public
   */
  public async composeText(iPhraseQuadruples: PhraseQuadruple[]) {
    const kHeadingsManager = this.getHeadingsManager();
    const kProps =
      ['negNeg', 'negPos', 'negBlank', 'posNeg', 'posPos', 'posBlank', 'blankNeg', 'blankPos', 'blankBlank'];
    const texts: Record<string, ITextSectionText[]> = {};


    async function addOnePhrase(iQuadruple: PhraseQuadruple) {
      const kLabels: ClassLabel = kHeadingsManager.classLabels;

      let tGroup: string;
      switch (iQuadruple.actual) {
        case kLabels.negLabel:
          switch (iQuadruple.predicted) {
            case kLabels.negLabel:
              tGroup = 'negNeg';
              break;
            case kLabels.posLabel:
              tGroup = 'negPos';
              break;
            default:
              tGroup = 'negBlank';
          }
          break;
        case kLabels.posLabel:
          switch (iQuadruple.predicted) {
            case kLabels.negLabel:
              tGroup = 'posNeg';
              break;
            case kLabels.posLabel:
              tGroup = 'posPos';
              break;
            default:
              tGroup = 'posBlank';
          }
          break;
        default:
          switch (iQuadruple.predicted) {
            case kLabels.negLabel:
              tGroup = 'blankNeg';
              break;
            case kLabels.posLabel:
              tGroup = 'blankPos';
              break;
            default:
              tGroup = 'blankBlank';
          }
      }
      if (!texts[tGroup]) texts[tGroup] = [];
      texts[tGroup].push({
        textParts: await highlightFeatures(iQuadruple.phrase, iQuadruple.nonNtigramFeatures),
        index: iQuadruple.index
      });
    }

    for (const iTriple of iPhraseQuadruples) {
      await addOnePhrase(iTriple);
    }

    // The phrases are all in their groups. Create the array of group objects
    textStore.setTextSections([]);
    kProps.forEach(iProp => {
      const tPhrases = texts[iProp];
      if (tPhrases && tPhrases.length !== 0) {
        textStore.textSections.push({
          title: kHeadingsManager.headings[iProp],
          text: texts[iProp]
        });
      }
    });
  }
}
