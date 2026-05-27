import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { AnalysisResponse, ApiAnomaly } from '../lib/api';

// ── Domain types (kept compatible with existing UI) ───────────────────────────

export interface Anomaly {
  id: string;
  type: string;
  severity: 'critical' | 'warning';
  confidence: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Scan {
  id: string;
  timestamp: string;
  location: string;
  imageUrl: string | null;
  heatmapUrl: string | null;   // base64 data URL from real API
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  processingTime?: string;
  anomalies: Anomaly[];
  diagnosticGenerated: boolean;
  diagnosticId?: string;
  diagnostics?: string;        // AI-generated text from backend
  severity?: string;           // LOW | MEDIUM | HIGH | NONE
}

export interface Diagnostic {
  id: string;
  scanId: string;
  anomalyId: string;
  timestamp: string;
  location: string;
  defectType: string;
  severity: 'CRITICAL' | 'WARNING' | 'LOW';
  confidence: string;
  /** Bounding box area as percentage of image (0–100) */
  areaPercent: number;
  /** Bounding box pixel dimensions (relative %) */
  bboxWidth: number;
  bboxHeight: number;
  physicsAnalysis: string;
  xaiReasoning: string;
  riskCategory: 'IMMEDIATE' | 'MONITOR' | 'LOW';
  repairRecommendation: string;
}

interface ScanContextType {
  scans: Scan[];
  diagnostics: Diagnostic[];
  selectedScan: Scan | null;
  /** Increments every time a new scan is stored — subscribe to re-fetch DB data. */
  scanVersion: number;
  addScan: (scan: Scan) => void;
  updateScan: (id: string, updates: Partial<Scan>) => void;
  selectScan: (id: string) => void;
  addDiagnostic: (diagnostic: Diagnostic) => void;
  getLastScan: () => Scan | null;
  /** Convert a real API AnalysisResponse into a Scan and store it */
  storeApiResult: (result: AnalysisResponse, imageUrl: string | null) => Scan;
}

const ScanContext = createContext<ScanContextType | undefined>(undefined);

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiAnomalyToScanAnomaly(a: ApiAnomaly): Anomaly {
  return {
    id: a.id,
    type: a.label,
    severity: a.severity,
    confidence: `${(a.confidence * 100).toFixed(1)}%`,
    x: a.bbox.x,
    y: a.bbox.y,
    width: a.bbox.w,
    height: a.bbox.h,
    _raw: a,
  } as Anomaly & { _raw: ApiAnomaly };
}

function buildDiagnosticsFromScan(scan: Scan): Diagnostic[] {
  return scan.anomalies.map((anomaly, idx) => {
    const confNum    = parseFloat(anomaly.confidence) / 100;
    const areaPercent = Math.round(anomaly.width * anomaly.height * 100) / 100;
    const sevUpper   = anomaly.severity === 'critical' ? 'CRITICAL'
                     : anomaly.severity === 'warning'  ? 'WARNING' : 'LOW';
    const riskCat    = anomaly.severity === 'critical' ? 'IMMEDIATE'
                     : anomaly.severity === 'warning'  ? 'MONITOR' : 'LOW';

    // Use XAI text from backend if available (stored on ApiAnomaly extended fields),
    // otherwise fall back to a minimal derived string.
    const raw = (anomaly as any)._raw as import('../lib/api').ApiAnomaly & {
      xai_explanation?: string; physics_analysis?: string; repair_recommendation?: string;
    } | undefined;

    const xaiReasoning        = raw?.xai_explanation        ?? `EigenCAM activation detected ${anomaly.type.toUpperCase()} with ${anomaly.confidence} confidence. Bounding box covers ${areaPercent.toFixed(2)}% of image area.`;
    const physicsAnalysis     = raw?.physics_analysis       ?? `${anomaly.type.toUpperCase()} defect (${sevUpper}) detected. Confidence: ${anomaly.confidence}. Area: ${areaPercent.toFixed(2)}% of image.`;
    const repairRecommendation = raw?.repair_recommendation ?? `Severity ${sevUpper}: consult structural engineer for site-specific repair strategy.`;

    return {
      id: `DIAG-${scan.id}-${idx + 1}`,
      scanId: scan.id,
      anomalyId: anomaly.id,
      timestamp: scan.timestamp,
      location: scan.location,
      defectType: anomaly.type.toUpperCase(),
      severity: sevUpper as 'CRITICAL' | 'WARNING' | 'LOW',
      confidence: anomaly.confidence,
      areaPercent,
      bboxWidth: Math.round(anomaly.width * 100) / 100,
      bboxHeight: Math.round(anomaly.height * 100) / 100,
      physicsAnalysis,
      xaiReasoning,
      riskCategory: riskCat,
      repairRecommendation,
    };
  });
}

const LAST_SCAN_KEY  = 'auralis_last_scan';
const SCAN_CACHE_KEY = 'auralis_scan_cache';
const CACHE_LIMIT    = 10;

function persistScan(scan: Scan) {
  try {
    const { heatmapUrl, ...rest } = scan;
    // Maintain a rolling cache of the last CACHE_LIMIT scans
    const raw = localStorage.getItem(SCAN_CACHE_KEY);
    const cache: Scan[] = raw ? JSON.parse(raw) : [];
    const updated = [rest, ...cache.filter((s) => s.id !== rest.id)].slice(0, CACHE_LIMIT);
    localStorage.setItem(SCAN_CACHE_KEY, JSON.stringify(updated));
    // Keep the single-key for backward compat (dashboard reads this)
    localStorage.setItem(LAST_SCAN_KEY, JSON.stringify(rest));
  } catch {}
}

function restoreLastScan(): Scan | null {
  try {
    const raw = localStorage.getItem(LAST_SCAN_KEY);
    return raw ? (JSON.parse(raw) as Scan) : null;
  } catch { return null; }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ScanProvider({ children }: { children: ReactNode }) {
  const restored = restoreLastScan();
  const [scans, setScans] = useState<Scan[]>(restored ? [restored] : []);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>(() => {
    if (!restored || restored.anomalies.length === 0) return [];
    return buildDiagnosticsFromScan(restored);
  });
  const [selectedScan, setSelectedScan] = useState<Scan | null>(null);
  const [scanVersion, setScanVersion] = useState(0);

  const addScan = (scan: Scan) => setScans((prev) => [scan, ...prev]);

  const updateScan = (id: string, updates: Partial<Scan>) =>
    setScans((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));

  const selectScan = (id: string) =>
    setSelectedScan(scans.find((s) => s.id === id) ?? null);

  const addDiagnostic = (d: Diagnostic) => setDiagnostics((prev) => [d, ...prev]);

  const getLastScan = () => (scans.length > 0 ? scans[0] : null);

  const storeApiResult = (result: AnalysisResponse, imageUrl: string | null): Scan => {
    const heatmapUrl = result.heatmap_b64
      ? `data:image/png;base64,${result.heatmap_b64}`
      : null;

    // Prefer the persistent Supabase Storage URL over the ephemeral blob URL
    const persistentImageUrl = result.image_url ?? imageUrl;

    const scan: Scan = {
      id: result.scan_id,
      timestamp: new Date().toISOString(),
      location: result.location,
      imageUrl: persistentImageUrl,
      heatmapUrl,
      status: 'COMPLETED',
      processingTime: `${(result.processing_time_ms / 1000).toFixed(1)}s`,
      anomalies: result.anomalies.map(apiAnomalyToScanAnomaly),
      diagnosticGenerated: result.anomalies.length > 0,
      diagnostics: result.diagnostics,
      severity: result.severity,
    };

    addScan(scan);

    if (scan.anomalies.length > 0) {
      const newDiags = buildDiagnosticsFromScan(scan);
      scan.diagnosticId = newDiags[0]?.id;
      setDiagnostics((prev) => [...newDiags, ...prev]);
    }

    persistScan(scan);

    // Cache image URL for immediate dashboard display on next load
    if (persistentImageUrl) {
      try { localStorage.setItem('auralis_last_scan_image', persistentImageUrl); } catch {}
    }

    // Increment version so subscribed pages (history, logs, dashboard) re-fetch from DB
    setScanVersion((v) => v + 1);

    return scan;
  };

  return (
    <ScanContext.Provider value={{
      scans,
      diagnostics,
      selectedScan,
      scanVersion,
      addScan,
      updateScan,
      selectScan,
      addDiagnostic,
      getLastScan,
      storeApiResult,
    }}>
      {children}
    </ScanContext.Provider>
  );
}

export function useScan() {
  const context = useContext(ScanContext);
  if (context === undefined) throw new Error('useScan must be used within a ScanProvider');
  return context;
}
