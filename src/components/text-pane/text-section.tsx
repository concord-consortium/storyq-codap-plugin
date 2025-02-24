import React from "react";
import { clsx } from "clsx";
import { ITextSection, ITextSectionTitle } from "../../stores/store_types_and_constants";

import "./text-section.scss";

interface ITextSectionTitleProps {
  count: number;
  title?: ITextSectionTitle;
}
function TextSectionTitle({ count, title }: ITextSectionTitleProps) {
  if (!title) return null;

  const { actual, predicted, color } = title;
  return (
    <>
      {actual && (
        <span>
          True label: <span className="label" style={{ color }}>{actual}</span>
          {predicted && <span>,&nbsp;</span>}
        </span>
      )}
      {predicted && <span>Predicted label: <span className="label" style={{ color }}>{predicted}</span></span>}
      <span>&nbsp;</span>{`(${count} case${count === 1 ? "" : "s"})`}
    </>
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
        <TextSectionTitle count={textSection.text.length} title={textSection.title} />
      </p>
      <div className="text-section-text" style={{ height: textHeight }}>
        {textSection.text.map(text => {
          const indexString = text.index != null ? `${text.index + 1}. ` : "";
          return (
            <div className="phrase-row" key={indexString}>
              <div className="phrase-index">{indexString}</div>
              <div className="phrase">
                {text.textParts.map((part, index) => (
                  <span className={clsx(part.classNames)} key={`${index}-${part.text}`}>
                    {part.text}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
