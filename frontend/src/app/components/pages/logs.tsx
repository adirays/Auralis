import React, { useEffect, useState, useRef } from 'react';
import { ShieldAlert, AlertTriangle, FileWarning, Search, ArrowRight, ShieldCheck, Activity } from 'lucide-react';
import clsx from 'clsx';
import { historyApi, type ScanRecord } from '../../lib/api';
import { useScan } from '../../context/scan-context';

interface LogEntry {
  id: string;
  scanId: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: string;
  sensor: string;
  message: string;
  status: 'unresolved' | 'investigating' | 'resolved' | 'acknowledged';
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

function scanToLogEntry(scan: ScanRecord, idx: number): LogEntry {
  const sev = scan.anomaly_count === 0
    ? 'info'
    : scan.severity === 'HIGH' ? 'critical'
    : scan.severity === 'MEDIUM' || scan.severity === 'LOW' ? 'warning'
    : 'info';
  const prefix = sev === 'critical' ? 'ERR' : sev === 'warning' ? 'WARN' : 'INF';
  const suffix = idx.toString(16).toUpperCase().padStart(4, '0');
  const anomalyText = scan.anomaly_count > 0
    ? `${scan.anomaly_count} ${scan.anomaly_count === 1 ? 'anomaly' : 'anomalies'} detected (severity: ${scan.severity}). Processing time: ${(scan.processing_time_ms / 1000).toFixed(2)}s.`
    : `Scan completed. No anomalies detected. Processing time: ${(scan.processing_time_ms / 1000).toFixed(2)}s.`;
  const status = scan.acknowledged_at
    ? 'acknowledged'
    : sev === 'critical' ? 'unresolved' : sev === 'warning' ? 'investigating' : 'resolved';
  return {
    id: `${prefix}-${suffix}`,
    scanId: scan.id,
    severity: sev,
    timestamp: scan.timestamp,
    sensor: scan.id,
    message: anomalyText,
    status,
  };
}

export function AnomalyLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [mutedIds, setMutedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('auralis_muted_logs') ?? '[]')); }
    catch { return new Set(); }
  });
  const { scanVersion } = useScan();
  const [, setTick] = useState(0);

  const handleMute = (scanId: string) => {
    setMutedIds((prev) => {
      const next = new Set(prev);
      next.has(scanId) ? next.delete(scanId) : next.add(scanId);
      try { localStorage.setItem('auralis_muted_logs', JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  useEffect(() => {
    historyApi.getScans(100)
      .then((scans) => setLogs(scans.map((s, i) => scanToLogEntry(s, i + 1))))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [scanVersion]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const handleAcknowledge = async (scanId: string) => {
    try {
      await historyApi.acknowledge(scanId);
      setLogs((prev) =>
        prev.map((log) =>
          log.scanId === scanId ? { ...log, status: 'acknowledged' as const } : log
        )
      );
    } catch (err) {
      console.error('Acknowledge failed', err);
    }
  };

  // Reset to page 1 when search or filter changes
  const setSearchAndReset = (v: string) => { setSearch(v); setPage(1); };
  const setFilterAndReset = (v: string | null) => { setActiveFilter(v); setPage(1); };

  const filtered = logs.filter((l) => {
    if (mutedIds.has(l.scanId)) return false;
    const matchSearch = search === '' ||
      l.id.toLowerCase().includes(search.toLowerCase()) ||
      l.sensor.toLowerCase().includes(search.toLowerCase()) ||
      l.message.toLowerCase().includes(search.toLowerCase());
    const matchFilter = activeFilter === null || l.severity === activeFilter;
    return matchSearch && matchFilter;
  });

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const criticalCount = logs.filter((l) => l.severity === 'critical').length;
  const warningCount  = logs.filter((l) => l.severity === 'warning').length;
  const infoCount     = logs.filter((l) => l.severity === 'info').length;

  return (
    <div className="flex-1 flex flex-col h-full bg-background rounded-[2px] border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[2px] bg-destructive/10 flex items-center justify-center border border-destructive/20 relative">
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-destructive rounded-full animate-ping" />
            <ShieldAlert className="w-4 h-4 text-destructive" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-destructive">ANOMALY LOGS</h2>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Incident Response & Automated Triaging</p>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="SEARCH LOGS..."
              value={search}
              onChange={(e) => setSearchAndReset(e.target.value)}
              className="w-48 bg-input-background border border-input rounded-[2px] py-1.5 pl-8 pr-3 text-[10px] font-mono focus:outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="p-3 bg-muted border-b border-border flex items-center gap-3 overflow-x-auto shrink-0">
        <button
          onClick={() => setFilterAndReset(activeFilter === 'critical' ? null : 'critical')}
          className={clsx(
            "px-3 py-1.5 bg-background border rounded-[2px] text-[10px] font-mono text-foreground font-bold hover:border-primary transition-colors shadow-sm shrink-0 flex items-center gap-2",
            activeFilter === 'critical' ? 'border-destructive' : 'border-border'
          )}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-destructive" />
          CRITICAL <span className="bg-destructive/20 text-destructive px-1.5 rounded-[2px]">{criticalCount}</span>
        </button>
        <button
          onClick={() => setFilterAndReset(activeFilter === 'warning' ? null : 'warning')}
          className={clsx(
            "px-3 py-1.5 bg-background border rounded-[2px] text-[10px] font-mono text-foreground hover:border-primary transition-colors shadow-sm shrink-0 flex items-center gap-2",
            activeFilter === 'warning' ? 'border-warning' : 'border-border'
          )}
        >
          <FileWarning className="w-3.5 h-3.5 text-warning" />
          WARNINGS <span className="bg-warning/20 text-warning px-1.5 rounded-[2px]">{warningCount}</span>
        </button>
        <button
          onClick={() => setFilterAndReset(activeFilter === 'info' ? null : 'info')}
          className={clsx(
            "px-3 py-1.5 bg-background border rounded-[2px] text-[10px] font-mono text-foreground hover:border-primary transition-colors shadow-sm shrink-0 flex items-center gap-2",
            activeFilter === 'info' ? 'border-primary' : 'border-border'
          )}
        >
          <Activity className="w-3.5 h-3.5 text-primary" />
          INFO <span className="bg-primary/20 text-primary px-1.5 rounded-[2px]">{infoCount}</span>
        </button>
      </div>

      {/* Log Feed */}
      <div className="flex-1 overflow-auto p-4 bg-card-solid">
        <div className="max-w-4xl mx-auto space-y-4">
          {loading ? (
            <p className="font-mono text-[0.75rem] text-muted-foreground text-center animate-pulse pt-8">LOADING LOGS...</p>
          ) : filtered.length === 0 ? (
            <p className="font-mono text-[0.75rem] text-muted-foreground text-center pt-8">NO RECORDS MATCH QUERY</p>
          ) : (
            <div className="relative border-l-2 border-border/50 ml-4 pl-6 space-y-6">
              {paginated.map((log, i) => (
                <div key={i} className="relative group">
                  {/* Timeline Dot */}
                  <div className={clsx(
                    "absolute -left-[31px] w-4 h-4 rounded-full border-4 border-card-solid flex items-center justify-center top-1",
                    log.severity === 'critical' ? 'bg-destructive' :
                    log.severity === 'warning' ? 'bg-warning' : 'bg-primary'
                  )} />

                  {/* Log Card */}
                  <div className={clsx(
                    "border rounded-[2px] p-4 bg-background transition-all hover:shadow-sm",
                    log.severity === 'critical' ? 'border-destructive/30 hover:border-destructive/50' :
                    log.severity === 'warning' ? 'border-warning/30 hover:border-warning/50' : 'border-primary/30 hover:border-primary/50'
                  )}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <span className={clsx(
                          "text-[10px] font-mono px-1.5 py-0.5 rounded-[2px] font-bold border",
                          log.severity === 'critical' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                          log.severity === 'warning' ? 'bg-warning/10 text-warning border-warning/20' : 'bg-primary/10 text-primary border-primary/20'
                        )}>
                          {log.id}
                        </span>
                        <span
                          className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest"
                          title={formatLocal(log.timestamp)}
                        >
                          {formatLocal(log.timestamp)} · {formatTimeAgo(log.timestamp)}
                        </span>
                      </div>

                      <span className={clsx(
                        "text-[10px] font-mono px-2 py-0.5 rounded-full border flex items-center gap-1",
                        log.status === 'unresolved' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                        log.status === 'investigating' ? 'bg-warning/10 text-warning border-warning/20' :
                        log.status === 'acknowledged' ? 'bg-success/10 text-success border-success/20' :
                        'bg-success/10 text-success border-success/20'
                      )}>
                        {(log.status === 'resolved' || log.status === 'acknowledged') && <ShieldCheck className="w-3 h-3" />}
                        {log.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="mb-3">
                      <div className="text-sm font-bold mb-1 flex items-center gap-2">
                        <AlertTriangle className={clsx(
                          "w-4 h-4",
                          log.severity === 'critical' ? 'text-destructive animate-pulse' :
                          log.severity === 'warning' ? 'text-warning' : 'text-primary'
                        )} />
                        {log.message}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-2">
                        SOURCE: <span className="font-bold text-foreground">{log.sensor}</span>
                      </div>
                    </div>

                    {log.status !== 'resolved' && log.status !== 'acknowledged' && (
                      <div className="mt-4 pt-3 border-t border-border flex items-center gap-3">
                        <button
                          onClick={() => handleAcknowledge(log.scanId)}
                          className="text-[10px] font-mono font-bold bg-primary text-primary-foreground px-3 py-1.5 rounded-[2px] hover:bg-primary/90 transition-colors flex items-center gap-1.5">
                          ACKNOWLEDGE <ArrowRight className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleMute(log.scanId)}
                          className="text-[10px] font-mono font-bold text-muted-foreground hover:text-foreground transition-colors border border-border px-3 py-1.5 rounded-[2px]">
                          {mutedIds.has(log.scanId) ? 'UNMUTE' : 'MUTE'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 font-mono text-[0.6rem] text-muted-foreground">
              <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalFiltered)} OF {totalFiltered}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 border border-border hover:border-primary disabled:opacity-30 transition-colors"
                >PREV</button>
                <span className="px-2 py-1">{page}/{totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-2 py-1 border border-border hover:border-primary disabled:opacity-30 transition-colors"
                >NEXT</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
