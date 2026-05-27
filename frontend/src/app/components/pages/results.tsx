import { useState, useEffect } from "react";
import {
  AlertTriangle,
  Info,
  MapPin,
  Calendar,
  ZoomIn,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Layers,
  Eye,
  EyeOff,
  Crosshair,
  Cpu,
  FileText,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ImageWithFallback } from "../figma/ImageWithFallback";
import { historyApi, type ScanRecordWithAnomalies, type ApiAnomaly } from "../../lib/api";

interface DetectionBox {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  severity: "CRITICAL" | "WARNING" | "NOMINAL";
  confidence: number;
}

interface AnalysisResult {
  id: string;
  structureCode: string;
  location: string;
  date: string;
  confidence: number;
  risk: "CRITICAL" | "WARNING" | "NOMINAL";
  image: string | null;
  detections: DetectionBox[];
  findings: { type: string; severity: string; confidence: number; layer: string }[];
  recommendation: string;
  modelInfo: { backbone: string; inference: string };
}

function severityToRisk(sev: string): "CRITICAL" | "WARNING" | "NOMINAL" {
  if (sev === "HIGH") return "CRITICAL";
  if (sev === "MEDIUM") return "WARNING";
  return "NOMINAL";
}

function anomalyToDetection(a: ApiAnomaly): DetectionBox {
  return {
    x: a.bbox.x,
    y: a.bbox.y,
    w: a.bbox.w,
    h: a.bbox.h,
    label: a.label,
    severity: a.severity === "critical" ? "CRITICAL" : "WARNING",
    confidence: Math.round(a.confidence * 100),
  };
}

function scanToResult(row: ScanRecordWithAnomalies): AnalysisResult {
  const anomalies = row.anomalies ?? [];
  const avgConf = anomalies.length > 0
    ? anomalies.reduce((s, a) => s + a.confidence, 0) / anomalies.length
    : 0;
  // Prefer persisted heatmap URL; fall back to stored image URL
  const displayImage = row.heatmap_url ?? row.image_url;
  return {
    id: row.id,
    structureCode: row.id,
    location: row.location,
    date: row.timestamp,
    confidence: Math.round(avgConf * 1000) / 10,
    risk: severityToRisk(row.severity),
    image: displayImage,
    detections: anomalies.map(anomalyToDetection),
    findings: anomalies.map((a) => ({
      type: a.label,
      severity: a.severity === "critical" ? "CRITICAL" : "WARNING",
      confidence: Math.round(a.confidence * 100),
      layer: "EigenCAM (Layer 4 × Layer 9 Fusion)",
    })),
    recommendation: row.diagnostics,
    modelInfo: {
      backbone: "YOLOv8-seg",
      inference: `${(row.processing_time_ms / 1000).toFixed(2)}s`,
    },
  };
}

function computePieData(records: AnalysisResult[]) {
  const total = records.length || 1;
  const critical = records.filter((r) => r.risk === "CRITICAL").length;
  const warning  = records.filter((r) => r.risk === "WARNING").length;
  const nominal  = records.filter((r) => r.risk === "NOMINAL").length;
  return [
    { name: "Nominal", value: Math.round((nominal / total) * 100) },
    { name: "Warning", value: Math.round((warning / total) * 100) },
    { name: "Critical", value: Math.round((critical / total) * 100) },
  ].filter((d) => d.value > 0);
}

const pieColors = ["#22D3EE", "#F59E0B", "#EF4444"];

const severityConfig: Record<string, { color: string; border: string }> = {
  CRITICAL: { color: "#EF4444", border: "rgba(239,68,68,0.6)" },
  WARNING: { color: "#F59E0B", border: "rgba(245,158,11,0.6)" },
  NOMINAL: { color: "#22D3EE", border: "rgba(34,211,238,0.6)" },
};

function RiskTag({ risk }: { risk: string }) {
  const cfg = severityConfig[risk] || severityConfig.NOMINAL;
  return (
    <span
      className="font-mono text-[0.6rem] px-2 py-0.5 tracking-wider"
      style={{ color: cfg.color, background: `${cfg.color}12`, border: `1px solid ${cfg.color}25` }}
    >
      {risk}
    </span>
  );
}

function GradCamViewer({
  result,
  onZoom,
}: {
  result: AnalysisResult;
  onZoom: () => void;
}) {
  const [showBoxes, setShowBoxes] = useState(true);

  return (
    <div className="relative group overflow-hidden" style={{ background: "#050a14" }}>
      <ImageWithFallback
        src={result.image ?? ""}
        alt={result.structureCode}
        className="w-full h-64 sm:h-72 object-cover"
      />

      {/* Detection boxes */}
      {showBoxes &&
        result.detections.map((d, i) => {
          const cfg = severityConfig[d.severity] || severityConfig.NOMINAL;
          return (
            <div
              key={i}
              className="absolute"
              style={{
                left: `${d.x}%`,
                top: `${d.y}%`,
                width: `${d.w}%`,
                height: `${d.h}%`,
                border: `1px solid ${cfg.border}`,
              }}
            >
              {[
                "top-0 left-0 border-t border-l",
                "top-0 right-0 border-t border-r",
                "bottom-0 left-0 border-b border-l",
                "bottom-0 right-0 border-b border-r",
              ].map((cls, j) => (
                <span
                  key={j}
                  className={`absolute w-2 h-2 ${cls}`}
                  style={{ borderColor: cfg.color }}
                />
              ))}
              <div
                className="absolute -top-6 left-0 px-1.5 py-0.5 font-mono text-[0.55rem] whitespace-nowrap"
                style={{
                  color: cfg.color,
                  background: "rgba(3,7,18,0.85)",
                  border: `1px solid ${cfg.color}30`,
                }}
              >
                {d.label} // {d.confidence}%
              </div>
            </div>
          );
        })}

      {/* Controls — top right */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setShowBoxes(!showBoxes)}
          className="p-1.5 cursor-pointer transition-colors"
          style={{ background: "rgba(3,7,18,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}
          title="Toggle detections"
        >
          {showBoxes ? (
            <Eye className="w-3 h-3 text-purple" />
          ) : (
            <EyeOff className="w-3 h-3 text-muted-foreground" />
          )}
        </button>
        <button
          onClick={onZoom}
          className="p-1.5 cursor-pointer transition-colors"
          style={{ background: "rgba(3,7,18,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}
          title="Fullscreen"
        >
          <ZoomIn className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>

      {/* Bottom info strip */}
      <div
        className="absolute bottom-0 inset-x-0 flex items-center justify-between px-3 py-1.5"
        style={{ background: "rgba(3,7,18,0.85)", borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="font-mono text-[0.6rem] text-muted-foreground flex items-center gap-1.5">
          <Crosshair className="w-3 h-3 text-cyan" />
          {result.detections.length} DETECTION{result.detections.length !== 1 ? "S" : ""}
        </span>
        <span className="font-mono text-[0.6rem] text-muted-foreground">
          EIGENCAM ACTIVE
        </span>
      </div>
    </div>
  );
}

/* ──── Lightbox ──── */
function Lightbox({
  data,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  data: AnalysisResult[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const r = data[index];
  const [showBoxes, setShowBoxes] = useState(true);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(3,7,18,0.92)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div className="relative max-w-5xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 p-1.5 cursor-pointer"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        <div className="relative overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          <ImageWithFallback
            src={r.image ?? ""}
            alt={r.structureCode}
            className="w-full max-h-[70vh] object-contain"
            style={{ background: "#050a14" }}
          />

          {showBoxes &&
            r.detections.map((d, i) => {
              const cfg = severityConfig[d.severity] || severityConfig.NOMINAL;
              return (
                <div
                  key={i}
                  className="absolute"
                  style={{
                    left: `${d.x}%`,
                    top: `${d.y}%`,
                    width: `${d.w}%`,
                    height: `${d.h}%`,
                    border: `1px solid ${cfg.border}`,
                  }}
                >
                  <div
                    className="absolute -top-6 left-0 px-1.5 py-0.5 font-mono text-[0.6rem] whitespace-nowrap"
                    style={{
                      color: cfg.color,
                      background: "rgba(3,7,18,0.9)",
                      border: `1px solid ${cfg.color}30`,
                    }}
                  >
                    {d.label} // {d.confidence}%
                  </div>
                </div>
              );
            })}

          {/* Toggle bar */}
          <div className="absolute top-3 right-3 flex gap-1">
            <button
              onClick={() => setShowBoxes(!showBoxes)}
              className="flex items-center gap-1.5 px-2 py-1 font-mono text-[0.6rem] cursor-pointer"
              style={{
                background: "rgba(3,7,18,0.85)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: showBoxes ? "#A855F7" : "#94A3B8",
              }}
            >
              <Eye className="w-3 h-3" />
              DETECTIONS
            </button>
          </div>
        </div>

        {/* Nav */}
        {data.length > 1 && (
          <>
            <button
              onClick={onPrev}
              className="absolute top-1/2 -left-10 -translate-y-1/2 p-2 cursor-pointer"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={onNext}
              className="absolute top-1/2 -right-10 -translate-y-1/2 p-2 cursor-pointer"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </>
        )}

        <div className="mt-2 flex items-center justify-between font-mono text-[0.65rem]">
          <div className="flex items-center gap-3">
            <span className="text-foreground">{r.structureCode}</span>
            <RiskTag risk={r.risk} />
          </div>
          <span className="text-muted-foreground">
            {index + 1} / {data.length}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ──── Main Page ──── */
export function ResultsPage() {
  const [selected, setSelected] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [loading, setLoading]  = useState(true);
  const [offset, setOffset]    = useState(20);
  const [hasMore, setHasMore]  = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    historyApi.getScansWithAnomalies(20, 0)
      .then((records) => { setResults(records.map(scanToResult)); setHasMore(records.length === 20); })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, []);

  const loadMore = () => {
    setLoadingMore(true);
    historyApi.getScansWithAnomalies(20, offset)
      .then((records) => {
        setResults((prev) => [...prev, ...records.map(scanToResult)]);
        setHasMore(records.length === 20);
        setOffset((o) => o + 20);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  const exportCsv = () => {
    const rows = [
      ['ID', 'TIMESTAMP', 'LOCATION', 'SEVERITY', 'ANOMALIES', 'AVG_CONFIDENCE', 'PROC_TIME_S'],
      ...results.map((r) => [
        r.id, r.date, r.location, r.risk,
        r.detections.length,
        r.confidence > 0 ? `${r.confidence}%` : '—',
        r.modelInfo.inference,
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `auralis_scans_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 font-mono text-[0.7rem] text-muted-foreground">
      LOADING SCAN HISTORY...
    </div>
  );

  if (results.length === 0) return (
    <div className="flex items-center justify-center h-64 font-mono text-[0.7rem] text-muted-foreground">
      NO SCAN RECORDS FOUND
    </div>
  );

  const active = results[selected] ?? results[0];
  const overallData = computePieData(results);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-foreground">ANALYSIS RESULTS</h1>
          <p className="font-mono text-[0.7rem] text-muted-foreground mt-0.5">
            Auditable AI — Grad-CAM explainability layer active
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-2 px-4 py-1.5 text-[0.75rem] tracking-wider cursor-pointer transition-all hover:brightness-110 text-background"
          style={{ background: "linear-gradient(135deg, #A855F7, #22D3EE)", fontWeight: 600 }}
        >
          <Download className="w-3.5 h-3.5" /> EXPORT
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid sm:grid-cols-4 gap-px" style={{ background: "rgba(255,255,255,0.06)" }}>
        {[
          { label: "STRUCTURES", value: results.length.toString() },
          {
            label: "DETECTIONS",
            value: results.reduce((s, r) => s + r.detections.length, 0).toString(),
          },
          {
            label: "AVG CONFIDENCE",
            value: results.some((r) => r.confidence > 0)
              ? (results.filter((r) => r.confidence > 0).reduce((s, r) => s + r.confidence, 0) /
                 results.filter((r) => r.confidence > 0).length).toFixed(1) + "%"
              : "—",
            accent: true,
          },
          { label: "MODEL", value: results[0]?.modelInfo.backbone ?? 'YOLOv8-seg' },
        ].map((s) => (
          <div
            key={s.label}
            className="p-3"
            style={{ background: "rgba(10,15,28,0.7)", backdropFilter: "blur(12px)" }}
          >
            <p className="font-mono text-[0.55rem] text-muted-foreground tracking-wider">
              {s.label}
            </p>
            <p
              className="font-mono text-[1.1rem] mt-0.5"
              style={{ color: s.accent ? "#A855F7" : "#E2E8F0", fontWeight: 600 }}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Thumbnail selector */}
      <div className="flex gap-px" style={{ background: "rgba(255,255,255,0.06)" }}>
        {results.map((r, i) => (
          <button
            key={r.id}
            onClick={() => setSelected(i)}
            className="relative flex-1 h-16 overflow-hidden cursor-pointer transition-all"
            style={{
              border: selected === i ? "1px solid #A855F7" : "1px solid transparent",
              opacity: selected === i ? 1 : 0.5,
            }}
          >
            <ImageWithFallback
              src={r.image ?? ""}
              alt={r.structureCode}
              className="w-full h-full object-cover"
            />
            <div
              className="absolute inset-0 flex items-end"
              style={{
                background: "linear-gradient(transparent 40%, rgba(3,7,18,0.9))",
              }}
            >
              <div className="px-2 pb-1 flex items-center justify-between w-full">
                <span className="font-mono text-[0.55rem] text-foreground">{r.structureCode}</span>
                <RiskTag risk={r.risk} />
              </div>
            </div>
            {selected === i && (
              <div
                className="absolute top-0 inset-x-0 h-[2px]"
                style={{ background: "linear-gradient(90deg, #22D3EE, #A855F7)" }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Main bento layout */}
      <div className="grid lg:grid-cols-12 gap-px" style={{ background: "rgba(255,255,255,0.06)" }}>
        {/* Image viewer — 7 cols */}
        <div
          className="lg:col-span-7"
          style={{ background: "rgba(10,15,28,0.7)", backdropFilter: "blur(12px)" }}
        >
          <GradCamViewer
            result={active}
            onZoom={() => setLightbox(selected)}
          />

          {/* Findings table */}
          <div className="p-4">
            <h3 className="text-muted-foreground mb-3">DETECTED ANOMALIES</h3>
            <div className="border border-border divide-y divide-border">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 px-3 py-1.5 font-mono text-[0.55rem] text-muted-foreground tracking-wider" style={{ background: "rgba(255,255,255,0.02)" }}>
                <span className="col-span-5">ANOMALY</span>
                <span className="col-span-2">SEVERITY</span>
                <span className="col-span-2">CONF.</span>
                <span className="col-span-3">LAYER</span>
              </div>
              {active.findings.map((f, i) => {
                const cfg = severityConfig[f.severity as keyof typeof severityConfig] || severityConfig.NOMINAL;
                return (
                  <div
                    key={i}
                    className="grid grid-cols-12 gap-2 px-3 py-2 font-mono text-[0.7rem] hover:bg-white/[0.01] transition-colors items-center"
                  >
                    <span className="col-span-5 text-foreground">{f.type}</span>
                    <span className="col-span-2" style={{ color: cfg.color }}>
                      {f.severity}
                    </span>
                    <span className="col-span-2 text-foreground tabular-nums">{f.confidence}%</span>
                    <span className="col-span-3 text-muted-foreground">{f.layer}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right panel — 5 cols */}
        <div className="lg:col-span-5 flex flex-col">
          {/* Structure info */}
          <div
            className="p-4 border-b border-border"
            style={{ background: "rgba(10,15,28,0.7)", backdropFilter: "blur(12px)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-[0.65rem] text-cyan">{active.structureCode}</span>
                  <RiskTag risk={active.risk} />
                </div>
                <h2 className="text-foreground">{active.location}</h2>
              </div>
            </div>

            <div className="space-y-1.5 font-mono text-[0.7rem]">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="w-3 h-3 text-purple" />
                {active.location}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-3 h-3 text-purple" />
                {active.date}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Cpu className="w-3 h-3 text-cyan" />
                {active.modelInfo.backbone} / {active.modelInfo.inference}
              </div>
            </div>

            {/* Confidence bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[0.6rem] text-muted-foreground tracking-wider">
                  AI CONFIDENCE
                </span>
                <span className="font-mono text-[1rem] text-cyan" style={{ fontWeight: 600 }}>
                  {active.confidence}%
                </span>
              </div>
              <div className="h-1 bg-white/[0.04] overflow-hidden">
                <div
                  className="h-full transition-all duration-700"
                  style={{
                    width: `${active.confidence}%`,
                    background: "linear-gradient(90deg, #22D3EE, #A855F7)",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div
            className="p-4 border-b border-border"
            style={{ background: "rgba(10,15,28,0.7)", backdropFilter: "blur(12px)" }}
          >
            <h3 className="text-muted-foreground mb-2">RECOMMENDATION</h3>
            <div
              className="p-3 font-mono text-[0.7rem] text-foreground/90 leading-relaxed"
              style={{
                background: "rgba(168,85,247,0.03)",
                borderLeft: "2px solid #A855F7",
              }}
            >
              <Info className="w-3.5 h-3.5 text-purple mb-1.5" />
              {active.recommendation}
            </div>
          </div>

          {/* Health distribution */}
          <div
            className="p-4 flex-1"
            style={{ background: "rgba(10,15,28,0.7)", backdropFilter: "blur(12px)" }}
          >
            <h3 className="text-muted-foreground mb-3">FLEET HEALTH</h3>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie
                    data={overallData}
                    innerRadius={35}
                    outerRadius={55}
                    dataKey="value"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {overallData.map((_, i) => (
                      <Cell key={i} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(10,15,28,0.95)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 0,
                      color: "#E2E8F0",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "0.7rem",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {overallData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2"
                        style={{ background: pieColors[i] }}
                      />
                      <span className="font-mono text-[0.65rem] text-foreground">{d.name}</span>
                    </div>
                    <span className="font-mono text-[0.65rem] text-muted-foreground tabular-nums">
                      {d.value}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <Lightbox
          data={results}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onPrev={() => setLightbox((lightbox - 1 + results.length) % results.length)}
          onNext={() => setLightbox((lightbox + 1) % results.length)}
        />
      )}

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-6 py-2 font-mono text-[0.7rem] tracking-wider border border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors disabled:opacity-50"
            style={{ background: 'rgba(10,15,28,0.7)' }}
          >
            {loadingMore ? 'LOADING...' : 'LOAD MORE'}
          </button>
        </div>
      )}
    </div>
  );
}