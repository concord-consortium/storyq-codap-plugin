import { FeatureStore } from "./feature_store";
import {
  Feature, getStarterFeature, getTargetCaseFormula, kFeatureKindSearch, kFeatureTypeConstructed, kSearchWhereContain,
  kSearchWhereCount, kWhatOptionText, SearchDetails, SearchWhereOption
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
