import {
  featureColors, isPaletteColor, kNoColor, ngramColor, ngramTokenColor, normalizeHex, pickerSwatches
} from "./color-utils";

describe("normalizeHex", () => {
  it("expands three digit shorthand", () => {
    expect(normalizeHex("#777")).toBe("#777777");
  });

  it("lower cases", () => {
    expect(normalizeHex("#FFE671")).toBe("#ffe671");
    expect(normalizeHex("#FFF")).toBe("#ffffff");
  });

  it("leaves anything else alone", () => {
    expect(normalizeHex("#ffe671")).toBe("#ffe671");
  });

  // kNoColor is compared by identity elsewhere, so normalizing it must not case fold it into something
  // that no longer matches the constant.
  it("passes kNoColor through unchanged", () => {
    expect(normalizeHex(kNoColor)).toBe(kNoColor);
  });
});

describe("isPaletteColor", () => {
  it("recognizes a palette color whatever its case", () => {
    expect(isPaletteColor("#ffe671")).toBe(true);
    expect(isPaletteColor("#FFE671")).toBe(true);
  });

  it("rejects a color that is not in the palette", () => {
    expect(isPaletteColor("#777")).toBe(false);
    expect(isPaletteColor("#777777")).toBe(false);
  });

  // Jie asked for a single words color outside the six, so that an ordinary feature and the extracted
  // words can always be told apart. Sharing a color with the palette is the bug, not an implementation detail.
  it("rejects the single words color", () => {
    expect(isPaletteColor(ngramColor)).toBe(false);
  });
});

describe("pickerSwatches", () => {
  it("offers the six palette colors and nothing else", () => {
    expect(pickerSwatches(featureColors[1])).toEqual(featureColors);
  });

  it("appends the current color when it is not one of the six", () => {
    expect(pickerSwatches("#777")).toEqual([...featureColors, "#777"]);
  });

  it("offers an extra color whether or not it is the current one", () => {
    expect(pickerSwatches(ngramColor, ngramColor)).toEqual([...featureColors, ngramColor]);
    expect(pickerSwatches(featureColors[1], ngramColor)).toEqual([...featureColors, ngramColor]);
  });

  it("lists each color once, comparing through normalized hex", () => {
    expect(pickerSwatches("#FFE671")).toEqual(featureColors);
    expect(pickerSwatches("#777777", "#777")).toEqual([...featureColors, "#777"]);
  });
});

describe("ngramTokenColor", () => {
  it("takes the feature's color when it has one", () => {
    expect(ngramTokenColor("#dbb6fb")).toBe("#dbb6fb");
  });

  it("falls back to the single words color for a missing color and for kNoColor", () => {
    expect(ngramTokenColor(undefined)).toBe(ngramColor);
    expect(ngramTokenColor(kNoColor)).toBe(ngramColor);
  });
});
