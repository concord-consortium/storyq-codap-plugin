import React from "react";
import { ITextSection, ITextSectionTitle } from "../../stores/text_store";

import "./text-section.scss";

interface ITextSectionTitleProps {
  title?: ITextSectionTitle;
}
function TextSectionTitle({ title }: ITextSectionTitleProps) {
  if (!title) return null;

  const { actual, predicted, color } = title;
  return (
    <p>
      {actual && <span>True label: <span className="label" style={{ color }}>{actual}</span>{predicted && ", "}</span>}
      {predicted && <span>Predicted label: <span className="label" style={{ color }}>{predicted}</span></span>}
    </p>
  );
}

const titleHeight = 26;

interface ITextSectionProps {
  height: number;
  textSection: ITextSection;
}
export function TextSection({ height, textSection }: ITextSectionProps) {
  const textHeight = height - titleHeight;
  return (
    <div className="text-section" style={{ height }}>
      <p className="text-section-title" style={{ height: titleHeight }}>
        <TextSectionTitle title={textSection.title} />
      </p>
      <div className="text-section-text" style={{ height: textHeight }}>
        {textSection.text.map(text => {
          return (
            <div className="phrase-row">
              <div className="phrase-index">{text.index}{text.index != null && "."}</div>
              <div className="phrase">{text.phrase}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
