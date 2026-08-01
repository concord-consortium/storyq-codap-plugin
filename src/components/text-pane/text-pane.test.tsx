import React from "react";
import { render } from "@testing-library/react";
import { TextPane } from "./text-pane";

// jsdom does not implement ResizeObserver, so record what the component asks to observe.
const observed: Element[] = [];
class MockResizeObserver {
  constructor(readonly callback: ResizeObserverCallback) {}
  observe(target: Element) { observed.push(target); }
  unobserve() {}
  disconnect() {}
}

describe("TextPane", () => {
  beforeAll(() => {
    global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  });

  beforeEach(() => {
    observed.length = 0;
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
});
