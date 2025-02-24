import React from "react";
import { observer } from "mobx-react";
import { textStore } from "../../stores/text_store";
import { TextSection, textSectionTitleHeight } from "./text-section";

import "./text-pane.scss";

const paneHeight = 395;
const titleHeight = 22;
const containerHeight = paneHeight - titleHeight;

export const TextPane = observer(function TextPane() {
  const visibleTextSectionCount = textStore.textSections.filter(textSection => !textSection.hidden).length;
  const textHeight = containerHeight - textStore.textSections.length * textSectionTitleHeight;
  const sectionHeight = textHeight / visibleTextSectionCount;

  return (
    <div className="text-pane" style={{ height: paneHeight }}>
      <p className="text-title" style={{ height: titleHeight }}>
        {textStore.textComponentTitle}
      </p>
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
