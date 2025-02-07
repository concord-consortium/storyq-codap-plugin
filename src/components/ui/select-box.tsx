import clsx from "clsx";
import React from "react";
import { FeatureKind } from "../../stores/store_types_and_constants";

type SelectBoxChangeEvent = CustomEvent<{value: string}> & {value: string};

interface ISelectBoxProps {
  dataSource: string[] | number[] | FeatureKind[];
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
              {placeholder && <option value="" disabled>{placeholder}</option>}
              {dataSource.map((item, index) => {
                if ((typeof item === "string") || (typeof item === "number")) {
                  return <option key={`${item}-${index}`} value={item}>{item}</option>
                }
                if (item.items.length === 0) {
                  return null;
                }
                return (
                  <optgroup key={item.key} label={item.key}>
                    {item.items.map((subItem, subIndex) => {
                      const stringValue = JSON.stringify(subItem.value);
                      return (
                        <option
                          key={`${stringValue}-${subIndex}-${index}`}
                          value={stringValue}
                        >
                          {subItem.name}
                        </option>
                      );
                    })}
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

