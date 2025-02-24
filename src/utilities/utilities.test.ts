import { highlightFeatures } from "./utilities";

describe("highlightFeatures", () => {
  it("should handle no features", async () => {
    const text = `Test text.`;
    const selectedFeatures: string[] = [];
    const result = await highlightFeatures(text, selectedFeatures);
    expect(result).toEqual([
      { text }
    ]);
  });

  it("should handle a single word feature", async () => {
    const text = `Test text.`;
    const selectedFeatures = ["text"];
    const result = await highlightFeatures(text, selectedFeatures);
    expect(result).toEqual([
      { text: "Test " },
      { text: "text", classNames: ["highlighted"] },
      { text: "." }
    ]);
  });

  it("should handle multiple single word features", async () => {
    const text = `Test text.`;
    const selectedFeatures = ["Test", "text"];
    const result = await highlightFeatures(text, selectedFeatures);
    expect(result).toEqual([
      { text: "Test", classNames: ["highlighted"] },
      { text: " " },
      { text: "text", classNames: ["highlighted"] },
      { text: "." }
    ]);
  });

  it("should handle a single phrase feature", async () => {
    const text = `Test text.`;
    const selectedFeatures = ["Test text"];
    const result = await highlightFeatures(text, selectedFeatures);
    expect(result).toEqual([
      { text: "Test text", classNames: ["highlighted"] },
      { text: "." }
    ]);
  });

  it("should handle a single contain feature", async () => {
    const text = `Test text.`;
    const selectedFeatures = [`contain: "text"`];
    const result = await highlightFeatures(text, selectedFeatures);
    expect(result).toEqual([
      { text: "Test " },
      { text: "text", classNames: ["highlighted"] },
      { text: "." }
    ]);
  });

  it("should handle a single count feature", async () => {
    const text = `Test text.`;
    const selectedFeatures = [`count: "test"`];
    const result = await highlightFeatures(text, selectedFeatures);
    expect(result).toEqual([
      { text: "Test", classNames: ["highlighted"] },
      { text: " text." }
    ]);
  });

  it("should handle a list feature", async () => {
    const text = `I love you`;
    const selectedFeatures = [`contain: personalPronouns`];
    const result = await highlightFeatures(text, selectedFeatures);
    expect(result).toEqual([
      { text: "I", classNames: ["highlighted"] },
      { text: " love " },
      { text: "you", classNames: ["highlighted"] }
    ]);
  });
});
