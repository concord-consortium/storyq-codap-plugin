import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import codapInterface from "../lib/CodapInterface";
import { featureStore } from "../stores/feature_store";
import { Feature, getStarterFeature, kFeatureTypeConstructed } from "../stores/store_types_and_constants";
import { FeatureList } from "./feature_list";

function makeFeature(name: string, caseID: string, color: string): Feature {
  const feature = getStarterFeature();
  feature.name = name;
  feature.caseID = caseID;
  feature.color = color;
  feature.highlight = true;
  feature.type = kFeatureTypeConstructed;
  return feature;
}

describe("FeatureList", () => {
  beforeEach(() => {
    jest.spyOn(codapInterface, "sendRequest").mockResolvedValue({ success: true });
    featureStore.setFeatures([
      makeFeature('count: "a"', "1", "#ffe671"),
      makeFeature('count: "b"', "2", "#dbb6fb"),
      makeFeature('count: "c"', "3", "#45f1eb")
    ]);
  });

  afterEach(() => jest.restoreAllMocks());

  it("keeps an open picker with its own feature when a row above it is deleted", () => {
    render(<FeatureList allowChoose={false} allowHighlightControls />);

    fireEvent.click(screen.getByRole("button", { name: 'Highlight color for count: "b"' }));
    expect(screen.getByRole("listbox")).toHaveAccessibleName('Highlight color for count: "b"');

    act(() => featureStore.setFeatures(featureStore.features.slice(1)));

    // The row owns the picker's open state, so a key tied to position would hand it to the neighbour.
    const picker = screen.queryByRole("listbox");
    if (picker) expect(picker).toHaveAccessibleName('Highlight color for count: "b"');
    expect(screen.getByRole("button", { name: 'Highlight color for count: "c"' }))
      .toHaveAttribute("aria-expanded", "false");
  });
});
