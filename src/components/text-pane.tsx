import React from "react";
import { observer } from "mobx-react";
import { textStore } from "../stores/text_store";

import "./text-pane.scss";

export const TextPane = observer(function TextPane() {
  return (
    <div className="text-pane">
      <p>
        {textStore.textDisplay}
      </p>
    </div>
  );
});
