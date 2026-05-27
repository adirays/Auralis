import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { Eye, EyeOff, Terminal, Lock, ShieldCheck } from "lucide-react";
import { authApi } from "../../lib/api";

const RULES = [
  { label: "Min 8 characters",       test: (p: string) => p.length >= 8 },
  { label: "Uppercase letter",        test: (p: string) => /[A-Z]/.test(p) },
  { label: "Number",                  test: (p: string) => /[0-9]/.test(p) },
  { label: "Special character",       test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function validate(password: string, confirm: string): string {
  for (const rule of RULES) {
    if (!rule.test(password)) return `PASSWORD MUST CONTAIN: ${rule.label.toUpperCase()}`;
  }
  if (password !== confirm) return "PASSWORDS DO NOT MATCH";
  return "";
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword]         = useState("");
  const [confirm, setConfirm]           = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [success, setSuccess]           = useState(false);

  // Redirect to login if no token in URL
  useEffect(() => {
    if (!token) navigate("/login", { replace: true });
  }, [token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate(password, confirm);
    if (validationError) { setError(validationError); return; }

    setError("");
    setLoading(true);
    try {
      await authApi.confirmPasswordReset(token, password);
      setSuccess(true);
      setTimeout(() => navigate("/login", { replace: true }), 3000);
    } catch (err: any) {
      const msg: string = err?.message ?? "Reset failed.";
      // Surface token-specific errors clearly
      if (msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("invalid")) {
        setError("RESET LINK INVALID OR EXPIRED. REQUEST A NEW ONE.");
      } else {
        setError(msg.toUpperCase());
      }
    } finally {
      setLoading(false);
    }
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
          backgroundSize: "50px 50px",
        }} />
      </div>

      {/* Accent Glow Elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-400/10 rounded-full blur-3xl" />

      <div className="relative z-10 w-full max-w-md px-4">
        {/* Logo */}
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
        </div>

        {/* Panel */}
        <div className="border border-slate-700 bg-slate-900/50 backdrop-blur-xl p-8">
          {/* Header */}
          <div className="border-b border-slate-700 pb-4 mb-6">
            <div className="flex items-center gap-2 font-['JetBrains_Mono'] text-xs text-slate-400">
              <div className="w-3 h-3 border border-purple-500" />
              <span>SET NEW SECURITY KEY</span>
            </div>
          </div>

          {success ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <ShieldCheck className="w-12 h-12 text-cyan-400" />
              </div>
              <p className="font-['JetBrains_Mono'] text-sm text-cyan-400 tracking-wide">
                PASSWORD UPDATED SUCCESSFULLY
              </p>
              <p className="font-['JetBrains_Mono'] text-xs text-slate-400">
                Redirecting to login...
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 border border-red-500/50 bg-red-500/10 px-4 py-3">
                  <p className="font-['JetBrains_Mono'] text-xs text-red-400">
                    ERROR: {error}
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* New password */}
                <div>
                  <label className="block font-['Inter'] font-bold text-xs text-slate-300 mb-2 tracking-wide">
                    NEW PASSWORD
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

                {/* Confirm password */}
                <div>
                  <label className="block font-['Inter'] font-bold text-xs text-slate-300 mb-2 tracking-wide">
                    CONFIRM PASSWORD
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 px-4 py-3 text-white font-['JetBrains_Mono'] text-sm focus:outline-none focus:border-purple-500 transition-colors pr-12"
                      placeholder="••••••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-purple-500 transition-colors"
                    >
                      {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Password strength indicators */}
                <div className="grid grid-cols-2 gap-1.5">
                  {RULES.map((rule) => {
                    const passed = rule.test(password);
                    return (
                      <div key={rule.label} className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full transition-colors ${passed ? "bg-cyan-400" : "bg-slate-600"}`} />
                        <span className={`font-['JetBrains_Mono'] text-[10px] transition-colors ${passed ? "text-cyan-400" : "text-slate-500"}`}>
                          {rule.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-purple-500 to-cyan-400 text-white font-['Inter'] font-bold py-3 px-6 hover:from-purple-600 hover:to-cyan-500 transition-all duration-300 relative group overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors" />
                  <div className="relative flex items-center justify-center gap-2">
                    <Lock className="w-4 h-4" />
                    <span className="tracking-wider">
                      {loading ? "UPDATING..." : "SET NEW PASSWORD"}
                    </span>
                  </div>
                </button>
              </form>
            </>
          )}

          {/* Footer */}
          <div className="mt-6 pt-6 border-t border-slate-700">
            <p className="text-center text-xs font-['JetBrains_Mono'] text-slate-400">
              REMEMBERED YOUR PASSWORD?{" "}
              <Link to="/login" className="text-cyan-400 hover:text-cyan-300 transition-colors">
                BACK_TO_LOGIN
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
