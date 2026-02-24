import clsx from "clsx";
import { observer } from "mobx-react-lite";
import React from "react";
import { ITextSection, ITextSectionTitle } from "../../stores/store_types_and_constants";
import { targetStore } from "../../stores/target_store";
import { TextParts } from "./text-parts";

import { ReactComponent as CorrectIcon } from "../../assets/correct-icon.svg";
import { ReactComponent as IncorrectIcon } from "../../assets/incorrect-icon.svg";

import "./text-section.scss";

interface ITextSectionTitleProps {
  caseCount: number;
  count: number;
  title?: ITextSectionTitle;
}
export const TextSectionTitle = observer(function TextSectionTitle({
  caseCount, count, title
}: ITextSectionTitleProps) {
  if (!title) return null;

  const { actual, actualColor, predicted, predictedColor } = title;
  const countPart = `${count} case${count === 1 ? "" : "s"}`;
  const percent = caseCount > 0 ? Math.floor(count / caseCount * 100) : 0;

  let AccuracyIcon: React.FC | null = null;
  if (predicted) {
    AccuracyIcon = actual === predicted ? CorrectIcon : IncorrectIcon;
  }
  const accuracyIconClasses = clsx(
    "accuracy-icon", { "positive-prediction": predicted === targetStore.positiveClassName }
  );

  return (
    <div className="actual-title">
      {actual && (
        <div>
          <span>True: </span><span className="label" style={{ color: actualColor }}>{actual}</span>
          {predicted && <span>,</span>}
        </div>
      )}
      {predicted && (
        <div className="predicted-title">
          <div>Predicted:&nbsp;</div><div className="label" style={{ color: predictedColor }}>{predicted}</div>
          {AccuracyIcon && <div className={accuracyIconClasses}><AccuracyIcon /></div>}
        </div>
      )}
      <div className="case-count">{`(${countPart}, ${percent}% of all)`}</div>
    </div>
  );
});

interface ITextSectionProps {
  caseCount: number;
  textSection: ITextSection;
  style?: React.CSSProperties;
}
export function TextSection({ caseCount, textSection, style }: ITextSectionProps) {
  const { text, title } = textSection;
  return (
    <div className="text-section" style={style}>
      <div className="text-section-title">
        <TextSectionTitle caseCount={caseCount} count={text.length} title={title} />
      </div>
      <div className="text-section-text">
        {text.map((textSectionText, index) => {
          const indexString = textSectionText.index != null ? `(${textSectionText.index + 1}) ` : "";
          return (
            <div key={`text-section-${index}`}>
              <div className="phrase">
                <TextParts textParts={[{ text: indexString }, ...textSectionText.textParts]} />
              </div>
              {index < text.length - 1 && <div className="divider" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
