import { useNavigate } from "react-router";
import { ArrowRight, Cpu, Scan, BarChart3, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import logoImg from "../../../imports/image.png";
import { historyApi, healthApi } from "../../lib/api";

function TypedText({ text, speed = 50 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(timer);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);
  return (
    <span>
      {displayed}
      <span className="animate-pulse text-cyan">_</span>
    </span>
  );
}

export function LandingPage() {
  const navigate = useNavigate();

  const [totalScans,   setTotalScans]   = useState<string>('—');
  const [avgAccuracy,  setAvgAccuracy]  = useState<string>('—');
  const [uniqueAssets, setUniqueAssets] = useState<string>('—');
  const [avgLatency,   setAvgLatency]   = useState<string>('—');
  const [modelVersion, setModelVersion] = useState<string>('—');
  const [isOnline,     setIsOnline]     = useState<boolean | null>(null);

  useEffect(() => {
    historyApi.getScans(200).then((scans) => {
      setTotalScans(scans.length.toLocaleString());
      setUniqueAssets(String(new Set(scans.map((s) => s.location)).size));
      const withTime = scans.filter((s) => s.processing_time_ms > 0);
      if (withTime.length > 0) {
        const avg = withTime.reduce((s, r) => s + r.processing_time_ms, 0) / withTime.length;
        setAvgLatency(`${(avg / 1000).toFixed(1)}s`);
      }
      if (scans.length > 0 && scans[0].model_version) {
        setModelVersion(scans[0].model_version);
      }
    }).catch(() => {});

    historyApi.getScansWithAnomalies(200).then((scans) => {
      const withAnomalies = scans.filter((s) => s.anomalies.length > 0);
      if (withAnomalies.length > 0) {
        const allConf = withAnomalies.flatMap((s) => s.anomalies.map((a) => a.confidence));
        const avg = allConf.reduce((s, c) => s + c, 0) / allConf.length;
        setAvgAccuracy(`${(avg * 100).toFixed(1)}%`);
      } else {
        setAvgAccuracy('N/A');
      }
    }).catch(() => {});

    healthApi.get().then((h) => setIsOnline(h.status === 'ok')).catch(() => setIsOnline(false));
  }, []);

  const features = [
    {
      icon: Scan,
      title: "NEURAL DETECTION",
      desc: "YOLOv8 segmentation backbone detects micro-fractures, corrosion patterns, and deformation anomalies with EigenCAM explainability.",
      stat: avgAccuracy,
      statLabel: "AVG CONFIDENCE",
    },
    {
      icon: Cpu,
      title: "GRAD-CAM AUDIT",
      desc: "Explainable AI via SVD-based EigenCAM (Layer 4 × Layer 9 fusion). Every prediction is visually auditable.",
      stat: avgLatency,
      statLabel: "AVG LATENCY",
    },
    {
      icon: BarChart3,
      title: "RISK SCORING",
      desc: "Automated severity classification with confidence intervals. Multi-structure comparative analysis.",
      stat: uniqueAssets,
      statLabel: "LOCATIONS",
    },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Grid background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(168,85,247,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,0.3) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Top glow */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse, rgba(168,85,247,0.08) 0%, transparent 70%)",
        }}
      />

      {/* Nav */}
      <nav
        className="relative z-10 flex items-center justify-between px-6 lg:px-16 h-14 border-b border-border"
        style={{ background: "rgba(3,7,18,0.85)", backdropFilter: "blur(12px)" }}
      >
        <div className="flex items-center gap-3">
          <img src={logoImg} alt="Auralis" className="w-8 h-8 object-contain" />
          <span
            className="text-[0.9rem] tracking-[0.2em] text-foreground"
            style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 700 }}
          >
            AURALIS
          </span>
          <span className="hidden sm:inline text-[0.55rem] font-mono text-muted-foreground ml-1 border border-border px-1.5 py-0.5">
            {modelVersion !== '—' ? modelVersion : 'v1'}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:flex items-center gap-1.5 font-mono text-[0.65rem]" style={{ color: isOnline === false ? '#EF4444' : '#22D3EE' }}>
            <span
              className="w-1.5 h-1.5"
              style={{ background: isOnline === false ? '#EF4444' : '#22D3EE', boxShadow: isOnline === false ? '0 0 6px #EF4444' : '0 0 6px #22D3EE' }}
            />
            {isOnline === null ? 'CHECKING' : isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 px-4 py-1.5 text-[0.75rem] tracking-wider text-background cursor-pointer transition-all hover:brightness-110"
            style={{
              background: "linear-gradient(135deg, #A855F7, #22D3EE)",
              fontFamily: "'Inter', sans-serif",
              fontWeight: 600,
            }}
          >
            LAUNCH TERMINAL
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 px-6 lg:px-16 pt-24 pb-20 max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            {/* System tag */}
            <div className="flex items-center gap-2 mb-6 font-mono text-[0.65rem]">
              <Terminal className="w-3 h-3 text-purple" />
              <span className="text-muted-foreground">SYS://AURALIS/</span>
              <span className="text-cyan">STRUCTURAL_AUDIT</span>
            </div>

            <h1
              className="text-foreground mb-2"
              style={{ fontSize: "2.8rem", lineHeight: 1.05, letterSpacing: "-0.03em" }}
            >
              STRUCTURAL
              <br />
              <span
                style={{
                  background: "linear-gradient(135deg, #A855F7, #22D3EE)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                INTELLIGENCE
              </span>
            </h1>

            <div className="font-mono text-[0.8rem] text-muted-foreground mt-4 mb-8 leading-relaxed max-w-md">
              <TypedText text="Auditable AI for infrastructure health monitoring. Grad-CAM explainability. Zero black-box decisions." />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/dashboard")}
                className="flex items-center gap-2 px-5 py-2.5 text-[0.8rem] tracking-wider cursor-pointer transition-all hover:brightness-110 text-background"
                style={{
                  background: "linear-gradient(135deg, #A855F7, #22D3EE)",
                  fontWeight: 600,
                }}
              >
                OPEN DASHBOARD
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate("/upload")}
                className="px-5 py-2.5 text-[0.8rem] tracking-wider border border-border text-foreground cursor-pointer transition-all hover:border-cyan/40 hover:text-cyan"
              >
                UPLOAD SCAN
              </button>
            </div>

            {/* Metrics strip */}
            <div className="flex gap-8 mt-12">
              {[
                { val: totalScans,   label: "SCANS" },
                { val: avgAccuracy,  label: "AVG CONF" },
                { val: uniqueAssets, label: "ASSETS" },
              ].map((m) => (
                <div key={m.label}>
                  <p className="font-mono text-[1.4rem] text-cyan" style={{ fontWeight: 600 }}>
                    {m.val}
                  </p>
                  <p className="font-mono text-[0.55rem] text-muted-foreground tracking-wider">
                    {m.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Logo display */}
          <div className="hidden lg:flex justify-center items-center relative">
            {/* Glow rings */}
            <div
              className="absolute w-80 h-80 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(168,85,247,0.06) 0%, transparent 70%)",
              }}
            />
            <div
              className="absolute w-60 h-60 border border-purple/10 rounded-full"
              style={{ animation: "spin 30s linear infinite" }}
            />
            <div
              className="absolute w-72 h-72 border border-cyan/5 rounded-full"
              style={{ animation: "spin 45s linear infinite reverse" }}
            />
            <img
              src={logoImg}
              alt="Auralis"
              className="w-56 h-56 object-contain relative z-10"
              style={{ filter: "drop-shadow(0 0 40px rgba(34,211,238,0.15))" }}
            />
          </div>
        </div>
      </section>

      {/* Features bento */}
      <section className="relative z-10 px-6 lg:px-16 pb-20 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-px bg-cyan" />
          <h3 className="font-mono text-[0.7rem] text-muted-foreground tracking-[0.15em]">
            CAPABILITIES
          </h3>
        </div>

        <div className="grid md:grid-cols-3 gap-px" style={{ background: "rgba(255,255,255,0.06)" }}>
          {features.map((f) => (
            <div
              key={f.title}
              className="p-6 transition-all hover:bg-white/[0.02]"
              style={{ background: "rgba(10, 15, 28, 0.8)", backdropFilter: "blur(12px)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <f.icon className="w-5 h-5 text-purple" />
                <div className="text-right">
                  <p className="font-mono text-[1.1rem] text-cyan" style={{ fontWeight: 600 }}>
                    {f.stat}
                  </p>
                  <p className="font-mono text-[0.5rem] text-muted-foreground tracking-wider">
                    {f.statLabel}
                  </p>
                </div>
              </div>
              <h4
                className="text-foreground text-[0.8rem] mb-2 tracking-wider"
                style={{ fontWeight: 600 }}
              >
                {f.title}
              </h4>
              <p className="text-muted-foreground text-[0.75rem] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section className="relative z-10 px-6 lg:px-16 pb-20 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-px bg-purple" />
          <h3 className="font-mono text-[0.7rem] text-muted-foreground tracking-[0.15em]">
            AUDIT WORKFLOW
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-px" style={{ background: "rgba(255,255,255,0.06)" }}>
          {[
            { step: "01", label: "CAPTURE", desc: "Upload structural imagery" },
            { step: "02", label: "INFERENCE", desc: "YOLOv8 segmentation inference" },
            { step: "03", label: "EXPLAIN", desc: "Grad-CAM heatmap generation" },
            { step: "04", label: "AUDIT", desc: "Risk scoring & reporting" },
          ].map((s) => (
            <div
              key={s.step}
              className="p-5 transition-all hover:bg-white/[0.02]"
              style={{ background: "rgba(10, 15, 28, 0.8)" }}
            >
              <span
                className="font-mono text-[2rem] block mb-2"
                style={{
                  background: "linear-gradient(135deg, #A855F7, #22D3EE)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                {s.step}
              </span>
              <p className="text-foreground text-[0.8rem] tracking-wider mb-1" style={{ fontWeight: 600 }}>
                {s.label}
              </p>
              <p className="font-mono text-[0.65rem] text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border px-6 lg:px-16 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={logoImg} alt="" className="w-5 h-5 object-contain opacity-40" />
          <span className="font-mono text-[0.6rem] text-muted-foreground">
            AURALIS STRUCTURAL AUDITING AI
          </span>
        </div>
        <span className="font-mono text-[0.6rem] text-muted-foreground">
          2026 // ALL SYSTEMS NOMINAL
        </span>
      </footer>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}