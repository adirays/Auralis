import React, { useEffect, useState } from 'react';
import { Maximize2, Crosshair, Layers } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { historyApi, type ScanRecord } from '../lib/api';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1602321270896-e61c68d7a3c2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb25jcmV0ZSUyMGRhbXxlbnwxfHx8fDE3NzYyNTcyNjF8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral';
const CACHE_KEY = 'auralis_last_scan_image';

export function MainCanvas() {
  const { isAuthenticated } = useAuth();
  const [imageSrc, setImageSrc] = useState<string>(() => {
    return localStorage.getItem(CACHE_KEY) || FALLBACK_IMAGE;
  });
  const [lastScan, setLastScan] = useState<ScanRecord | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    historyApi.getScans(1, 0).then((scans) => {
      const scan = scans?.[0] ?? null;
      setLastScan(scan);
      const url = scan?.image_url;
      if (url) {
        setImageSrc(url);
        localStorage.setItem(CACHE_KEY, url);
      }
    }).catch(() => {});
  }, [isAuthenticated]);

  const scanLabel   = lastScan ? lastScan.id : 'NO SCAN';
  const confidence  = lastScan
    ? `${lastScan.severity !== 'NONE' ? lastScan.severity : 'NONE'} · ${lastScan.anomaly_count} ANOMAL${lastScan.anomaly_count !== 1 ? 'IES' : 'Y'}`
    : 'N/A';
  const locationLabel = lastScan?.location ?? 'N/A';

  return (
    <div className="col-span-8 row-span-2 bg-card border border-border rounded-[2px] shadow-card relative overflow-hidden flex flex-col transition-colors duration-300">
      
      {/* Canvas Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <Crosshair className="text-primary w-4 h-4" />
          <h3 className="m-0 text-xs font-bold tracking-widest text-foreground">
            AURALIS VISUAL TELEMETRY
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-1 hover:bg-muted rounded-[2px] text-muted-foreground hover:text-foreground transition-colors">
            <Layers className="w-4 h-4" />
          </button>
          <button className="p-1 hover:bg-muted rounded-[2px] text-muted-foreground hover:text-foreground transition-colors">
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Image Container */}
      <div className="flex-1 relative bg-black/5 group">
        <img 
          src={imageSrc}
          alt="Last Scan"
          className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-500"
        />

        {/* Grad-CAM Overlay */}
        <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] -translate-x-1/2 -translate-y-1/2 pointer-events-none mix-blend-screen">
          <div className="w-full h-full rounded-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-500/60 via-cyan-400/30 to-transparent blur-xl"></div>
        </div>
        
        {/* Additional Heatmap Nodes */}
        <div className="absolute top-1/2 left-[60%] w-[150px] h-[150px] -translate-x-1/2 -translate-y-1/2 pointer-events-none mix-blend-screen">
          <div className="w-full h-full rounded-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-cyan-500/50 via-purple-500/20 to-transparent blur-lg"></div>
        </div>

        {/* Crosshairs & Reticle */}
        <div className="absolute top-1/3 left-1/4 -translate-x-1/2 -translate-y-1/2 w-12 h-12 border border-cyan/50 rounded-full flex items-center justify-center animate-[pulse_3s_ease-in-out_infinite]">
          <div className="w-1 h-1 bg-cyan rounded-full"></div>
          <div className="absolute top-0 bottom-0 w-[1px] bg-cyan/30"></div>
          <div className="absolute left-0 right-0 h-[1px] bg-cyan/30"></div>
        </div>

        {/* Coordinates Overlay */}
        <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
          <div className="bg-background/80 backdrop-blur-md border border-border p-2 rounded-[2px] shadow-sm">
            <div className="font-mono text-[10px] text-cyan uppercase tracking-wider mb-1">{scanLabel}</div>
            <div className="font-mono text-xs font-bold text-foreground">{locationLabel}</div>
          </div>
          <div className="bg-background/80 backdrop-blur-md border border-border p-2 rounded-[2px] shadow-sm">
            <div className="font-mono text-[10px] text-primary uppercase tracking-wider mb-1">LAST SCAN RESULT</div>
            <div className="font-mono text-xs font-bold text-foreground">{confidence}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
