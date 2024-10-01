import React from "react";
import clsx from "clsx";

interface ITabPanelTabContentProps {
  index: number;
  selectedIndex: number;
  disabled: boolean;
  children: React.ReactNode
}

export const TabPanelTabContent = ({index, selectedIndex, disabled, children}: ITabPanelTabContentProps) => {
  const selected = index === selectedIndex;
  const hidden = !selected;
  const className = clsx("ui-item ui-multiview-item", {
    "ui-item-selected": selected,
    "ui-multiview-item-hidden": hidden,
    "ui-state-disabled": disabled,
  })

  return (
    <div
      className={className}
      role="tabpanel"
      style={{transform: "translate(0px, 0px)"}}
      aria-hidden={hidden}
    >
      <div className="ui-item-content ui-multiview-item-content">
        {children}
      </div>
    </div>
  )
}
