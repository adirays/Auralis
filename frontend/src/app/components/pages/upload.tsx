import { useState, useRef } from "react";
import { Upload, X, Loader2, Scan, FileImage, ArrowRight, Terminal } from "lucide-react";
import { useNavigate } from "react-router";
import { analysisApi } from "../../lib/api";
import { useScan } from "../../context/scan-context";

interface FileItem {
  id: string;
  name: string;
  size: string;
  status: "queued" | "processing" | "complete" | "error";
  progress: number;
  rawFile: File;
  errorMsg?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { storeApiResult } = useScan();

  const addFiles = (rawFiles: File[]) => {
    const newFiles: FileItem[] = rawFiles.map((f, i) => ({
      id: `${Date.now()}-${i}`,
      name: f.name,
      size: formatBytes(f.size),
      status: "queued",
      progress: 0,
      rawFile: f,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (dropped.length) addFiles(dropped);
  };

  const runAnalysis = async () => {
    const queued = files.filter((f) => f.status === "queued");
    if (queued.length === 0) return;

    // Mark all queued as processing
    setFiles((prev) =>
      prev.map((f) => (f.status === "queued" ? { ...f, status: "processing" } : f))
    );

    for (const item of queued) {
      try {
        const blobUrl = URL.createObjectURL(item.rawFile);
        const result = await analysisApi.analyze(item.rawFile);
        storeApiResult(result, blobUrl);
        setFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: "complete", progress: 100 } : f))
        );
      } catch (err: any) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? { ...f, status: "error", errorMsg: err?.message ?? "Analysis failed" }
              : f
          )
        );
      }
    }
  };

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));
  const allDone   = files.length > 0 && files.every((f) => f.status === "complete" || f.status === "error");
  const hasQueued = files.some((f) => f.status === "queued");

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-foreground">IMAGE INTAKE</h1>
        <p className="font-mono text-[0.7rem] text-muted-foreground mt-0.5">
          Upload structural imagery for AI-powered analysis pipeline
        </p>
      </div>

      {/* Supported formats */}
      <div className="flex items-center gap-4 font-mono text-[0.6rem] text-muted-foreground">
        <span className="text-foreground/60">ACCEPTED:</span>
        {["PNG", "JPG", "TIFF", "DICOM"].map((fmt) => (
          <span
            key={fmt}
            className="px-2 py-0.5 border border-border"
            style={{ background: "rgba(255,255,255,0.02)" }}
          >
            {fmt}
          </span>
        ))}
        <span className="text-foreground/60 ml-auto">MAX: 5MB / FILE</span>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="relative p-16 border text-center cursor-pointer transition-all"
        style={{
          borderColor: dragging ? "#A855F7" : "rgba(255,255,255,0.06)",
          background: dragging ? "rgba(168,85,247,0.03)" : "rgba(10,15,28,0.5)",
          backdropFilter: "blur(12px)",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const selected = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"));
            if (selected.length) addFiles(selected);
          }}
        />

        {/* Grid pattern inside */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(168,85,247,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,0.5) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />

        <div className="relative z-10">
          <div
            className="w-14 h-14 mx-auto mb-4 flex items-center justify-center border"
            style={{ borderColor: "rgba(168,85,247,0.3)", background: "rgba(168,85,247,0.05)" }}
          >
            <Upload className="w-6 h-6 text-purple" />
          </div>
          <p className="text-foreground text-[0.85rem] mb-1" style={{ fontWeight: 600 }}>
            DROP FILES OR CLICK TO BROWSE
          </p>
          <p className="font-mono text-[0.7rem] text-muted-foreground">
            Drag structural images into this zone
          </p>
        </div>
      </div>

      {/* File queue */}
      {files.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Terminal className="w-3 h-3 text-purple" />
            <span className="font-mono text-[0.65rem] text-muted-foreground tracking-wider">
              QUEUE ({files.length} FILE{files.length > 1 ? "S" : ""})
            </span>
          </div>

          <div className="border border-border divide-y divide-border" style={{ background: "rgba(10,15,28,0.7)", backdropFilter: "blur(12px)" }}>
            {files.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.01] transition-colors">
                <FileImage className="w-4 h-4 text-purple/60 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[0.8rem] text-foreground truncate">
                      {f.name}
                    </span>
                    <span className="font-mono text-[0.6rem] text-muted-foreground shrink-0">
                      {f.size}
                    </span>
                  </div>
                  {f.status === "processing" && (
                    <div className="mt-1.5 h-0.5 bg-white/[0.04] overflow-hidden">
                      <div
                        className="h-full animate-pulse"
                        style={{ width: "65%", background: "linear-gradient(90deg, #A855F7, #22D3EE)" }}
                      />
                    </div>
                  )}
                  {f.status === "error" && (
                    <div className="font-mono text-[0.6rem] text-destructive mt-0.5 truncate">
                      {f.errorMsg ?? "Error"}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {f.status === "processing" && (
                    <Loader2 className="w-3.5 h-3.5 text-purple animate-spin" />
                  )}
                  {f.status === "complete" && (
                    <span
                      className="font-mono text-[0.6rem] px-2 py-0.5 tracking-wider"
                      style={{ color: "#22D3EE", background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.15)" }}
                    >
                      COMPLETE
                    </span>
                  )}
                  {f.status === "error" && (
                    <span
                      className="font-mono text-[0.6rem] px-2 py-0.5 tracking-wider"
                      style={{ color: "#ef4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}
                    >
                      FAILED
                    </span>
                  )}
                  {f.status === "queued" && (
                    <>
                      <span className="font-mono text-[0.6rem] text-muted-foreground tracking-wider">
                        QUEUED
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(f.id); }}
                        className="p-1 hover:bg-white/[0.04] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {files.length > 0 && (
        <div className="flex gap-3">
          {hasQueued && (
            <button
              onClick={runAnalysis}
              className="flex items-center gap-2 px-5 py-2 text-[0.8rem] tracking-wider cursor-pointer transition-all hover:brightness-110 text-background"
              style={{ background: "linear-gradient(135deg, #A855F7, #22D3EE)", fontWeight: 600 }}
            >
              <Scan className="w-4 h-4" />
              RUN ANALYSIS
            </button>
          )}
          {allDone && (
            <button
              onClick={() => navigate("/results")}
              className="flex items-center gap-2 px-5 py-2 text-[0.8rem] tracking-wider cursor-pointer transition-all hover:brightness-110 text-background"
              style={{ background: "linear-gradient(135deg, #22D3EE, #A855F7)", fontWeight: 600 }}
            >
              VIEW RESULTS
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setFiles([])}
            className="px-5 py-2 text-[0.8rem] tracking-wider border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 cursor-pointer transition-colors"
          >
            CLEAR QUEUE
          </button>
        </div>
      )}
    </div>
  );
}
