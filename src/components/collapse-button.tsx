import React from "react";
import { clsx } from "clsx";
import { ReactComponent as ArrowIcon } from "../assets/arrow-icon.svg";

import "./collapse-button.scss";

export const collapseButtonWidth = 16;

interface ICollapseButtonProps {
  direction: "left" | "right";
  onClick: () => void;
}
export function CollapseButton({ direction, onClick }: ICollapseButtonProps) {
  return (
    <button className="collapse-button" onClick={onClick}>
      <ArrowIcon className={clsx("arrow-icon", direction)} />
    </button>
  );
}
