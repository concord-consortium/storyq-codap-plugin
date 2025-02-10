/**
 * This component displays a progress bar
 */

import React, { useRef } from "react";

interface IProgressBarProps {
  percentComplete: number
}
export function ProgressBar({ percentComplete }: IProgressBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  return (
    <div className='sq-progress-bar-container'>
      <div className='sq-progress-bar' style={{ width: `${percentComplete}%` }} ref={barRef}>
        <p className='sq-pb-label'>{percentComplete}%</p>
      </div>
    </div>
  );
}
