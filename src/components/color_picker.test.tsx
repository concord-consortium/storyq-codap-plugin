import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { featureColors } from "../utilities/color-utils";
import { ColorPicker } from "./color_picker";

function renderPicker(
  color: string, handlers: { onChoose?: jest.Mock, onClose?: jest.Mock, buttonRect?: Partial<DOMRect> } = {}
) {
  const button = document.createElement("button");
  document.body.appendChild(button);
  if (handlers.buttonRect) {
    button.getBoundingClientRect = () => ({ left: 0, top: 0, bottom: 0, ...handlers.buttonRect }) as DOMRect;
  }
  const onChoose = handlers.onChoose ?? jest.fn();
  const onClose = handlers.onClose ?? jest.fn();
  render(
    <ColorPicker
      button={button}
      color={color}
      featureName={'count: "love"'}
      id="picker"
      onChoose={onChoose}
      onClose={onClose}
    />
  );
  return { button, onChoose, onClose };
}

function swatches() {
  return screen.getAllByRole("option");
}

describe("ColorPicker", () => {
  it("offers the six palette colors", () => {
    renderPicker(featureColors[1]);

    expect(swatches()).toHaveLength(6);
  });

  it("appends the feature's own color when it is not one of the six", () => {
    renderPicker("#777");

    expect(swatches()).toHaveLength(7);
    expect(swatches()[6]).toHaveStyle({ backgroundColor: "#777" });
  });

  it("compares palette membership through normalized hex", () => {
    renderPicker("#FFE671");

    expect(swatches()).toHaveLength(6);
  });

  it("names every swatch, and reports exactly one as selected", () => {
    renderPicker("#777");

    swatches().forEach(swatch => expect(swatch).toHaveAccessibleName());
    expect(swatches().filter(swatch => swatch.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(swatches()[6]).toHaveAccessibleName("Current color");
    expect(swatches()[0]).toHaveAccessibleName("Yellow");
  });

  it("names the grid after the feature it recolors", () => {
    renderPicker(featureColors[0]);

    screen.getByRole("listbox", { name: 'Highlight color for count: "love"' });
  });

  it("opens below the button when there is room", () => {
    renderPicker(featureColors[0], { buttonRect: { left: 40, top: 100, bottom: 128 } });

    expect(screen.getByRole("listbox")).toHaveStyle({ left: "40px", top: "130px" });
  });

  it("opens above the button when the plugin window is too short below it", () => {
    window.innerHeight = 160;
    renderPicker(featureColors[0], { buttonRect: { left: 40, top: 100, bottom: 128 } });

    expect(screen.getByRole("listbox")).toHaveStyle({ top: "23px" });
    window.innerHeight = 768;
  });

  it("focuses the selected swatch when it opens", () => {
    renderPicker(featureColors[2]);

    expect(swatches()[2]).toHaveFocus();
  });

  it("moves left and right through the swatches, wrapping at both ends", () => {
    renderPicker(featureColors[0]);

    fireEvent.keyDown(swatches()[0], { key: "ArrowLeft" });
    expect(swatches()[5]).toHaveFocus();

    fireEvent.keyDown(swatches()[5], { key: "ArrowRight" });
    expect(swatches()[0]).toHaveFocus();
  });

  it("moves up and down a row, clamping to the last swatch of a ragged row", () => {
    renderPicker(featureColors[0]);

    fireEvent.keyDown(swatches()[0], { key: "ArrowDown" });
    expect(swatches()[4]).toHaveFocus();

    fireEvent.keyDown(swatches()[4], { key: "ArrowUp" });
    expect(swatches()[0]).toHaveFocus();

    fireEvent.keyDown(swatches()[0], { key: "ArrowRight" });
    fireEvent.keyDown(swatches()[1], { key: "ArrowRight" });
    fireEvent.keyDown(swatches()[2], { key: "ArrowDown" });
    expect(swatches()[5]).toHaveFocus();
  });

  it("closes on Escape without choosing", () => {
    const { onChoose, onClose } = renderPicker(featureColors[0]);

    fireEvent.keyDown(swatches()[0], { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("chooses the swatch that is activated", () => {
    const { onChoose } = renderPicker(featureColors[0]);

    fireEvent.click(swatches()[3]);

    expect(onChoose).toHaveBeenCalledWith(featureColors[3]);
  });

  it("stays open while focus moves between swatches, and closes when it leaves", () => {
    const { onClose } = renderPicker(featureColors[0]);

    fireEvent.blur(swatches()[0], { relatedTarget: swatches()[1] });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.blur(swatches()[0], { relatedTarget: document.createElement("input") });
    expect(onClose).toHaveBeenCalled();
  });

  it("ignores a click inside itself and closes on one outside", () => {
    const { button, onClose } = renderPicker(featureColors[0]);

    fireEvent.pointerDown(swatches()[0]);
    fireEvent.pointerDown(button);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });
});
