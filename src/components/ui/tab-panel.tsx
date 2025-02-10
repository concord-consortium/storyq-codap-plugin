import React from "react";
import { clsx } from "clsx";
import { TabPanelTab } from "./tab-panel-tab";
import { TabPanelTabContent } from "./tab-panel-tab-content";

interface ITabPanelProps {
  id: string;
  selectedIndex: number;
  onSelectionChanged: (index: number) => void;
  children: React.ReactNode
}

export const TabPanel = ({ id, selectedIndex, onSelectionChanged, children }: ITabPanelProps) => {
  return (
    <div
      id={id}
      className={clsx(
        "ui-multiview ui-swipeable ui-tabpanel ui-tabpanel-tabs-position-top ui-widget",
        "ui-visibility-change-handler ui-collection"
      )}
      tabIndex={-1}
      role="tabpanel"
    >
      <div className="ui-tabpanel-tabs">
        <div role="tablist"
          className={clsx(
            "ui-tabs ui-tabs-scrolling-enabled ui-tabs-horizontal ui-tab-indicator-position-bottom",
            "ui-tabs-icon-position-start ui-tabs-styling-mode-primary ui-widget ui-visibility-change-handler",
            "ui-collection ui-tabs-expanded"
          )}
          tabIndex={0}
        >
          <div className="ui-tabs-wrapper">
            {React.Children.map(children, (child, index) => {
              if (React.isValidElement(child)) {
                return (
                  <TabPanelTab
                    title={child.props.title}
                    index={index}
                    selectedIndex={selectedIndex}
                    disabled={child.props.disabled}
                    onSelectionChanged={onSelectionChanged}
                  />
                );
              }
              return null;
            })}
          </div>
        </div>
      </div>
      <div className="ui-tabpanel-container">
        <div className="ui-multiview-wrapper">
          <div
            className="ui-multiview-item-container"
            style={{ transition: "all", transform: "translate(0px, 0px)", left: 0 }}
          >
            {React.Children.map(children, (child, index) => {
              if (React.isValidElement(child)) {
                return (
                  <TabPanelTabContent
                    index={index}
                    selectedIndex={selectedIndex}
                    disabled={child.props.disabled}
                    children={child}
                  />
                );
              }
              return null;
            })}
        </div>
        </div>
      </div>
    </div>
  );
}
