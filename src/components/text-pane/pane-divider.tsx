import { clsx } from "clsx";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ReactComponent as DragThumbIcon } from "../../assets/drag-thumb-icon.svg";
import { kPaneDividerSize } from "../constants";

import "./pane-divider.scss";

const kMinRatio = 0;
const kMaxRatio = 1 - kMinRatio;

type Place = "vertical" | "horizontal" | "center";
type DragZone = Place | null;

interface IPaneDividerBarProps {
  className?: string;
  dragZone: DragZone;
  gripIcon?: Place;
  onMouseDown: (dragZone: Place, e: React.MouseEvent) => void;
  place: Place;
  setHoverZone: (zone: DragZone) => void;
  style?: React.CSSProperties;
}

function PaneDividerBar({
  className, dragZone, gripIcon, onMouseDown, place, setHoverZone, style
}: IPaneDividerBarProps) {
  return (
    <div
      className={clsx("pane-divider-bar", place, className)}
      style={style}
      onMouseDown={e => onMouseDown(place, e)}
      onMouseEnter={() => !dragZone && setHoverZone(place)}
      onMouseLeave={() => !dragZone && setHoverZone(null)}
    >
      {place !== "center" && <div className="accent-line"/>}
      {gripIcon && (
        <div className="grip-icon">
          {["vertical", "center"].includes(gripIcon) && <DragThumbIcon />}
          {["horizontal", "center"].includes(gripIcon) && <DragThumbIcon className="rotated" />}
        </div>
      )}
    </div>
  );
} 

interface IPaneDividerProps {
  containerHeight: number;
  containerWidth: number;
  horizontalSplitRatio: number;
  orientation: "vertical" | "cross";
  onHorizontalRatioChange: (ratio: number) => void;
  onVerticalRatioChange: (ratio: number) => void;
  verticalSplitRatio: number;
}

function clampRatio(ratio: number): number {
  return Math.min(kMaxRatio, Math.max(kMinRatio, ratio));
}

export function PaneDivider({
  containerHeight, containerWidth, horizontalSplitRatio, onHorizontalRatioChange, onVerticalRatioChange, orientation,
  verticalSplitRatio
}: IPaneDividerProps) {
  const [hoverZone, setHoverZone] = useState<DragZone>(null);
  const [dragZone, setDragZone] = useState<DragZone>(null);
  const dragStartRef = useRef<{ x: number, y: number, hRatio: number, vRatio: number } | null>(null);

  const availableWidth = containerWidth - kPaneDividerSize;
  const verticalBarLeft = horizontalSplitRatio * availableWidth;
  const availableHeight = containerHeight - kPaneDividerSize;
  const horizontalBarTop = verticalSplitRatio * availableHeight;

  const handleMouseDown = useCallback((zone: Place, e: React.MouseEvent) => {
    e.preventDefault();
    setDragZone(zone);
    dragStartRef.current = { x: e.clientX, y: e.clientY, hRatio: horizontalSplitRatio, vRatio: verticalSplitRatio };
  }, [horizontalSplitRatio, verticalSplitRatio]);

  useEffect(() => {
    if (!dragZone) return;

    const handleMouseMove = (e: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start) return;

      if (dragZone === "vertical" || dragZone === "center") {
        const deltaX = e.clientX - start.x;
        const deltaRatio = availableWidth > 0 ? deltaX / availableWidth : 0;
        onHorizontalRatioChange(clampRatio(start.hRatio + deltaRatio));
      }
      if (dragZone === "horizontal" || dragZone === "center") {
        const deltaY = e.clientY - start.y;
        const deltaRatio = availableHeight > 0 ? deltaY / availableHeight : 0;
        onVerticalRatioChange(clampRatio(start.vRatio + deltaRatio));
      }
    };

    const handleMouseUp = () => {
      setDragZone(null);
      dragStartRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [availableHeight, availableWidth, dragZone, onHorizontalRatioChange, onVerticalRatioChange]);

  // Determine active/hover classes
  const verticalClasses = clsx({
    dragging: dragZone === "vertical" || dragZone === "center",
    hover: hoverZone === "vertical" || hoverZone === "center"
  });
  const horizontalClasses = clsx({
    dragging: dragZone === "horizontal" || dragZone === "center",
    hover: hoverZone === "horizontal" || hoverZone === "center"
  });
  const centerClasses = clsx({ dragging: !!dragZone, hover: !!hoverZone });

  if (orientation === "vertical") {
    return (
      <PaneDividerBar
        className={verticalClasses}
        dragZone={dragZone}
        gripIcon="vertical"
        onMouseDown={handleMouseDown}
        place="vertical"
        setHoverZone={setHoverZone}
        style={{ left: verticalBarLeft, height: containerHeight }}
      />
    );
  }

  return (
    <div className="pane-divider-cross">
      <PaneDividerBar
        className={verticalClasses}
        dragZone={dragZone}
        onMouseDown={handleMouseDown}
        place="vertical"
        setHoverZone={setHoverZone}
        style={{ left: verticalBarLeft }}
      />
      <PaneDividerBar
        className={horizontalClasses}
        dragZone={dragZone}
        onMouseDown={handleMouseDown}
        place="horizontal"
        setHoverZone={setHoverZone}
        style={{ top: horizontalBarTop }}
      />
      <PaneDividerBar
        className={centerClasses}
        dragZone={dragZone}
        gripIcon="center"
        onMouseDown={handleMouseDown}
        place="center"
        setHoverZone={setHoverZone}
        style={{ left: verticalBarLeft, top: horizontalBarTop }}
      />
    </div>
  );
}
