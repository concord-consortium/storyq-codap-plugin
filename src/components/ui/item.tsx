import React from "react";

interface IItemProps {
  title: string;
  text?: string;
  disabled?: boolean;
  children: React.ReactNode
}

// NOTE: this is just to maintain the calling component pattern - this is really handled via TabPanelTabContent

export const Item = ({children}: IItemProps) => {
  return <>{children}</>;
}

