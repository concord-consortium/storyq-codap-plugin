import codapInterface from "../lib/CodapInterface";
import { trainingStore } from "../stores/training_store";
import { ModelManager } from "./model_manager";

/**
 * Regression coverage for STORYQ-86: reopening a saved CODAP document must leave
 * trainingStore.model.logisticModel intact so the Training pane's buttons work.
 */
describe("ModelManager in a reopened document", () => {
  let modelManager: ModelManager;

  beforeEach(() => {
    jest.spyOn(codapInterface, "sendRequest").mockResolvedValue({ success: true, values: [] });

    // Round-trip the training store the way saving and reopening a document does, from a clean
    // slate so that nothing an earlier test left behind ends up in the snapshot
    trainingStore.model.reset();
    trainingStore.trainingResults = [];
    trainingStore.resultCaseIDs = [];
    const snapshot = JSON.parse(JSON.stringify(trainingStore.asJSON()));
    trainingStore.fromJSON(snapshot);

    modelManager = new ModelManager();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("has a usable logistic model to train with", () => {
    expect(trainingStore.model.logisticModel).toBeDefined();
  });

  it("can start a training run, configuring the logistic model rather than throwing", async () => {
    trainingStore.model.setName("model 1");
    trainingStore.model.setTrainingInProgress(true);

    // buildModel goes on to ask CODAP for the target cases, which do not exist here, so it still
    // rejects. All we check is that it gets past setting up the logistic model.
    await modelManager.buildModel().catch(() => null);

    const { logisticModel } = trainingStore.model;
    expect(logisticModel.progressCallback).toBeDefined();
    expect(logisticModel.lockIntercept).toBe(trainingStore.model.lockInterceptAtZero);
  });

  it("clears every flag a restored run left as soon as a new run starts", async () => {
    trainingStore.setTrainingCouldNotBeResumed(true);
    trainingStore.setResumeIsPending(true);
    trainingStore.setRestoringRun(true);
    trainingStore.model.setName("model 1");

    await modelManager.buildModel().catch(() => null);

    expect(trainingStore.trainingCouldNotBeResumed).toBe(false);
    expect(trainingStore.resumeIsPending).toBe(false);
    expect(trainingStore.isRestoringRun).toBe(false);
  });

  it("makes the model's name unique before starting a run, whatever the name field did", async () => {
    // The TextBox does this on blur, which covers the student who types a name and nothing else: not
    // a hand-edited document, not a second plugin instance on the same dataset. A duplicate name
    // leaves two rows in the results table that nothing downstream can tell apart.
    trainingStore.trainingResults = [{ name: "model 1" } as any];
    trainingStore.model.setName("model 1");

    await modelManager.buildModel().catch(() => null);

    expect(trainingStore.model.name).toBe("model 1_1");
  });

  it("clears every flag a restored run left when the run is cancelled", async () => {
    trainingStore.setTrainingCouldNotBeResumed(true);
    trainingStore.setResumeIsPending(true);
    trainingStore.setRestoringRun(true);

    await modelManager.cancel();

    expect(trainingStore.trainingCouldNotBeResumed).toBe(false);
    expect(trainingStore.resumeIsPending).toBe(false);
    expect(trainingStore.isRestoringRun).toBe(false);
  });

  it("can step without throwing", () => {
    trainingStore.model.setTrainingInProgress(true);
    trainingStore.model.setTrainingInStepMode(true);

    expect(() => modelManager.nextStep()).not.toThrow();
    expect(trainingStore.model.logisticModel.trace).toBe(true);
  });

  it("can cancel without throwing, leaving the model reset and usable", async () => {
    trainingStore.model.setName("model 1");
    trainingStore.model.setTrainingInProgress(true);
    trainingStore.setTrainingCouldNotBeResumed(true);
    const { logisticModel } = trainingStore.model;
    logisticModel.trace = true;
    logisticModel.theta = [1, 2, 3];

    await expect(modelManager.cancel()).resolves.toBeUndefined();

    expect(trainingStore.model.name).toBe("");
    expect(trainingStore.model.trainingInProgress).toBe(false);
    expect(trainingStore.trainingCouldNotBeResumed).toBe(false);
    expect(trainingStore.model.logisticModel).toBe(logisticModel);
    expect(logisticModel.trace).toBe(false);
    expect(logisticModel.theta).toEqual([]);
  });
});

/**
 * prepWeightsCollection asks whether the weight cases are still unnamed, and that answer decides
 * between updating the existing cases and creating a second set. That question is now answered by a
 * single search for the dataset's items, grouped by token here, so these cover both that the verdict
 * is unchanged and that the cost no longer scales with the vocabulary.
 */
describe("ModelManager deciding whether to update or create weight cases", () => {
  const tokenNames = ["good", "bad", "sweet", "sour"];
  const tokens = tokenNames.map(token => ({ token } as any));

  interface IDatasetOptions {
    // A model name carried by every token's item.
    namedModel?: string;
    // A model name per token, for the cases where they differ from one another.
    namesByToken?: Record<string, string>;
    // Tokens the dataset holds no item for.
    missingTokens?: string[];
    // A second item per token, carrying this model name and following the first. A document with two
    // models has one item per token per model, so a token name is not unique among the items.
    secondItemNamed?: string;
  }

  function mockFeatureDataset(options: IDatasetOptions = {}, iTokens = tokens) {
    const requests: any[] = [];
    const items = iTokens
      .filter(iToken => !options.missingTokens?.includes(iToken.token))
      .flatMap((iToken, iIndex) => {
        const first = {
          id: String(iIndex),
          values: {
            name: iToken.token,
            "model name": options.namesByToken?.[iToken.token] ?? options.namedModel ?? ""
          }
        };
        if (options.secondItemNamed == null) return [first];
        return [first, { id: `${iIndex}b`, values: { name: iToken.token, "model name": options.secondItemNamed } }];
      });

    jest.spyOn(codapInterface, "sendRequest").mockImplementation((request: any) => {
      requests.push(request);
      const answer = (iRequest: any) => {
        if (/itemSearch/.test(iRequest.resource)) return { success: true, values: items };
        if (/caseCount/.test(iRequest.resource)) return { success: true, values: iTokens.length };
        if (/caseByIndex\[(\d+)]/.test(iRequest.resource)) {
          const index = Number(iRequest.resource.match(/caseByIndex\[(\d+)]/)[1]);
          return { success: true, values: { case: { id: 700 + index, values: { name: iTokens[index].token } } } };
        }
        return { success: true, values: [] };
      };
      return Promise.resolve(Array.isArray(request) ? request.map(answer) : answer(request));
    });
    return { requests };
  }

  function searchRequests(requests: any[]) {
    return requests.filter(request =>
      (Array.isArray(request) ? request : [request]).some((iRequest: any) => /itemSearch/.test(iRequest.resource)));
  }

  function weightWrites(requests: any[]) {
    return requests
      .filter(request => !Array.isArray(request) && /weights].case$/.test(request.resource))
      .map(request => request.action);
  }

  afterEach(() => jest.restoreAllMocks());

  it.each([[4], [40]])("asks for the dataset's items once, whatever the %i-token vocabulary", async (count) => {
    const manyTokens = Array.from({ length: count }, (_unused, iIndex) => ({ token: `t${iIndex}` } as any));
    const { requests } = mockFeatureDataset({}, manyTokens);

    await new ModelManager().prepWeightsCollection(manyTokens);

    // One request, not an array of them, and the same one at either vocabulary size. itemSearch is
    // an unindexed scan, so a search per token cost a scan per token as well as a round trip.
    const searches = searchRequests(requests);
    expect(searches).toHaveLength(1);
    expect(Array.isArray(searches[0])).toBe(false);
    expect(searches[0].resource).toBe("dataContext[Features].itemSearch[*]");
  });

  it("asks CODAP nothing at all when there are no tokens", async () => {
    const { requests } = mockFeatureDataset({}, []);

    await new ModelManager().prepWeightsCollection([]);

    expect(searchRequests(requests)).toHaveLength(0);
    expect(weightWrites(requests)).toEqual(["create"]);
  });

  it("updates the existing weight cases when none of them carries a model name", async () => {
    const { requests } = mockFeatureDataset();

    await new ModelManager().prepWeightsCollection(tokens);

    expect(weightWrites(requests)).toEqual(["update"]);
  });

  it("creates a new set when a weight case already carries one", async () => {
    const { requests } = mockFeatureDataset({ namedModel: "model A" });

    await new ModelManager().prepWeightsCollection(tokens);

    expect(weightWrites(requests)).toEqual(["create"]);
  });

  it("creates a new set when only the first token's item carries a name", async () => {
    // The answer is a fold over every token, not the last token's verdict. With the first item named
    // and the rest blank, remembering only the last result would report the whole set as unnamed and
    // write this model's weights over the previous model's.
    const { requests } = mockFeatureDataset({ namesByToken: { good: "model A" } });

    await new ModelManager().prepWeightsCollection(tokens);

    expect(weightWrites(requests)).toEqual(["create"]);
  });

  it("creates a new set when only the last token's item carries a name", async () => {
    const { requests } = mockFeatureDataset({ namesByToken: { sour: "model A" } });

    await new ModelManager().prepWeightsCollection(tokens);

    expect(weightWrites(requests)).toEqual(["create"]);
  });

  it("creates a new set when no weight case can be found at all, as it did before", async () => {
    const { requests } = mockFeatureDataset({ missingTokens: tokenNames });

    await new ModelManager().prepWeightsCollection(tokens);

    expect(weightWrites(requests)).toEqual(["create"]);
  });

  it("consults the first item carrying each token's name, not the last", async () => {
    // A token name is not unique among the items: a document with two models holds one item per
    // token per model, and the per-token search this replaced read the first of them. Taking the
    // last instead would report a second model's own freshly stamped cases as the answer.
    const { requests } = mockFeatureDataset({ secondItemNamed: "model A" });

    await new ModelManager().prepWeightsCollection(tokens);

    expect(weightWrites(requests)).toEqual(["update"]);
  });

  it("still updates when the dataset holds an item for only some of the tokens", async () => {
    // A token with no item of its own is skipped rather than counted as named, which is what the
    // per-token search did with its empty result.
    const { requests } = mockFeatureDataset({ missingTokens: ["bad", "sour"] });

    await new ModelManager().prepWeightsCollection(tokens);

    expect(weightWrites(requests)).toEqual(["update"]);
  });
});
