import React from "react";
import { clsx } from "clsx";
import { ITextSection, ITextSectionTitle } from "../../stores/store_types_and_constants";

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
          const indexString = text.index != null ? `${text.index + 1}. ` : "";
          return (
            <div className="phrase-row">
              <div className="phrase-index">{indexString}</div>
              <div className="phrase">
                {text.textParts.map(part =><span className={clsx(part.classNames)}>{part.text}</span>)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
