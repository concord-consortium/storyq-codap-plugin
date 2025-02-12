/**
 * This component displays a progress bar
 */

import React from "react";

interface IProgressBarProps {
  percentComplete: number
}
export function ProgressBar({ percentComplete }: IProgressBarProps) {
  return (
    <div className='sq-progress-bar-container'>
      <div className='sq-progress-bar' style={{ width: `${percentComplete}%` }}>
        <p className='sq-pb-label'>{percentComplete}%</p>
      </div>
    </div>
  );
}
