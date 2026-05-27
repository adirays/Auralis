import React, { useState, useRef, useEffect } from 'react';
import { Camera, UploadCloud, Scan, AlertTriangle, CheckCircle, Crosshair, RefreshCw, Layers, Search, Filter, History, Clock } from 'lucide-react';
import clsx from 'clsx';
import { useScan } from '../../context/scan-context';
import { analysisApi, historyApi, type ScanRecord } from '../../lib/api';

export function VisualInspection() {
  const { storeApiResult, scanVersion } = useScan();
  const [dragActive, setDragActive] = useState(false);
  const [imageFile, setImageFile] = useState<string | null>(null);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [heatMapMode, setHeatMapMode] = useState(false);
  const [currentScan, setCurrentScan] = useState<import('../../context/scan-context').Scan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dbHistory, setDbHistory] = useState<ScanRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError]   = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [location, setLocation] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'critical' | 'warning' | 'normal'>('all');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Seed sidebar from DB on mount and after each new scan
  useEffect(() => {
    setHistoryLoading(true);
    setHistoryError(false);
    setHistoryOffset(10);
    setHistoryHasMore(true);
    historyApi.getScans(10, 0)
      .then((data) => {
        setDbHistory(data);
        setHistoryHasMore(data.length === 10);
        setHistoryLoading(false);
      })
      .catch(() => { setHistoryError(true); setHistoryLoading(false); });
  }, [scanVersion]);

  const loadMoreHistory = () => {
    if (historyLoadingMore || !historyHasMore) return;
    setHistoryLoadingMore(true);
    historyApi.getScans(10, historyOffset)
      .then((data) => {
        setDbHistory((prev) => [...prev, ...data]);
        setHistoryHasMore(data.length === 10);
        setHistoryOffset((o) => o + 10);
      })
      .catch(() => {})
      .finally(() => setHistoryLoadingMore(false));
  };

  const scanResults = currentScan?.anomalies ?? [];

  const filteredHistory = dbHistory.filter((s) => {
    const matchSearch = !historySearch ||
      s.id.toLowerCase().includes(historySearch.toLowerCase()) ||
      s.location.toLowerCase().includes(historySearch.toLowerCase());
    const status = s.severity === 'HIGH' ? 'critical' : s.anomaly_count > 0 ? 'warning' : 'normal';
    const matchFilter = historyFilter === 'all' || status === historyFilter;
    return matchSearch && matchFilter;
  });

  const scanHistory = filteredHistory.map((scan) => {
    const status = scan.severity === 'HIGH' ? 'critical' : scan.anomaly_count > 0 ? 'warning' : 'normal';
    const date = new Date(scan.timestamp);
    const diffMs = Date.now() - date.getTime();
    const diffMins  = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays  = Math.floor(diffHours / 24);
    let timeAgo: string;
    if (diffMins < 1)        timeAgo = 'just now';
    else if (diffMins < 60)  timeAgo = `${diffMins}m ago`;
    else if (diffHours < 24) timeAgo = diffMins % 60 > 0 ? `${diffHours}h ${diffMins % 60}m ago` : `${diffHours}h ago`;
    else                     timeAgo = diffDays === 1 ? '1d ago' : `${diffDays}d ago`;
    const exactTime = date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return {
      id:        scan.id,
      date:      timeAgo,
      exactTime,
      location:  scan.location,
      status,
      findings:  scan.anomaly_count,
    };
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Only image files are supported (JPEG, PNG).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('File too large. Maximum size is 5 MB.');
      return;
    }
    setRawFile(file);
    setImageFile(URL.createObjectURL(file));
    setScanComplete(false);
    setError(null);
  };

  const startScan = async () => {
    if (!rawFile) return;

    const trimmedLocation = location.trim();
    if (trimmedLocation && !/^[A-Za-z0-9 \-_\.]+$/.test(trimmedLocation)) {
      setError('Location may only contain letters, numbers, spaces, hyphens, underscores, and dots.');
      return;
    }

    setIsScanning(true);
    setScanComplete(false);
    setError(null);

    try {
      const result = await analysisApi.analyze(rawFile, trimmedLocation || undefined);
      const scan = storeApiResult(result, imageFile);
      setCurrentScan(scan);
      setScanComplete(true);
    } catch (err: any) {
      setError(err?.message ?? 'Analysis failed. Please try again.');
    } finally {
      setIsScanning(false);
    }
  };

  const resetScanner = () => {
    setImageFile(null);
    setRawFile(null);
    setScanComplete(false);
    setIsScanning(false);
    setCurrentScan(null);
    setError(null);
    setHeatMapMode(false);
    setLocation('');
  };

  // The image to display: heatmap overlay when in heatmap mode, original otherwise
  const displayImage = heatMapMode && currentScan?.heatmapUrl
    ? currentScan.heatmapUrl
    : imageFile;

  return (
    <div className="flex-1 flex flex-col h-full bg-background rounded-[2px] border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[2px] bg-primary/20 flex items-center justify-center border border-primary/30">
            <Camera className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">AI VISUAL SCANNER</h2>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Deep-Learning Anomaly Detection Model V4</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden lg:flex gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="SEARCH SCANS..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-48 bg-input-background border border-input rounded-[2px] py-1.5 pl-8 pr-3 text-[10px] font-mono focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <button
              onClick={() => {
                const cycle: Array<typeof historyFilter> = ['all', 'critical', 'warning', 'normal'];
                setHistoryFilter(cycle[(cycle.indexOf(historyFilter) + 1) % cycle.length]);
              }}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 border rounded-[2px] text-[10px] font-mono transition-colors',
                historyFilter !== 'all'
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'bg-input-background border-input hover:bg-muted'
              )}
            >
              <Filter className="w-3.5 h-3.5" />
              {historyFilter === 'all' ? 'FILTER' : historyFilter.toUpperCase()}
            </button>
          </div>

          <div className="h-6 w-px bg-border hidden lg:block" />

          <div className="flex gap-2">
            {imageFile && (
              <button
                onClick={resetScanner}
                className="flex items-center gap-2 px-3 py-1.5 bg-input-background border border-input rounded-[2px] text-[10px] font-mono hover:bg-muted transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                RESET
              </button>
            )}
            {scanComplete && (
              <button
                onClick={() => setHeatMapMode(!heatMapMode)}
                className={clsx(
                  'flex items-center gap-2 px-3 py-1.5 rounded-[2px] text-[10px] font-mono font-bold transition-colors border',
                  heatMapMode
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'bg-input-background border-input hover:bg-muted',
                )}
              >
                <Layers className="w-3.5 h-3.5" />
                {heatMapMode ? 'HEAT MAP' : 'NORMAL SCAN'}
              </button>
            )}
            <input
              type="text"
              placeholder="LOCATION (e.g. SECTOR A-41)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={isScanning || scanComplete}
              className="w-44 bg-input-background border border-input rounded-[2px] py-1.5 px-3 text-[10px] font-mono focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
            />
          <button
              onClick={startScan}
              disabled={!imageFile || isScanning || scanComplete}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded-[2px] text-[10px] font-mono font-bold transition-colors shadow-sm',
                !imageFile || isScanning || scanComplete
                  ? 'bg-muted text-muted-foreground border border-border cursor-not-allowed'
                  : 'bg-primary border border-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              <Scan className={clsx('w-3.5 h-3.5', isScanning && 'animate-spin')} />
              {isScanning ? 'PROCESSING TENSORS...' : 'INITIALIZE SCAN'}
            </button>
          </div>
          {/* Model caching note */}
          <p className="hidden lg:block font-mono text-[0.6rem] text-muted-foreground/50 mt-1 text-right pr-1">
            Model pre-loaded at startup. First scan ready immediately.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left Column: History */}
        <div className="hidden lg:flex w-72 flex-col border-r border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border bg-background/50 flex items-center justify-between">
            <h3 className="text-xs font-bold text-muted-foreground flex items-center gap-2">
              <History className="w-3.5 h-3.5" />
              SCAN HISTORY
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 max-h-[calc(100vh-12rem)]">
            {historyLoading && (
              <p className="text-[10px] font-mono text-muted-foreground text-center mt-8 uppercase animate-pulse">Loading...</p>
            )}
            {!historyLoading && historyError && (
              <p className="text-[10px] font-mono text-destructive text-center mt-8 uppercase">Failed to load history</p>
            )}
            {!historyLoading && !historyError && scanHistory.length === 0 && (
              <p className="text-[10px] font-mono text-muted-foreground text-center mt-8 uppercase">No scans yet</p>
            )}
            {!historyLoading && !historyError && scanHistory.map((scan) => (
              <div key={scan.id} className="p-3 border border-border rounded-[2px] bg-background/50 hover:bg-muted/30 transition-colors cursor-pointer group">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-mono font-bold group-hover:text-primary transition-colors">{scan.id}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-[2px] ${
                    scan.status === 'normal' ? 'bg-success/10 text-success border border-success/20' :
                    scan.status === 'warning' ? 'bg-warning/10 text-warning border border-warning/20' :
                    'bg-destructive/10 text-destructive border border-destructive/20'
                  }`}>
                    {scan.status.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-[10px] font-mono text-muted-foreground mb-0.5 flex items-center gap-1" title={scan.exactTime}>
                      <Clock className="w-3 h-3" />
                      {scan.date}
                    </div>
                    <div className="text-[10px] font-mono font-bold tracking-widest">{scan.location?.trim() || scan.id}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-mono text-muted-foreground mb-0.5">FINDINGS</div>
                    <div className={clsx(
                      'font-mono text-xs font-bold',
                      scan.findings > 0 ? (scan.status === 'critical' ? 'text-destructive' : 'text-warning') : 'text-success',
                    )}>{scan.findings > 0 ? scan.findings : 'NONE'}</div>
                  </div>
                </div>
              </div>
            ))}
            {/* Load More / End of list */}
            {!historyLoading && !historyError && dbHistory.length > 0 && (
              historyHasMore ? (
                <button
                  onClick={loadMoreHistory}
                  disabled={historyLoadingMore}
                  className="w-full py-1.5 text-[10px] font-mono text-muted-foreground hover:text-primary border border-border hover:border-primary rounded-[2px] transition-colors disabled:opacity-50"
                >
                  {historyLoadingMore ? 'LOADING...' : 'LOAD MORE'}
                </button>
              ) : (
                <p className="text-[10px] font-mono text-muted-foreground text-center py-1">NO MORE SCANS</p>
              )
            )}
          </div>
        </div>

        {/* Center Column: Viewer */}
        <div className="flex-1 p-4 flex flex-col relative bg-card-solid">

          {/* Status badges */}
          <div className="absolute top-6 left-6 z-10 space-y-2 pointer-events-none">
            <div className="px-2 py-1 bg-card/80 backdrop-blur-sm border border-border rounded-[2px] flex items-center gap-2 w-fit">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] font-mono font-bold">IMAGE PROCESSING ENGINE</span>
            </div>
            {scanComplete && (
              <>
                <div className="px-2 py-1 bg-card/80 backdrop-blur-sm border border-border rounded-[2px] flex items-center gap-2 w-fit text-muted-foreground">
                  <span className="text-[10px] font-mono">
                    STATUS:{' '}
                    <span className={scanResults.length > 0 ? 'text-destructive' : 'text-success'}>
                      {scanResults.length > 0 ? 'ANOMALY DETECTED' : 'NOMINAL'}
                    </span>
                  </span>
                </div>
                {heatMapMode && (
                  <div className="px-2 py-1 bg-card/80 backdrop-blur-sm border border-primary/50 rounded-[2px] flex items-center gap-2 w-fit">
                    <Layers className="w-3 h-3 text-primary" />
                    <span className="text-[10px] font-mono font-bold text-primary">THERMAL HEAT MAP ACTIVE</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Main Upload / Viewer */}
          <div className={clsx(
            'flex-1 border rounded-[2px] relative overflow-hidden flex items-center justify-center transition-all',
            !imageFile
              ? dragActive
                ? 'border-primary bg-primary/5'
                : 'border-dashed border-border hover:border-primary/50 hover:bg-muted/50'
              : 'border-border bg-black/40',
          )}>

            {!imageFile ? (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center"
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4 border border-border">
                  <UploadCloud className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-bold mb-2 tracking-widest">DRAG & DROP TENSOR IMAGE</h3>
                <p className="text-[10px] font-mono text-muted-foreground uppercase max-w-[250px]">
                  Supports High-Resolution RGB & Infrared scans (JPEG, PNG). Click to browse local filesystem.
                </p>
              </div>
            ) : (
              <div className="w-full h-full relative flex items-center justify-center group">
                {/* Image display — switches between original and real heatmap */}
                <img
                  src={displayImage!}
                  alt="Inspection Scan"
                  className={clsx(
                    'max-w-full max-h-full object-contain transition-all duration-700',
                    isScanning ? 'opacity-50 contrast-125 saturate-0' : 'opacity-100',
                  )}
                />

                {/* Scanning overlay */}
                {isScanning && (
                  <div className="absolute inset-0 z-10 pointer-events-none">
                    <div className="w-full h-1 bg-primary shadow-[0_0_15px_rgba(0,255,255,0.8)] absolute left-0 animate-[scan_2s_ease-in-out_infinite]" />
                    <div className="absolute inset-0 bg-primary/5 bg-[linear-gradient(rgba(0,255,255,0.1)_1px,transparent_1px)] bg-[size:100%_4px] opacity-50" />
                    <div className="absolute top-1/4 left-1/4 w-8 h-8 border border-primary/40 rounded-full animate-ping" />
                    <div className="absolute bottom-1/3 right-1/4 w-12 h-12 border border-primary/40 rounded-full animate-ping" style={{ animationDelay: '0.5s' }} />
                    {/* Loading text */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-card/90 border border-primary/40 rounded-[2px] flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      <span className="font-mono text-[0.65rem] text-primary tracking-widest">Processing image...</span>
                    </div>
                  </div>
                )}

                {/* Bounding boxes — only in normal mode */}
                {scanComplete && !heatMapMode && scanResults.length > 0 && (
                  <div className="absolute inset-0 z-20 pointer-events-none">
                    {scanResults.map((res, idx) => (
                      <div
                        key={res.id}
                        className={clsx(
                          'absolute border-2 bg-black/20 backdrop-blur-[1px] transition-all duration-500 flex flex-col shadow-[0_0_10px_rgba(0,0,0,0.5)]',
                          res.severity === 'critical' ? 'border-destructive' : 'border-warning',
                        )}
                        style={{
                          left: `${res.x}%`,
                          top: `${res.y}%`,
                          width: `${res.width}%`,
                          height: `${res.height}%`,
                          animation: `zoomIn 0.3s ease-out forwards ${idx * 0.2}s`,
                          opacity: 0,
                          transform: 'scale(0.8)',
                        }}
                      >
                        <div className={clsx('absolute -top-1 -left-1 w-2 h-2', res.severity === 'critical' ? 'bg-destructive' : 'bg-warning')} />
                        <div className={clsx('absolute -top-1 -right-1 w-2 h-2', res.severity === 'critical' ? 'bg-destructive' : 'bg-warning')} />
                        <div className={clsx('absolute -bottom-1 -left-1 w-2 h-2', res.severity === 'critical' ? 'bg-destructive' : 'bg-warning')} />
                        <div className={clsx('absolute -bottom-1 -right-1 w-2 h-2', res.severity === 'critical' ? 'bg-destructive' : 'bg-warning')} />
                        <div className={clsx(
                          'absolute -top-6 left-[-2px] px-1.5 py-0.5 text-[8px] font-mono font-bold whitespace-nowrap',
                          res.severity === 'critical' ? 'bg-destructive text-destructive-foreground' : 'bg-warning text-warning-foreground',
                        )}>
                          {res.type} [{res.confidence}]
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="mt-3 p-3 border border-destructive/30 bg-destructive/5 rounded-[2px] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-[10px] font-mono text-destructive">{error}</p>
            </div>
          )}

          {/* Progress bar */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-2">
              <span>PROGRESS</span>
              <span className={clsx(
                'font-bold',
                scanComplete ? 'text-success' : isScanning ? 'text-primary animate-pulse' : 'text-muted-foreground',
              )}>
                {scanComplete ? 'ANALYSIS COMPLETE' : isScanning ? 'SCANNING...' : 'AWAITING INPUT'}
              </span>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full relative overflow-hidden">
              <div className={clsx(
                'absolute left-0 top-0 bottom-0 rounded-full transition-all duration-500',
                scanComplete ? 'bg-success w-full' : isScanning ? 'bg-primary w-1/2 animate-[pulse_1s_ease-in-out_infinite]' : 'bg-transparent w-0',
              )} />
            </div>
          </div>
        </div>

        {/* Right Column: Diagnostics */}
        <div className="w-80 border-l border-border bg-card p-4 flex flex-col gap-4 overflow-y-auto shrink-0">
          <h3 className="text-xs font-bold text-muted-foreground mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2"><Layers className="w-3.5 h-3.5" /> DIAGNOSTICS REPORT</span>
            {scanComplete && scanResults.length > 0 && (
              <span className="text-[10px] font-mono text-destructive animate-pulse">ACTION REQ</span>
            )}
          </h3>

          {!imageFile ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground p-4">
              <Crosshair className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-[10px] font-mono uppercase">Waiting for telemetry image input.</p>
            </div>
          ) : isScanning ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4 gap-4">
              <Scan className="w-8 h-8 text-primary animate-spin" />
              <div className="space-y-2 w-full">
                <div className="text-[10px] font-mono text-primary font-bold tracking-widest">ANALYZING GEOMETRY...</div>
                <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full animate-[pulse_1s_ease-in-out_infinite] w-full origin-left scale-x-[0.5]" />
                </div>
              </div>
              <div className="w-full text-left space-y-1 mt-4">
                <div className="text-[10px] font-mono text-muted-foreground opacity-50 animate-pulse">&gt; Edge detection initialized...</div>
                <div className="text-[10px] font-mono text-muted-foreground opacity-75 animate-pulse" style={{ animationDelay: '0.2s' }}>&gt; Contour extraction running...</div>
                <div className="text-[10px] font-mono text-muted-foreground opacity-100 animate-pulse" style={{ animationDelay: '0.4s' }}>&gt; Generating heatmap overlay...</div>
              </div>
            </div>
          ) : scanComplete ? (
            <div className="flex flex-col gap-3">
              {/* Summary */}
              {scanResults.length > 0 ? (
                <div className="bg-destructive/10 border border-destructive/20 rounded-[2px] p-3 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-destructive mb-1">
                      {scanResults.length} ANOMAL{scanResults.length === 1 ? 'Y' : 'IES'} DETECTED
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground leading-tight">
                      {currentScan?.diagnostics ?? 'Structural integrity compromised. Immediate manual inspection required.'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-success/10 border border-success/20 rounded-[2px] p-3 flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-success mb-1">NO ANOMALIES DETECTED</div>
                    <div className="text-[10px] font-mono text-muted-foreground leading-tight">
                      {currentScan?.diagnostics ?? 'Scan completed successfully. Structure appears nominal.'}
                    </div>
                  </div>
                </div>
              )}

              {/* Processing time */}
              {currentScan?.processingTime && (
                <div className="text-[10px] font-mono text-muted-foreground px-1">
                  PROCESSING TIME: <span className="text-primary">{currentScan.processingTime}</span>
                  {' '}| SEVERITY: <span className={clsx(
                    currentScan.severity === 'HIGH' ? 'text-destructive' :
                    currentScan.severity === 'MEDIUM' ? 'text-warning' : 'text-success',
                  )}>{currentScan.severity}</span>
                </div>
              )}

              {/* Heat map legend */}
              {heatMapMode && (
                <div className="p-3 border border-primary/30 rounded-[2px] bg-primary/5">
                  <div className="text-xs font-bold text-primary mb-3 flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5" />
                    THERMAL INTENSITY SCALE
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: 'CRITICAL', range: '> 0.85', color: 'from-red-500 to-red-600 border-red-400' },
                      { label: 'WARNING', range: '0.60–0.85', color: 'from-orange-500 to-yellow-500 border-orange-400' },
                      { label: 'MODERATE', range: '0.35–0.60', color: 'from-yellow-500 to-blue-500 border-yellow-400' },
                      { label: 'NORMAL', range: '< 0.35', color: 'from-blue-500 to-cyan-500 border-blue-400' },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between text-[10px] font-mono">
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-[2px] bg-gradient-to-r ${item.color} border`} />
                          <span>{item.label}</span>
                        </div>
                        <span className="text-muted-foreground">{item.range}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Anomaly cards */}
              <div className="space-y-2 mt-2">
                {scanResults.map((res) => (
                  <div key={res.id} className="p-3 border border-border rounded-[2px] bg-background/50 flex flex-col gap-2 cursor-pointer hover:border-primary/50 transition-colors">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-mono font-bold">{res.id}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-[2px] border ${
                        res.severity === 'critical'
                          ? 'bg-destructive/10 text-destructive border-destructive/20'
                          : 'bg-warning/10 text-warning border-warning/20'
                      }`}>
                        {res.severity.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-[10px] font-mono text-muted-foreground">CLASSIFICATION</div>
                        <div className="font-mono text-sm tracking-widest">{res.type}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-mono text-muted-foreground">CONFIDENCE</div>
                        <div className="font-mono text-xs text-primary">{res.confidence}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground p-4">
              <CheckCircle className="w-8 h-8 mb-2 text-success opacity-50" />
              <p className="text-[10px] font-mono uppercase">Image loaded. Ready for tensor analysis.</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes scan {
          0% { top: -5%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 105%; opacity: 0; }
        }
        @keyframes zoomIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
