import { Outlet, NavLink, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard,
  Upload,
  BarChart3,
  History,
  Settings,
  Bell,
  Search,
  Menu,
  X,
  Terminal,
  Signal,
  LogOut,
} from "lucide-react";
import { useState, useEffect } from "react";
import logoImg from "../../imports/image.png";
import { useAuth } from "../context/auth-context";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "DASHBOARD", code: "01" },
  { to: "/upload", icon: Upload, label: "UPLOAD", code: "02" },
  { to: "/results", icon: BarChart3, label: "ANALYSIS", code: "03" },
  { to: "/history", icon: History, label: "HISTORY", code: "04" },
  { to: "/settings", icon: Settings, label: "SETTINGS", code: "05" },
];

function SystemClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="font-mono text-[0.7rem] text-muted-foreground tabular-nums">
      {time.toLocaleTimeString("en-US", { hour12: false })}
    </span>
  );
}

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Scanline overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-50 opacity-[0.015]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
        }}
      />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed z-40 h-full w-60 flex flex-col transition-transform duration-300 border-r border-border ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        style={{
          background: "rgba(10, 15, 28, 0.92)",
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
          <img src={logoImg} alt="Auralis" className="w-8 h-8 object-contain" />
          <div className="flex flex-col">
            <span
              className="text-[0.85rem] tracking-[0.2em] text-foreground"
              style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 700 }}
            >
              AURALIS
            </span>
            <span className="text-[0.55rem] tracking-[0.15em] text-muted-foreground uppercase">
              Structural Auditing AI
            </span>
          </div>
          <button
            className="ml-auto lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {navItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`group flex items-center gap-2.5 px-3 py-2 transition-all relative ${
                  active
                    ? "text-cyan"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {/* Active indicator */}
                {active && (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4"
                    style={{ background: "#22D3EE", boxShadow: "0 0 8px #22D3EE" }}
                  />
                )}
                <span className="font-mono text-[0.6rem] opacity-60">{item.code}</span>
                <item.icon className="w-4 h-4" />
                <span className="text-[0.75rem] tracking-wider">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* System status footer */}
        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-center gap-2 mb-2">
            <Signal className="w-3 h-3 text-cyan" />
            <span className="font-mono text-[0.65rem] text-cyan">SYSTEM ONLINE</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[0.6rem] text-muted-foreground">NODE_STATUS</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5"
                  style={{
                    background: i <= 3 ? "#22D3EE" : "rgba(255,255,255,0.1)",
                    boxShadow: i <= 3 ? "0 0 4px #22D3EE" : "none",
                  }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="font-mono text-[0.6rem] text-muted-foreground">UPTIME</span>
            <span className="font-mono text-[0.6rem] text-foreground/80">47d 13h 22m</span>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 ml-0 lg:ml-60">
        {/* Top bar */}
        <header
          className="sticky top-0 z-30 h-12 border-b border-border flex items-center justify-between px-4 lg:px-5"
          style={{
            background: "rgba(10, 15, 28, 0.8)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden text-muted-foreground hover:text-foreground"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Breadcrumb */}
            <div className="hidden sm:flex items-center gap-2 font-mono text-[0.7rem]">
              <Terminal className="w-3 h-3 text-purple" />
              <span className="text-muted-foreground">auralis://</span>
              <span className="text-cyan">
                {location.pathname === "/" ? "home" : location.pathname.slice(1)}
              </span>
            </div>

            {/* Search */}
            <div className="hidden md:flex items-center gap-2 border border-border px-2.5 py-1.5 ml-4" style={{ background: "rgba(255,255,255,0.02)" }}>
              <Search className="w-3 h-3 text-muted-foreground" />
              <input
                placeholder="Search assets..."
                className="bg-transparent border-none outline-none text-[0.75rem] text-foreground placeholder:text-muted-foreground/60 w-40"
              />
              <span className="font-mono text-[0.55rem] text-muted-foreground/60 border border-border px-1">
                /
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <SystemClock />

            {/* Notification */}
            <button className="relative p-1.5 hover:bg-secondary transition-colors cursor-pointer">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <span
                className="absolute top-0.5 right-0.5 w-1.5 h-1.5"
                style={{ background: "#EF4444", boxShadow: "0 0 6px #EF4444" }}
              />
            </button>

            {/* Divider */}
            <div className="w-px h-5 bg-border" />

            {/* User */}
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 flex items-center justify-center text-[0.65rem] font-mono text-cyan border border-cyan/30"
                style={{ background: "rgba(34,211,238,0.05)" }}
              >
                {user?.name?.slice(0, 2).toUpperCase() || "OP"}
              </div>
              <div className="hidden sm:block">
                <p className="text-[0.7rem] text-foreground">{user?.name || "Operator"}</p>
                <p className="font-mono text-[0.55rem] text-muted-foreground">LVL-3 CLEARANCE</p>
              </div>
              <button
                onClick={handleLogout}
                className="ml-2 p-1.5 hover:bg-secondary transition-colors text-muted-foreground hover:text-purple group"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-5">
          <Outlet />
        </main>

        {/* Bottom status bar */}
        <div className="h-6 border-t border-border flex items-center px-4 gap-6" style={{ background: "rgba(10,15,28,0.9)" }}>
          <span className="font-mono text-[0.55rem] text-muted-foreground">
            AURALIS v2.4.1
          </span>
          <span className="font-mono text-[0.55rem] text-muted-foreground">
            MODEL: ResNet-152 + Grad-CAM
          </span>
          <span className="font-mono text-[0.55rem] text-cyan flex items-center gap-1">
            <span className="w-1 h-1 bg-cyan inline-block" style={{ boxShadow: "0 0 4px #22D3EE" }} />
            CONNECTED
          </span>
          <span className="font-mono text-[0.55rem] text-muted-foreground ml-auto">
            GPU: 72% | MEM: 14.2GB / 24GB
          </span>
        </div>
      </div>
    </div>
  );
}