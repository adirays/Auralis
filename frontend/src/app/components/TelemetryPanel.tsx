import React, { useEffect, useState } from 'react';
import { Target, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { historyApi, type ScanRecordWithAnomalies } from '../lib/api';
import { useScan } from '../context/scan-context';

export function TelemetryPanel() {
  const { scanVersion } = useScan();
  const [records, setRecords] = useState<ScanRecordWithAnomalies[]>([]);
  const [modelVersion, setModelVersion] = useState<string>('—');

  useEffect(() => {
    historyApi.getScansWithAnomalies(10).then((data) => {
      setRecords(data);
      if (data.length > 0 && data[0].model_version) {
        setModelVersion(data[0].model_version);
      }
    }).catch(() => {});
  }, [scanVersion]);

  // Flatten anomalies from most recent scans, cap at 5 for display
  const detections = records
    .flatMap((r) =>
      r.anomalies.map((a) => ({
        id: a.id,
        class: a.label.toUpperCase(),
        confidence: a.confidence,
        bbox: [
          Math.round(a.bbox.x),
          Math.round(a.bbox.y),
          Math.round(a.bbox.x + a.bbox.w),
          Math.round(a.bbox.y + a.bbox.h),
        ],
        severity: a.severity === 'critical' ? 'CRITICAL' : 'WARNING',
      }))
    )
    .slice(0, 5);

  // Derive trend: anomaly counts per day from last 12 scans
  const trendBuckets = (() => {
    const last12 = records.slice(0, 12);
    if (last12.length === 0) return Array(12).fill(0) as number[];
    const counts = last12.map((r) => r.anomaly_count);
    const max = Math.max(...counts, 1);
    return counts.map((c) => c / max);
  })();

  // Trend label: compare last scan anomaly count vs previous
  const trendLabel = (() => {
    if (records.length < 2) return 'N/A';
    const diff = records[0].anomaly_count - records[1].anomaly_count;
    if (diff === 0) return '0% / LAST';
    return `${diff > 0 ? '+' : ''}${diff} / LAST`;
  })();

  return (
    <div className="col-span-4 row-span-2 bg-card border border-border rounded-[2px] shadow-card flex flex-col transition-colors duration-300 overflow-hidden">
      
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-sidebar/50">
        <Target className="w-4 h-4 text-primary" />
        <h3 className="m-0 text-xs font-bold tracking-widest text-foreground">
          YOLOv8 DETECTIONS
        </h3>
      </div>

      <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex justify-between">
          <span>MODEL: {modelVersion}</span>
          <span>{detections.length} DETECTION{detections.length !== 1 ? 'S' : ''}</span>
        </div>

        {/* List of detections */}
        <div className="flex flex-col gap-3">
          {detections.length === 0 ? (
            <p className="text-[10px] font-mono text-muted-foreground text-center py-4 uppercase">No detections</p>
          ) : (
            detections.map((det) => (
              <DetectionCard key={det.id} detection={det} />
            ))
          )}
        </div>

        {/* Anomaly trend chart */}
        <div className="mt-auto border border-border bg-background/50 rounded-[2px] p-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-mono text-muted-foreground tracking-widest">ANOMALY TREND</span>
            <span className="text-[10px] font-mono font-bold text-cyan">{trendLabel}</span>
          </div>
          <div className="flex items-end gap-1 h-12 w-full mt-2">
            {trendBuckets.map((val, i) => (
              <div
                key={i}
                className="w-full bg-primary/40 rounded-t-[1px] hover:bg-primary transition-colors"
                style={{ height: `${Math.max(val * 100, 4)}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetectionCard({ detection }: { detection: any }) {
  const isCritical = detection.severity === 'CRITICAL';
  const isWarning  = detection.severity === 'WARNING';
  const colorClass = isCritical ? 'text-destructive border-destructive/30' :
                     isWarning  ? 'text-warning border-warning/30' :
                     'text-success border-success/30';

  return (
    <div className={clsx("p-3 border rounded-[2px] flex flex-col gap-2 transition-colors", colorClass)}>
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          {isCritical ? <AlertTriangle className="w-4 h-4 text-destructive animate-pulse" /> : <div className="w-1.5 h-1.5 rounded-full bg-current" />}
          <span className="font-mono text-xs font-bold text-foreground">
            {detection.id} : {detection.class}
          </span>
        </div>
        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-background border border-border rounded-[2px] text-foreground">
          {(detection.confidence * 100).toFixed(1)}%
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1 mt-1 text-[10px] font-mono">
        <div className="text-muted-foreground">BBOX_X: <span className="text-foreground">{detection.bbox[0]}, {detection.bbox[2]}</span></div>
        <div className="text-muted-foreground">BBOX_Y: <span className="text-foreground">{detection.bbox[1]}, {detection.bbox[3]}</span></div>
      </div>
    </div>
  );
}
