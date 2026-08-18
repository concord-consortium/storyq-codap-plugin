import { reaction } from "mobx";
import codapInterface from "../lib/CodapInterface";
import { kNoColor } from "../utilities/color-utils";
import { FeatureStore } from "./feature_store";
import {
  Feature, getNewToken, getStarterFeature, getTargetCaseFormula, kFeatureKindNgram, kFeatureKindSearch,
  kFeatureTypeConstructed, kFeatureTypeUnigram, kSearchWhereContain, kSearchWhereCount, kTokenTypeConstructed,
  kTokenTypeUnigram, kWhatOptionText, SearchDetails, SearchWhereOption
} from "./store_types_and_constants";

function makeSearchFeature(name: string, where: SearchWhereOption, text: string): Feature {
  const feature = getStarterFeature();
  feature.name = name;
  feature.type = kFeatureTypeConstructed;
  feature.info.kind = kFeatureKindSearch;
  const details = feature.info.details as SearchDetails;
  details.where = where;
  details.what = kWhatOptionText;
  details.freeFormText = text;
  feature.targetCaseFormula = getTargetCaseFormula(where);
  return feature;
}

describe("FeatureStore.fromJSON", () => {
  it("re-derives targetCaseFormula, which does not survive being saved", () => {
    const countFeature = makeSearchFeature(`count: "love"`, kSearchWhereCount, "love");
    const containFeature = makeSearchFeature(`contain: "good"`, kSearchWhereContain, "good");
    const store = new FeatureStore();
    store.setFeatures([countFeature, containFeature]);

    // Storyq.getPluginStore() stringifies and parses the stores, which drops every function.
    const json = JSON.parse(JSON.stringify(store.asJSON()));
    expect(json.features[0].targetCaseFormula).toBeUndefined();

    const restored = new FeatureStore();
    restored.fromJSON(json);

    expect(restored.features[0].targetCaseFormula?.("`count: \"love\"`")).toBe("`count: \"love\"`>0");
    expect(restored.features[1].targetCaseFormula?.("`contain: \"good\"`")).toBe("`contain: \"good\"`=true");
  });

  it("gives features with no search details the default formula", () => {
    const feature = getStarterFeature();
    feature.name = "single words";
    feature.info.details = null;
    const restored = new FeatureStore();
    restored.fromJSON({ features: [feature] } as any);

    expect(restored.features[0].targetCaseFormula?.("`single words`")).toBe("`single words`=true");
  });
});

describe("FeatureStore.setColorFor and setHighlightFor", () => {
  const kNumUnigrams = 3;
  let store: FeatureStore;
  let sendRequest: jest.SpyInstance;

  function makeNgramFeature(): Feature {
    const feature = getStarterFeature();
    feature.name = "single words";
    feature.caseID = ""; // the ngram feature has no case of its own
    feature.color = "#ffe671";
    feature.info.kind = kFeatureKindNgram;
    feature.type = kFeatureTypeUnigram;
    return feature;
  }

  beforeEach(() => {
    sendRequest = jest.spyOn(codapInterface, "sendRequest").mockImplementation(async (message: any) => {
      if (message?.action === "get") {
        return {
          success: true,
          values: Array.from({ length: kNumUnigrams }, (_, index) => ({ id: 1000 + index }))
        };
      }
      return { success: true };
    });

    store = new FeatureStore();
    store.setFeatureDatasetInfo({
      datasetName: "Features", datasetTitle: "Features", collectionName: "features",
      weightsCollectionName: "weights", datasetID: 42
    });
    for (let index = 0; index < kNumUnigrams; index++) {
      store.addToken(`word${index}`, getNewToken({ token: `word${index}`, type: kTokenTypeUnigram }));
    }
    // Training adds one of these to the same map for every chosen feature.
    store.addToken("count: \"love\"", getNewToken({ token: 'count: "love"', type: kTokenTypeConstructed }));
  });

  afterEach(() => jest.restoreAllMocks());

  it("recolors the single words feature and every word it extracted in one batched request", async () => {
    store.setFeatures([makeNgramFeature()]);
    // features is a deep observable, so only the proxy read back out of it notifies.
    const feature = store.features[0];

    await store.setColorFor(feature, "#dbb6fb");

    expect(feature.color).toBe("#dbb6fb");
    expect(store.tokenMap.word0.color).toBe("#dbb6fb");
    expect(store.tokenMap['count: "love"'].color).toBe(kNoColor);

    const updates = sendRequest.mock.calls
      .map(call => call[0])
      .filter(request => request.action === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({
      action: "update",
      resource: "dataContext[42].collection[features].case",
      values: [
        { id: 1000, values: { color: "#dbb6fb" } },
        { id: 1001, values: { color: "#dbb6fb" } },
        { id: 1002, values: { color: "#dbb6fb" } }
      ]
    });
  });

  it("writes an ordinary feature's color to its own case, with the values nested", async () => {
    const constructed = makeSearchFeature('contain: "good"', kSearchWhereContain, "good");
    constructed.caseID = "777";
    store.setFeatures([constructed]);
    const feature = store.features[0];

    await store.setColorFor(feature, "#45f1eb");

    expect(feature.color).toBe("#45f1eb");
    expect(sendRequest.mock.calls.map(call => call[0])).toEqual([{
      action: "update",
      resource: "dataContext[42].collection[features].caseByID[777]",
      values: { values: { color: "#45f1eb" } }
    }]);
  });

  it("hides the single words feature and every word it extracted together", async () => {
    store.setFeatures([makeNgramFeature()]);
    const feature = store.features[0];

    await store.setHighlightFor(feature, false);

    expect(feature.highlight).toBe(false);
    expect(store.tokenMap.word0.highlight).toBe(false);
    expect(store.tokenMap['count: "love"'].highlight).toBe(true);
  });

  it("shows the text pane every new value at once, tokens included", async () => {
    store.setFeatures([makeNgramFeature()]);
    const seen: string[][] = [];
    const dispose = reaction(
      () => store.highlights,
      () => seen.push(Object.values(store.tokenMap).map(token => token.color))
    );

    await store.setColorFor(store.features[0], "#dbb6fb");
    dispose();

    // A token mutation on its own fires nothing, so the one reaction has to see the new token colors.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(["#dbb6fb", "#dbb6fb", "#dbb6fb", kNoColor]);
  });
});

describe("FeatureStore.snapshotTokens and restoreTokens", () => {
  let store: FeatureStore;

  beforeEach(() => {
    store = new FeatureStore();
    store.addToken("good",
      getNewToken({ token: "good", type: kTokenTypeUnigram, count: 12, index: 0, featureCaseID: 900 }));
    store.addToken("bad",
      getNewToken({ token: "bad", type: kTokenTypeUnigram, count: 9, index: 1, featureCaseID: 901 }));
    store.addToken("long",
      getNewToken({ token: "long", type: kTokenTypeConstructed, count: 4, index: 2, featureCaseID: 902 }));
  });

  it("puts back the counts and indexes a rebuild changed", () => {
    // The expectation has to be a deep copy: toJS(tokenMap) and asJSON().tokenMap are both the live
    // map, so either would pass however restoreTokens behaved.
    const expected = JSON.parse(JSON.stringify(store.tokenMap));
    const snapshot = store.snapshotTokens();

    store.tokenMap.long.count = 8;
    store.tokenMap.long.index = 0;
    store.tokenMap.good.index = 1;
    store.restoreTokens(snapshot);

    expect(store.tokenMap).toEqual(expected);
  });

  it("is not reached into by the rebuild it protects against", () => {
    const snapshot = store.snapshotTokens();

    store.tokenMap.long.count = 8;

    expect(snapshot.long.count).toBe(4);
  });

  it("leaves the two maps agreeing on identity, since a reopened document has no id map at all", () => {
    store.restoreTokens(store.snapshotTokens());

    Object.values(store.tokenMap).forEach(token => {
      expect(store.caseIdTokenMap[Number(token.featureCaseID)]).toBe(token);
    });
  });

  it("copies the one field of a token that is not a primitive", () => {
    store.tokenMap.good.caseIDs = [100, 101];
    const snapshot = store.snapshotTokens();

    store.tokenMap.good.caseIDs.push(102);

    expect(snapshot.good.caseIDs).toEqual([100, 101]);
  });

  it("leaves a snapshot restorable more than once", () => {
    store.tokenMap.good.caseIDs = [100, 101];
    const snapshot = store.snapshotTokens();

    store.restoreTokens(snapshot);
    store.tokenMap.good.count = 99;
    store.tokenMap.good.caseIDs.push(102);
    store.restoreTokens(snapshot);

    expect(store.tokenMap.good.count).toBe(12);
    expect(store.tokenMap.good.caseIDs).toEqual([100, 101]);
  });
});
