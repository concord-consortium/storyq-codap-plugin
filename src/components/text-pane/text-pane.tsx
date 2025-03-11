import React, { useEffect } from "react";
import { reaction } from "mobx";
import { observer } from "mobx-react";
import { textFeedbackManager } from "../../managers/text_feedback_manager";
import { domainStore } from "../../stores/domain_store";
import { featureStore } from "../../stores/feature_store";
import { textStore } from "../../stores/text_store";
import { TextParts } from "./text-parts";
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

  const visibleTextSectionCount = textStore.textSections.filter(textSection => !textSection.hidden).length;
  const textHeight = containerHeight - textStore.textSections.length * textSectionTitleHeight;
  const sectionHeight = textHeight / visibleTextSectionCount;

  return (
    <div className="text-pane" style={{ height: paneHeight }}>
      <div className="text-title" style={{ height: titleHeight }}>
        <TextParts textParts={domainStore.textPaneTitle} />
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
