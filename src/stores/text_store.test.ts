import { ITextPart, ITextSection } from './store_types_and_constants';
import { textStore } from "./text_store";

describe("textStore", () => {
  it("import modern titles", () => {
    const textComponentTitle = JSON.stringify([{ text: "Test " }, { text: "1", classNames: ["highlighted"] }]);
    textStore.fromJSON({ textComponentTitle });
    expect(textStore.textComponentTitle).toEqual([{ text: "Test " }, { text: "1", classNames: ["highlighted"] }]);
  });

  it("import legacy titles", () => {
    const textComponentTitle = "Test 1";
    textStore.fromJSON({ textComponentTitle });
    expect(textStore.textComponentTitle).toEqual([{ text: "Test 1" }]);
  });

  it("setTextComponentTitle", () => {
    const title: ITextPart[] = [{ text: "New Title" }];
    textStore.setTextComponentTitle(title);
    expect(textStore.textComponentTitle).toEqual(title);
  });

  it("setTitleDataset", () => {
    textStore.setTitleDataset("testing");
    expect(textStore.titleDataset).toBe("testing");
  });

  it("setTextSections", () => {
    const sections: ITextSection[] = [{
      title: { actual: "Section 1", predicted: "Section 1", color: "#000" },
      text: [{ textParts: [{ text: "Test" }], index: 0 }],
      hidden: false
    }];
    textStore.setTextSections(sections);
    expect(textStore.textSections).toEqual(sections);
  });

  it("getTextSectionId", () => {
    const section: ITextSection = {
      title: { actual: "Section 1", predicted: "Section 1", color: "#000" },
      text: [{ textParts: [{ text: "Test" }], index: 0 }],
      hidden: false
    };
    const id = textStore.getTextSectionId(section);
    expect(id).toBe("section-Section 1-Section 1");
  });

  it("toggleTextSectionVisibility", () => {
    const section: ITextSection = {
      title: { actual: "Section 1", predicted: "Section 1", color: "#000" },
      text: [{ textParts: [{ text: "Test" }], index: 0 }],
      hidden: false
    };
    textStore.toggleTextSectionVisibility(section);
    expect(section.hidden).toBe(true);
    textStore.toggleTextSectionVisibility(section);
    expect(section.hidden).toBe(false);
  });

  it("updateTitle with datasetName and attributeName", () => {
    textStore.updateTitle("Dataset", "Attribute");
    expect(textStore.textComponentTitle).toEqual([
      { text: "Selected " },
      { text: "Attributes", classNames: ["highlighted"] },
      { text: " in " },
      { text: "Dataset", classNames: ["highlighted"] }
    ]);
  });

  it("updateTitle without datasetName and attributeName", () => {
    textStore.updateTitle("", "");
    expect(textStore.textComponentTitle).toEqual([{ text: "Choose Data And Text To Begin" }]);
  });

  it("clearText", async () => {
    const sections: ITextSection[] = [{
      title: { actual: "Section 1", predicted: "Section 1", color: "#000" },
      text: [{ textParts: [{ text: "Test" }], index: 0 }],
      hidden: false
    }];
    textStore.setTextSections(sections);
    await textStore.clearText();
    expect(textStore.textSections).toEqual([]);
  });
});
