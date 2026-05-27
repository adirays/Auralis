import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router";
import { Eye, EyeOff, Terminal, Shield, Lock } from "lucide-react";
import { useAuth } from "../../context/auth-context";
import { healthApi, authApi } from "../../lib/api";

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [rememberMe, setRememberMe] = useState(() =>
    localStorage.getItem('auralis_remember_me') === 'true'
  );

  const { login } = useAuth();
  const navigate = useNavigate();
  const [apiVersion, setApiVersion] = useState<string>('—');
  const [apiOnline, setApiOnline]   = useState<boolean | null>(null);

  useEffect(() => {
    healthApi.get()
      .then((h) => { setApiOnline(h.status === 'ok'); setApiVersion(h.version); })
      .catch(() => setApiOnline(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      localStorage.setItem('auralis_remember_me', rememberMe ? 'true' : 'false');
      if (!rememberMe) {
        // Without remember-me, clear tokens when the tab closes
        const token = localStorage.getItem('auralis_token');
        const refresh = localStorage.getItem('auralis_refresh_token');
        if (token)   sessionStorage.setItem('auralis_token', token);
        if (refresh) sessionStorage.setItem('auralis_refresh_token', refresh);
        localStorage.removeItem('auralis_token');
        localStorage.removeItem('auralis_refresh_token');
      }
      navigate("/dashboard");
    } catch (err: any) {
      const raw: string = err?.message ?? 'Authentication failed';
      const isNetworkMsg = raw.toLowerCase().includes('not reachable') ||
                           raw.toLowerCase().includes('backend') ||
                           raw.toLowerCase().includes('session expired');
      setError(isNetworkMsg ? raw : raw.toUpperCase());
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    try {
      await authApi.requestPasswordReset(resetEmail);
    } catch {
      // Always show success — never reveal whether email exists
    } finally {
      setResetLoading(false);
      setResetSent(true);
    }
  };

  const closeReset = () => {
    setShowReset(false);
    setResetSent(false);
    setResetEmail("");
  };

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden flex items-center justify-center">
      {/* Cyber Grid Background */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(168, 85, 247, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(168, 85, 247, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px'
        }} />
      </div>

      {/* Accent Glow Elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-400/10 rounded-full blur-3xl" />

      {/* Password Reset Modal */}
      {showReset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(3,7,18,0.85)', backdropFilter: 'blur(8px)' }}
        >
          <div className="w-full max-w-sm mx-4 border border-slate-700 bg-slate-900 p-6">
            <h2 className="font-['JetBrains_Mono'] text-sm text-white mb-4 tracking-wider">
              RESET PASSWORD
            </h2>
            {resetSent ? (
              <p className="font-['JetBrains_Mono'] text-xs text-cyan-400 leading-relaxed">
                If that email is registered, a reset link has been sent. Check your inbox.
              </p>
            ) : (
              <form onSubmit={handleReset} className="space-y-4">
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="w-full bg-slate-950 border border-slate-700 px-4 py-2 text-white font-['JetBrains_Mono'] text-sm focus:outline-none focus:border-purple-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full bg-gradient-to-r from-purple-500 to-cyan-400 text-white font-['Inter'] font-bold py-2 disabled:opacity-50"
                >
                  {resetLoading ? 'SENDING...' : 'SEND RESET LINK'}
                </button>
              </form>
            )}
            <button
              onClick={closeReset}
              className="mt-4 font-['JetBrains_Mono'] text-xs text-slate-400 hover:text-slate-300 transition-colors"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {/* Login Container */}
      <div className="relative z-10 w-full max-w-md px-4">
        {/* AURALIS Logo */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 border border-purple-500 relative">
              <div className="absolute inset-1 border border-cyan-400" />
              <div className="absolute inset-2 bg-gradient-to-br from-purple-500/20 to-cyan-400/20" />
              <Terminal className="absolute inset-0 m-auto w-6 h-6 text-purple-500" />
            </div>
            <h1 className="font-['Orbitron'] text-4xl font-bold text-white tracking-wider">
              AURALIS
            </h1>
          </div>
          <p className="font-['JetBrains_Mono'] text-sm text-slate-400 tracking-wide">
            STRUCTURAL HEALTH MONITORING SYSTEM
          </p>
          <div className="mt-2 flex items-center justify-center gap-2 text-xs font-['JetBrains_Mono'] text-cyan-400">
            <Shield className="w-3 h-3" />
            <span>SECURE ACCESS REQUIRED</span>
          </div>
        </div>

        {/* Login Panel */}
        <div className="border border-slate-700 bg-slate-900/50 backdrop-blur-xl p-8">
          {/* Terminal Header */}
          <div className="border-b border-slate-700 pb-4 mb-6">
            <div className="flex items-center gap-2 font-['JetBrains_Mono'] text-xs text-slate-400">
              <div className="w-3 h-3 border border-purple-500" />
              <span>AUTHENTICATION PROTOCOL</span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 border border-red-500/50 bg-red-500/10 px-4 py-3">
              <p className="font-['JetBrains_Mono'] text-xs text-red-400">
                ERROR: {error}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Input */}
            <div>
              <label className="block font-['Inter'] font-bold text-xs text-slate-300 mb-2 tracking-wide">
                EMAIL ADDRESS
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 px-4 py-3 text-white font-['JetBrains_Mono'] text-sm focus:outline-none focus:border-purple-500 transition-colors"
                  placeholder="user@domain.com"
                  required
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 bg-cyan-400 opacity-50" />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block font-['Inter'] font-bold text-xs text-slate-300 mb-2 tracking-wide">
                PASSWORD
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 px-4 py-3 text-white font-['JetBrains_Mono'] text-sm focus:outline-none focus:border-purple-500 transition-colors pr-12"
                  placeholder="••••••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-purple-500 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between text-xs font-['JetBrains_Mono']">
              <label className="flex items-center gap-2 text-slate-400 cursor-pointer hover:text-slate-300 transition-colors">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 bg-slate-950 border border-slate-700 checked:bg-purple-500 checked:border-purple-500 focus:outline-none focus:ring-0"
                />
                <span>REMEMBER_ME</span>
              </label>
              <button
                type="button"
                onClick={() => setShowReset(true)}
                className="text-cyan-400 hover:text-cyan-300 transition-colors bg-transparent border-none font-['JetBrains_Mono'] text-xs cursor-pointer"
              >
                RESET_PASSWORD
              </button>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-500 to-cyan-400 text-white font-['Inter'] font-bold py-3 px-6 hover:from-purple-600 hover:to-cyan-500 transition-all duration-300 relative group overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors" />
              <div className="relative flex items-center justify-center gap-2">
                <Lock className="w-4 h-4" />
                <span className="tracking-wider">
                  {loading ? "AUTHENTICATING..." : "AUTHENTICATE"}
                </span>
              </div>
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 pt-6 border-t border-slate-700">
            <p className="text-center text-xs font-['JetBrains_Mono'] text-slate-400 mb-3">
              DON'T HAVE AN ACCOUNT?{" "}
              <Link to="/signup" className="text-cyan-400 hover:text-cyan-300 transition-colors">
                CREATE_ONE_HERE
              </Link>
            </p>
            <p className="text-center text-xs font-['JetBrains_Mono'] text-slate-500">
              AURALIS STRUCTURAL HEALTH MONITORING
            </p>
          </div>
        </div>

        {/* Status Bar */}
        <div className="mt-4 border border-slate-700 bg-slate-900/30 backdrop-blur-sm px-4 py-2">
          <div className="flex items-center justify-between font-['JetBrains_Mono'] text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span>STATUS: <span className="text-cyan-400">{apiOnline === null ? 'CHECKING' : apiOnline ? 'READY' : 'OFFLINE'}</span></span>
              <span>VER: <span className="text-purple-500">{apiVersion !== '—' ? apiVersion : '—'}</span></span>
            </div>
            <div className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 animate-pulse ${apiOnline === false ? 'bg-red-400' : 'bg-cyan-400'}`} />
              <span>{apiOnline === null ? 'CHECKING' : apiOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
