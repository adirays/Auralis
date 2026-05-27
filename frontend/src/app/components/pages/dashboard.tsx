import {
  Activity,
  AlertTriangle,
  TrendingUp,
  Building2,
  Clock,
  Zap,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Camera,
  MapPin,
  Crosshair,
  Eye,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useScan } from "../../context/scan-context";
import { historyApi, type ScanRecord } from "../../lib/api";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  RadialBarChart,
  RadialBar,
} from "recharts";

// ── Derived data helpers ──────────────────────────────────────────────────────

function computeStats(scans: ScanRecord[]) {
  const totalScans = scans.length;
  const uniqueLocations = new Set(scans.map((s) => s.location)).size;
  const criticalScans = scans.filter((s) => s.severity === 'HIGH').length;
  const healthScore = totalScans > 0
    ? Math.round(((totalScans - criticalScans) / totalScans) * 100)
    : 100;
  const detectionRate = totalScans > 0
    ? Math.round((scans.filter((s) => s.anomaly_count > 0).length / totalScans) * 100)
    : 0;
  return { totalScans, uniqueLocations, criticalScans, healthScore, detectionRate };
}

function computeTrendData(scans: ScanRecord[]) {
  const byMonth: Record<string, { key: string; month: string; inspections: number; alerts: number }> = {};
  scans.forEach((s) => {
    // Parse UTC components directly to avoid local-timezone month shift
    const d    = new Date(s.timestamp);
    const year = d.getUTCFullYear();
    const mon  = d.getUTCMonth();                              // 0-based UTC month
    const key  = `${year}-${String(mon).padStart(2, '0')}`;   // YYYY-MM (0-based, padded for sort)
    if (!byMonth[key]) {
      // Build label from UTC year + month so it matches the key
      const label = new Date(Date.UTC(year, mon, 1))
        .toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
      byMonth[key] = { key, month: label, inspections: 0, alerts: 0 };
    }
    byMonth[key].inspections += 1;
    if (s.severity === 'HIGH' || s.severity === 'MEDIUM') byMonth[key].alerts += 1;
  });

  const result = Object.values(byMonth)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ month, inspections, alerts }) => ({ month, inspections, alerts }));

  if (result.length === 1) {
    return [{ month: '—', inspections: 0, alerts: 0 }, result[0]];
  }
  return result;
}

function computeDamageData(scans: ScanRecord[]) {
  const critical = scans.filter((s) => s.severity === 'HIGH').length;
  const medium   = scans.filter((s) => s.severity === 'MEDIUM').length;
  const low      = scans.filter((s) => s.severity === 'LOW').length;
  const none     = scans.filter((s) => s.severity === 'NONE').length;
  return [
    { type: 'HIGH',   count: critical },
    { type: 'MED',    count: medium },
    { type: 'LOW',    count: low },
    { type: 'NONE',   count: none },
  ].filter((d) => d.count > 0);
}

function formatLocal(ts: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(ts));
}

function formatTimeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function severityToRisk(sev: string): { risk: string; bars: number } {
  if (sev === 'HIGH')   return { risk: 'CRITICAL', bars: 3 };
  if (sev === 'MEDIUM') return { risk: 'WARNING',  bars: 2 };
  return                       { risk: 'NOMINAL',  bars: 0 };
}

function timeAgo(ts: string): string {
  return formatTimeAgo(ts);
}

// ── Sub-components (unchanged visually) ──────────────────────────────────────

function RiskTag({ risk }: { risk: string }) {
  const styleMap: Record<string, string> = {
    NOMINAL:  "text-accent bg-accent/10 border border-accent/20",
    WARNING:  "text-warning bg-warning/10 border border-warning/20",
    CRITICAL: "text-destructive bg-destructive/10 border border-destructive/20",
  };
  const className = styleMap[risk] || styleMap.NOMINAL;
  return (
    <span className={`font-mono text-[0.6rem] px-2 py-0.5 tracking-wider rounded-[2px] ${className}`}>
      {risk}
    </span>
  );
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-card border border-border p-2 shadow-lg">
      {payload.map((entry: any, index: number) => (
        <div key={index} className="font-mono text-[0.7rem] text-foreground">
          {entry.name}: {entry.value}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { getLastScan, scanVersion } = useScan() as any;
  const lastScan = getLastScan();
  const navigate = useNavigate();

  const [scans, setScans]     = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick]           = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    historyApi.getScans(100)
      .then(setScans)
      .catch(() => setScans([]))
      .finally(() => setLoading(false));
  }, [scanVersion]);

  const { totalScans, uniqueLocations, criticalScans, healthScore, detectionRate } = computeStats(scans);
  const trendData   = computeTrendData(scans);
  const damageData  = computeDamageData(scans);
  const recentScans = [...scans].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 6);
  const lastSync = scans.length > 0
    ? formatLocal(new Date(Math.max(...scans.map((s) => new Date(s.timestamp).getTime()))).toISOString())
    : '—';

  const healthData = [{ name: 'Health', value: healthScore }];

  const gpuMetrics = [
    { label: 'TOTAL_SCANS',    value: totalScans,      max: Math.max(totalScans, 1) },
    { label: 'CRITICAL',       value: criticalScans,   max: Math.max(totalScans, 1) },
    { label: 'DETECTION_RATE', value: detectionRate,   max: 100 },
  ];

  const stats = [
    {
      label: "TOTAL SCANS",
      value: loading ? "—" : totalScans.toLocaleString(),
      change: totalScans > 0 ? `+${totalScans}` : "0",
      up: true,
      icon: Activity,
    },
    {
      label: "ASSETS MONITORED",
      value: loading ? "—" : String(uniqueLocations),
      change: uniqueLocations > 0 ? `+${uniqueLocations}` : "0",
      up: true,
      icon: Building2,
    },
    {
      label: "ACTIVE ALERTS",
      value: loading ? "—" : String(criticalScans),
      change: criticalScans > 0 ? `+${criticalScans}` : "0",
      up: criticalScans === 0,
      icon: AlertTriangle,
    },
    {
      label: "HEALTH SCORE",
      value: loading ? "—" : `${healthScore}%`,
      change: `${healthScore}%`,
      up: healthScore >= 80,
      icon: Target,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground">DASHBOARD</h1>
          <p className="font-mono text-[0.7rem] text-muted-foreground mt-0.5">
            Real-time structural health telemetry
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-[0.6rem] text-muted-foreground">
          <Zap className="w-3 h-3 text-accent" />
          LAST SCAN: {lastSync}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border">
        {stats.map((s) => (
          <div
            key={s.label}
            className="p-4 transition-all hover:bg-muted/50 bg-card backdrop-blur-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <s.icon className="w-4 h-4 text-primary" />
              <span
                className={`font-mono text-[0.65rem] flex items-center gap-0.5 ${s.up ? 'text-accent' : 'text-warning'}`}
              >
                {s.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {s.change}
              </span>
            </div>
            <p className="font-mono text-[1.6rem] text-foreground" style={{ fontWeight: 600 }}>
              {s.value}
            </p>
            <p className="font-mono text-[0.6rem] text-muted-foreground tracking-wider mt-0.5">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Last Scan Details */}
      {lastScan && (
        <div className="p-4 bg-card border border-border backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-[2px] flex items-center justify-center bg-primary/10 border border-primary/30">
                <Camera className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="text-muted-foreground">LAST SCAN DETAILS</h3>
                <p className="font-mono text-[0.6rem] text-muted-foreground mt-0.5">Most recent AI visual inspection</p>
              </div>
            </div>
            <button
              onClick={() => lastScan?.id && navigate(`/scan/${lastScan.id}`)}
              className="font-mono text-[0.6rem] px-3 py-1.5 rounded-[2px] hover:bg-muted/50 transition-colors flex items-center gap-2 text-accent border border-accent/20">
              <Eye className="w-3 h-3" />
              VIEW FULL SCAN
            </button>
          </div>

          <div className="grid lg:grid-cols-12 gap-4">
            {/* Left: Scan metadata */}
            <div className="lg:col-span-4 space-y-3">
              <div className="p-3 rounded-[2px] bg-muted/20 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[0.6rem] text-muted-foreground">SCAN ID</span>
                  <span className="font-mono text-[0.75rem] font-bold text-primary">{lastScan.id}</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[0.6rem] text-muted-foreground">STATUS</span>
                  <span className="font-mono text-[0.65rem] px-2 py-0.5 rounded-[2px] text-accent bg-accent/10 border border-accent/20">
                    {lastScan.status}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[0.6rem] text-muted-foreground">PROCESSING TIME</span>
                  <span className="font-mono text-[0.75rem] text-foreground">{lastScan.processingTime}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[0.6rem] text-muted-foreground">TIMESTAMP</span>
                  <span className="font-mono text-[0.65rem] text-muted-foreground" title={formatLocal(lastScan.timestamp)}>
                    {formatLocal(lastScan.timestamp)}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-[2px] flex items-center gap-3 bg-muted/20 border border-border">
                <MapPin className="w-4 h-4 text-accent" />
                <div>
                  <div className="font-mono text-[0.6rem] text-muted-foreground">LOCATION</div>
                  <div className="font-mono text-[0.8rem] font-bold text-foreground">{lastScan.location}</div>
                </div>
              </div>

              {lastScan.diagnosticGenerated && (
                <div
                  className="p-3 rounded-[2px] flex items-center gap-3 bg-accent/5 border border-accent/20 cursor-pointer hover:bg-accent/10 transition-colors"
                  onClick={() => navigate('/telemetry')}
                >
                  <Crosshair className="w-4 h-4 text-accent" />
                  <div className="flex-1">
                    <div className="font-mono text-[0.6rem] text-muted-foreground">DIAGNOSTIC REPORT</div>
                    <div className="font-mono text-[0.75rem] font-bold text-accent">{lastScan.diagnosticId}</div>
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-accent" />
                </div>
              )}
            </div>

            {/* Center: Image preview */}
            <div className="lg:col-span-4 rounded-[2px] overflow-hidden flex items-center justify-center bg-muted/30 border border-border min-h-[200px]">
              {lastScan.imageUrl ? (
                <img src={lastScan.imageUrl} alt="Last scan" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center p-8">
                  <Camera className="w-12 h-12 mx-auto mb-2 opacity-20 text-primary" />
                  <p className="font-mono text-[0.6rem] text-muted-foreground uppercase">Image Preview</p>
                  <p className="font-mono text-[0.55rem] text-muted-foreground mt-1">Scan data processed</p>
                </div>
              )}
            </div>

            {/* Right: Detected anomalies */}
            <div className="lg:col-span-4 space-y-2">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-mono text-[0.6rem] text-muted-foreground tracking-wider">DETECTED ANOMALIES</h4>
                <span className="font-mono text-[0.75rem] font-bold text-destructive">{lastScan.anomalies.length}</span>
              </div>
              <div className="space-y-2">
                {lastScan.anomalies.map((anomaly: any) => (
                  <div
                    key={anomaly.id}
                    className={`p-2.5 rounded-[2px] transition-all hover:bg-muted/30 bg-muted/20 border ${
                      anomaly.severity === 'critical' ? 'border-destructive/20' : 'border-warning/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-[0.65rem] font-bold text-foreground">{anomaly.id}</span>
                      <span
                        className={`font-mono text-[0.55rem] px-1.5 py-0.5 rounded-[2px] border ${
                          anomaly.severity === 'critical'
                            ? 'text-destructive bg-destructive/10 border-destructive/20'
                            : 'text-warning bg-warning/10 border-warning/20'
                        }`}
                      >
                        {anomaly.severity.toUpperCase()}
                      </span>
                    </div>
                    <div className="font-mono text-[0.7rem] text-foreground mb-1">{anomaly.type}</div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[0.55rem] text-muted-foreground">CONFIDENCE</span>
                      <span className="font-mono text-[0.6rem] text-accent">{anomaly.confidence}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bento grid */}
      <div className="grid lg:grid-cols-12 gap-px bg-border">
        {/* Inspection Trends — 7 cols */}
        <div className="lg:col-span-7 p-4 bg-card backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-muted-foreground">INSPECTION TRENDS</h3>
            <span className="font-mono text-[0.55rem] text-muted-foreground">ROLLING</span>
          </div>
          {scans.length === 0 ? (
            <div className="flex items-center justify-center h-[220px]">
              <p className="font-mono text-[0.65rem] text-muted-foreground uppercase tracking-widest">
                No inspection data available yet
              </p>
            </div>
          ) : (
            <>
              {trendData[0]?.month === 'Prev' && (
                <p className="font-mono text-[0.6rem] text-muted-foreground mb-2">
                  Not enough data for trend visualization
                </p>
              )}
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="dashboardTrendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop key="trend-stop-0" offset="0%" stopColor="#A855F7" stopOpacity={0.3} />
                      <stop key="trend-stop-100" offset="100%" stopColor="#22D3EE" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid key="trend-grid" stroke="#374151" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    key="trend-xaxis"
                    dataKey="month"
                    stroke="#9CA3AF"
                    tick={{ fill: "#9CA3AF", fontSize: 10, fontFamily: "'JetBrains Mono'" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    key="trend-yaxis"
                    stroke="#9CA3AF"
                    tick={{ fill: "#9CA3AF", fontSize: 10, fontFamily: "'JetBrains Mono'" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    key="trend-tooltip"
                    contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", color: "#E5E7EB", fontFamily: "'JetBrains Mono'", fontSize: 11 }}
                    labelStyle={{ color: "#E5E7EB" }}
                    itemStyle={{ color: "#E5E7EB" }}
                  />
                  <Area
                    key="inspections"
                    type="monotone"
                    dataKey="inspections"
                    stroke="#A855F7"
                    fill="url(#dashboardTrendGrad)"
                    strokeWidth={2}
                  />
                  <Area
                    key="alerts"
                    type="monotone"
                    dataKey="alerts"
                    stroke="#22D3EE"
                    fill="transparent"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                <span className="flex items-center gap-1.5 font-mono text-[0.6rem] text-muted-foreground">
                  <span className="w-3 h-0.5 bg-primary inline-block" /> INSPECTIONS
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[0.6rem] text-muted-foreground">
                  <span className="w-3 h-0.5 bg-accent inline-block opacity-60 border-t border-dashed border-accent" /> ALERTS
                </span>
              </div>
            </>
          )}
        </div>

        {/* Health score — 5 cols */}
        <div className="lg:col-span-5 p-4 bg-card backdrop-blur-sm">
          <h3 className="text-muted-foreground mb-4">SYSTEM HEALTH INDEX</h3>
          <div className="flex items-center justify-center relative">
            <RadialBarChart
              width={180}
              height={180}
              innerRadius={55}
              outerRadius={80}
              data={healthData}
              startAngle={90}
              endAngle={-270}
            >
              <defs>
                <linearGradient id="dashboardHealthGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop key="health-stop-0" offset="0%" stopColor="#22D3EE" />
                  <stop key="health-stop-100" offset="100%" stopColor="#A855F7" />
                </linearGradient>
              </defs>
              <RadialBar
                key="health-radial"
                dataKey="value"
                cornerRadius={0}
                background={{ fill: "hsl(var(--muted) / 0.3)" }}
                fill="url(#dashboardHealthGrad)"
              />
            </RadialBarChart>
            <div className="absolute text-center">
              <p className="font-mono text-[2rem] text-foreground" style={{ fontWeight: 700 }}>
                {healthScore}
              </p>
              <p className="font-mono text-[0.55rem] text-muted-foreground tracking-wider">
                / 100
              </p>
            </div>
          </div>

          {/* Real scan metrics */}
          <div className="mt-4 space-y-2.5">
            {gpuMetrics.map((m) => (
              <div key={m.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[0.6rem] text-muted-foreground">{m.label}</span>
                  <span className="font-mono text-[0.6rem] text-foreground">
                    {m.value}
                    <span className="text-muted-foreground">/{m.max}</span>
                  </span>
                </div>
                <div className="h-1 bg-muted/20 overflow-hidden rounded-full">
                  <div
                    className="h-full transition-all bg-gradient-to-r from-primary to-accent rounded-full"
                    style={{ width: `${Math.min((m.value / m.max) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid lg:grid-cols-12 gap-px bg-border">
        {/* Damage classification - 5 cols */}
        <div className="lg:col-span-5 p-4 bg-card backdrop-blur-sm">
          <h3 className="text-muted-foreground mb-4">DAMAGE CLASSIFICATION</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={damageData.length > 0 ? damageData : [{ type: '—', count: 0 }]} barSize={20}>
              <defs>
                <linearGradient id="dashboardBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop key="bar-stop-0" offset="0%" stopColor="#22D3EE" />
                  <stop key="bar-stop-100" offset="100%" stopColor="#A855F7" />
                </linearGradient>
              </defs>
              <CartesianGrid key="bar-grid" stroke="#374151" vertical={false} />
              <XAxis
                key="bar-xaxis"
                dataKey="type"
                stroke="#9CA3AF"
                tick={{ fill: "#9CA3AF", fontSize: 10, fontFamily: "'JetBrains Mono'" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                key="bar-yaxis"
                stroke="#9CA3AF"
                tick={{ fill: "#9CA3AF", fontSize: 10, fontFamily: "'JetBrains Mono'" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                key="bar-tooltip"
                contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", color: "#E5E7EB", fontFamily: "'JetBrains Mono'", fontSize: 11 }}
                labelStyle={{ color: "#E5E7EB" }}
                itemStyle={{ color: "#E5E7EB" }}
              />
              <Bar key="bar-count" dataKey="count" fill="url(#dashboardBarGrad)" radius={0} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Activity feed — 7 cols */}
        <div className="lg:col-span-7 p-4 bg-card backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-muted-foreground">RECENT ACTIVITY</h3>
            <span className="font-mono text-[0.55rem] text-muted-foreground">
              LIVE FEED
              <span className="inline-block w-1.5 h-1.5 ml-1.5 animate-pulse bg-destructive rounded-full" style={{ boxShadow: "0 0 6px var(--destructive)" }} />
            </span>
          </div>
          <div className="space-y-0">
            {recentScans.length === 0 ? (
              <p className="font-mono text-[0.65rem] text-muted-foreground py-4 text-center">
                {loading ? 'LOADING...' : 'NO SCANS YET'}
              </p>
            ) : (
              recentScans.map((s, idx) => {
                const { risk, bars } = severityToRisk(s.severity);
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between py-2.5 border-b border-border last:border-0 hover:bg-muted/20 transition-colors px-1"
                  >
                    <div className="flex items-center gap-3">
                      <div className="font-mono text-[0.6rem] text-muted-foreground w-4">
                        {String(idx + 1).padStart(2, "0")}
                      </div>
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-mono text-[0.8rem] text-foreground">{s.location?.trim() || s.id}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <RiskTag risk={risk} />
                      <div className="flex gap-0.5">
                        {[1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className={`w-1 h-3 ${
                              i <= bars
                                ? bars >= 3
                                  ? "bg-destructive"
                                  : "bg-warning"
                                : "bg-border"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="font-mono text-[0.6rem] text-muted-foreground w-6 text-right flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" /> {timeAgo(s.timestamp)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
