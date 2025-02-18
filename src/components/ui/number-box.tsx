import React from "react";

interface INumberBoxProps {
  width: string | number;
  min: number;
  max: number;
  value?: number;
  onValueChanged: (value: number | undefined) => void;
}

export const NumberBox = (props: INumberBoxProps) => {
  const {width, min, max, value, onValueChanged} = props;
  const style: React.CSSProperties = width !== undefined ? {width} : {};

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const intValue = parseInt(e.target.value, 10);
    const newValue = isNaN(intValue) ? undefined : intValue;
    onValueChanged(newValue);
  };

  return (
    <div style={style} className="ui-show-invalid-badge ui-numberbox ui-texteditor ui-editor-outlined ui-widget">
      <input type="hidden" value={value} />
      <div className="ui-texteditor-container">
        <div className="ui-texteditor-input-container">
          <input
            autoComplete="off"
            inputMode="decimal"
            className="ui-texteditor-input"
            type="number"
            value={value}
            onChange={handleChange}
            min={min}
            max={max}
            step="1"
            aria-valuemin={min}
            aria-valuemax={max}
            tabIndex={0}
            aria-valuenow={value}
            role="spinbutton"
          />
        </div>
      </div>
    </div>
  );
}
