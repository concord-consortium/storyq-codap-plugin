import { isPaletteColor, kNoColor, ngramColor, ngramTokenColor, normalizeHex } from "./color-utils";

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
    expect(normalizeHex(kNoColor)).toBe("no_color");
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
});

describe("ngramTokenColor", () => {
  it("takes the feature's color when it has one", () => {
    expect(ngramTokenColor("#dbb6fb")).toBe("#dbb6fb");
  });

  it("falls back to yellow for a missing color and for kNoColor", () => {
    expect(ngramTokenColor(undefined)).toBe(ngramColor);
    expect(ngramTokenColor(kNoColor)).toBe(ngramColor);
  });
});
