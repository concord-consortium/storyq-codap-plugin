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
      {actual && <span>True label: <span style={{ color }}>{actual}</span>{predicted && ", "}</span>}
      {predicted && <span>Predicted label: <span style={{ color }}>{predicted}</span></span>}
    </p>
  );
}

interface ITextSectionProps {
  textSection: ITextSection;
}
export function TextSection({ textSection }: ITextSectionProps) {
  return (
    <div className="text-section">
      <p className="text-section-title">
        <TextSectionTitle title={textSection.title} />
      </p>
      <p className="text-section-text">
        {textSection.text}
      </p>
    </div>
  );
}
