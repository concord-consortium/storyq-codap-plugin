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
});
