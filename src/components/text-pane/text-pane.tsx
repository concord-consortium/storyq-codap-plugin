import React, { useEffect, useMemo, useRef, useState } from "react";
import { reaction } from "mobx";
import { observer } from "mobx-react";
import pluralize from "pluralize";
import { textFeedbackManager } from "../../managers/text_feedback_manager";
import { featureStore } from "../../stores/feature_store";
import { targetDatasetStore } from "../../stores/target_dataset_store";
import { targetStore } from "../../stores/target_store";
import { testingStore } from "../../stores/testing_store";
import { textStore } from "../../stores/text_store";
import { PaneDivider } from "./pane-divider";
import { kDividerSize } from "./text-pane-constants";
import { TextSection } from "./text-section";

import "./text-pane.scss";

const titleHeight = 36;

const TextPaneTitle = observer(function TextPaneTitle() {
  const _dataset = textStore.titleDataset === "target"
    ? targetDatasetStore.targetDatasetInfo.title : testingStore.testingDatasetInfo.title;
  const dataset = _dataset ? _dataset : "[data]";
  const _attribute = textStore.titleDataset === "target"
    ? targetStore.targetAttributeName : testingStore.testingAttributeName;
  const attribute = _attribute ? pluralize(_attribute) : "[text]";
  return (
    <>
      <span>Selected </span>
      <span className="highlighted">{attribute}</span>
      <span> in </span>
      <span className="highlighted">{dataset}</span>
    </>
  );
});

export const TextPane = observer(function TextPane() {
  const paneRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [horizontalSplitRatio, setHorizontalSplitRatio] = useState(0.5);
  const [verticalSplitRatio, setVerticalSplitRatio] = useState(0.5);

  // update the text pane when the highlight state of any feature changes
  useEffect(() => {
    return reaction(
      () => featureStore.highlights,
      () => textFeedbackManager?.updateTextPane()
    );
  }, []);

  // calculate container dimensions based on parent size
  useEffect(() => {
    const updateDimensions = () => {
      if (paneRef.current) {
        const paneHeight = paneRef.current.clientHeight;
        const calculatedHeight = paneHeight - titleHeight;
        setContainerHeight(calculatedHeight);
        setContainerWidth(paneRef.current.clientWidth);
      }
    };

    // delay initial calculation to allow DOM to fully render
    requestAnimationFrame(updateDimensions);

    // update on window resize
    window.addEventListener('resize', updateDimensions);

    // observe the parent element of the pane
    let resizeObserver: ResizeObserver | null = null;
    if (paneRef.current?.parentElement) {
      resizeObserver = new ResizeObserver(updateDimensions);
      resizeObserver.observe(paneRef.current.parentElement);
    }

    return () => {
      window.removeEventListener('resize', updateDimensions);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []);

  const textSections = textStore.textSections;

  // sort the text sections so the target label section comes first
  const chosenTargetClassName = targetStore.chosenTargetClassName;
  const sortedTextSections = useMemo(() => {
    const result = [...textSections];
    if (chosenTargetClassName) {
      result.sort((a, b) => {
        const aIsTarget = !!(a.title && a.title.actual === chosenTargetClassName);
        const bIsTarget = !!(b.title && b.title.actual === chosenTargetClassName);
        if (aIsTarget === bIsTarget) return 0;
        return aIsTarget ? -1 : 1;
      });
    }
    return result;
  }, [chosenTargetClassName, textSections]);

  const displaySections = sortedTextSections.slice(0, 4); // Cap at 4 sections
  const sectionCount = displaySections.length;
  const splitHorizontally = sectionCount > 1;
  const splitVertically = sectionCount > 2;

  const splitWidth = containerWidth - kDividerSize;
  const leftWidth = horizontalSplitRatio * splitWidth;
  const rightWidth = (1 - horizontalSplitRatio) * splitWidth;
  const splitHeight = containerHeight - kDividerSize;
  const topHeight = verticalSplitRatio * splitHeight;
  const bottomHeight = (1 - verticalSplitRatio) * splitHeight;

  return (
    <div className="text-pane" ref={paneRef}>
      <div className="text-title" style={{ height: titleHeight }}>
        <TextPaneTitle />
      </div>
      <div className="text-container" ref={containerRef} style={{ height: containerHeight }}>
        {displaySections.map((section, index) => {
          const isLeft = index % 2 === 0;
          const splitWidth = isLeft ? leftWidth : rightWidth;
          const isTop = index < 2;
          const splitHeight = isTop ? topHeight : bottomHeight;
          const style = {
            height: splitVertically ? splitHeight : containerHeight,
            left: splitHorizontally && !isLeft ? leftWidth + kDividerSize : undefined,
            top: splitVertically && !isTop ? topHeight + kDividerSize : undefined,
            width: splitHorizontally ? splitWidth : containerWidth
          }

          return (
            <TextSection
              caseCount={textStore.caseCount}
              key={textStore.getTextSectionId(section)}
              textSection={section}
              style={style}
            />
          );
        })}
        {splitHorizontally && (
          <PaneDivider
            orientation={splitVertically ? "cross" : "vertical"}
            containerWidth={containerWidth}
            containerHeight={containerHeight}
            horizontalSplitRatio={horizontalSplitRatio}
            verticalSplitRatio={verticalSplitRatio}
            onHorizontalRatioChange={setHorizontalSplitRatio}
            onVerticalRatioChange={setVerticalSplitRatio}
          />
        )}
      </div>
    </div>
  );
});
