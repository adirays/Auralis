import { useState, useEffect } from 'react';
import { Search, Filter, Download, Eye, Building2, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router';
import { historyApi, type ScanRecord } from '../../lib/api';
import { useScan } from '../../context/scan-context';

const PAGE_SIZE = 20;

function downloadUrl(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.click();
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

function RiskTag({ risk }: { risk: string }) {
  const styles: Record<string, { color: string }> = {
    NONE:     { color: '#22D3EE' },
    LOW:      { color: '#22D3EE' },
    MEDIUM:   { color: '#F59E0B' },
    HIGH:     { color: '#EF4444' },
    NOMINAL:  { color: '#22D3EE' },
    WARNING:  { color: '#F59E0B' },
    CRITICAL: { color: '#EF4444' },
  };
  const s = styles[risk] ?? styles.NONE;
  return (
    <span
      className="font-mono text-[0.6rem] px-2 py-0.5 tracking-wider"
      style={{ color: s.color, background: `${s.color}12`, border: `1px solid ${s.color}25` }}
    >
      {risk}
    </span>
  );
}

export function HistoryPage() {
  const [records, setRecords] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [, setTick] = useState(0);
  const { scanVersion } = useScan();
  const navigate = useNavigate();

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const fetchHistory = async (reset = false) => {
    setLoading(true);
    setError(null);
    const currentOffset = reset ? 0 : offset;
    try {
      const data = await historyApi.getScans(PAGE_SIZE, currentOffset);
      setRecords((prev) => reset ? data : [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
      if (reset) setOffset(PAGE_SIZE); else setOffset(currentOffset + PAGE_SIZE);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHistory(true); }, [scanVersion]);

  const filtered = records.filter((h) => {
    const matchSearch =
      h.id.toLowerCase().includes(search.toLowerCase()) ||
      h.location.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'ALL' ||
      h.severity === filter ||
      (filter === 'NOMINAL' && h.severity === 'NONE');
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-foreground">AUDIT HISTORY</h1>
        <p className="font-mono text-[0.7rem] text-muted-foreground mt-0.5">
          Complete analysis log with inference metadata
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex items-center gap-2 px-3 py-1.5 flex-1 max-w-sm border border-border"
          style={{ background: 'rgba(10,15,28,0.7)', backdropFilter: 'blur(12px)' }}
        >
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID or location..."
            className="bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/40 w-full text-sm font-mono"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1" />
          {['ALL', 'NONE', 'MEDIUM', 'HIGH'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-2.5 py-1 font-mono text-[0.65rem] tracking-wider cursor-pointer transition-all"
              style={{
                background: filter === f ? 'linear-gradient(135deg, #A855F7, #22D3EE)' : 'rgba(255,255,255,0.02)',
                color: filter === f ? '#030712' : '#94A3B8',
                border: `1px solid ${filter === f ? 'transparent' : 'rgba(255,255,255,0.06)'}`,
                fontWeight: filter === f ? 600 : 400,
              }}
            >
              {f === 'NONE' ? 'NOMINAL' : f}
            </button>
          ))}
        </div>
        <button
          onClick={() => fetchHistory(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-[0.65rem] font-mono hover:border-primary transition-colors"
          style={{ background: 'rgba(10,15,28,0.7)' }}
        >
          <RefreshCw className="w-3 h-3" />
          REFRESH
        </button>
      </div>

      {/* Table */}
      <div
        className="border border-border overflow-hidden"
        style={{ background: 'rgba(10,15,28,0.7)', backdropFilter: 'blur(12px)' }}
      >
        {loading ? (
          <div className="p-8 text-center font-mono text-[0.75rem] text-muted-foreground animate-pulse">
            LOADING RECORDS...
          </div>
        ) : error ? (
          <div className="p-8 text-center font-mono text-[0.75rem] text-destructive">
            ERROR: {error}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  {['#', 'SCAN ID', 'LOCATION', 'SEVERITY', 'ANOMALIES', 'PROC. TIME', 'TIMESTAMP', ''].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 font-mono text-[0.55rem] text-muted-foreground tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((h, i) => (
                  <tr key={h.id} className="border-b border-border last:border-0 hover:bg-white/[0.01] transition-colors">
                    <td className="px-3 py-2.5 font-mono text-[0.65rem] text-muted-foreground">
                      {String(i + 1).padStart(2, '0')}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[0.7rem] text-cyan">{h.id}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-purple/60" />
                        <span className="font-mono text-[0.75rem] text-foreground">{h.location}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <RiskTag risk={h.severity} />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[0.7rem] text-foreground tabular-nums">
                      {h.anomaly_count}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[0.65rem] text-muted-foreground tabular-nums">
                      {(h.processing_time_ms / 1000).toFixed(2)}s
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[0.7rem] text-muted-foreground" title={formatLocal(h.timestamp)}>
                      {h.timestamp ? `${formatLocal(h.timestamp)} · ${formatTimeAgo(h.timestamp)}` : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => navigate(`/scan/${h.id}`)}
                          className="p-1 hover:bg-white/[0.04] cursor-pointer transition-colors"
                          title="View scan detail"
                        >
                          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => h.image_url && downloadUrl(h.image_url, `${h.id}.jpg`)}
                          className={`p-1 hover:bg-white/[0.04] transition-colors ${h.image_url ? 'cursor-pointer' : 'cursor-not-allowed opacity-30'}`}
                          title={h.image_url ? 'Download image' : 'No image available'}
                          disabled={!h.image_url}
                        >
                          <Download className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="p-8 text-center font-mono text-[0.75rem] text-muted-foreground">
            NO RECORDS MATCH QUERY
          </div>
        )}

        <div
          className="flex items-center justify-between px-3 py-2 border-t border-border font-mono text-[0.55rem] text-muted-foreground"
          style={{ background: 'rgba(255,255,255,0.01)' }}
        >
          <span>SHOWING {filtered.length} OF {records.length} RECORDS</span>
          {hasMore && !loading && (
            <button
              onClick={() => fetchHistory(false)}
              className="text-primary hover:underline font-mono text-[0.55rem] tracking-wider"
            >
              LOAD MORE
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
