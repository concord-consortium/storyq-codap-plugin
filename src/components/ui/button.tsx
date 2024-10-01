import React from "react";
import clsx from "clsx";

interface IButtonProps {
  className: string;
  text?: string;
  icon?: string;
  disabled?: boolean;
  onClick: () => void;
  hint?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export const Button = (props: IButtonProps) => {
  const {hint, disabled, style, icon, onClick, children} = props;
  const className = clsx(
    "ui-widget ui-button ui-button-mode-contained ui-button-normal",
    {"ui-button-disabled": disabled},
    props.className
  );
  const content = children ?? <i className={`ui-icon ui-icon-${icon}`} />;

  const handleClick = () => {
    if (!disabled) {
      onClick();
    }
  }

  return (
    <div
      className={className}
      style={style}
      role="button"
      tabIndex={0}
      title={hint}
      onClick={handleClick}
    >
      <div className="ui-button-content">{content}</div>
    </div>
  )
}
