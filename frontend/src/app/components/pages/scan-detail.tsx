import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, MapPin, Clock, Cpu, AlertTriangle, CheckCircle, Download } from 'lucide-react';
import { historyApi, type ScanRecordWithAnomalies } from '../../lib/api';
import { ImageWithFallback } from '../figma/ImageWithFallback';

function downloadUrl(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.click();
}

export function ScanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [scan, setScan] = useState<ScanRecordWithAnomalies | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    historyApi.getScan(id)
      .then(setScan)
      .catch((e) => setError(e?.message ?? 'Failed to load scan'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center h-64 font-mono text-[0.7rem] text-muted-foreground animate-pulse">
      LOADING SCAN {id}...
    </div>
  );

  if (error || !scan) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <p className="font-mono text-[0.7rem] text-destructive">ERROR: {error ?? 'Scan not found'}</p>
      <button onClick={() => navigate(-1)} className="font-mono text-[0.65rem] text-primary hover:underline">← GO BACK</button>
    </div>
  );

  const ts = new Date(scan.timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-muted rounded-[2px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-foreground">{scan.id}</h1>
            <p className="font-mono text-[0.7rem] text-muted-foreground mt-0.5">Scan detail view</p>
          </div>
        </div>
        <div className="flex gap-2">
          {scan.image_url && (
            <button
              onClick={() => downloadUrl(scan.image_url!, `${scan.id}.jpg`)}
              className="flex items-center gap-2 px-3 py-1.5 border border-border text-[0.65rem] font-mono hover:border-primary transition-colors"
              style={{ background: 'rgba(10,15,28,0.7)' }}
            >
              <Download className="w-3 h-3" /> IMAGE
            </button>
          )}
          {scan.heatmap_url && (
            <button
              onClick={() => downloadUrl(scan.heatmap_url!, `${scan.id}_heatmap.png`)}
              className="flex items-center gap-2 px-3 py-1.5 border border-border text-[0.65rem] font-mono hover:border-primary transition-colors"
              style={{ background: 'rgba(10,15,28,0.7)' }}
            >
              <Download className="w-3 h-3" /> HEATMAP
            </button>
          )}
        </div>
      </div>

      {/* Meta + Image */}
      <div className="grid lg:grid-cols-12 gap-px" style={{ background: 'rgba(255,255,255,0.06)' }}>
        {/* Image */}
        <div className="lg:col-span-7" style={{ background: 'rgba(10,15,28,0.7)', backdropFilter: 'blur(12px)' }}>
          <ImageWithFallback
            src={scan.heatmap_url ?? scan.image_url ?? ''}
            alt={scan.id}
            className="w-full h-72 object-cover"
          />
        </div>

        {/* Meta */}
        <div className="lg:col-span-5 p-4 space-y-3 rounded-br-[2px]" style={{ background: 'linear-gradient(135deg, #1a1a1a, #222)', backdropFilter: 'blur(12px)', border: '1px solid #374151' }}>
          <div className="flex items-center gap-2 font-mono text-[0.7rem] text-gray-300">
            <MapPin className="w-3 h-3 text-primary" /> {scan.location || '—'}
          </div>
          <div className="flex items-center gap-2 font-mono text-[0.7rem] text-gray-400">
            <Clock className="w-3 h-3 text-primary" /> {ts}
          </div>
          <div className="flex items-center gap-2 font-mono text-[0.7rem] text-gray-400">
            <Cpu className="w-3 h-3 text-cyan" /> {scan.model_version} · {(scan.processing_time_ms / 1000).toFixed(2)}s
          </div>
          <div className="pt-2 border-t border-gray-700">
            <div className="font-mono text-[0.6rem] text-gray-300 uppercase tracking-wider mb-1">SEVERITY</div>
            <span className={`font-mono text-sm font-semibold ${
              scan.severity === 'HIGH'   ? 'text-red-400' :
              scan.severity === 'MEDIUM' ? 'text-yellow-400' :
              scan.severity === 'LOW'    ? 'text-blue-400' : 'text-gray-400'
            }`}>
              {scan.severity}
            </span>
          </div>
          <div className="pt-2 border-t border-gray-700">
            <div className="font-mono text-[0.6rem] text-gray-300 uppercase tracking-wider mb-1">DIAGNOSTICS</div>
            <p className="font-mono text-[0.65rem] text-gray-100 leading-relaxed">{scan.diagnostics || '—'}</p>
          </div>
        </div>
      </div>

      {/* Anomalies */}
      <div className="border border-gray-700 rounded-[2px]" style={{ background: 'linear-gradient(135deg, #1a1a1a, #222)', backdropFilter: 'blur(12px)' }}>
        <div className="px-4 py-3 border-b border-gray-700 font-mono text-[0.65rem] text-gray-300 tracking-wider uppercase">
          ANOMALIES ({scan.anomalies.length})
        </div>
        {scan.anomalies.length === 0 ? (
          <div className="p-6 flex items-center gap-2 font-mono text-[0.7rem] text-green-400">
            <CheckCircle className="w-4 h-4" /> No anomalies detected
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {scan.anomalies.map((a) => (
              <div key={a.id} className="px-4 py-3 flex items-center justify-between hover:bg-white/[0.03] transition-colors">
                <div className="flex items-center gap-3">
                  <AlertTriangle className={`w-3.5 h-3.5 ${
                    a.severity === 'critical' ? 'text-red-400' : 'text-yellow-400'
                  }`} />
                  <span className="font-mono text-[0.7rem] text-gray-100">{a.id} — {a.label}</span>
                </div>
                <div className="flex items-center gap-4 font-mono text-[0.65rem]">
                  <span className={`font-semibold ${
                    a.severity === 'critical' ? 'text-red-400' :
                    a.severity === 'warning'  ? 'text-yellow-400' : 'text-blue-400'
                  }`}>{a.severity.toUpperCase()}</span>
                  <span className="text-gray-300">{(a.confidence * 100).toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
