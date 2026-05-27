import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, setTokens, clearTokens, type UserResponse } from '../lib/api';

interface AuthContextType {
  user: UserResponse | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, role?: string, organization?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check both localStorage (remember me) and sessionStorage (session-only)
    const token = localStorage.getItem('auralis_token') ?? sessionStorage.getItem('auralis_token');
    if (!token) { setIsLoading(false); return; }

    authApi.me()
      .then((u) => {
        setUser(u);
        setIsAuthenticated(true);
      })
      .catch(() => {
        clearTokens();
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const { access_token, refresh_token } = await authApi.login(email, password);
    setTokens(access_token, refresh_token);
    const u = await authApi.me();
    setUser(u);
    setIsAuthenticated(true);
  };

  const signup = async (name: string, email: string, password: string, role = 'engineer', organization = '') => {
    const { access_token, refresh_token } = await authApi.signup(name, email, password, role, organization);
    setTokens(access_token, refresh_token);
    const u = await authApi.me();
    setUser(u);
    setIsAuthenticated(true);
  };

  const logout = () => {
    clearTokens();
    ['auralis_last_scan', 'auralis_last_scan_image', 'auralis_alert_prefs'].forEach(
      (k) => localStorage.removeItem(k)
    );
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
