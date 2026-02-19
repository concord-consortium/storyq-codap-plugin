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
import { kPaneDividerSize } from "../constants";
import { PaneDivider } from "./pane-divider";
import { TextSection } from "./text-section";

import "./text-pane.scss";

const titleHeight = 36;
const defaultSplitRatio = 0.5;

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
  const [horizontalSplitRatio, setHorizontalSplitRatio] = useState(defaultSplitRatio);
  const [verticalSplitRatio, setVerticalSplitRatio] = useState(defaultSplitRatio);

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
        setContainerHeight(paneRef.current.clientHeight - titleHeight);
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

  // sort the text sections so the target label section comes first
  const chosenTargetClassName = targetStore.chosenTargetClassName;
  const textSections = textStore.textSections;
  const sortedTextSections = useMemo(() => {
    const result = [...textSections];
    if (chosenTargetClassName) {
      result.sort((a, b) => {
        if (!a.title || !b.title) return 0;

        // If predicted labels are included, sort positive predictions first
        if (a.title.predicted != null && b.title.predicted != null) {
          const aIsPredictedTarget = a.title.predicted === chosenTargetClassName;
          const bIsPredictedTarget = b.title.predicted === chosenTargetClassName;
          if (aIsPredictedTarget !== bIsPredictedTarget) return aIsPredictedTarget ? -1 : 1;
        }

        // Sort negative actual labels first
        const aIsTarget = a.title.actual === chosenTargetClassName;
        const bIsTarget = b.title.actual === chosenTargetClassName;
        if (aIsTarget === bIsTarget) return 0;
        return aIsTarget ? 1 : -1;
      });
    }
    return result;
  }, [chosenTargetClassName, textSections]);

  const displaySections = sortedTextSections.slice(0, 4); // Cap at 4 sections
  const splitHorizontally = displaySections.length > 1;
  const splitVertically = displaySections.length > 2;

  const splitWidth = Math.max(containerWidth - kPaneDividerSize, 0);
  const leftWidth = horizontalSplitRatio * splitWidth;
  const rightWidth = (1 - horizontalSplitRatio) * splitWidth;
  const splitHeight = Math.max(containerHeight - kPaneDividerSize, 0);
  const topHeight = verticalSplitRatio * splitHeight;
  const bottomHeight = (1 - verticalSplitRatio) * splitHeight;

  const handleResetClick = () => {
    setHorizontalSplitRatio(defaultSplitRatio);
    setVerticalSplitRatio(defaultSplitRatio);
  };
  const resetDisabled = horizontalSplitRatio === defaultSplitRatio && verticalSplitRatio === defaultSplitRatio;
  const resetClasses = "storyq-button reset-button";

  return (
    <div className="text-pane" ref={paneRef}>
      <div className="text-title" style={{ height: titleHeight }}>
        <TextPaneTitle />
        <button className={resetClasses} disabled={resetDisabled} onClick={handleResetClick}>Reset</button>
      </div>
      <div className="text-container" ref={containerRef} style={{ height: containerHeight }}>
        {displaySections.map((textSection, index) => {
          const isLeft = index % 2 === 0;
          const splitWidth = isLeft ? leftWidth : rightWidth;
          const isTop = index < 2;
          const splitHeight = isTop ? topHeight : bottomHeight;
          const style = {
            height: splitVertically ? splitHeight : containerHeight,
            left: splitHorizontally && !isLeft ? leftWidth + kPaneDividerSize : undefined,
            top: splitVertically && !isTop ? topHeight + kPaneDividerSize : undefined,
            width: splitHorizontally ? splitWidth : containerWidth
          }

          return (
            <TextSection
              caseCount={textStore.caseCount}
              key={textStore.getTextSectionId(textSection)}
              textSection={textSection}
              style={style}
            />
          );
        })}
        {splitHorizontally && ( // If we're split vertically, we're also split horizontally
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
