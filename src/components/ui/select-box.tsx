import clsx from "clsx";
import React from "react";

type SelectBoxChangeEvent = CustomEvent<{value: string}> & {value: string};


interface SelectBoxItem {
  name: string;
  value: string;
}
interface SelectBoxGroup {
  key: string;
  items: SelectBoxItem[]
}

interface ISelectBoxProps {
  dataSource: string[] | number[] | SelectBoxGroup[];
  placeholder: string;
  hint?: string;
  value?: any;
  noDataText?: string;
  style?: React.CSSProperties;
  width?: string | number;
  className?: string;
  defaultValue?: any;
  onValueChange?: (option: string) => void;
  onValueChanged?: (e: SelectBoxChangeEvent) => void;
}

export const SelectBox = (props: ISelectBoxProps) => {
  const {dataSource, placeholder, hint, value, noDataText, onValueChange, onValueChanged, width, defaultValue} = props;
  const className = clsx("ui-show-invalid-badge ui-selectbox ui-textbox ui-texteditor ui-dropdowneditor-button-visible ui-editor-outlined ui-widget ui-dropdowneditor ui-dropdowneditor-field-clickable ui-dropdowneditor-active", props.className)

  let style: React.CSSProperties = props.style ?? {};
  if (width) {
    style.width = width;
  }

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onValueChange?.(value);
    if (onValueChanged) {
      const syntheticEvent = new CustomEvent('customEvent', {detail: {value}}) as any;
      syntheticEvent.value = value;
      onValueChanged(syntheticEvent);
    }
  }

  if (dataSource.length === 0) {
    return <div>{noDataText}</div>
  }

  return (
    <div
      className={className}
      title={hint}
      style={style}>
      <div className="ui-dropdowneditor-input-wrapper ui-selectbox-container">
        <div className="ui-texteditor-container">
          <div className="ui-texteditor-input-container">
            <select
              className="ui-texteditor-input"
              style={{"WebkitAppearance": "auto"} as any}
              value={value ?? defaultValue}
              onChange={handleChange}
              title={hint}
            >
              {placeholder && <option value="" disabled selected={value === undefined}>{placeholder}</option>}
              {dataSource.map((item, index) => {
                if ((typeof item === "string") || (typeof item === "number")) {
                  return <option key={`${item}-${index}`} value={item}>{item}</option>
                }
                if (item.items.length === 0) {
                  return null;
                }
                return (
                  <optgroup label={item.key}>
                    {item.items.map((subItem, subIndex) => <option key={`${subItem.value}-${subIndex}-${index}`} value={subItem.value}>{subItem.name}</option>)}
                  </optgroup>
                )
              })}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}

