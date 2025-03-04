import { NonNtigramFeature } from "../managers/headings_manager";
import { kAnyNumberKeyword } from "../stores/store_types_and_constants";
import { highlightFeatures } from "./utilities";

describe("highlightFeatures", () => {
  it("should handle no features", async () => {
    const text = `Test text.`;
    const selectedFeatures: NonNtigramFeature[] = [];
    const result = await highlightFeatures(text, selectedFeatures);
    expect(result).toEqual([
      { text }
    ]);
  });

  it("should handle a single word feature", async () => {
    const text = `Test text.`;
    const selectedFeatures = [{ word: "text", feature: { color: "#000", highlight: true } }];
    const result = await highlightFeatures(text, selectedFeatures);
    expect(result).toEqual([
      { text: "Test " },
      { text: "text", classNames: ["highlighted"], style: { backgroundColor: "#000" } },
      { text: "." }
    ]);
  });

  it("should handle multiple single word features", async () => {
    const text = `Test text.`;
    const selectedFeatures = [
      { word: "Test", feature: { color: "#000", highlight: true } },
      { word: "text", feature: { color: "#000", highlight: true } }
    ];
    const result = await highlightFeatures(text, selectedFeatures);
    expect(result).toEqual([
      { text: "Test", classNames: ["highlighted"], style: { backgroundColor: "#000" } },
      { text: " " },
      { text: "text", classNames: ["highlighted"], style: { backgroundColor: "#000" } },
      { text: "." }
    ]);
  });

  it("should handle a single phrase feature", async () => {
    const text = `Test text.`;
    const selectedFeatures = [
      { word: "Test text", feature: { color: "#000", highlight: true } }
    ];
    const result = await highlightFeatures(text, selectedFeatures);
    expect(result).toEqual([
      { text: "Test text", classNames: ["highlighted"], style: { backgroundColor: "#000" } },
      { text: "." }
    ]);
  });

  it("should handle a single contain feature", async () => {
    const text = `Test text.`;
    const selectedFeatures = [
      { word: `contain: "text"`, feature: { color: "#000", highlight: true } }
    ];
    const result = await highlightFeatures(text, selectedFeatures);
    expect(result).toEqual([
      { text: "Test " },
      { text: "text", classNames: ["highlighted"], style: { backgroundColor: "#000" } },
      { text: "." }
    ]);
  });

  it("should handle a single count feature", async () => {
    const text = `Test text.`;
    const selectedFeatures = [
      { word: `count: "test"`, feature: { color: "#000", highlight: true } }
    ];
    const result = await highlightFeatures(text, selectedFeatures);
    expect(result).toEqual([
      { text: "Test", classNames: ["highlighted"], style: { backgroundColor: "#000" } },
      { text: " text." }
    ]);
  });

  it("should handle a punctuation feature", async () => {
    const text = `Test text.`;
    const selectedFeatures = [
      { word: "count: .", feature: { color: "#000", highlight: true } }
    ];
    const result = await highlightFeatures(text, selectedFeatures);
    expect(result).toEqual([
      { text: "Test text" },
      { text: ".", classNames: ["highlighted"], style: { backgroundColor: "#000" } }
    ]);
  });

  it("should handle numbers", async () => {
    const text = `123 abc`;
    const selectedFeatures = [
      { word: `contain: ${kAnyNumberKeyword}`, feature: { color: "#000", highlight: true } }
    ];
    const result = await highlightFeatures(text, selectedFeatures);
    expect(result).toEqual([
      { text: "123", classNames: ["highlighted"], style: { backgroundColor: "#000" } },
      { text: " abc" }
    ]);
  });

  it("should handle a list feature", async () => {
    const text = `I love you`;
    const selectedFeatures = [
      { word: `contain: personalPronouns`, feature: { color: "#000", highlight: true } }
    ];
    const result = await highlightFeatures(text, selectedFeatures);
    expect(result).toEqual([
      { text: "I", classNames: ["highlighted"], style: { backgroundColor: "#000" } },
      { text: " love " },
      { text: "you", classNames: ["highlighted"], style: { backgroundColor: "#000" } }
    ]);
  });
});
