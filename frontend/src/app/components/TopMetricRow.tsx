import React, { useEffect, useState } from 'react';
import { Activity, Cpu, ShieldCheck, Zap } from 'lucide-react';
import clsx from 'clsx';
import { historyApi, healthApi } from '../lib/api';

export function TopMetricRow() {
  const [totalScans, setTotalScans]       = useState<string>('—');
  const [activeAlerts, setActiveAlerts]   = useState<string>('—');
  const [modelStatus, setModelStatus]     = useState<string>('—');
  const [integrity, setIntegrity]         = useState<string>('—');
  const [alertStatus, setAlertStatus]     = useState<'success' | 'alert' | 'normal'>('normal');
  const [integrityStatus, setIntegrityStatus] = useState<'success' | 'alert' | 'normal'>('normal');
  const [modelSubtext, setModelSubtext]   = useState<string>('Checking...');
  const [scanSubtext, setScanSubtext]     = useState<string>('All time');

  useEffect(() => {
    historyApi.getScans(200).then((scans) => {
      const total   = scans.length;
      const alerts  = scans.filter((s) => s.anomaly_count > 0).length;
      const critical = scans.filter((s) => s.severity === 'HIGH').length;

      setTotalScans(String(total));
      setScanSubtext(`${total} scan${total !== 1 ? 's' : ''} recorded`);
      setActiveAlerts(String(alerts));
      setAlertStatus(alerts > 0 ? 'alert' : 'success');

      if (critical === 0 && alerts === 0) {
        setIntegrity('NOMINAL');
        setIntegrityStatus('success');
      } else if (critical > 0) {
        setIntegrity('CRITICAL');
        setIntegrityStatus('alert');
      } else {
        setIntegrity('WARNING');
        setIntegrityStatus('normal');
      }
    }).catch(() => {
      setTotalScans('N/A');
      setActiveAlerts('N/A');
      setIntegrity('N/A');
    });

    healthApi.get().then((h) => {
      const online = h.status === 'ok';
      setModelStatus(online ? 'ONLINE' : 'DEGRADED');
      setModelSubtext(`DB: ${h.database} · v${h.version}`);
    }).catch(() => {
      setModelStatus('OFFLINE');
      setModelSubtext('Backend unreachable');
    });
  }, []);

  return (
    <div className="grid grid-cols-12 gap-2 w-full h-full">
      <MetricCard
        title="TOTAL SCANS"
        value={totalScans}
        subtext={scanSubtext}
        icon={<Activity className="text-success" size={20} />}
        status="success"
      />
      <MetricCard
        title="AI MODEL STATUS"
        value={modelStatus}
        subtext={modelSubtext}
        icon={<Cpu className="text-primary" size={20} />}
      />
      <MetricCard
        title="STRUCTURAL INTEGRITY"
        value={integrity}
        subtext={integrity === 'NOMINAL' ? 'No critical findings' : integrity === 'CRITICAL' ? 'Immediate action required' : integrity === 'WARNING' ? 'Anomalies detected' : '—'}
        icon={<ShieldCheck className={integrityStatus === 'alert' ? 'text-destructive' : 'text-success'} size={20} />}
        status={integrityStatus}
      />
      <MetricCard
        title="DETECTED ANOMALIES"
        value={activeAlerts}
        subtext={activeAlerts !== '—' && activeAlerts !== 'N/A' && parseInt(activeAlerts) > 0 ? 'Requires Audit' : 'No anomalies'}
        icon={<Zap className={alertStatus === 'alert' ? 'text-destructive' : 'text-success'} size={20} />}
        status={alertStatus}
      />
    </div>
  );
}

function MetricCard({ title, value, subtext, icon, status }: { title: string, value: string, subtext: string, icon: React.ReactNode, status?: 'success' | 'alert' | 'normal' }) {
  return (
    <div className={clsx(
      "col-span-12 sm:col-span-6 lg:col-span-3 bg-card border border-border rounded-[2px] p-4 flex flex-col justify-between shadow-card transition-colors duration-300",
      status === 'alert' && "border-destructive/30 bg-destructive/5"
    )}>
      <div className="flex justify-between items-center mb-4">
        <label className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold m-0 leading-none">
          {title}
        </label>
        {icon}
      </div>
      <div>
        <div className={clsx(
          "font-mono text-2xl font-bold tracking-tight mb-1",
          status === 'alert' ? "text-destructive" : status === 'success' ? "text-success" : "text-foreground"
        )}>
          {value}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground tracking-wider opacity-80 uppercase">
          {subtext}
        </div>
      </div>
    </div>
  );
}
