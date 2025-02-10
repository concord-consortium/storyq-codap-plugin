import clsx from "clsx";
import React from "react";
import { FeatureKind } from "../../stores/store_types_and_constants";
import "./select-box.scss";

interface ISelectBoxProps {
  dataSource: string[] | number[] | FeatureKind[];
  placeholder: string;
  hint?: string;
  value?: string | number;
  noDataText?: string;
  style?: React.CSSProperties;
  width?: string | number;
  className?: string;
  defaultValue?: string | number;
  onValueChange?: (option: string) => void;
  onValueChanged?: (value: string) => void;
}

export function SelectBox({
  className, dataSource, placeholder, hint, value, noDataText, onValueChange, onValueChanged, style, width, defaultValue
}: ISelectBoxProps) {
  const _className = clsx(
    "ui-show-invalid-badge ui-selectbox ui-textbox ui-texteditor ui-dropdowneditor-button-visible ui-editor-outlined",
    "ui-widget ui-dropdowneditor ui-dropdowneditor-field-clickable ui-dropdowneditor-active", className
  );

  let _style: React.CSSProperties = style ?? {};
  if (width) {
    _style.width = width;
  }

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onValueChange?.(value);
    onValueChanged?.(value);
  }

  if (dataSource.length === 0) {
    return <div>{noDataText}</div>
  }

  return (
    <div
      className={_className}
      title={hint}
      style={_style}>
      <div className="ui-dropdowneditor-input-wrapper ui-selectbox-container">
        <div className="ui-texteditor-container">
          <div className="ui-texteditor-input-container">
            <select
              className="ui-texteditor-input select-box-select"
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
