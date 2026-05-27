import React, { useEffect, useState } from 'react';
import { Layers, Activity, Search, Filter, AlertTriangle } from 'lucide-react';
import { historyApi, type ScanRecord } from '../../lib/api';
import { useScan } from '../../context/scan-context';

function severityToStatus(sev: string): 'normal' | 'warning' | 'critical' {
  if (sev === 'HIGH')   return 'critical';
  if (sev === 'MEDIUM') return 'warning';
  return 'normal';
}

export function StructureAnalysis() {
  const { scanVersion } = useScan();
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    historyApi.getScans(50).then(setScans).catch(() => {});
  }, [scanVersion]);

  const lastScan = scans[0] ?? null;

  // Derive per-scan anomaly nodes from real scan records (cap at 5)
  const nodes = scans
    .filter((s) =>
      search === '' ||
      s.id.toLowerCase().includes(search.toLowerCase()) ||
      s.location.toLowerCase().includes(search.toLowerCase())
    )
    .slice(0, 5)
    .map((s, i) => ({
      id: s.id,
      val: `${s.anomaly_count} anomal${s.anomaly_count !== 1 ? 'ies' : 'y'}`,
      status: severityToStatus(s.severity),
      location: s.location,
      processingTime: `${(s.processing_time_ms / 1000).toFixed(2)}s`,
    }));

  const sectorLabel = lastScan ? lastScan.location : 'NO DATA';
  const tensionLabel = lastScan
    ? lastScan.severity === 'HIGH' ? 'CRITICAL'
    : lastScan.severity === 'MEDIUM' ? 'WARNING'
    : 'NOMINAL'
    : 'N/A';
  const tensionColor = tensionLabel === 'CRITICAL' ? 'text-destructive'
    : tensionLabel === 'WARNING' ? 'text-warning'
    : 'text-success';

  // Timeline: oldest to newest scan timestamps
  const timelineStart = scans.length > 0
    ? new Date(scans[scans.length - 1].timestamp).toLocaleDateString()
    : 'N/A';
  const timelineEnd = scans.length > 0
    ? new Date(scans[0].timestamp).toLocaleDateString()
    : 'N/A';

  return (
    <div className="flex-1 flex flex-col h-full bg-background rounded-[2px] border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[2px] bg-primary/20 flex items-center justify-center border border-primary/30">
            <Layers className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">STRUCTURE ANALYSIS</h2>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">3D Modal Inspection & Stress Mapping</p>
          </div>
        </div>
        
        <div className="flex gap-2">
           <div className="relative">
             <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
             <input
               type="text"
               placeholder="SEARCH SECTORS..."
               value={search}
               onChange={(e) => setSearch(e.target.value)}
               className="w-48 bg-input-background border border-input rounded-[2px] py-1.5 pl-8 pr-3 text-[10px] font-mono focus:outline-none focus:border-primary transition-colors"
             />
           </div>
           <button className="flex items-center gap-2 px-3 py-1.5 bg-input-background border border-input rounded-[2px] text-[10px] font-mono hover:bg-muted transition-colors">
             <Filter className="w-3.5 h-3.5" />
             FILTER
           </button>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 flex">
        {/* Left Side: Viewer */}
        <div className="flex-1 p-4 flex flex-col relative">
          
          <div className="absolute top-6 left-6 z-10 space-y-2">
            <div className="px-2 py-1 bg-card/80 backdrop-blur-sm border border-border rounded-[2px] flex items-center gap-2 w-fit">
              <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${lastScan ? 'bg-success' : 'bg-muted-foreground'}`} />
              <span className="text-[10px] font-mono font-bold">{sectorLabel}</span>
            </div>
            <div className="px-2 py-1 bg-card/80 backdrop-blur-sm border border-border rounded-[2px] flex items-center gap-2 w-fit text-muted-foreground">
               <span className="text-[10px] font-mono">SEVERITY: <span className={tensionColor}>{tensionLabel}</span></span>
            </div>
          </div>
          
          {/* Viewer Container */}
          <div className="flex-1 border border-border bg-card-solid rounded-[2px] relative overflow-hidden flex items-center justify-center">
             {/* Abstract grid */}
             <div className="absolute inset-0 opacity-[0.05]" style={{
               backgroundImage: 'linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)',
               backgroundSize: '40px 40px',
               transform: 'perspective(1000px) rotateX(60deg) translateY(-100px) translateZ(-200px)',
               transformOrigin: 'top center'
             }} />
             
             {/* 3D Model Wireframe */}
             <div className="relative z-10 w-64 h-64 border-2 border-primary/40 rounded-full flex items-center justify-center">
                <div className="w-full h-full border border-cyan/40 rounded-full animate-[spin_10s_linear_infinite]" style={{ transform: 'rotateX(75deg)' }} />
                <div className="absolute w-full h-full border border-cyan/40 rounded-full animate-[spin_15s_linear_infinite_reverse]" style={{ transform: 'rotateY(75deg)' }} />
                <div className="absolute w-48 h-48 border border-primary rounded-full animate-pulse" />
                <Activity className="absolute text-primary w-12 h-12" />
             </div>
          </div>
          
          {/* Timeline */}
          <div className="mt-4 pt-4 border-t border-border">
             <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-2">
                <span>{timelineStart}</span>
                <span className="text-primary font-bold">{timelineEnd}</span>
             </div>
             <div className="w-full h-1.5 bg-muted rounded-full relative">
                <div className="absolute right-0 top-0 bottom-0 w-1/4 bg-primary/20 rounded-full" />
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-primary border border-background rounded-full shadow-md" />
             </div>
          </div>
        </div>
        
        {/* Right Side: Scan Metrics */}
        <div className="w-80 border-l border-border bg-card p-4 flex flex-col gap-4 overflow-y-auto">
           <h3 className="text-xs font-bold text-muted-foreground mb-2">SCAN METRICS</h3>
           
           {nodes.length === 0 ? (
             <p className="text-[10px] font-mono text-muted-foreground text-center py-8 uppercase">No scan data</p>
           ) : (
             nodes.map((node) => (
               <div key={node.id} className="p-3 border border-border rounded-[2px] bg-background/50 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono font-bold">{node.id}</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-[2px] ${
                      node.status === 'normal'   ? 'bg-success/10 text-success border border-success/20' :
                      node.status === 'warning'  ? 'bg-warning/10 text-warning border border-warning/20' :
                      'bg-destructive/10 text-destructive border border-destructive/20'
                    }`}>
                      {node.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-[10px] font-mono text-muted-foreground">ANOMALIES</div>
                      <div className="font-mono text-lg">{node.val}</div>
                    </div>
                    {node.status === 'critical' && <AlertTriangle className="w-4 h-4 text-destructive animate-pulse" />}
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground truncate">{node.location} · {node.processingTime}</div>
               </div>
             ))
           )}
        </div>
      </div>
    </div>
  );
}
