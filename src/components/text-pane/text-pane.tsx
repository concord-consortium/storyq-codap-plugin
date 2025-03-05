import React, { useEffect } from "react";
import { reaction } from "mobx";
import { observer } from "mobx-react";
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

export const TextPane = observer(function TextPane() {
  // Update the text pane when the highlight state of any feature changes
  useEffect(() => {
    return reaction(
      () => featureStore.highlights,
      () => textFeedbackManager?.updateTextPane()
    );
  }, []);

  // Update the title when the target dataset, title, or attribute changes
  useEffect(() => {
    return reaction(
      () => {
        return [
          textStore.titleDataset, targetDatasetStore.targetDatasetInfo.title, targetStore.targetAttributeName,
          testingStore.testingDatasetInfo.title, testingStore.testingAttributeName
        ];
      },
      () => {
        const dataset = textStore.titleDataset === "target"
          ? targetDatasetStore.targetDatasetInfo.title : testingStore.testingDatasetInfo.title;
        const attribute = textStore.titleDataset === "target"
          ? targetStore.targetAttributeName : testingStore.testingAttributeName;
        textStore.updateTitle(dataset, attribute);
      }
    );
  }, []);

  const visibleTextSectionCount = textStore.textSections.filter(textSection => !textSection.hidden).length;
  const textHeight = containerHeight - textStore.textSections.length * textSectionTitleHeight;
  const sectionHeight = textHeight / visibleTextSectionCount;

  return (
    <div className="text-pane" style={{ height: paneHeight }}>
      <div className="text-title" style={{ height: titleHeight }}>
        {textStore.textComponentTitle}
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
