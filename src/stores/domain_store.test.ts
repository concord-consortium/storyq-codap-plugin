import { getCaseValues } from "../lib/codap-helper";
import codapInterface from "../lib/CodapInterface";
import { APIRequest, UpdateCaseRequest } from "../types/codap-api-types";
import { kNoColor, ngramColor } from "../utilities/color-utils";
import { DomainStore, domainStore } from "./domain_store";
import { featureStore } from "./feature_store";
import {
  Feature, getNewToken, getStarterFeature, kFeatureKindNgram, kFeatureTypeConstructed, kFeatureTypeUnigram,
  kTokenTypeUnigram, NgramDetails
} from "./store_types_and_constants";
import { targetStore } from "./target_store";

jest.mock("../lib/CodapInterface", () => ({
  __esModule: true,
  default: { sendRequest: jest.fn(), on: jest.fn(), updateInteractiveState: jest.fn() }
}));
// codap-helper imports text_feedback_manager, which imports the stores, which import codap-helper.
// Left in place, that cycle re-enters the mock factory below and hands the stores a second, separate
// set of mock functions from the ones this file configures.
jest.mock("../managers/text_feedback_manager", () => ({ setupTextFeedbackManager: jest.fn() }));
jest.mock("../lib/codap-helper", () => ({
  ...jest.requireActual("../lib/codap-helper"),
  getCaseValues: jest.fn(),
  openTable: jest.fn()
}));

const mockSendRequest = codapInterface.sendRequest as jest.Mock;
const mockGetCaseValues = getCaseValues as jest.Mock;

const kTargetDataset = "Sentiments";
const kTargetCollection = "texts";

// CODAP v3 returns every case value as a string, which is what makes the count feature's number
// indistinguishable from a boolean without an explicit test.
const targetCases = [
  { id: 1, values: { text: "love love ice cream", rating: "positive", 'count: "love"': "2", 'contain: "good"': "false" } },
  { id: 2, values: { text: "good crackers", rating: "positive", 'count: "love"': "0", 'contain: "good"': "true" } },
  { id: 3, values: { text: "love the good crackers", rating: "positive", 'count: "love"': "1", 'contain: "good"': "true" } }
];
const featureCases = [
  { id: 100, children: [101], values: { name: 'count: "love"', type: "constructed" } },
  { id: 200, children: [201], values: { name: 'contain: "good"', type: "constructed" } }
];
// A restored document's feature cases already carry their two frequency values, under attribute names
// built from the document's own class labels.
const restoredFeatureCases = [
  { id: 100, values: { name: 'count: "love"', "frequency in yes": "129", "frequency in no": "71" } },
  { id: 200, values: { name: 'contain: "good"', "frequency in yes": "", "frequency in no": "" } }
];

function targetCaseUpdates() {
  const requests = mockSendRequest.mock.calls
    .map(call => call[0])
    .filter(request => Array.isArray(request)) as UpdateCaseRequest[][];
  const targetUpdate = requests.flat().find(
    request => request.resource === `dataContext[${kTargetDataset}].collection[${kTargetCollection}].case`
  );
  return targetUpdate?.values ?? [];
}

function featureIDsFor(targetCaseId: number) {
  const update = targetCaseUpdates().find(value => Number(value.id) === targetCaseId);
  return update ? JSON.parse(String(update.values.featureIDs)) : undefined;
}

function sentRequests() {
  return mockSendRequest.mock.calls.flatMap(call => call[0]) as APIRequest[];
}

function makeConstructedFeature(name: string): Feature {
  const feature = getStarterFeature();
  feature.name = name;
  feature.caseID = "900";
  feature.chosen = true;
  feature.type = kFeatureTypeConstructed;
  return feature;
}

describe("DomainStore.recreateUsagesAndFeatureIDs", () => {
  beforeEach(async () => {
    mockSendRequest.mockReset();
    mockSendRequest.mockResolvedValue([{ success: true, values: { id: 1 } }, { success: true, values: { id: 2 } }]);
    mockGetCaseValues.mockReset();
    mockGetCaseValues.mockImplementation(async (datasetName: string) =>
      datasetName === kTargetDataset ? targetCases : featureCases
    );

    targetStore.fromJSON({
      targetDatasetInfo: { name: kTargetDataset, title: kTargetDataset, id: 7 },
      targetAttributeName: "text",
      targetClassAttributeName: "rating",
      targetClassNames: { left: "positive", right: "negative" },
      targetChosenClassColumnKey: "left"
    } as any);
    targetStore.setTargetCollectionName(kTargetCollection);
    featureStore.setFeatures([]);
    featureStore.clearTokens();

    await domainStore.recreateUsagesAndFeatureIDs(true);
  });

  it("keeps a count feature in the rebuilt feature IDs", () => {
    expect(featureIDsFor(3)).toEqual([100, 200]);
  });

  it("rewrites a text that matches only the count feature", () => {
    expect(featureIDsFor(1)).toEqual([100]);
  });

  it("treats a count of zero as a non-match", () => {
    expect(featureIDsFor(2)).toEqual([200]);
  });
});

describe("DomainStore.updateNgramFeatures", () => {
  const featureColor = "#dbb6fb";

  function makeNgramFeature(): Feature {
    const feature = getStarterFeature();
    feature.name = "single words";
    feature.chosen = true;
    feature.color = featureColor;
    feature.highlight = false;
    feature.info.kind = kFeatureKindNgram;
    feature.info.details = { n: "uni" } as NgramDetails;
    feature.info.frequencyThreshold = 1;
    feature.info.ignoreStopWords = false;
    feature.type = kFeatureTypeUnigram;
    return feature;
  }

  beforeEach(async () => {
    mockSendRequest.mockReset();
    mockSendRequest.mockImplementation(async (request: any) => {
      if (request?.action === "create") {
        return { success: true, values: request.values.map((_: unknown, index: number) => ({ id: 500 + index })) };
      }
      return { success: true, values: [] };
    });
    mockGetCaseValues.mockReset();
    mockGetCaseValues.mockResolvedValue(targetCases);

    targetStore.fromJSON({
      targetDatasetInfo: { name: kTargetDataset, title: kTargetDataset, id: 7 },
      targetAttributeName: "text",
      targetClassAttributeName: "rating",
      targetClassNames: { left: "positive", right: "negative" },
      targetChosenClassColumnKey: "left"
    } as any);
    targetStore.setTargetCollectionName(kTargetCollection);
    featureStore.setFeatures([makeNgramFeature()]);
    featureStore.clearTokens();
    featureStore.setFeatureDatasetInfo({
      datasetName: "Features", datasetTitle: "Features", collectionName: "features",
      weightsCollectionName: "weights", datasetID: 42
    });

    await domainStore.updateNgramFeatures();
  });

  it("gives every extracted word the feature's color and highlight state", () => {
    const tokens = Object.values(featureStore.tokenMap);
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.every(token => token.color === featureColor)).toBe(true);
    expect(tokens.every(token => token.highlight === false)).toBe(true);
  });

  it("writes the same color and highlight state into the Features dataset", () => {
    const createRequest = mockSendRequest.mock.calls
      .map(call => call[0])
      .find(request => request?.action === "create");
    expect(createRequest.values.length).toBeGreaterThan(0);
    expect(createRequest.values.every((value: any) => value.values.color === featureColor)).toBe(true);
    expect(createRequest.values.every((value: any) => value.values.highlight === false)).toBe(true);
  });
});

describe("DomainStore.guaranteeFeaturesDataset, for a dataset created before this version", () => {
  let store: DomainStore;

  function hideRequests() {
    return sentRequests().filter(request =>
      request.action === "update" && String(request.resource).includes(".attribute[")
    );
  }

  function migrationAttempts() {
    return mockSendRequest.mock.calls.filter(
      call => Array.isArray(call[0]) && String(call[0][0]?.resource).includes(".attribute[color]")
    ).length;
  }

  beforeEach(() => {
    mockSendRequest.mockReset();
    mockSendRequest.mockResolvedValue({ success: true, values: [] });
    mockGetCaseValues.mockReset();
    mockGetCaseValues.mockResolvedValue(restoredFeatureCases);
    featureStore.setFeatures([makeConstructedFeature('contain: "good"')]);
    featureStore.setFeatureDatasetInfo({
      datasetName: "Features", datasetTitle: "Features", collectionName: "features",
      weightsCollectionName: "weights", datasetID: 42
    });
    store = new DomainStore();
  });

  it("hides the color and highlight attributes", async () => {
    await store.guaranteeFeaturesDataset();

    expect(hideRequests()).toEqual([
      {
        action: "update",
        resource: "dataContext[Features].collection[features].attribute[color]",
        values: { hidden: true }
      },
      {
        action: "update",
        resource: "dataContext[Features].collection[features].attribute[highlight]",
        values: { hidden: true }
      }
    ]);
  });

  it("creates total frequency and backfills it from the frequency values already on the cases", async () => {
    await store.guaranteeFeaturesDataset();

    const created = sentRequests().find(
      request => request.action === "create" && String(request.resource).endsWith(".attribute")
    );
    expect(created?.values).toEqual([{ name: "total frequency", hidden: false }]);

    const backfill = sentRequests().find(
      request => request.action === "update" && request.resource === "dataContext[Features].collection[features].case"
    );
    expect(backfill?.values).toEqual([
      { id: 100, values: { "total frequency": 200 } },
      { id: 200, values: { "total frequency": 0 } }
    ]);
  });

  it("repairs the single words feature's color, tokens included", async () => {
    const ngram = getStarterFeature();
    ngram.name = "single words";
    ngram.info.kind = kFeatureKindNgram;
    ngram.type = kFeatureTypeUnigram;
    ngram.color = kNoColor;
    featureStore.setFeatures([ngram]);
    featureStore.clearTokens();
    featureStore.addToken("love", getNewToken({ token: "love", type: kTokenTypeUnigram }));

    await store.guaranteeFeaturesDataset();

    expect(featureStore.features[0].color).toBe(ngramColor);
    expect(featureStore.tokenMap.love.color).toBe(ngramColor);
  });

  it("leaves a single words feature that already has a color alone", async () => {
    const ngram = getStarterFeature();
    ngram.name = "single words";
    ngram.info.kind = kFeatureKindNgram;
    ngram.type = kFeatureTypeUnigram;
    ngram.color = "#dbb6fb";
    featureStore.setFeatures([ngram]);

    await store.guaranteeFeaturesDataset();

    expect(featureStore.features[0].color).toBe("#dbb6fb");
    expect(sentRequests().some(request => String(request.resource).includes("caseFormulaSearch"))).toBe(false);
  });

  it("migrates once however often it is re-entered, including from concurrent callers", async () => {
    await Promise.all([store.guaranteeFeaturesDataset(), store.guaranteeFeaturesDataset()]);
    await store.guaranteeFeaturesDataset();

    expect(migrationAttempts()).toBe(1);
  });

  it("swallows a failed migration and retries it on the next entry", async () => {
    mockSendRequest.mockRejectedValueOnce(new Error("timed out"));
    jest.spyOn(console, "log").mockImplementation(() => null);

    await expect(store.guaranteeFeaturesDataset()).resolves.toBe(true);
    expect(migrationAttempts()).toBe(1);

    await store.guaranteeFeaturesDataset();
    expect(migrationAttempts()).toBe(2);
  });
});
