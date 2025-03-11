import React from "react";
import { clsx } from "clsx";
import { ReactComponent as CollapseExpandIcon } from "../../assets/collapse-expand-icon.svg";
import { ITextSection, ITextSectionTitle } from "../../stores/store_types_and_constants";
import { textStore } from "../../stores/text_store";
import { TextParts } from "./text-parts";

import "./text-section.scss";

export const textSectionTitleHeight = 28;

interface ITextSectionTitleProps {
  count: number;
  title?: ITextSectionTitle;
}
function TextSectionTitle({ count, title }: ITextSectionTitleProps) {
  if (!title) return null;

  const { actual, predicted, color } = title;
  return (
    <span className="actual-title">
      {actual && (
        <>
          <span>True label: </span><span className="label" style={{ color }}>{actual}</span>
          {predicted && <span>,&nbsp;</span>}
        </>
      )}
      {predicted && (
        <>
          <span>Predicted label: </span><span className="label" style={{ color }}>{predicted}</span>
        </>
      )}
      <span>&nbsp;</span>
      <span className="case-count">{`(${count} case${count === 1 ? "" : "s"})`}</span>
    </span>
  );
}

interface ITextSectionProps {
  textHeight: number;
  textSection: ITextSection;
}
export function TextSection({ textHeight, textSection }: ITextSectionProps) {
  const { hidden, text, title } = textSection;
  const height = textSectionTitleHeight + (!hidden ? textHeight : 0);
  return (
    <div className="text-section" style={{ height }}>
      <button
        className="text-section-title"
        onClick={() => textStore.toggleTextSectionVisibility(textSection)}
        style={{ height: textSectionTitleHeight }}
      >
        <TextSectionTitle count={text.length} title={title} />
        <div className={clsx("hide-icon", { hidden })}>
          <CollapseExpandIcon />
        </div>
      </button>
      {!hidden && (
        <div className="text-section-text" style={{ height: textHeight }}>
          {text.map((textSectionText, index) => {
            const indexString = textSectionText.index != null ? `${textSectionText.index + 1}:` : "";
            return (
              <div key={indexString}>
                <div className="phrase-row">
                  <div className="phrase-index">{indexString}</div>
                  <div className="phrase">
                    <TextParts textParts={textSectionText.textParts} />
                  </div>
                </div>
                {index < text.length - 1 && <div className="divider" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
