import { ITextSection } from './store_types_and_constants';
import { textStore } from "./text_store";

describe("textStore", () => {

  it("setTitleDataset", () => {
    textStore.setTitleDataset("testing");
    expect(textStore.titleDataset).toBe("testing");
  });

  it("setTextSections", () => {
    const sections: ITextSection[] = [{
      title: { actual: "Section 1", predicted: "Section 1" },
      text: [{ textParts: [{ text: "Test" }], index: 0 }]
    }];
    textStore.setTextSections(sections);
    expect(textStore.textSections).toEqual(sections);
  });

  it("getTextSectionId", () => {
    const section: ITextSection = {
      title: { actual: "Section 1", predicted: "Section 1" },
      text: [{ textParts: [{ text: "Test" }], index: 0 }]
    };
    const id = textStore.getTextSectionId(section);
    expect(id).toBe("section-Section 1-Section 1");
  });

  it("clearText", async () => {
    const sections: ITextSection[] = [{
      title: { actual: "Section 1", predicted: "Section 1" },
      text: [{ textParts: [{ text: "Test" }], index: 0 }]
    }];
    textStore.setTextSections(sections);
    await textStore.clearText();
    expect(textStore.textSections).toEqual([]);
  });
});
