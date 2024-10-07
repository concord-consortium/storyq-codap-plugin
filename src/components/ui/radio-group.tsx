import React from "react";
import clsx from "clsx";

type RadioGroupChangeEvent = CustomEvent<{value: string}> & {value: string};

interface IRadioGroupProps {
  items: string[];
  value: string;
  hint: string;
  onValueChange: (e: RadioGroupChangeEvent) => void;
}

interface IRadioGroupItemProps {
  item: string;
  value: string;
  onValueChange: (e: RadioGroupChangeEvent) => void;
}

const RadioGroupItem = ({item, value, onValueChange}: IRadioGroupItemProps) => {
  const selected = item === value;
  const outerClassName = clsx("ui-item ui-radiobutton", {
    "ui-item-selected": selected,
    "ui-radiobutton-checked": selected
  });
  const innerClassName = clsx("ui-radiobutton-icon", {
    "ui-radiobutton-icon-checked": selected,
  });

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const syntheticEvent = new CustomEvent('customEvent', {
      detail: {
        value: value
      }
    }) as any;
    syntheticEvent.value = value;
    onValueChange(syntheticEvent);
  };

  return (
    <div
      className={outerClassName}
      role="radio"
      aria-checked={selected}
      onClick={handleClick}
    >
      <div className="ui-radio-value-container">
        <div className={innerClassName}>
          <div className="ui-radiobutton-icon-dot"></div>
        </div>
      </div>
      <div className="ui-item-content">{item}</div>
    </div>
  )
}

export const RadioGroup = ({items, value, hint, onValueChange}: IRadioGroupProps) => {
  return (
    <div
      className="ui-show-invalid-badge ui-radiogroup ui-radiogroup-vertical ui-widget"
      role="radiogroup"
      title={hint}
      tabIndex={0}
    >
      <input type="hidden" value={value} />
      <div className="ui-widget ui-collection">
        {items.map(item => <RadioGroupItem key={item} item={item} value={value} onValueChange={onValueChange} />)}
      </div>
    </div>
  )
}

