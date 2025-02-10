import clsx from "clsx";
import React, { useState } from "react";

interface ITabPanelTabProps {
  title: string;
  index: number;
  selectedIndex: number;
  disabled: boolean;
  onSelectionChanged: (index: number) => void;
}

export const TabPanelTab = ({title, index, selectedIndex, disabled, onSelectionChanged}: ITabPanelTabProps) => {
  const selected = index === selectedIndex;
  const [hovering, setHovering] = useState(false);
  const className = clsx("ui-item ui-tab ui-tabpanel-tab", {
    "ui-tab-selected": selected,
    "ui-state-disabled": disabled,
    "ui-state-hover": hovering
  });

  const handleClick = () => {
    if (!disabled) {
      onSelectionChanged(index);
    }
  }

  const handleMouseEnter = () => setHovering(true);
  const handleMouseLeave = () => setHovering(false);

  return (
    <div
      className={className}
      role="tab"
      aria-disabled={disabled}
      aria-selected={selected}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="ui-item-content ui-tab-content">
        <div className="ui-tab-text">
          <span className="ui-tab-text-span">{title}<span className="ui-tab-text-span-pseudo">{title}</span></span>
        </div>
      </div>
    </div>
  )
}
