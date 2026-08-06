import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import codapInterface from "../lib/CodapInterface";
import { featureStore } from "../stores/feature_store";
import { Feature, getStarterFeature, kFeatureTypeConstructed } from "../stores/store_types_and_constants";
import { FeatureListItem } from "./feature_list_item";

function makeFeature(): Feature {
  const feature = getStarterFeature();
  feature.name = 'count: "love"';
  feature.caseID = "777";
  feature.color = "#dbb6fb";
  feature.highlight = true;
  feature.type = kFeatureTypeConstructed;
  return feature;
}

describe("FeatureListItem", () => {
  let feature: Feature;

  beforeEach(() => {
    feature = makeFeature();
    featureStore.setFeatures([feature]);
    feature = featureStore.features[0];
  });

  it("shows no highlight controls in the Training tab configuration", () => {
    render(<FeatureListItem allowDelete={false} feature={feature} />);

    expect(screen.queryByRole("button", { name: /highlighting for/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Highlight color for/ })).toBeNull();
  });

  it("names both controls after the feature, and says what the visibility toggle will do", () => {
    render(<FeatureListItem allowChoose={false} allowHighlightControls feature={feature} />);

    screen.getByRole("button", { name: 'Hide highlighting for count: "love"' });
    const colorButton = screen.getByRole("button", { name: 'Highlight color for count: "love"' });
    expect(colorButton).toHaveAttribute("aria-expanded", "false");
    expect(colorButton).toHaveAttribute("aria-haspopup", "listbox");
  });

  it("offers to show highlighting when it is off", () => {
    feature.highlight = false;
    render(<FeatureListItem allowChoose={false} allowHighlightControls feature={feature} />);

    screen.getByRole("button", { name: 'Show highlighting for count: "love"' });
  });

  it("turns the feature's highlighting off and back on", async () => {
    jest.spyOn(codapInterface, "sendRequest").mockResolvedValue({ success: true });
    render(<FeatureListItem allowChoose={false} allowHighlightControls feature={feature} />);

    fireEvent.click(screen.getByRole("button", { name: /Hide highlighting/ }));
    await waitFor(() => expect(feature.highlight).toBe(false));

    fireEvent.click(screen.getByRole("button", { name: /Show highlighting/ }));
    await waitFor(() => expect(feature.highlight).toBe(true));

    jest.restoreAllMocks();
  });

  it("empties the pill while highlighting is off, and only where the controls explain it", () => {
    feature.highlight = false;
    const { container, rerender } = render(
      <FeatureListItem allowChoose={false} allowHighlightControls feature={feature} />
    );
    expect(container.querySelector(".feature-list-item")).toHaveStyle({ backgroundColor: "#ffffff" });

    rerender(<FeatureListItem allowDelete={false} feature={feature} />);
    expect(container.querySelector(".feature-list-item")).toHaveStyle({ backgroundColor: "#dbb6fb" });
  });
});

describe("FeatureListItem's color picker", () => {
  let feature: Feature;

  function openPicker() {
    render(<FeatureListItem allowChoose={false} allowHighlightControls feature={feature} />);
    const colorButton = screen.getByRole("button", { name: 'Highlight color for count: "love"' });
    fireEvent.click(colorButton);
    return colorButton;
  }

  beforeEach(() => {
    feature = makeFeature();
    featureStore.setFeatures([feature]);
    feature = featureStore.features[0];
    jest.spyOn(codapInterface, "sendRequest").mockResolvedValue({ success: true });
  });

  afterEach(() => jest.restoreAllMocks());

  it("opens on the color button and reports itself open", async () => {
    const colorButton = openPicker();

    expect(screen.getByRole("listbox")).toHaveAttribute("id", colorButton.getAttribute("aria-controls"));
    expect(colorButton).toHaveAttribute("aria-expanded", "true");
  });

  it("closes on a second press of the color button", () => {
    const colorButton = openPicker();

    fireEvent.click(colorButton);

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("applies the chosen color and returns focus to the color button", async () => {
    const colorButton = openPicker();

    fireEvent.click(screen.getAllByRole("option")[2]);

    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(feature.color).toBe("#45f1eb");
    expect(colorButton).toHaveFocus();
  });

  it("returns focus to the color button on Escape", () => {
    const colorButton = openPicker();

    fireEvent.keyDown(screen.getAllByRole("option")[0], { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(colorButton).toHaveFocus();
  });

  it("closes when focus leaves it, and leaves focus where the user sent it", () => {
    openPicker();
    const elsewhere = document.createElement("input");
    document.body.appendChild(elsewhere);

    act(() => elsewhere.focus());

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(elsewhere).toHaveFocus();
  });
});
