import React from "react";
import { observer } from "mobx-react";
import { textStore } from "../../stores/text_store";
import { TextSection } from "./text-section";

import "./text-pane.scss";

const paneHeight = 395;
const titleHeight = 22;
const containerHeight = paneHeight - titleHeight;

export const TextPane = observer(function TextPane() {
  const sectionHeight = containerHeight / textStore.textSections.length;
  return (
    <div className="text-pane" style={{ height: paneHeight }}>
      <p className="text-title" style={{ height: titleHeight }}>
        {textStore.textComponentTitle}
      </p>
      <div className="text-container" style={{ height: containerHeight }}>
        {textStore.textSections.map(textSection => (
          <TextSection
            height={sectionHeight}
            key={`section-${textSection.title?.actual}-${textSection.title?.predicted}`}
            textSection={textSection}
          />
        ))}
      </div>
    </div>
  );
});
