import React, { useEffect } from "react";
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

const paneHeight = 395;
const titleHeight = 36;
const containerVerticalPadding = 4;
const containerHeight = paneHeight - titleHeight - containerVerticalPadding * 2;

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
  // Update the text pane when the highlight state of any feature changes
  useEffect(() => {
    return reaction(
      () => featureStore.highlights,
      () => textFeedbackManager?.updateTextPane()
    );
  }, []);

  const visibleTextSectionCount = textStore.textSections.filter(textSection => !textSection.hidden).length;
  const textHeight = containerHeight - textStore.textSections.length * textSectionTitleHeight;
  const sectionHeight = textHeight / visibleTextSectionCount;

  return (
    <div className="text-pane" style={{ height: paneHeight }}>
      <div className="text-title" style={{ height: titleHeight }}>
        <TextPaneTitle />
      </div>
      <div className="text-container" style={{ height: containerHeight }}>
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
