import React from 'react';
import { TopMetricRow } from './TopMetricRow';
import { MainCanvas } from './MainCanvas';
import { TelemetryPanel } from './TelemetryPanel';

export function Dashboard() {
  return (
    <>
      {/* Header / Metric Row */}
      <div className="shrink-0 md:h-[100px]">
        <TopMetricRow />
      </div>

      {/* 12-Column Grid Body */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-2 min-h-0">
        <MainCanvas />
        <TelemetryPanel />
      </div>
    </>
  );
}