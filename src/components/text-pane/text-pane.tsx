import React, { useEffect, useRef, useState } from "react";
import { reaction } from "mobx";
import { observer } from "mobx-react";
import pluralize from "pluralize";
import { textFeedbackManager } from "../../managers/text_feedback_manager";
import { featureStore } from "../../stores/feature_store";
import { targetDatasetStore } from "../../stores/target_dataset_store";
import { targetStore } from "../../stores/target_store";
import { testingStore } from "../../stores/testing_store";
import { textStore } from "../../stores/text_store";
import { TextSection, textSectionTitleHeight } from "./text-section";

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

  // update the text pane when the highlight state of any feature changes
  useEffect(() => {
    return reaction(
      () => featureStore.highlights,
      () => textFeedbackManager?.updateTextPane()
    );
  }, []);

  // calculate container height based on parent height
  useEffect(() => {
    const updateHeight = () => {
      if (paneRef.current) {
        const paneHeight = paneRef.current.clientHeight;
        const calculatedContainerHeight = paneHeight - titleHeight;
        // Only update if the height actually changed to prevent infinite loops
        setContainerHeight(prev => {
          if (prev !== calculatedContainerHeight) {
            return calculatedContainerHeight;
          }
          return prev;
        });
      }
    };

    // delay initial height calculation to allow DOM to fully render
    const timer = setTimeout(updateHeight, 0);

    // update height on window resize
    window.addEventListener('resize', updateHeight);

    // observe the parent element of the pane, not the pane itself
    let resizeObserver: ResizeObserver | null = null;
    if (paneRef.current?.parentElement) {
      resizeObserver = new ResizeObserver(updateHeight);
      resizeObserver.observe(paneRef.current.parentElement);
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateHeight);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []);

  const visibleTextSectionCount = textStore.textSections.filter(textSection => !textSection.hidden).length;
  const textHeight = containerHeight > 0
    ? containerHeight - textStore.textSections.length * textSectionTitleHeight
    : 0;
  const sectionHeight = visibleTextSectionCount > 0 ? textHeight / visibleTextSectionCount : 0;

  return (
    <div className="text-pane" ref={paneRef}>
      <div className="text-title" style={{ height: titleHeight }}>
        <TextPaneTitle />
      </div>
      <div className="text-container" ref={containerRef} style={{ height: containerHeight }}>
        {textStore.textSections.map(textSection => (
          <TextSection
            key={textStore.getTextSectionId(textSection)}
            textHeight={sectionHeight}
            textSection={textSection}
          />
        ))}
      </div>
    </div>
  );
});
