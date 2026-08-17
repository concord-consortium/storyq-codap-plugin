/**
 * The ModelManager uses information in the domain store to build a model
 */
import { action, runInAction } from "mobx";
import { deselectAllCasesIn } from "../lib/codap-helper";
import codapInterface from "../lib/CodapInterface";
import { LogisticRegression } from "../lib/jsregression";
import { Document, oneHot } from "../lib/one_hot";
import { domainStore } from "../stores/domain_store";
import { featureStore } from "../stores/feature_store";
import {
  Feature, kFeatureKindNgram, kTokenTypeConstructed, NgramDetails, StoredAIModel, Token
} from "../stores/store_types_and_constants";
import { targetStore } from "../stores/target_store";
import { trainingStore } from "../stores/training_store";
import { computeKappa } from "../utilities/utilities";
import {
  APIRequest, CaseInfo, CaseValues, CreateCaseResponse, CreateCaseValue, GetCaseByIDResponse, GetCaseCountResponse,
  GetCaseFormulaSearchResponse, GetCollectionListResponse, GetItemSearchResponse, UpdateCaseValue
} from "../types/codap-api-types";

export class ModelManager {

  stepModeContinueCallback: ((iIteration: number) => void) | null = null
  stepModeIteration: number = 0

  constructor() {
    this.progressBar = this.progressBar.bind(this)
    this.stepModeCallback = this.stepModeCallback.bind(this)
  }

  guaranteeUniqueModelName(iCandidate: string) {
    function isNotUnique(iName: string) {
      return Boolean(trainingStore.trainingResults.find(iResult => iResult.name === iName))
    }

    let counter = 1,
      tTest = iCandidate
    while (isNotUnique(tTest)) {
      tTest = `${iCandidate}_${counter}`
      counter++
    }
    return tTest
  }

  /**
   * - We make sure both collections have their attributes showing
   * - If new cases for those collections need to be created, we create them
   * - We fill in the model name for cases in each collection
   * - We gather up the caseIDs for both weight and result cases
   */
  async prepWeightsCollection(iTokens: Token[]) {

    /**
     * We test to see if the weight case for each token has an empty model name
     */
    async function allFirstWeightCasesAreEmpty() {
      const tAttrName = 'name'
      let tIsEmpty = true,
        tFoundOne = false;
      for (let tIndex = 0; tIndex < iTokens.length && tIsEmpty; tIndex++) {
        const tFormula = `${tAttrName}==${iTokens[tIndex].token}`,
          tFirstChildResult = await codapInterface.sendRequest({
            action: 'get',
            resource: `dataContext[${datasetName}].itemSearch[${tFormula}]`
          }) as GetItemSearchResponse;
        if (tFirstChildResult.success && tFirstChildResult.values && tFirstChildResult.values.length > 0) {
          tFoundOne = true
          const tName = tFirstChildResult.values[0].values['model name']
          tIsEmpty = tIsEmpty && (!tName || tName === '')
        }
      }
      return tFoundOne && tIsEmpty
    }

    const { collectionName, datasetName, weightsCollectionName } = featureStore.featureDatasetInfo,
      tUpdatingExistingWeights = await allFirstWeightCasesAreEmpty(),
      tCreationRequests: CreateCaseValue[] = [],
      tUpdateRequests: UpdateCaseValue[] = [],
      tFeatureWeightCaseIDs: Record<string, number> = {},
      tTokenArray: string[] = [],
      tModelName = trainingStore.model.name;

    async function showWeightAttributes() {
      const tShowRequests = [{
        action: 'update',
        resource: `dataContext[${datasetName}].collection[${weightsCollectionName}].attribute[weight]`,
        values: {hidden: false}
      }, {
        action: 'update',
        resource: `dataContext[${datasetName}].collection[${weightsCollectionName}].attribute[model name]`,
        values: {hidden: false}
      }];
      await codapInterface.sendRequest(tShowRequests);
    }

    async function getFeatureWeightCaseIDs() {
      const tFeatureCountResult = await codapInterface.sendRequest({
          action: 'get',
          resource: `dataContext[${datasetName}].collection[${collectionName}].caseCount`
        }) as GetCaseCountResponse,
        tFeatureCount = tFeatureCountResult.success&& tFeatureCountResult.values ? tFeatureCountResult.values : 0,
        tRequests: APIRequest[] = [];
      for (let n = 0; n < tFeatureCount; n++) {
        tRequests.push({
          action: 'get',
          resource: `dataContext[${datasetName}].collection[${collectionName}].caseByIndex[${n}]`
        });
      }
      const tResults = await codapInterface.sendRequest(tRequests) as GetCaseByIDResponse[];
      tResults.forEach(iResult => {
        if (iResult.success && iResult.values) {
          tFeatureWeightCaseIDs[String(iResult.values.case.values.name)] = iResult.values.case.id;
        }
      });
    }

    // Start with features/weights collection
    await showWeightAttributes();
    if (tUpdatingExistingWeights) {
      await getFeatureWeightCaseIDs();
      featureStore.featureWeightCaseIDs = tFeatureWeightCaseIDs;
    }
    
    // generate feature requests
    iTokens.forEach(aToken => {
      if (tUpdatingExistingWeights) {
        tUpdateRequests.push({
          id: tFeatureWeightCaseIDs[aToken.token],
          values: {
            'model name': tModelName,
          }
        });
      } else {
        tFeatureWeightCaseIDs[aToken.token] = -1;
        tTokenArray.push(aToken.token);
        tCreationRequests.push({
          parent: aToken.featureCaseID || 0,
          values: {
            'model name': tModelName,
          }
        });
      }
    });
      
    if (tUpdatingExistingWeights) {
      await codapInterface.sendRequest({
        action: 'update',
        resource: `dataContext[${datasetName}].collection[${weightsCollectionName}].case`,
        values: tUpdateRequests
      });
    } else {
      const tCreateResults = await codapInterface.sendRequest({
        action: 'create',
        resource: `dataContext[${datasetName}].collection[${weightsCollectionName}].case`,
        values: tCreationRequests
      }) as CreateCaseResponse;
      if (tCreateResults.success && tCreateResults.values) {
        tCreateResults.values.forEach((iValue, iIndex) => {
          tFeatureWeightCaseIDs[tTokenArray[iIndex]] = iValue.id;
        });
      }
      featureStore.featureWeightCaseIDs = tFeatureWeightCaseIDs;
    }
  }

  async prepResultsCollection() {
    /**
     * The results collection is a child of the target collection and is where we show the predicted labels and
     * probabilities for each target text for each model
     */
    async function guaranteeResultsCollection() {
      const tPositiveClassName = targetStore.positiveClassName,
        tResultsCollectionName = targetStore.targetResultsCollectionName;
      if (targetStore.targetClassAttributeName !== '' && tPositiveClassName !== '') {
        const collectionListResult  = await codapInterface.sendRequest({
          action: 'get',
          resource: `dataContext[${tTargetDatasetName}].collectionList`
        }) as GetCollectionListResponse;
        if (collectionListResult.success && collectionListResult.values && collectionListResult.values.length === 1) {
          // There is not yet any results collection, so create it
          const tAttributeValues = [
            {
              name: 'model name',
              description: 'The model used for predicting these results'
            },
            {
              name: tPredictedLabelAttributeName,
              description: 'The label predicted by the model'
            },
            {
              name: 'probability of ' + tPositiveClassName,
              unit: '%',
              precision: 3,
              description: 'A computed probability based on the logistic regression model'
            }
          ];
          await codapInterface.sendRequest({
            action: 'create',
            resource: `dataContext[${tTargetDatasetName}].collection`,
            values: [{
              name: tResultsCollectionName,
              title: tResultsCollectionName,
              attrs: tAttributeValues
            }]
          }).catch(reason => {
            console.log(`Exception in creating results collection because ${reason}`);
          });

          // This unfortunately installs an empty child case for each parent case. We store their IDs so we can
          // use them later as the place to store model results
          const tCaseIDResult = await codapInterface.sendRequest({
            action: 'get',
            resource: `dataContext[${tTargetDatasetName}].collection[${tResultsCollectionName}].caseFormulaSearch[true]`
          }) as GetCaseFormulaSearchResponse;
          if (tCaseIDResult.success && tCaseIDResult.values) {
            tResultCaseIDsToFill = tCaseIDResult.values.map(iValue => Number(iValue.id));
          }
        } else { // We add a new case to each parent case for the next set of results
          const tParentCollectionName = targetStore.targetCollectionName,
            tCreateRequests: { parent: number, values: {} }[] = [];
          // First we get the parent case IDs
          const tParentCaseIDResults = await codapInterface.sendRequest({
            action: 'get',
            resource: `dataContext[${tTargetDatasetName}].collection[${tParentCollectionName}].caseFormulaSearch[true]`
          }) as GetCaseFormulaSearchResponse;
          // Formulate the requests for the child cases
          if (tParentCaseIDResults.success && tParentCaseIDResults.values) {
            tParentCaseIDResults.values.forEach(iResult => {
              tCreateRequests.push({
                parent: Number(iResult.id),
                values: {}
              });
            });
          }
          // Send off the requests
          const tChildrenRequestResult = await codapInterface.sendRequest({
            action: 'create',
            resource: `dataContext[${tTargetDatasetName}].collection[${tResultsCollectionName}].case`,
            values: tCreateRequests
          }) as CreateCaseResponse;
          // Store the IDs for the children for later use
          if (tChildrenRequestResult.success && tChildrenRequestResult.values) {
            tResultCaseIDsToFill = tChildrenRequestResult.values.map(iValue => Number(iValue.id));
          }
        }
      }
    }

    const tPredictedLabelAttributeName = targetStore.targetPredictedLabelAttributeName,
      tTargetDatasetName = targetStore.targetDatasetInfo.name;
    let tResultCaseIDsToFill: number[] = [];

    await guaranteeResultsCollection();

    trainingStore.resultCaseIDs = tResultCaseIDsToFill;
  }

  async cancel() {

    async function wipeWeights() {
      const { datasetName, weightsCollectionName } = featureStore.featureDatasetInfo,
        tFeatureWeightCaseIDs = featureStore.featureWeightCaseIDs,
        tUpdateRequests: UpdateCaseValue[] = [];
      for (let featureWeightCaseIDsKey in tFeatureWeightCaseIDs) {
        tUpdateRequests.push({
          id: tFeatureWeightCaseIDs[featureWeightCaseIDsKey],
          values: {
            'model name': '',
            weight: ''
          }
        });
      }
      await codapInterface.sendRequest({
        action: 'update',
        resource: `dataContext[${datasetName}].collection[${weightsCollectionName}].case`,
        values: tUpdateRequests
      });
    }

    async function wipeResultsInTarget() {
      const tTargetDatasetName = targetStore.targetDatasetInfo.name,
        tPredictedLabelAttributeName = targetStore.targetPredictedLabelAttributeName,
        tProbName = `probability of ${targetStore.positiveClassName}`,
        tUpdateRequests = trainingStore.resultCaseIDs.map(iID => {
          const tRequest: UpdateCaseValue = {
            id: iID,
            values: {
              'model name': '',
            }
          }
          tRequest.values[tPredictedLabelAttributeName] = ''
          tRequest.values[tProbName] = ''
          return tRequest
        });
      await codapInterface.sendRequest({
        action: 'update',
        resource: `dataContext[${tTargetDatasetName}].collection[${targetStore.targetResultsCollectionName}].case`,
        values: tUpdateRequests,
      });
    }

    trainingStore.model.reset();
    // All three, not just the message flag: a resume left pending on a model that no longer exists
    // would divert the first Step of the next fresh run into a catch-up.
    trainingStore.setTrainingCouldNotBeResumed(false);
    trainingStore.setResumeIsPending(false);
    trainingStore.setRestoringRun(false);
    await wipeWeights();
    await wipeResultsInTarget();
  }

  /**
   * The weight cases the interrupted run wrote, keyed by token name.
   *
   * The attribute is called `model name`, with a space, so the formula has to backquote it: without
   * the backquotes CODAP answers success: false and the resume is refused for no good reason.
   *
   * Returns whatever it could resolve and, separately, whether it resolved one case per token. The
   * two answers are used for different things and must not be collapsed into one: the resume is
   * refused unless `complete`, while Cancel takes `ids` as it stands, because clearing a case the
   * interrupted run stamped with its own name is safe even when the set is partial, and the fallback
   * is the path that tells the student to press Cancel.
   */
  async reacquireWeightCaseIDs(iModelName: string, iTokens: string[]) {
    const { collectionName, datasetName, weightsCollectionName } = featureStore.featureDatasetInfo;
    const tEscapedName = iModelName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const tWeightCases = await codapInterface.sendRequest({
      action: 'get',
      resource: `dataContext[${datasetName}].collection[${weightsCollectionName}]` +
        `.caseFormulaSearch[\`model name\`=='${tEscapedName}']`
    }) as GetCaseFormulaSearchResponse;
    const tFeatureCases = await codapInterface.sendRequest({
      action: 'get',
      resource: `dataContext[${datasetName}].collection[${collectionName}].caseFormulaSearch[true]`
    }) as GetCaseFormulaSearchResponse;
    if (!tWeightCases.success || !tWeightCases.values || !tFeatureCases.success || !tFeatureCases.values) {
      return { ids: {}, complete: false };
    }

    const tTokenOfFeatureCase: Record<number, string> = {};
    tFeatureCases.values.forEach(iCase => { tTokenOfFeatureCase[Number(iCase.id)] = String(iCase.values.name); });

    const tIDs: Record<string, number> = {};
    let tComplete = true;
    for (const iCase of tWeightCases.values) {
      const tToken = tTokenOfFeatureCase[Number(iCase.parent)];
      // Unresolvable, or a second case for a token already resolved. Either way the set is no longer
      // one-per-token, so the resume is off; the ids gathered so far still belong to this model's
      // name and are still the right thing for Cancel to blank.
      if (!tToken || tIDs[tToken] != null) { tComplete = false; continue; }
      tIDs[tToken] = Number(iCase.id);
    }
    if (Object.keys(tIDs).length !== iTokens.length || iTokens.some(iToken => tIDs[iToken] == null)) {
      tComplete = false;
    }
    return { ids: tIDs, complete: tComplete };
  }

  /**
   * The interrupted run's result cases are the newest child of each target case, taken in the order
   * of the target case list the resume captured, because showPredictedLabels pairs them positionally
   * against the documents. The results collection accumulates one child per target case per model,
   * so the unfiltered list is not this run's set, and a plain interrupted run has written no model
   * name for a name search to find.
   *
   * This issues its own search rather than going through getCaseValues, which deletes `parent` from
   * every case it returns.
   *
   * Reports its two answers the way reacquireWeightCaseIDs does, and for the same reason: `complete`
   * gates the resume, because the positional pairing needs every target case to have paired, while
   * `ids` is what Cancel blanks and is worth having even when a target case added since the run was
   * interrupted has no result child of its own.
   */
  async reacquireResultCaseIDs(iTargetCaseIDs: number[]) {
    const tTargetDatasetName = targetStore.targetDatasetInfo.name;
    const tResultCases = await codapInterface.sendRequest({
      action: 'get',
      resource: `dataContext[${tTargetDatasetName}].collection[${targetStore.targetResultsCollectionName}]` +
        `.caseFormulaSearch[true]`
    }) as GetCaseFormulaSearchResponse;
    if (!tResultCases.success || !tResultCases.values) return { ids: [], complete: false };

    const tChildrenOf: Record<number, number[]> = {};
    tResultCases.values.forEach(iCase => {
      const tParent = Number(iCase.parent);
      (tChildrenOf[tParent] ||= []).push(Number(iCase.id));
    });
    const tIDs = iTargetCaseIDs.map(iID => {
      const tChildren = tChildrenOf[iID];
      return tChildren?.length ? tChildren[tChildren.length - 1] : undefined;
    });
    // Compacted when incomplete, which is safe because an incomplete result refuses the resume, so the
    // only thing that ever reads this array positionally has already been ruled out.
    return { ids: tIDs.filter(iID => iID != null) as number[], complete: !tIDs.some(iID => iID == null) };
  }

  /**
   * Turns a list of target cases into the documents and the encoded matrix a fit runs on. A fresh run
   * and a resume share this so that the two cannot drift apart: a resume that rebuilt the documents
   * its own way would silently encode a different training set.
   *
   * The caller passes the target cases rather than this reading targetStore.targetCases, because that
   * field is reassigned with a filtered subset by work that fires unawaited on every document open.
   *
   * This writes nothing to the AIModel. It reports ignoreStopWords rather than assigning it, because
   * the resume calls this to validate a restored run, and a validation that assigned would leave a
   * refused resume having altered the document it was supposed to leave alone.
   */
  encodeTrainingData(iTargetCases: CaseInfo[]) {
    const tTargetAttributeName = targetStore.targetAttributeName,
      tTargetColumnFeatureNames = featureStore.targetColumnFeatureNames,
      tNonNgramFeatures = featureStore.chosenFeatures.filter(iFeature => iFeature.info.kind !== kFeatureKindNgram),
      tNgramFeatures = featureStore.chosenFeatures.filter(iFeature => iFeature.info.kind === kFeatureKindNgram),
      tUnigramFeature = tNgramFeatures.find(iFeature => (iFeature.info.details as NgramDetails).n === 'uni'),
      tPositiveClassName = targetStore.positiveClassName,
      tDocuments: Document[] = [];

    const tColumnNames = tTargetColumnFeatureNames.concat(
      featureStore.chosenFeatures.map(iFeature => {
        return iFeature.name;
      })
    );
    // Grab the strings in the target collection that are the values of the target attribute.
    // Stash these in an array that can be used to produce a oneHot representation
    iTargetCases.forEach(iCase => {
      const tCaseID = iCase.id,
        tText = iCase.values[tTargetAttributeName],
        tClass = iCase.values[targetStore.targetClassAttributeName],
        tColumnFeatures: Record<string, number | boolean> = {};
      // We're going to put column features into each document as well so one-hot can include them in the vector
      tColumnNames.forEach((aName) => {
        const featureValue = iCase.values[aName];
        const numberValue = Number(featureValue);
        let tValue: number;
        if (isFinite(numberValue)) {
          if (numberValue > 0) {
            tValue = 1;
          } else {
            tValue = 0;
          }
        } else {
          if (['1', 'true'].indexOf(String(featureValue).toLowerCase()) >= 0) {
            tValue = 1;
          } else {
            tValue = 0;
          }
        }
        if (tValue) tColumnFeatures[aName] = tValue;
      });
      tDocuments.push({
        example: String(tText), class: String(tClass), caseID: tCaseID, columnFeatures: tColumnFeatures
      });
    });

    const tData: number[][] = [];

    // Logistic can't happen until we've isolated the features and produced a oneHot representation
    const tIgnore = tUnigramFeature && (tUnigramFeature.info.ignoreStopWords === true ||
      tUnigramFeature.info.ignoreStopWords === false) ? tUnigramFeature.info.ignoreStopWords : true;
    const tOneHot = oneHot({
        frequencyThreshold: (tUnigramFeature && (Number(tUnigramFeature.info.frequencyThreshold) - 1)) || 0,
        ignoreStopWords: tIgnore,
        ignorePunctuation: true,
        includeUnigrams: Boolean(tUnigramFeature),
        positiveClass: tPositiveClassName,
        negativeClass: targetStore.negativeClassName,
        features: tNonNgramFeatures
      },
      tDocuments);
    if (!tOneHot) return undefined;

    // Column feature results get pushed on after unigrams

    // The logisticModel.fit function requires that the class value (0 or 1) be the
    // last element of each oneHot.
    tOneHot.oneHotResult.forEach(iResult => {
      iResult.oneHotExample.push(iResult.class === tPositiveClassName ? 1 : 0);
      tData.push(iResult.oneHotExample);
    });

    return { data: tData, oneHot: tOneHot, documents: tDocuments, ignoreStopWords: tIgnore };
  }

  /**
   * The eager half of a restore. It re-acquires the case IDs whether or not the run turns out to be
   * resumable, then rebuilds the encoded data, checks it against what the document recorded, and
   * either commits the rebuild or puts the token maps back.
   *
   * setTrainingRowCount is the only AIModel write on this path. Nothing else here may assign to the
   * model, because a refused resume has to leave the document exactly as it found it, and restoring
   * the token maps restores nothing else.
   */
  async prepareResume(iTargetCases: CaseInfo[]) {
    const tModel = trainingStore.model;
    const tSnapshot = featureStore.snapshotTokens();
    const tSavedTokens = Object.values(tSnapshot);
    const tSavedNames = tSavedTokens.map(iToken => iToken.token);
    // The saved ordering counts only when every token carries a distinct, non-negative index.
    // getNewToken defaults index to -1, and a map of all -1s sorts into insertion order, which would
    // then be re-imposed as though it were the run's own ordering. Names are taken above and are
    // unaffected: membership and the weight search need the set, not the order.
    const tIndexes = tSavedTokens.map(iToken => iToken.index);
    const tOrderIsUsable = tIndexes.every(iIndex => iIndex >= 0) &&
      new Set(tIndexes).size === tIndexes.length;
    const tSavedOrder = tOrderIsUsable
      ? tSavedTokens.slice().sort((a, b) => a.index - b.index).map(iToken => iToken.token)
      : undefined;
    const tTargetCaseIDs = iTargetCases.map(iCase => iCase.id);

    // Acquired before the resumable-or-not branch, so Cancel works either way, and the weight ids are
    // taken as far as they resolved rather than all-or-nothing, so that Cancel on the fallback path
    // still has something to blank.
    const tWeightCaseIDs = await this.reacquireWeightCaseIDs(tModel.name, tSavedNames);
    const tResultCaseIDs = await this.reacquireResultCaseIDs(tTargetCaseIDs);
    featureStore.setFeatureWeightCaseIDs(tWeightCaseIDs.ids);
    trainingStore.resultCaseIDs = tResultCaseIDs.ids;

    // An empty saved map is its own rejection condition rather than a special case of the token-set
    // check below: it records no column set, so there is nothing for that check to compare against.
    if (tSavedNames.length === 0) return false;
    // The encoding is one row per target case, so no target cases is exactly an empty matrix, and fit
    // reads data[0].length on its first line. Checked here rather than on the encoded data so that
    // the refusal is a clean one, with no rebuild committed and nothing to undo. It is reachable only
    // for a document that predates the row count, since the row check below refuses a later one
    // first, and it does not need rows to have been deleted: a target dataset renamed or removed
    // while the document was closed arrives here on a successful round trip.
    if (iTargetCases.length === 0) return false;
    if (tModel.trainingRowCount != null && tModel.trainingRowCount !== iTargetCases.length) return false;
    // A constructed token stays in tokenMap when its feature is unchosen or deleted, because
    // toggleChosenFor only sweeps unigram tokens and deleteFeature's non-unigram branch never calls
    // deleteToken. So the token-set check below sees no change while the column it encodes has gone
    // to all zeros, and the resume would silently fit a different training set. Target column
    // features have constructed tokens with no Feature object of their own, which is why that half
    // of the test is not optional.
    const tColumnFeatureNames = featureStore.targetColumnFeatureNames;
    const tEveryConstructedTokenIsLive = tSavedTokens.every(iToken =>
      iToken.type !== kTokenTypeConstructed ||
      tColumnFeatureNames.includes(iToken.token) ||
      Boolean(featureStore.getFeatureByName(iToken.token)?.chosen));
    if (!tEveryConstructedTokenIsLive) return false;
    if (!tWeightCaseIDs.complete || !tResultCaseIDs.complete) return false;

    const tEncoded = this.encodeTrainingData(iTargetCases);
    if (!tEncoded) {
      featureStore.restoreTokens(tSnapshot);
      return false;
    }

    const tRebuiltNames = tEncoded.oneHot.tokenArray.map((iToken: Token) => iToken.token);
    const tSameTokenSet = tRebuiltNames.length === tSavedNames.length &&
      tSavedNames.every(iName => tRebuiltNames.includes(iName));
    if (!tSameTokenSet) {
      featureStore.restoreTokens(tSnapshot);
      return false;
    }

    // Re-impose the saved ordering on the token array, on the columns of the encoded data and on
    // tokenMap's own indexes. The last of those is what keeps a document that is interrupted a second
    // time landing in the same place rather than one rounding step away. Skipped entirely when the
    // saved ordering is not usable: the resume then runs on the rebuilt order and accepts the one-ULP
    // difference, because ordering is never a reason to refuse a resume.
    let tOrderedData = tEncoded.data;
    if (tSavedOrder) {
      const tPositionOf: Record<string, number> = {};
      tEncoded.oneHot.tokenArray.forEach((iToken: Token, iIndex: number) => {
        tPositionOf[iToken.token] = iIndex;
      });
      const tOrderedTokens = tSavedOrder.map(iName => tEncoded.oneHot.tokenArray[tPositionOf[iName]]);
      tOrderedTokens.forEach((iToken: Token, iIndex: number) => {
        iToken.index = iIndex;
        // The token objects are the ones tokenMap holds, so the line above has usually written this
        // already. It is here for a tokenArray that ever holds copies of them.
        if (featureStore.tokenMap[iToken.token]) featureStore.tokenMap[iToken.token].index = iIndex;
      });
      tOrderedData = tEncoded.data.map(iRow => {
        const tRow = tSavedOrder.map(iName => iRow[tPositionOf[iName]]);
        tRow.push(iRow[iRow.length - 1]); // the class value stays last
        return tRow;
      });
      tEncoded.oneHot.tokenArray = tOrderedTokens;
    }

    // The rebuild is kept on the logistic model so the gradient replay can wait for a Step press.
    const tLogisticModel = tModel.logisticModel;
    tLogisticModel._data = tOrderedData;
    tLogisticModel._oneHot = tEncoded.oneHot;
    tLogisticModel._documents = tEncoded.documents;
    // Re-recorded so that a run interrupted, resumed and interrupted again is still fully checked.
    tModel.setTrainingRowCount(iTargetCases.length);
    trainingStore.setResumeIsPending(true);
    return true;
  }

  async buildModel() {
    // This run is being started here, so whatever a reopened document restored is no longer in play.
    // All three flags: a resume left pending by a student who reopened a step-mode run and pressed
    // Cancel would otherwise divert this run's first Step into a catch-up.
    trainingStore.setTrainingCouldNotBeResumed(false)
    trainingStore.setResumeIsPending(false)
    trainingStore.setRestoringRun(false)

    const tTargetDatasetName = targetStore.targetDatasetInfo.name,
      tLogisticModel = trainingStore.model.logisticModel

    await deselectAllCasesIn(tTargetDatasetName);
    tLogisticModel.reset();
    tLogisticModel.iterations = trainingStore.model.iterations;
    tLogisticModel.progressCallback = this.progressBar;
    tLogisticModel.trace = trainingStore.model.trainingInStepMode;
    tLogisticModel.stepModeCallback = trainingStore.model.trainingInStepMode ?
      this.stepModeCallback : undefined;
    tLogisticModel.lockIntercept = trainingStore.model.lockInterceptAtZero;

    const tEncoded = this.encodeTrainingData(targetStore.targetCases);
    if (!tEncoded) return
    const { data: tData, oneHot: tOneHot, documents: tDocuments } = tEncoded;

    // Assigned here rather than inside the shared encoding, so that the resume's validation rebuild
    // cannot write it into a restored model it is about to refuse.
    trainingStore.model.setIgnoreStopWords(tEncoded.ignoreStopWords);

    // Recorded so that a document saved during this run can have its row count checked on the way
    // back in. Nothing else ever writes it, because a document only acquires an interrupted run by
    // being saved during a fresh one.
    trainingStore.model.setTrainingRowCount(tDocuments.length);

    // In step mode we'll be repeatedly updating weights and results. Prep for that before we start fitting
    await this.prepWeightsCollection(tOneHot.tokenArray)
    await this.prepResultsCollection()

    // The fitting process is asynchronous so we fire it off here
    tLogisticModel.fit(tData);
    tLogisticModel._data = tData;
    tLogisticModel._oneHot = tOneHot;
    tLogisticModel._documents = tDocuments;
  }

  async progressBar(iIteration: number) {
    const tModel = trainingStore.model,
      tIterations = tModel.iterations,
      this_ = this
    runInAction(async () => {
      tModel.setIteration(iIteration);
      if (iIteration >= tIterations && tModel.logisticModel.fitResult) {
        const tLogisticModel = tModel.logisticModel;

        await this_.computeResults(tModel.logisticModel.fitResult.theta);

        action(() => {
          if (!tLogisticModel.fitResult) return;

          trainingStore.inactivateAll();

          trainingStore.trainingResults.push({
            name: tModel.name,
            targetDatasetName: targetStore.targetDatasetInfo.name,
            isActive: true,
            threshold: Number(tLogisticModel.threshold),
            constantWeightTerm: tLogisticModel.fitResult.constantWeightTerm,
            ignoreStopWords: tModel.ignoreStopWords,
            settings: {
              iterations: tLogisticModel.iterations,
              locked: !!tLogisticModel.lockIntercept,
              thresholdAtPoint5: tModel.usePoint5AsProbThreshold
            },
            accuracy: tLogisticModel.accuracy || 0,
            kappa: (tLogisticModel.accuracy === 0) ? 0 : (tLogisticModel.kappa || 0),
            featureNames: featureStore.chosenFeatureNames,
            hasNgram: featureStore.hasNgram,
            storedModel: this.fillOutCurrentStoredModel(tLogisticModel)
          });
        })();

        await domainStore.syncWeightsAndResultsWithActiveModels()
        await domainStore.recreateUsagesAndFeatureIDs(tModel.ignoreStopWords)

        tModel.reset()
      }
    })
  }

  async stepModeCallback(iIteration: number, iCost: number, iWeights: number[], continueCallback: (iter: number) => void) {
    await this.computeResults(iWeights)
    this.stepModeContinueCallback = continueCallback
    this.stepModeIteration = iIteration
  }

  nextStep() {
    const tLogisticModel = trainingStore.model.logisticModel;
    tLogisticModel.trace = trainingStore.model.trainingInStepMode;
    tLogisticModel.stepModeCallback = tLogisticModel.trace ? this.stepModeCallback : undefined;

    this.stepModeContinueCallback?.(this.stepModeIteration + 1);
  }

  fillOutCurrentStoredModel(iLogisticModel: LogisticRegression): StoredAIModel {
    const tTokenArray = iLogisticModel._oneHot.tokenArray,
      tWeights = iLogisticModel.fitResult?.theta ?? [] // toss the constant term

    return {
      storedTokens: tTokenArray.map((iToken: any, iIndex: number) => {
        return {
          featureCaseID: iToken.featureCaseID,
          name: iToken.token,
          formula: iToken.type !== 'unigram' ? featureStore.getFormulaFor(iToken.token) : '',
          weight: tWeights[iIndex]
        }
      }),
      positiveClassName: targetStore.positiveClassName,
      negativeClassName: targetStore.negativeClassName
    }
  }

  async computeResults(iWeights: number[]) {
    const tModel = trainingStore.model,
      tLogisticModel = tModel.logisticModel,
      tData = tLogisticModel._data,
      tOneHot = tLogisticModel._oneHot,
      tPositiveClassName = targetStore.positiveClassName,
      tNegativeClassName = targetStore.negativeClassName,
      tDocuments = tLogisticModel._documents;
    await this.updateWeights(tModel.name, tOneHot.tokenArray, iWeights);

    let tPredictionTools = {
      logisticModel: tLogisticModel,
      oneHotData: tData,
      documents: tDocuments,
      tokenArray: tOneHot.tokenArray,
      positiveClassName: tPositiveClassName,
      negativeClassName: tNegativeClassName,
      lockProbThreshold: trainingStore.model.usePoint5AsProbThreshold
    }
    await this.showPredictedLabels(tModel.name, tPredictionTools)
  }

  async updateWeights(iModelName: string, iTokens: any, iWeights: number[]) {
    const { collectionName, datasetName } = featureStore.featureDatasetInfo,
      tFeatures = featureStore.chosenFeatures,
      tUpdateRequests: UpdateCaseValue[] = [],
      tFeatureWeightCaseIDs = featureStore.featureWeightCaseIDs

    function generateRequests() {
      iTokens.forEach((aToken: any, iIndex: number) => {
          let tWeight: number | '',
            tFeature: Feature | undefined,
            tFeatureIsChosen: boolean | undefined = false
          if (aToken.type === 'unigram') {
            tWeight = iWeights[iIndex]
          } else {
            tFeature = tFeatures.find(iFeature => aToken.token === iFeature.name)
            tFeatureIsChosen = tFeature && tFeature.chosen
            tWeight = tFeatureIsChosen ? iWeights[iIndex] : ''
          }
          tUpdateRequests.push({
            id: tFeatureWeightCaseIDs[aToken.token],
            values: {
              'model name': iModelName,
              weight: tWeight
            }
          })
          // Also update in stored features
          if (tFeature && tFeatureIsChosen)
            tFeature.weight = tWeight
        }
      )
    }

    generateRequests()

    await codapInterface.sendRequest({
      action: 'update',
      resource: `dataContext[${datasetName}].collection[${collectionName}].case`,
      values: tUpdateRequests
    })
  }

  /**
   * Add attributes for predicted label and for probability. Compute and stash values.
   * @param iModelName
   * @param iTools
   * @private
   */
  private async showPredictedLabels(iModelName: string, iTools:
    {
      logisticModel: LogisticRegression, // Will compute probabilities
      oneHotData: number[][],
      documents: any,
      tokenArray: any,
      positiveClassName: string,
      negativeClassName: string,
      lockProbThreshold: boolean
    }
  ) {

    function findThreshold(): number {
      // Determine the probability threshold that yields the fewest discrepant classifications
      // First compute the probabilities separating them into two arrays
      iTools.documents.forEach((aDoc: any, iIndex: number) => {
        let tProbability: number = iTools.logisticModel.transformRow(iTools.oneHotData[iIndex]),
          tActual = iTools.oneHotData[iIndex][tOneHotLength - 1];
        if (tActual) {
          tPosProbs.push(tProbability);
        } else {
          tNegProbs.push(tProbability);
        }
        // We will have to be able to lookup the probability later
        tMapFromCaseIDToProbability[aDoc.caseID] = tProbability;
      });
      tPosProbs.sort();
      tNegProbs.sort();
      let tCurrValue = tPosProbs[0],
        tNegLength = tNegProbs.length,
        tPosLength = tPosProbs.length,
        tCurrMinDiscrepancies: number,
        tStartingThreshold: number;

      // Return the index in tNegPros starting as given for the >= target probability
      function findNegIndex(iStarting: number, iTargetProb: number): number {
        while (tNegProbs[iStarting] < iTargetProb && iStarting < tNegLength) {
          iStarting++;
        }
        return iStarting;
      }

      let tRecord: {
        posIndex: number, // Position at which we start testing for discrepancies
        negIndex: number,
        currMinDescrepancies: number,
        threshold: number
      };
      if (iTools.lockProbThreshold) {
        let tPosIndex = tPosProbs.findIndex((iProb) => {
            return iProb > 0.5;
          }),
          tNegIndex = tNegProbs.findIndex((iProb) => {
            return iProb > 0.5;
          });
        if (tNegIndex === -1)
          tNegIndex = tNegLength;
        tRecord = {
          posIndex: tPosIndex,
          negIndex: tNegIndex,
          currMinDescrepancies: tPosIndex + (tNegLength - tNegIndex),
          threshold: 0.5
        }
      } else {
        let tNegIndex = tNegProbs.findIndex((v: number) => {
          return v > tCurrValue;
        });
        if (tNegIndex === -1) {
          // Negative and Positive probabilities don't overlap
          tCurrMinDiscrepancies = 0;
          tNegIndex = tNegLength;
          tStartingThreshold = (tNegProbs[tNegLength - 1] + tPosProbs[0]) / 2; // halfway
        } else {
          tCurrMinDiscrepancies = Number.MAX_VALUE;
          tStartingThreshold = tPosProbs[0];
        }

        tNegIndex = (tNegIndex === -1) ? tNegLength : tNegIndex;
        tRecord = {
          posIndex: 0, // Position at which we start testing for discrepancies
          negIndex: tNegIndex,
          currMinDescrepancies: tCurrMinDiscrepancies,
          threshold: tStartingThreshold
        };
        while (tRecord.negIndex < tNegLength && tRecord.posIndex < tPosLength) {
          let tCurrDiscrepancies = tRecord.posIndex + (tNegLength - tRecord.negIndex);
          if (tCurrDiscrepancies < tRecord.currMinDescrepancies) {
            tRecord.currMinDescrepancies = tCurrDiscrepancies;
            tRecord.threshold = tPosProbs[tRecord.posIndex];
          }
          tRecord.posIndex++;
          tRecord.negIndex = findNegIndex(tRecord.negIndex, tPosProbs[tRecord.posIndex]);
        }
      }
      return tRecord.threshold;
    }

    const
      tOneHotLength = iTools.oneHotData[0].length,
      tPosProbs: number[] = [],
      tNegProbs: number[] = [],
      tMapFromCaseIDToProbability: Record<any, number> = {},
      kProbPredAttrNamePrefix = 'probability of ',
      tProbName = `${kProbPredAttrNamePrefix}${iTools.positiveClassName}`,
      tPredictedLabelAttributeName = targetStore.targetPredictedLabelAttributeName,
      tTargetDatasetName = targetStore.targetDatasetInfo.name;

    // Create values of predicted label and probability for each document
    let tThresholdResult = findThreshold(),
      // tWeAreUpdating = tResultCaseIDs.length > 0,
      tLabelValuesForUpdating: UpdateCaseValue[] = [],
      tActualPos = 0,
      tPredictedPos = 0,
      tBothPos = 0,
      tBothNeg = 0;
    iTools.logisticModel.threshold = tThresholdResult;
    iTools.documents.forEach((aDoc: any, iIndex: number) => {
      let tProbability: number,
        tPredictedLabel,
        tActualLabel,
        tValues: CaseValues = {'model name': iModelName};
      tProbability = tMapFromCaseIDToProbability[aDoc.caseID];
      tPredictedLabel = tProbability > tThresholdResult ? iTools.positiveClassName : iTools.negativeClassName;
      tValues[tPredictedLabelAttributeName] = tPredictedLabel;
      tValues[tProbName] = tProbability * 100; // Convert o %
      tActualLabel = aDoc.class;
      tActualPos += tActualLabel === iTools.positiveClassName ? 1 : 0;
      tPredictedPos += tPredictedLabel === iTools.positiveClassName ? 1 : 0;
      tBothPos += (tActualLabel === iTools.positiveClassName && tPredictedLabel === iTools.positiveClassName) ? 1 : 0;
      tBothNeg += (tActualLabel === iTools.negativeClassName && tPredictedLabel === iTools.negativeClassName) ? 1 : 0;

      // if (tWeAreUpdating) {
      tLabelValuesForUpdating.push({
        id: trainingStore.resultCaseIDs[iIndex],
        values: tValues
      })
      /*
            } else {
              tLabelValuesForCreation.push({
                parent: aDoc.caseID,
                values: tValues
              })
            }
      */
    });

    let computedKappa = computeKappa(iTools.documents.length, tBothPos, tBothNeg, tActualPos, tPredictedPos);
    iTools.logisticModel.accuracy = computedKappa.observed;
    iTools.logisticModel.kappa = (computedKappa.observed === 0) ? 0 : computedKappa.kappa;

    // Send the values to CODAP
    // if (tWeAreUpdating) {
    //   tResultCaseIDs.length = 0
    await codapInterface.sendRequest({
      action: 'update',
      resource: `dataContext[${tTargetDatasetName}].collection[${targetStore.targetResultsCollectionName}].case`,
      values: tLabelValuesForUpdating,
    })
    /*
        } else {
          await codapInterface.sendRequest({
            action: 'create',
            resource: `dataContext[${tTargetDatasetName}].collection[${tResultsCollectionName}].case`,
            values: tLabelValuesForCreation
          })
        }
    */
  }

}

