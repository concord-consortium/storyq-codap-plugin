import React, { useEffect, useState } from "react";
import clsx from "clsx";

type TextBoxChangeEvent = CustomEvent<{value: string}> & {value: string};

interface ITextBoxProps {
  className: string;
  placeholder: string;
  value: string;
  maxLength: number;
  onValueChanged: (e: TextBoxChangeEvent) => void;
  hint?: string;
  width?: number;
  onFocusOut?: () => void;
}

export const TextBox = (props: ITextBoxProps) => {
  const {className, placeholder, value, maxLength, onValueChanged, hint, width, onFocusOut} = props;
  const style: React.CSSProperties = width !== undefined ? {width} : {};
  const [internalValue, setInternalValue] = useState(value);
  const hasValue = internalValue.length > 0;

  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalValue(newValue);

    const syntheticEvent = new CustomEvent('customEvent', { detail: { value: newValue } }) as any;
    syntheticEvent.value = newValue;
    onValueChanged(syntheticEvent);
  };

  return (
    <div style={style} className={`${className} ui-show-invalid-badge ui-textbox ui-texteditor ui-editor-outlined ui-texteditor-empty ui-widget ui-state-hover`}>
      <div className="ui-texteditor-container">
        <div className="ui-texteditor-input-container">
          <input
            autoComplete="off"
            placeholder={placeholder}
            className="ui-texteditor-input"
            type="text"
            spellCheck="false"
            maxLength={maxLength}
            tabIndex={0}
            title={hint}
            value={internalValue}
            onChange={handleChange}
            onBlur={onFocusOut}
          />
          <div className={clsx("ui-placeholder", {"ui-state-invisible": hasValue})}>
            {placeholder}
          </div>
        </div>
      </div>
    </div>
  );
};
