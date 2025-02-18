import React, { useCallback } from "react";
import clsx from "clsx";

interface ICheckBoxProps {
  text: string;
  value: boolean;
  onValueChanged: (value: boolean) => void;
  hint?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export const CheckBox = ({ text, value, onValueChanged, hint, disabled, style }: ICheckBoxProps) => {
  const hasText = text.length > 0;
  const className = clsx(
    "ui-widget ui-checkbox",
    {
      "ui-checkbox-checked": value,
      "ui-checkbox-has-text": hasText,
      "ui-state-disabled": disabled,
    }
  );

  const handleClick = useCallback(() => {
    if (!disabled) onValueChanged(!value);
  }, [disabled, value, onValueChanged]);

  return (
    <div
      aria-readonly="false"
      aria-invalid="false"
      aria-disabled={disabled}
      role="checkbox"
      aria-checked={value}
      className={className}
      tabIndex={0}
      title={hint}
      onClick={handleClick}
      style={style}
    >
      <input type="hidden" value={String(value)} />
      <div className="ui-checkbox-container">
        <span className="ui-checkbox-icon"></span>
        {hasText && <span className="ui-checkbox-text">{text}</span>}
      </div>
    </div>
  );
}
