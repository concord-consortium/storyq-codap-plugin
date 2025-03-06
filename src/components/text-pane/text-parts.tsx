import React from "react";
import clsx from "clsx";
import { toJS } from "mobx";
import { ITextPart } from "../../stores/store_types_and_constants";

interface ITextPartProps {
  textParts: ITextPart[];
}
export function TextParts({ textParts }: ITextPartProps) {
  return (
    <>
      {textParts.map((part, index) => {
        const style = part.style ? toJS(part.style) : undefined;
        return (
          <span className={clsx(part.classNames)} key={`${index}-${part.text}`} style={style}>
            {part.text}
          </span>
        );
      })}
    </>
  );
}
