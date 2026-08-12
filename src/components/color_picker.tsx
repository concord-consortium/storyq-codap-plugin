/**
 * A popover offering StoryQ's six feature colors, plus the single words row's own color and the feature's
 * current color when those are not among them. It is portalled to the document body because the feature list
 * scrolls inside two clipping containers, and because the tab panel sets an inline transform, which would
 * otherwise make it, rather than the viewport, the containing block for `position: fixed`.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { featureColorNames, normalizeHex, pickerSwatches } from "../utilities/color-utils";

import "./color_picker.scss";

const kSwatchesPerRow = 4;
// The popover's height, needed here to decide whether it fits below the button, and handed to the scss
// through a custom property so the two cannot drift apart. Not to be confused with the gap between
// swatches, which is the scss's own.
const kPopoverHeight = 75;
// The gap between the color button and the popover.
const kAnchorGap = 2;

export interface IColorPickerProps {
  button: HTMLElement
  color: string
  // Colors this row offers in addition to the six, kept selectable whether or not one is the current color.
  extraColors?: string[]
  featureName: string
  id: string
  onChoose: (color: string) => void
  // Escape asks for focus back on the color button. The routes where the user has already said where
  // focus goes, a click elsewhere or focus moving out, must leave it alone.
  onClose: (returnFocus?: boolean) => void
}

export const ColorPicker = function ColorPicker({
  button, color, extraColors, featureName, id, onChoose, onClose
}: IColorPickerProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const swatches = pickerSwatches(color, extraColors);
  const selectedIndex = Math.max(swatches.findIndex(swatch => normalizeHex(swatch) === normalizeHex(color)), 0);
  const [focusedIndex, setFocusedIndex] = useState(selectedIndex);

  const anchor = button.getBoundingClientRect();
  const opensBelow = anchor.bottom + kAnchorGap + kPopoverHeight <= window.innerHeight;
  const style = {
    "--sq-color-picker-height": `${kPopoverHeight}px`,
    left: anchor.left,
    top: opensBelow ? anchor.bottom + kAnchorGap : anchor.top - kAnchorGap - kPopoverHeight
  } as React.CSSProperties;

  // Focus follows the roving tabindex, and moves in on the selected swatch when the picker opens.
  useLayoutEffect(() => {
    popoverRef.current?.querySelectorAll<HTMLElement>(".swatch")[focusedIndex]?.focus();
  }, [focusedIndex]);

  useEffect(() => {
    // Closing on scroll is simpler than following the button, and the picker is short lived.
    const close = () => onClose();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      // The portal means the popover is not a DOM descendant of the row, so containment is tested
      // against the popover itself. The button toggles itself and must not be closed from here.
      if (!popoverRef.current?.contains(target) && !button.contains(target)) onClose();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [button, onClose]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const lastIndex = swatches.length - 1;
    switch (event.key) {
      case "ArrowLeft":
        setFocusedIndex(focusedIndex === 0 ? lastIndex : focusedIndex - 1);
        break;
      case "ArrowRight":
        setFocusedIndex(focusedIndex === lastIndex ? 0 : focusedIndex + 1);
        break;
      case "ArrowUp":
        setFocusedIndex(Math.max(focusedIndex - kSwatchesPerRow, 0));
        break;
      case "ArrowDown":
        // The second row is ragged, so a column that does not exist clamps to the last swatch.
        setFocusedIndex(Math.min(focusedIndex + kSwatchesPerRow, lastIndex));
        break;
      case "Escape":
        onClose(true);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const handleFocusOut = (event: React.FocusEvent) => {
    // focusout fires here on every arrow key too, as focus moves between swatches, so both halves of
    // this test are needed. The button half covers Escape, which has already moved focus there.
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && (popoverRef.current?.contains(nextTarget) || button.contains(nextTarget))) return;
    onClose();
  };

  return ReactDOM.createPortal(
    <div
      aria-label={`Highlight color for ${featureName}`}
      className="sq-color-picker"
      id={id}
      onBlur={handleFocusOut}
      onKeyDown={handleKeyDown}
      ref={popoverRef}
      role="listbox"
      style={style}
    >
      {swatches.map((swatch, index) => (
        <button
          aria-label={featureColorNames[normalizeHex(swatch)] ?? "Current color"}
          aria-selected={index === selectedIndex}
          className={`swatch${index === selectedIndex ? " selected" : ""}`}
          key={swatch}
          onClick={() => onChoose(swatch)}
          role="option"
          style={{ backgroundColor: swatch }}
          tabIndex={index === focusedIndex ? 0 : -1}
          type="button"
        />
      ))}
    </div>,
    document.body
  );
};
