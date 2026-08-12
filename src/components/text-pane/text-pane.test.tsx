import React from "react";
import { render, screen } from "@testing-library/react";
import { ITextSection } from "../../stores/store_types_and_constants";
import { textStore } from "../../stores/text_store";
import { TextPane } from "./text-pane";

// The pane reads its divider size out of a scss module, which jest maps to identity-obj-proxy, so the
// parseInt in constants.ts yields NaN and React warns on every inline style once the pane splits.
jest.mock("../constants", () => ({ kCollapseButtonWidth: 24, kPaneDividerSize: 24 }));

function makeSection(actual: string, phraseCount: number): ITextSection {
  return {
    text: Array.from({ length: phraseCount }, () => ({ textParts: [{ text: "a phrase" }] })),
    title: { actual }
  };
}

// jsdom does not implement ResizeObserver, so record what the component asks to observe.
const observed: Element[] = [];
class MockResizeObserver {
  constructor(readonly callback: ResizeObserverCallback) {}
  observe(target: Element) { observed.push(target); }
  unobserve() {}
  disconnect() {}
}

describe("TextPane", () => {
  const originalResizeObserver = global.ResizeObserver;

  beforeAll(() => {
    global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  });

  afterAll(() => {
    global.ResizeObserver = originalResizeObserver;
  });

  beforeEach(() => {
    observed.length = 0;
    textStore.setTextSections([]);
  });

  // The pane can be resized without its parent changing size, for instance when the StoryQ panel
  // beside it is collapsed and flex hands the freed space to the pane. Observing the parent misses
  // that, leaving the pane rendering at a stale width (STORYQ-80).
  it("observes its own element rather than its parent", () => {
    const { container } = render(<TextPane />);
    const pane = container.querySelector(".text-pane");

    expect(pane).toBeInTheDocument();
    expect(observed).toEqual([pane]);
  });

  // Every percentage in the pane is taken over the selection, so the title has to state how big that is.
  // Without it a section reading "30% of all selected" leaves the student with no denominator.
  it("titles itself with the number of selected cases", () => {
    textStore.setTextSections([makeSection("good", 3), makeSection("bad", 7)]);

    const { container } = render(<TextPane />);

    expect(container.querySelector(".text-title")).toHaveTextContent("10 selected");
    expect(screen.getByText("(3 cases, 30% of all selected)")).toBeInTheDocument();
    expect(screen.getByText("(7 cases, 70% of all selected)")).toBeInTheDocument();
  });
});
