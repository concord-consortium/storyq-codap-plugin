import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import codapInterface from "../lib/CodapInterface";
import { ModelManager } from "../managers/model_manager";
import { domainStore } from "../stores/domain_store";
import { featureStore } from "../stores/feature_store";
import { targetStore } from "../stores/target_store";
import { trainingStore } from "../stores/training_store";
import { uiStore } from "../stores/ui_store";
import {
  buildTargetCases, haltRunAfterIteration, kClassAttributeName, kFirstFeatureCaseID,
  kFirstInterruptedResultCaseID, kFirstWeightCaseID, kTargetAttributeName, makeSearchFeature, mockCodap,
  seedTokenMapWithUnigrams, setUpStores, stopAnyRunInFlight, waitUntil
} from "../test/training-fixtures";
import { APIRequest, CaseInfo } from "../types/codap-api-types";
import Storyq from "./storyq";
import { TrainingPane } from "./training_pane";

const kRows = 40;
const kIterations = 8;
const kSavedIteration = 4;
const kModelName = "model C";
const kTargetDatasetID = 1;

interface IStorage {
  domainStore: object;
  uiStore: object;
}

/**
 * A CODAP holding the document the plugin is being restored into: the target dataset the run was
 * fitting, the Features dataset it wrote its weights to, and the results the earlier model left.
 */
function mockCodapForRestore(
  targetCases: CaseInfo[], tokens: string[], options: { slowBy?: number, failOn?: RegExp } = {}
) {
  const requests: APIRequest[] = [];
  const featureCases: CaseInfo[] = tokens.map((iToken, iIndex) => ({
    children: [], id: kFirstFeatureCaseID + iIndex, values: { name: iToken, type: "unigram" }
  }));
  const weightCases: CaseInfo[] = tokens.map((iToken, iIndex) => ({
    children: [],
    id: kFirstWeightCaseID + iIndex,
    parent: kFirstFeatureCaseID + iIndex,
    values: { "model name": kModelName, weight: "" }
  }));
  const resultCases: CaseInfo[] = targetCases.map((iCase, iIndex) => ({
    children: [], id: kFirstInterruptedResultCaseID + iIndex, parent: iCase.id, values: { "model name": "" }
  }));

  function handle(request: APIRequest) {
    requests.push(request);
    const { action, resource } = request;
    if (action === "create") return { success: true, values: [{ id: 5000, itemID: 5000 }] };
    if (action !== "get") return { success: true, values: [] };
    if (/^dataContextList$/.test(resource)) {
      return { success: true, values: [{ id: kTargetDatasetID, name: "reviews", title: "reviews" }] };
    }
    if (/collectionList$/.test(resource)) {
      return {
        success: true,
        values: [{ id: 10, name: "reviews", title: "reviews" }, { id: 11, name: "results", title: "results" }]
      };
    }
    if (/attributeList$/.test(resource)) {
      return {
        success: true,
        values: [kTargetAttributeName, kClassAttributeName, "long"].map((iName, iIndex) => ({
          id: 20 + iIndex, name: iName, title: iName
        }))
      };
    }
    if (/collection\[weights]/.test(resource)) return { success: true, values: weightCases };
    if (/collection\[features]/.test(resource)) return { success: true, values: featureCases };
    if (/collection\[results]/.test(resource)) return { success: true, values: resultCases };
    if (/collection\[reviews]/.test(resource)) {
      // getCaseValues deletes parent from what it returns, so it must not be handed the originals
      return { success: true, values: targetCases.map(iCase => ({ ...iCase })) };
    }
    return { success: true, values: [] };
  }

  jest.spyOn(codapInterface, "sendRequest").mockImplementation((request: APIRequest | APIRequest[]) => {
    const asked = Array.isArray(request) ? request : [request];
    if (options.failOn && asked.some(iRequest => options.failOn?.test(iRequest.resource))) {
      return Promise.reject(new Error(`CODAP could not answer ${asked[0].resource}`));
    }
    const answer = Array.isArray(request) ? request.map(handle) : handle(request);
    if (!options.slowBy) return Promise.resolve(answer);
    return new Promise(resolve => setTimeout(() => resolve(answer), options.slowBy));
  });

  return { requests };
}

/**
 * Runs a model, halts it partway the way closing the document does, and returns what CODAP would
 * have saved.
 */
async function interruptARun(options: { stepMode?: boolean } = {}): Promise<{
  storage: IStorage, targetCases: CaseInfo[], tokens: string[]
}> {
  mockCodap();
  const targetCases = buildTargetCases({ seed: 20260817, rows: kRows });
  setUpStores({ targetCases, modelName: kModelName, iterations: kIterations, stepMode: options.stepMode });
  // updateFromCODAP derives the class names from the data on the way back in, so the run has to be
  // fitted under the names it will be restored with.
  const firstClass = String(targetCases[0].values[kClassAttributeName]);
  targetStore.setTargetClassNames({ left: firstClass, right: firstClass === "pos" ? "neg" : "pos" });
  seedTokenMapWithUnigrams(targetCases);
  trainingStore.model.setTrainingInProgress(true);

  const manager = new ModelManager();
  await manager.buildModel();
  if (options.stepMode) {
    // A step-mode run advances only when the student presses Step, and is left waiting for the next
    // press rather than halted
    for (let iStep = 1; iStep <= kSavedIteration; iStep++) {
      await waitUntil(() => manager.stepModeContinueCallback !== null && manager.stepModeIteration === iStep - 1,
        `the run is waiting for step ${iStep}`);
      manager.nextStep();
    }
  } else {
    haltRunAfterIteration(kSavedIteration);
  }
  await waitUntil(() => trainingStore.model.iteration === kSavedIteration, "the run has been interrupted");
  // Extraction stamps each token with the case it was written to, and the document keeps that
  Object.values(featureStore.tokenMap).forEach((iToken, iIndex) => {
    iToken.featureCaseID = kFirstFeatureCaseID + iIndex;
  });

  const storage = JSON.parse(JSON.stringify({
    domainStore: domainStore.asJSON(),
    uiStore: uiStore.asJSON()
  }));
  const tokens = Object.keys(featureStore.tokenMap);
  jest.restoreAllMocks();
  // A new session holds none of what the last one did
  setUpStores({ targetCases, modelName: "", iterations: kIterations });
  return { storage, targetCases, tokens };
}

function makeStoryq() {
  return new (Storyq as unknown as new (props: object) => {
    restorePluginFromStore: (iStorage: IStorage) => Promise<void>
  })({});
}

/**
 * The restore path, driven the way a reopened document drives it. This is where the resume is
 * sequenced behind the rest of the restore, and where every failing route out of it is handled.
 */
describe("Storyq restoring a document that was saved during a training run", () => {

  afterEach(() => {
    stopAnyRunInFlight();
    jest.restoreAllMocks();
  });

  it("resumes a plain run to completion with nobody pressing anything", async () => {
    const { storage, targetCases, tokens } = await interruptARun();
    mockCodapForRestore(targetCases, tokens);
    const storyq = makeStoryq();

    await storyq.restorePluginFromStore(storage);
    await waitUntil(() => trainingStore.trainingResults.length === 1 && trainingStore.model.name === "",
      "the resumed run has finished");

    expect(trainingStore.trainingResults[0].name).toBe(kModelName);
    expect(trainingStore.isRestoringRun).toBe(false);
    expect(trainingStore.trainingCouldNotBeResumed).toBe(false);
  });

  it("hands a validated step-mode run back to the student rather than replaying it unasked", async () => {
    const { storage, targetCases, tokens } = await interruptARun({ stepMode: true });
    mockCodapForRestore(targetCases, tokens);
    const storyq = makeStoryq();

    await storyq.restorePluginFromStore(storage);

    expect(trainingStore.resumeIsPending).toBe(true);
    expect(trainingStore.isRestoringRun).toBe(false);
    expect(trainingStore.model.iteration).toBe(kSavedIteration);
  });

  it("tells the student a run cannot be picked up when its column set no longer matches", async () => {
    const { storage, targetCases, tokens } = await interruptARun();
    mockCodapForRestore(targetCases, tokens);
    const storyq = makeStoryq();
    // A feature chosen while the document was closed adds a column the saved run never had
    storage.domainStore = {
      ...storage.domainStore,
      featureStore: {
        ...(storage.domainStore as { featureStore: { features: object[] } }).featureStore,
        features: [
          ...(storage.domainStore as { featureStore: { features: object[] } }).featureStore.features,
          makeSearchFeature()
        ]
      }
    };

    await storyq.restorePluginFromStore(storage);

    expect(trainingStore.trainingCouldNotBeResumed).toBe(true);
    expect(trainingStore.isRestoringRun).toBe(false);
    expect(trainingStore.resumeIsPending).toBe(false);
  });

  it("falls back rather than leaving the pane in limbo when the target sweep rejects", async () => {
    const { storage, targetCases, tokens } = await interruptARun();
    // getCaseValues dereferences its result after a catch that returns undefined, so one failed
    // request rejects the whole restore rather than the sweep alone.
    mockCodapForRestore(targetCases, tokens, { failOn: /collection\[reviews]\.caseFormulaSearch/ });
    const storyq = makeStoryq();

    await expect(storyq.restorePluginFromStore(storage)).rejects.toThrow();

    expect(trainingStore.trainingCouldNotBeResumed).toBe(true);
    expect(trainingStore.isRestoringRun).toBe(false);
  });

  it("falls back when the rest of the restore rejects", async () => {
    const { storage, targetCases, tokens } = await interruptARun();
    // A document whose Features dataset has to be created reaches a create that does not catch
    const domainStoreJSON = storage.domainStore as { featureStore: { featureDatasetID: number } };
    domainStoreJSON.featureStore.featureDatasetID = -1;
    mockCodapForRestore(targetCases, tokens, { failOn: /^dataContext$/ });
    const storyq = makeStoryq();

    await storyq.restorePluginFromStore(storage);

    expect(trainingStore.trainingCouldNotBeResumed).toBe(true);
    expect(trainingStore.isRestoringRun).toBe(false);
  });

  it("ignores a second restore arriving while one is in flight, without freezing the pane", async () => {
    const { storage, targetCases, tokens } = await interruptARun();
    const { requests } = mockCodapForRestore(targetCases, tokens);
    const storyq = makeStoryq();

    const first = storyq.restorePluginFromStore(storage);
    const second = storyq.restorePluginFromStore(storage);
    await Promise.all([first, second]);
    await waitUntil(() => trainingStore.trainingResults.length === 1 && trainingStore.model.name === "",
      "the resumed run has finished");

    const weightSearches = requests.filter(iRequest => /caseFormulaSearch\[`model name`/.test(iRequest.resource));
    expect(weightSearches).toHaveLength(1);
    expect(trainingStore.trainingResults).toHaveLength(1);
    expect(trainingStore.isRestoringRun).toBe(false);
  });

  it("does not let a student cancel a run whose fate is still undecided", async () => {
    const { storage, targetCases, tokens } = await interruptARun();
    mockCodapForRestore(targetCases, tokens, { slowBy: 5 });
    const storyq = makeStoryq();

    const restore = storyq.restorePluginFromStore(storage);
    render(<TrainingPane />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // The run finishes while the pane is mounted, so its renders belong inside act
    await act(async () => {
      await restore;
      await waitUntil(() => trainingStore.trainingResults.length === 1 && trainingStore.model.name === "",
        "the resumed run has finished");
    });

    // Cancel would have blanked the cases the resume is about to write, and the resume would then
    // have written them back under an emptied model name.
    expect(trainingStore.trainingResults).toHaveLength(1);
    expect(trainingStore.trainingResults[0].name).toBe(kModelName);
  });
});
