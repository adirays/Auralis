import React, { useState, useEffect, useCallback } from 'react';
import { Brain, Download, RefreshCcw, AlertTriangle, TrendingUp, Layers, Eye, Wrench, FileText, Target } from 'lucide-react';
import clsx from 'clsx';
import { useScan } from '../../context/scan-context';
import { historyApi, type ScanRecordWithAnomalies } from '../../lib/api';
import type { Diagnostic } from '../../context/scan-context';

function buildDiagnosticsFromDB(records: ScanRecordWithAnomalies[]): Diagnostic[] {
  const diags: Diagnostic[] = [];
  records.forEach((record) => {
    record.anomalies.forEach((anomaly, idx) => {
      const sev = anomaly.severity === 'critical' ? 'CRITICAL'
                : anomaly.severity === 'warning'  ? 'WARNING' : 'LOW';
      const riskCat = anomaly.severity === 'critical' ? 'IMMEDIATE'
                    : anomaly.severity === 'warning'  ? 'MONITOR' : 'LOW';
      const confNum    = anomaly.confidence;
      const areaPercent = Math.round(anomaly.bbox.w * anomaly.bbox.h * 100) / 100;

      diags.push({
        id: `DIAG-${record.id}-${idx + 1}`,
        scanId: record.id,
        anomalyId: anomaly.id,
        timestamp: record.timestamp,
        location: record.location,
        defectType: anomaly.label.toUpperCase(),
        severity: sev as 'CRITICAL' | 'WARNING' | 'LOW',
        confidence: `${(confNum * 100).toFixed(1)}%`,
        areaPercent,
        bboxWidth:  Math.round(anomaly.bbox.w * 100) / 100,
        bboxHeight: Math.round(anomaly.bbox.h * 100) / 100,
        physicsAnalysis:      anomaly.physics_analysis      ?? `${anomaly.label.toUpperCase()} defect (${sev}) detected. Confidence: ${(confNum * 100).toFixed(1)}%. Area: ${areaPercent.toFixed(2)}% of image.`,
        xaiReasoning:         anomaly.xai_explanation       ?? `EigenCAM activation detected ${anomaly.label.toUpperCase()} with ${(confNum * 100).toFixed(1)}% confidence. Bounding box covers ${areaPercent.toFixed(2)}% of image area.`,
        repairRecommendation: anomaly.repair_recommendation ?? `Severity ${sev}: consult structural engineer for site-specific repair strategy.`,
        riskCategory: riskCat as 'IMMEDIATE' | 'MONITOR' | 'LOW',
      });
    });
  });
  return diags;
}

function exportCsv(diagnostics: Diagnostic[]) {
  const rows = [
    ['DIAG_ID', 'SCAN_ID', 'TIMESTAMP', 'LOCATION', 'DEFECT_TYPE', 'SEVERITY', 'CONFIDENCE', 'AREA_%', 'BBOX_W_%', 'BBOX_H_%', 'RISK', 'REPAIR'],
    ...diagnostics.map((d) => [
      d.id, d.scanId,
      new Date(d.timestamp).toISOString(),
      d.location, d.defectType, d.severity, d.confidence,
      d.areaPercent.toFixed(2), d.bboxWidth.toFixed(2), d.bboxHeight.toFixed(2),
      d.riskCategory,
      `"${d.repairRecommendation.replace(/"/g, '""')}"`,
    ]),
  ];
  const csv  = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `auralis_diagnostics_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function TelemetryData() {
  const { scanVersion } = useScan();
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [totalScans, setTotalScans] = useState(0);
  const [selectedDiagnostic, setSelectedDiagnostic] = useState<string | null>(null);

  const load = useCallback(() => {
    historyApi.getScansWithAnomalies(100)
      .then((records) => {
        setTotalScans(records.length);
        setDiagnostics(buildDiagnosticsFromDB(records));
      })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load, scanVersion]);

  const criticalCount = diagnostics.filter(d => d.severity === 'CRITICAL').length;
  const warningCount  = diagnostics.filter(d => d.severity === 'WARNING').length;
  const avgConf = diagnostics.length > 0
    ? ((diagnostics.reduce((sum, d) => sum + parseFloat(d.confidence), 0) / diagnostics.length).toFixed(1)) + '%'
    : '0%';
  const avgArea = diagnostics.length > 0
    ? (diagnostics.reduce((sum, d) => sum + d.areaPercent, 0) / diagnostics.length).toFixed(2)
    : '0.00';

  return (
    <div className="flex-1 flex flex-col h-full bg-background rounded-[2px] border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[2px] bg-primary/20 flex items-center justify-center border border-primary/30">
            <Brain className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">EXPERT DIAGNOSTICS</h2>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">AI-Powered Multimodal Data Fusion & Physics Analysis</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-1.5 bg-input-background border border-input rounded-[2px] text-[10px] font-mono hover:bg-muted transition-colors">
            <RefreshCcw className="w-3.5 h-3.5 text-primary" />
            REFRESH
          </button>
          <button
            onClick={() => exportCsv(diagnostics)}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary border border-primary rounded-[2px] text-primary-foreground text-[10px] font-mono font-bold hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            EXPORT REPORT
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 border-b border-border shrink-0 bg-background">
        <div className="p-4 border-r border-border flex items-center gap-4">
          <div className="w-8 h-8 rounded-[2px] bg-primary/10 flex items-center justify-center">
            <FileText className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Total Scans</div>
            <div className="text-xl font-bold font-mono">{totalScans}</div>
          </div>
        </div>
        <div className="p-4 border-r border-border flex items-center gap-4">
          <div className="w-8 h-8 rounded-[2px] bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-destructive" />
          </div>
          <div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Critical</div>
            <div className="text-xl font-bold font-mono text-destructive">{criticalCount}</div>
          </div>
        </div>
        <div className="p-4 border-r border-border flex items-center gap-4">
          <div className="w-8 h-8 rounded-[2px] bg-warning/10 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-warning" />
          </div>
          <div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Warnings</div>
            <div className="text-xl font-bold font-mono text-warning">{warningCount}</div>
          </div>
        </div>
        <div className="p-4 border-r border-border flex flex-col justify-center">
          <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">
            <span>Avg Confidence</span>
            <span className="text-primary font-bold">{avgConf}</span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${parseFloat(avgConf)}%` }} />
          </div>
        </div>
        <div className="p-4 flex flex-col justify-center">
          <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">
            <span>Avg Area</span>
            <span className="text-destructive font-bold">{avgArea}%</span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-warning to-destructive rounded-full" style={{ width: `${Math.min(parseFloat(avgArea) * 10, 100)}%` }} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-card-solid p-4">
        <div className="max-w-7xl mx-auto space-y-4">
          {diagnostics.map((diagnostic) => (
            <div
              key={diagnostic.id}
              className={clsx(
                "border rounded-[2px] bg-card transition-all cursor-pointer",
                selectedDiagnostic === diagnostic.id ? "border-primary shadow-lg" : "border-border hover:border-primary/50"
              )}
              onClick={() => setSelectedDiagnostic(selectedDiagnostic === diagnostic.id ? null : diagnostic.id)}
            >
              {/* Diagnostic Header */}
              <div className="p-4 border-b border-border bg-background/50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={clsx(
                    "w-10 h-10 rounded-[2px] flex items-center justify-center border-2",
                    diagnostic.severity === 'CRITICAL'
                      ? "bg-destructive/10 border-destructive text-destructive"
                      : diagnostic.severity === 'WARNING'
                      ? "bg-warning/10 border-warning text-warning"
                      : "bg-primary/10 border-primary text-primary"
                  )}>
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-sm font-mono font-bold">{diagnostic.id}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">FROM {diagnostic.scanId}</span>
                      <span className={clsx(
                        "px-2 py-0.5 text-[10px] font-mono font-bold rounded-[2px] border",
                        diagnostic.severity === 'CRITICAL'
                          ? "bg-destructive/10 text-destructive border-destructive/20"
                          : diagnostic.severity === 'WARNING'
                          ? "bg-warning/10 text-warning border-warning/20"
                          : "bg-primary/10 text-primary border-primary/20"
                      )}>
                        {diagnostic.severity}
                      </span>
                      <span className={clsx(
                        "px-2 py-0.5 text-[10px] font-mono font-bold rounded-[2px] border",
                        diagnostic.riskCategory === 'IMMEDIATE'
                          ? "bg-destructive/20 text-destructive border-destructive/30 animate-pulse"
                          : diagnostic.riskCategory === 'MONITOR'
                          ? "bg-warning/10 text-warning border-warning/20"
                          : "bg-primary/10 text-primary border-primary/20"
                      )}>
                        RISK: {diagnostic.riskCategory}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-primary">{diagnostic.location}</div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Defect Type</div>
                    <div className="text-sm font-bold tracking-widest">{diagnostic.defectType}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Confidence</div>
                    <div className="text-sm font-mono font-bold text-primary">{diagnostic.confidence}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Area</div>
                    <div className="text-sm font-mono font-bold text-destructive">{diagnostic.areaPercent.toFixed(2)}%</div>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {selectedDiagnostic === diagnostic.id && (
                <div className="p-4 space-y-4">
                  {/* Bbox metrics */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-background/50 border border-border rounded-[2px]">
                      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Bbox Width</div>
                      <div className="text-sm font-mono font-bold">{diagnostic.bboxWidth.toFixed(2)}%</div>
                    </div>
                    <div className="p-3 bg-background/50 border border-border rounded-[2px]">
                      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Bbox Height</div>
                      <div className="text-sm font-mono font-bold">{diagnostic.bboxHeight.toFixed(2)}%</div>
                    </div>
                    <div className="p-3 bg-background/50 border border-border rounded-[2px]">
                      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Area (% image)</div>
                      <div className="text-sm font-mono font-bold text-primary">{diagnostic.areaPercent.toFixed(2)}%</div>
                    </div>
                  </div>

                  {/* Physics Analysis */}
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-[2px]">
                    <div className="flex items-center gap-2 mb-3">
                      <Target className="w-4 h-4 text-primary" />
                      <h4 className="text-xs font-bold text-primary uppercase tracking-widest">Physics & Severity Analysis</h4>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/90">{diagnostic.physicsAnalysis}</p>
                  </div>

                  {/* XAI Reasoning */}
                  <div className="p-4 bg-background border border-border rounded-[2px]">
                    <div className="flex items-center gap-2 mb-3">
                      <Eye className="w-4 h-4 text-muted-foreground" />
                      <h4 className="text-xs font-bold uppercase tracking-widest">XAI Interpretation (EigenCAM)</h4>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{diagnostic.xaiReasoning}</p>
                  </div>

                  {/* Repair Recommendation */}
                  <div className={clsx(
                    "p-4 border rounded-[2px]",
                    diagnostic.riskCategory === 'IMMEDIATE'
                      ? "bg-destructive/5 border-destructive/20"
                      : diagnostic.riskCategory === 'MONITOR'
                      ? "bg-warning/5 border-warning/20"
                      : "bg-primary/5 border-primary/20"
                  )}>
                    <div className="flex items-center gap-2 mb-3">
                      <Wrench className={clsx(
                        "w-4 h-4",
                        diagnostic.riskCategory === 'IMMEDIATE' ? "text-destructive"
                        : diagnostic.riskCategory === 'MONITOR' ? "text-warning" : "text-primary"
                      )} />
                      <h4 className={clsx(
                        "text-xs font-bold uppercase tracking-widest",
                        diagnostic.riskCategory === 'IMMEDIATE' ? "text-destructive"
                        : diagnostic.riskCategory === 'MONITOR' ? "text-warning" : "text-primary"
                      )}>Repair Recommendation</h4>
                    </div>
                    <p className="text-sm leading-relaxed font-medium">{diagnostic.repairRecommendation}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
