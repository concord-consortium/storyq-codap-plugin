import React from "react";
import { observer } from "mobx-react";
import { textStore } from "../../stores/text_store";
import { TextSection } from "./text-section";

import "./text-pane.scss";

export const TextPane = observer(function TextPane() {
  return (
    <div className="text-pane">
      <p className="text-title">
        {textStore.textComponentTitle}
      </p>
      <div className="text-container">
        {textStore.textSections.map(textSection => <TextSection textSection={textSection} />)}
      </div>
    </div>
  );
});
