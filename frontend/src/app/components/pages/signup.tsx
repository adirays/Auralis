import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router";
import { ShieldCheck, User, Mail, Lock, Building, HardHat, FileBadge, Activity, Check, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../../context/auth-context";
import { healthApi } from "../../lib/api";
import clsx from "clsx";

const PASSWORD_RULES = [
  { label: "Min 8 characters",  test: (p: string) => p.length >= 8 },
  { label: "Uppercase letter",   test: (p: string) => /[A-Z]/.test(p) },
  { label: "Number",             test: (p: string) => /[0-9]/.test(p) },
  { label: "Special character",  test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // CE fields
  const [role, setRole] = useState("");
  const [license, setLicense] = useState("");
  const [organization, setOrganization] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  useEffect(() => {
    healthApi.get()
      .then((h) => setApiOnline(h.status === 'ok'))
      .catch(() => setApiOnline(false));
  }, []);
  
  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("SECURITY KEY MISMATCH");
      return;
    }

    const failedRule = PASSWORD_RULES.find((r) => !r.test(password));
    if (failedRule) {
      setError(`SECURITY KEY INSUFFICIENT: ${failedRule.label.toUpperCase()}`);
      return;
    }
    
    if (!acceptedTerms) {
      setError("COMPLIANCE ACKNOWLEDGMENT REQUIRED");
      return;
    }

    setLoading(true);
    try {
      // Map job role to backend role enum; store license in organization field
      const backendRole = 'engineer';
      const orgWithLicense = license ? `${organization} [${license}]` : organization;
      await signup(name, email, password, backendRole, orgWithLicense);
      navigate("/dashboard");
    } catch (err: any) {
      const msg = err?.message ?? "REGISTRATION FAILED. CHECK SYSTEM LOGS.";
      setError(msg.toUpperCase());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex transition-colors duration-300">
      
      {/* Left Column: Data viz / Architectural abstraction (Hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 p-2 flex-col gap-2 relative border-r border-border bg-sidebar shrink-0">
         <div className="flex-1 border border-border bg-card p-8 flex flex-col justify-between rounded-[2px] shadow-card relative overflow-hidden">
           
           {/* Abstract grid pattern background for the card */}
           <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
             backgroundImage: 'linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)',
             backgroundSize: '24px 24px'
           }} />

           <div className="relative z-10">
             <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-[2px] bg-primary flex items-center justify-center shadow-md">
                  <Activity className="w-6 h-6 text-primary-foreground" />
                </div>
                <h1 className="orbitron-brand text-3xl font-bold tracking-widest m-0">
                  AURALIS
                </h1>
              </div>
              <h2 className="text-3xl font-bold mb-4 tracking-tight leading-tight max-w-md">
                ENGINEERING TELEMETRY PORTAL
              </h2>
              <div className="h-[2px] w-12 bg-primary mb-6" />
              <p className="text-muted-foreground max-w-md font-mono text-sm leading-relaxed uppercase opacity-80">
                Secure access restricted to authorized civil engineering officials, structural inspectors, and compliance auditors.
              </p>
           </div>
           
           <div className="grid grid-cols-2 gap-3 relative z-10 mt-12">
             <div className="border border-border p-5 bg-background/50 backdrop-blur-sm rounded-[2px]">
               <Activity className="text-primary mb-3" size={24} />
               <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Module Active</div>
               <div className="font-mono text-sm font-bold">Grad-CAM Stress Heatmaps</div>
             </div>
             <div className="border border-border p-5 bg-background/50 backdrop-blur-sm rounded-[2px]">
               <ShieldCheck className="text-success mb-3" size={24} />
               <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Compliance Standard</div>
               <div className="font-mono text-sm font-bold">ISO 9001 / EN 1992</div>
             </div>
             <div className="border border-border p-5 bg-background/50 backdrop-blur-sm rounded-[2px] col-span-2 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Node Connectivity</div>
                  <div className={`font-mono text-sm font-bold ${
                    apiOnline === null ? 'text-muted-foreground' :
                    apiOnline ? 'text-success' : 'text-destructive'
                  }`}>
                    {apiOnline === null ? 'CHECKING...' : apiOnline ? 'ONLINE' : 'OFFLINE'}
                  </div>
                </div>
                <div className="w-24 h-6 flex items-end gap-[2px]">
                   {[40, 70, 30, 90, 55, 80, 45, 95, 60, 100, 75, 85].map((h, i) => (
                     <div
                       key={i}
                       className="flex-1 bg-primary/40 rounded-t-[1px] animate-pulse"
                       style={{ height: `${h}%`, animationDelay: `${i * 100}ms`, animationDuration: '2s' }}
                     />
                   ))}
                </div>
             </div>
           </div>
         </div>
      </div>
      
      {/* Right Column: Registration Form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 overflow-y-auto">
        <div className="w-full max-w-[480px]">
          
          <div className="mb-10 lg:hidden flex items-center gap-3">
             <div className="w-8 h-8 rounded-[2px] bg-primary flex items-center justify-center">
                <Activity className="w-5 h-5 text-primary-foreground" />
             </div>
             <h1 className="orbitron-brand text-2xl font-bold tracking-wider m-0">
                AURALIS
             </h1>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">OFFICIAL REGISTRATION</h2>
            <p className="text-muted-foreground text-xs sm:text-sm font-mono uppercase tracking-widest">Operator credentials provisioning</p>
          </div>

          {error && (
            <div className="mb-6 p-4 border border-destructive/30 bg-destructive/5 text-destructive font-mono text-xs rounded-[2px] flex items-center gap-3 shadow-sm">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            
            {/* Split for Name & Role */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-input-background border border-input rounded-[2px] py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-colors font-mono shadow-sm placeholder:text-muted-foreground/50"
                    placeholder="Jane Doe"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Job Role</label>
                <div className="relative">
                  <HardHat className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                  <select
                    required
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className={clsx(
                      "w-full bg-input-background border border-input rounded-[2px] py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-colors font-mono appearance-none shadow-sm",
                      role ? "text-foreground" : "text-muted-foreground/50"
                    )}
                  >
                    <option value="" disabled>Select Role...</option>
                    <option value="Lead Structural Engineer">Lead Structural Engineer</option>
                    <option value="Geotechnical Specialist">Geotechnical Specialist</option>
                    <option value="Site Inspector">Site Inspector</option>
                    <option value="Compliance Auditor">Compliance Auditor</option>
                    <option value="Operations Manager">Operations Manager</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Split for Org & License */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Organization</label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                  <input
                    type="text"
                    required
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    className="w-full bg-input-background border border-input rounded-[2px] py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-colors font-mono shadow-sm placeholder:text-muted-foreground/50"
                    placeholder="Dept of Transportation"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">P.E. License / ID</label>
                <div className="relative">
                  <FileBadge className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                  <input
                    type="text"
                    required
                    value={license}
                    onChange={(e) => setLicense(e.target.value)}
                    className="w-full bg-input-background border border-input rounded-[2px] py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-colors font-mono uppercase shadow-sm placeholder:text-muted-foreground/50"
                    placeholder="PE-123456"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Official Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-input-background border border-input rounded-[2px] py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-colors font-mono shadow-sm placeholder:text-muted-foreground/50"
                  placeholder="name@agency.gov"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Security Key</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-input-background border border-input rounded-[2px] py-2.5 pl-9 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-colors font-mono tracking-widest shadow-sm placeholder:text-muted-foreground/50 placeholder:tracking-normal"
                    placeholder="Min 8 chars"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {/* Real-time strength indicators — only shown once user starts typing */}
                {password.length > 0 && (
                  <div className="grid grid-cols-2 gap-1 pt-1">
                    {PASSWORD_RULES.map((rule) => {
                      const passed = rule.test(password);
                      return (
                        <div key={rule.label} className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full transition-colors ${passed ? 'bg-success' : 'bg-muted-foreground/30'}`} />
                          <span className={`text-[10px] font-mono transition-colors ${passed ? 'text-success' : 'text-muted-foreground/50'}`}>
                            {rule.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Confirm Key</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-input-background border border-input rounded-[2px] py-2.5 pl-9 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-colors font-mono tracking-widest shadow-sm placeholder:text-muted-foreground/50 placeholder:tracking-normal"
                    placeholder="Verify key"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-4 pb-2">
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center mt-0.5">
                  <input 
                    type="checkbox" 
                    className="peer sr-only"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                  />
                  <div className="w-4 h-4 border border-input rounded-[2px] peer-checked:bg-primary peer-checked:border-primary transition-colors bg-input-background flex items-center justify-center shadow-sm group-hover:border-primary/50">
                    <Check className="w-3 h-3 text-primary-foreground opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                  </div>
                </div>
                <span className="text-xs font-mono text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">
                  I acknowledge my responsibility in accessing structural health telemetry data and comply with ISO 9001 and local engineering standards.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground font-bold text-sm tracking-widest uppercase py-3.5 rounded-[2px] hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-4 shadow-sm"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  <span>PROVISIONING...</span>
                </>
              ) : (
                <span>REQUEST AUTHORIZATION</span>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-border text-center">
             <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
               ALREADY HAVE CREDENTIALS?{" "}
               <Link to="/login" className="text-primary hover:text-primary/80 transition-colors font-bold underline underline-offset-4 ml-2">
                 ACCESS PORTAL
               </Link>
             </p>
          </div>
          
        </div>
      </div>
    </div>
  );
}
