import {
  Bell,
  User,
  Cpu,
  Monitor,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../../context/auth-context";
import { modelApi } from "../../lib/api";

const ALERTS_KEY = 'auralis_alert_prefs';

const DEFAULT_ALERTS = [
  { key: 'critical',  label: "Critical risk alerts",  desc: "Immediate push for CRITICAL findings",    on: true  },
  { key: 'analysis',  label: "Analysis completion",   desc: "Notify on inference pipeline finish",      on: true  },
  { key: 'digest',    label: "Weekly digest",          desc: "Fleet health summary report",              on: false },
];

function loadAlertPrefs(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function SettingsPage() {
  const { user } = useAuth();
  const [modelVersion, setModelVersion] = useState<string>('—');
  const [modelInfo, setModelInfo] = useState<{
    backbone: string;
    explainability: string;
    confidence_threshold: number | string;
    task: string;
  }>({
    backbone: '—',
    explainability: '—',
    confidence_threshold: '—',
    task: '—',
  });
  const [alertPrefs, setAlertPrefs] = useState<Record<string, boolean>>(() => {
    const saved = loadAlertPrefs();
    const defaults: Record<string, boolean> = {};
    DEFAULT_ALERTS.forEach((a) => { defaults[a.key] = a.key in saved ? saved[a.key] : a.on; });
    return defaults;
  });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  const toggleAlert = (key: string) => {
    setAlertPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    try { localStorage.setItem(ALERTS_KEY, JSON.stringify(alertPrefs)); } catch {}
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleDiscard = () => {
    const saved = loadAlertPrefs();
    const defaults: Record<string, boolean> = {};
    DEFAULT_ALERTS.forEach((a) => { defaults[a.key] = a.key in saved ? saved[a.key] : a.on; });
    setAlertPrefs(defaults);
  };

  useEffect(() => {
    modelApi.getInfo().then((info) => {
      setModelVersion(info.model_version);
      setModelInfo({
        backbone:             info.backbone,
        explainability:       info.explainability,
        confidence_threshold: info.confidence_threshold,
        task:                 info.task,
      });
    }).catch(() => {});
  }, []);

  const roleLabel = user?.role ? user.role.toUpperCase() : '—';
  const orgLabel  = user?.organization || '—';

  const modelParams = [
    { label: 'BACKBONE',             value: modelInfo.backbone },
    { label: 'EXPLAINABILITY',       value: modelInfo.explainability },
    { label: 'CONFIDENCE_THRESHOLD', value: String(modelInfo.confidence_threshold) },
    { label: 'MODEL_VERSION',        value: modelVersion },
    { label: 'TASK',                 value: modelInfo.task },
  ];
  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-foreground">CONFIGURATION</h1>
        <p className="font-mono text-[0.7rem] text-muted-foreground mt-0.5">
          System parameters and operator preferences
        </p>
      </div>

      {/* Appearance — locked to obsidian */}
      <div
        className="border border-border p-5"
        style={{ background: "rgba(10,15,28,0.7)", backdropFilter: "blur(12px)" }}
      >
        <div className="flex items-center gap-3 mb-4">
          <Monitor className="w-4 h-4 text-purple" />
          <div>
            <h3 className="text-foreground">APPEARANCE</h3>
            <p className="font-mono text-[0.65rem] text-muted-foreground mt-0.5">
              Terminal theme configuration
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-px" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div
            className="p-4"
            style={{
              background: "rgba(10,15,28,0.9)",
              border: "1px solid #A855F7",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-3 h-3"
                style={{
                  background: "linear-gradient(135deg, #A855F7, #22D3EE)",
                }}
              />
              <span className="font-mono text-[0.7rem] text-foreground">OBSIDIAN DARK</span>
            </div>
            <p className="font-mono text-[0.6rem] text-muted-foreground">
              Electric Purple + Neon Cyan
            </p>
            <span
              className="inline-block mt-2 font-mono text-[0.55rem] px-2 py-0.5 tracking-wider"
              style={{
                color: "#22D3EE",
                background: "rgba(34,211,238,0.08)",
                border: "1px solid rgba(34,211,238,0.15)",
              }}
            >
              ACTIVE
            </span>
          </div>
        </div>
      </div>

      {/* Operator Profile */}
      <div
        className="border border-border p-5"
        style={{ background: "rgba(10,15,28,0.7)", backdropFilter: "blur(12px)" }}
      >
        <div className="flex items-center gap-3 mb-4">
          <User className="w-4 h-4 text-cyan" />
          <div>
            <h3 className="text-foreground">OPERATOR PROFILE</h3>
            <p className="font-mono text-[0.65rem] text-muted-foreground mt-0.5">
              Identity and access credentials
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-muted-foreground block mb-1.5">CALLSIGN</label>
              <input
                value={user?.name ?? ''}
                readOnly
                className="w-full px-3 py-2 border border-border text-foreground"
                style={{ background: "rgba(255,255,255,0.02)" }}
              />
            </div>
            <div>
              <label className="text-muted-foreground block mb-1.5">CLEARANCE</label>
              <input
                value={roleLabel}
                readOnly
                className="w-full px-3 py-2 border border-border text-muted-foreground cursor-not-allowed"
                style={{ background: "rgba(255,255,255,0.01)" }}
              />
            </div>
          </div>
          <div>
            <label className="text-muted-foreground block mb-1.5">CONTACT</label>
            <input
              value={user?.email ?? ''}
              readOnly
              className="w-full px-3 py-2 border border-border text-foreground"
              style={{ background: "rgba(255,255,255,0.02)" }}
            />
          </div>
          <div>
            <label className="text-muted-foreground block mb-1.5">ORGANIZATION</label>
            <input
              value={orgLabel}
              readOnly
              className="w-full px-3 py-2 border border-border text-muted-foreground cursor-not-allowed"
              style={{ background: "rgba(255,255,255,0.01)" }}
            />
          </div>
        </div>
      </div>

      {/* Model config */}
      <div
        className="border border-border p-5"
        style={{ background: "rgba(10,15,28,0.7)", backdropFilter: "blur(12px)" }}
      >
        <div className="flex items-center gap-3 mb-4">
          <Cpu className="w-4 h-4 text-purple" />
          <div>
            <h3 className="text-foreground">MODEL CONFIGURATION</h3>
            <p className="font-mono text-[0.65rem] text-muted-foreground mt-0.5">
              AI inference parameters
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {modelParams.map((p) => (
            <div
              key={p.label}
              className="flex items-center justify-between py-2 px-3 border-b border-border last:border-0 hover:bg-white/[0.01] transition-colors"
            >
              <span className="font-mono text-[0.65rem] text-muted-foreground">{p.label}</span>
              <span className="font-mono text-[0.7rem] text-foreground">{p.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Notifications */}
      <div
        className="border border-border p-5"
        style={{ background: "rgba(10,15,28,0.7)", backdropFilter: "blur(12px)" }}
      >
        <div className="flex items-center gap-3 mb-4">
          <Bell className="w-4 h-4 text-cyan" />
          <div>
            <h3 className="text-foreground">ALERT CHANNELS</h3>
            <p className="font-mono text-[0.65rem] text-muted-foreground mt-0.5">
              Notification routing rules
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {DEFAULT_ALERTS.map((n) => (
            <div
              key={n.key}
              className="flex items-center justify-between py-2.5 px-3 border-b border-border last:border-0 hover:bg-white/[0.01] transition-colors"
            >
              <div>
                <p className="text-[0.8rem] text-foreground" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>{n.label}</p>
                <p className="font-mono text-[0.6rem] text-muted-foreground mt-0.5">{n.desc}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer" onClick={() => toggleAlert(n.key)}>
                <input type="checkbox" checked={alertPrefs[n.key]} onChange={() => toggleAlert(n.key)} className="sr-only peer" />
                <div
                  className="w-9 h-5 rounded-none peer-checked:after:translate-x-[16px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-4 after:h-4 after:transition-all"
                  style={{
                    background: alertPrefs[n.key] ? "linear-gradient(135deg, #A855F7, #22D3EE)" : "rgba(255,255,255,0.06)",
                  }}
                >
                  <span
                    className="absolute top-[2px] left-[2px] w-4 h-4 transition-transform"
                    style={{ background: "#030712", transform: alertPrefs[n.key] ? "translateX(16px)" : "translateX(0)" }}
                  />
                </div>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 items-center">
        {saveStatus === 'saved' && (
          <span className="font-mono text-[0.65rem] text-accent">CONFIG SAVED</span>
        )}
        <button
          onClick={handleDiscard}
          className="px-5 py-2 text-[0.8rem] tracking-wider border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 cursor-pointer transition-colors"
        >
          DISCARD
        </button>
        <button
          onClick={handleSave}
          className="px-5 py-2 text-[0.8rem] tracking-wider cursor-pointer transition-all hover:brightness-110 text-background"
          style={{ background: "linear-gradient(135deg, #A855F7, #22D3EE)", fontWeight: 600 }}
        >
          SAVE CONFIG
        </button>
      </div>
    </div>
  );
}
