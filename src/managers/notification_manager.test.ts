import codapInterface from "../lib/CodapInterface";
import { featureStore } from "../stores/feature_store";
import {
  Feature, getStarterFeature, kFeatureKindNgram, kFeatureTypeUnigram, kTokenTypeUnigram, NgramDetails, Token
} from "../stores/store_types_and_constants";
import { NotificationManager } from "./notification_manager";

jest.mock("./text_feedback_manager", () => ({ setupTextFeedbackManager: jest.fn() }));

const kNumUnigrams = 5;
const featureColor = "#dbb6fb";

function unigramCase(index: number, chosen: boolean) {
  return {
    id: 1000 + index,
    values: {
      name: `word${index}`,
      type: kTokenTypeUnigram,
      chosen: String(chosen),
      color: "#45f1eb",
      highlight: "true",
      "frequency in positive": "3",
      "frequency in negative": "1",
      usages: "[1,2,3]"
    }
  };
}

function makeNgramFeature(): Feature {
  const feature = getStarterFeature();
  feature.name = "single words with frequency ≥ 4 ignoring stopwords";
  feature.chosen = true;
  feature.color = featureColor;
  feature.highlight = false;
  feature.info.kind = kFeatureKindNgram;
  feature.info.details = { n: "uni" } as NgramDetails;
  feature.type = kFeatureTypeUnigram;
  return feature;
}

function makeToken(index: number): Token {
  return {
    caseIDs: [1, 2, 3], color: featureColor, count: 4, featureCaseID: 1000 + index, highlight: false,
    index, numNegative: 1, numPositive: 3, token: `word${index}`, type: kTokenTypeUnigram, weight: null
  };
}

describe("NotificationManager.handleUpdateFeatureCase", () => {
  const notifyHandlers: Record<string, (notification: any) => void> = {};

  beforeEach(() => {
    jest.spyOn(codapInterface, "on").mockImplementation(
      (action: any, resource: any, operation: any, handler: any) => {
        if (action === "notify") notifyHandlers[operation] = handler;
        return 0;
      }
    );
    jest.spyOn(codapInterface, "sendRequest").mockImplementation(async (message: any) => {
      const resource = String(message?.resource ?? "");
      if (message?.action === "get" && resource.includes("caseFormulaSearch")) {
        return { success: true, values: Array.from({ length: kNumUnigrams }, (_, i) => unigramCase(i, true)) };
      }
      if (message?.action === "update" && /\.case$/.test(resource)) {
        // CODAP broadcasts the echo synchronously, before answering the request that caused it.
        const chosen = message.values?.[0]?.values?.chosen;
        notifyHandlers.updateCases?.({
          resource: "dataContextChangeNotice[Features]",
          values: {
            operation: "updateCases",
            result: { cases: Array.from({ length: kNumUnigrams }, (_, i) => unigramCase(i, chosen)) }
          }
        });
        return { success: true };
      }
      return { success: true, values: [] };
    });

    featureStore.setFeatures([makeNgramFeature()]);
    featureStore.clearTokens();
    for (let i = 0; i < kNumUnigrams; i++) featureStore.addToken(`word${i}`, makeToken(i));
    featureStore.setFeatureDatasetInfo({
      datasetName: "Features", datasetTitle: "Features", collectionName: "features",
      weightsCollectionName: "weights", datasetID: 42
    });
    new NotificationManager();
  });

  afterEach(() => jest.restoreAllMocks());

  it("rebuilds the tokens with the feature's color and highlight state", async () => {
    const feature = featureStore.features[0];

    await featureStore.toggleChosenFor(feature);
    expect(Object.keys(featureStore.tokenMap)).toHaveLength(0);

    await featureStore.toggleChosenFor(feature);

    const tokens = Object.values(featureStore.tokenMap);
    expect(tokens).toHaveLength(kNumUnigrams);
    expect(tokens.every(token => token.color === featureColor)).toBe(true);
    expect(tokens.every(token => token.highlight === false)).toBe(true);
  });
});
