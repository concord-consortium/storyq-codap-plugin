import React from "react";
import { ITextSection, ITextSectionTitle } from "../../stores/store_types_and_constants";
import { TextParts } from "./text-parts";

import "./text-section.scss";

export const textSectionTitleHeight = 28;

interface ITextSectionTitleProps {
  count: number;
  title?: ITextSectionTitle;
}
function TextSectionTitle({ count, title }: ITextSectionTitleProps) {
  if (!title) return null;

  const { actual, actualColor, predicted, predictedColor } = title;
  return (
    <span className="actual-title">
      {actual && (
        <>
          <span>True label: </span><span className="label" style={{ color: actualColor }}>{actual}</span>
          {predicted && <span>,&nbsp;</span>}
        </>
      )}
      {predicted && (
        <>
          <span>Predicted label: </span><span className="label" style={{ color: predictedColor }}>{predicted}</span>
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
  const { text, title } = textSection;
  const height = textSectionTitleHeight + textHeight;
  return (
    <div className="text-section" style={{ height }}>
      <div
        className="text-section-title"
        style={{ height: textSectionTitleHeight }}
      >
        <TextSectionTitle count={text.length} title={title} />
      </div>
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
    </div>
  );
}
