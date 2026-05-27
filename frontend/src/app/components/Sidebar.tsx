import React, { useEffect, useState } from 'react';
import { useTheme } from './ThemeContext';
import { 
  Activity, 
  Layers, 
  Settings, 
  Database, 
  ShieldAlert, 
  Moon, 
  Sun,
  LayoutDashboard,
  LogOut,
  Camera
} from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { useNavigate, NavLink } from 'react-router';
import clsx from 'clsx';
import { historyApi } from '../lib/api';
import { useScan } from '../context/scan-context';

export function Sidebar() {
  const { theme, toggleTheme } = useTheme();
  const { logout, user } = useAuth();
  const { scanVersion } = useScan();
  const navigate = useNavigate();
  const [unacknowledged, setUnacknowledged] = useState<number | undefined>(undefined);

  useEffect(() => {
    historyApi.getScans(100).then((scans) => {
      const count = scans.filter((s) => !s.acknowledged_at && s.anomaly_count > 0).length;
      setUnacknowledged(count > 0 ? count : undefined);
    }).catch(() => {});
  }, [scanVersion]);

  const clearanceLabel = user?.role ? user.role.toUpperCase() : 'OPERATOR';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className={clsx(
      "w-64 h-full flex flex-col justify-between py-6 px-4 shrink-0 transition-colors duration-300",
      "bg-sidebar backdrop-blur-md border-r border-sidebar-border"
    )}>
      <div>
        {/* Brand */}
        <div className="flex items-center gap-3 px-2 mb-10">
          <div className="w-8 h-8 rounded-[2px] bg-primary flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary-foreground" />
          </div>
          <h1 className="orbitron-brand text-2xl font-bold tracking-wider text-foreground m-0">
            AURALIS
          </h1>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-2">
          <NavItem to="/dashboard" icon={<LayoutDashboard size={18} />} label="Overview" />
          <NavItem to="/visual-inspection" icon={<Camera size={18} />} label="AI Visual Scanner" />
          <NavItem to="/telemetry" icon={<Database size={18} />} label="Expert Diagnostics" />
          <NavItem to="/logs" icon={<ShieldAlert size={18} />} label="Anomaly Logs" badge={unacknowledged} />
        </nav>
      </div>

      <div>
        {/* Theme Toggle & Settings */}
        <div className="flex flex-col gap-2 border-t border-sidebar-border pt-4">
          <button 
            onClick={toggleTheme}
            className="flex items-center justify-between w-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 rounded-[2px] transition-colors"
          >
            <div className="flex items-center gap-3">
              {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
              <span className="font-medium">Theme</span>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-wider opacity-60">
              {theme === 'dark' ? 'Obsidian' : 'Marble'}
            </span>
          </button>
          
          <NavItem to="/settings" icon={<Settings size={18} />} label="System Config" />
          
          <div className="mt-4 pt-4 border-t border-sidebar-border/50">
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-foreground">{user?.name || 'Operator'}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{clearanceLabel}</span>
              </div>
              <button 
                onClick={handleLogout}
                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-[2px] transition-colors"
                title="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ icon, label, to, badge }: { icon: React.ReactNode, label: string, to: string, badge?: number }) {
  return (
    <NavLink 
      to={to}
      className={({ isActive }) => clsx(
        "flex items-center justify-between w-full px-3 py-2 text-sm transition-all rounded-[2px]",
        isActive 
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold border-l-2 border-primary" 
          : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 border-l-2 border-transparent"
      )}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span>{label}</span>
      </div>
      {badge !== undefined && (
        <span className="px-1.5 py-0.5 text-[10px] font-mono bg-destructive text-destructive-foreground rounded-[2px]">
          {badge}
        </span>
      )}
    </NavLink>
  );
}