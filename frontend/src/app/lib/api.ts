const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');

const TOKEN_KEY   = 'auralis_token';
const REFRESH_KEY = 'auralis_refresh_token';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY) ?? sessionStorage.getItem(REFRESH_KEY);
}

function setTokens(access: string, refresh: string) {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}

function handleUnauthorized(): never {
  clearTokens();
  window.location.href = '/login';
  throw new Error('Session expired. Please log in again.');
}

function networkError(url: string, err: unknown): Error {
  console.error('[API] Network error —', url, err);
  return new Error('Backend not reachable. Make sure the server is running on ' + BASE_URL);
}

// Tracks an in-flight refresh to avoid parallel refresh races
let _refreshPromise: Promise<string> | null = null;

async function _doRefresh(): Promise<string> {
  const rt = getRefreshToken();
  if (!rt) throw new Error('no refresh token');

  const url = `${BASE_URL}/api/auth/refresh`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: rt }),
  });

  if (!res.ok) {
    clearTokens();
    throw new Error('refresh failed');
  }

  const data: TokenResponse = await res.json();
  setTokens(data.access_token, data.refresh_token);
  return data.access_token;
}

async function _refreshOnce(): Promise<string> {
  if (!_refreshPromise) {
    _refreshPromise = _doRefresh().finally(() => { _refreshPromise = null; });
  }
  return _refreshPromise;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  _retry = true,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = `${BASE_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err) {
    throw networkError(url, err);
  }

  // Auto-refresh on 401 — attempt once, then give up
  if (res.status === 401 && _retry && getRefreshToken()) {
    try {
      const newToken = await _refreshOnce();
      return request<T>(path, options, false);
    } catch {
      handleUnauthorized();
    }
  }

  if (res.status === 401) {
    handleUnauthorized();
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {}
    console.error('[API] Error response —', options.method ?? 'GET', url, res.status, detail);
    throw new Error(detail);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as unknown as T;

  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  organization: string;
}

export const authApi = {
  login: (email: string, password: string) =>
    request<TokenResponse>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),

  signup: (name: string, email: string, password: string, role = 'engineer', organization = '') =>
    request<TokenResponse>('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role, organization }),
    }),

  refresh: (refresh_token: string) =>
    request<TokenResponse>('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    }),

  me: () => request<UserResponse>('/api/auth/me'),

  requestPasswordReset: (email: string) =>
    request<void>('/api/auth/password-reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }),

  confirmPasswordReset: (token: string, new_password: string) =>
    request<void>('/api/auth/password-reset/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password }),
    }),
};

export { setTokens, clearTokens };

// ── Analysis ──────────────────────────────────────────────────────────────────

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ApiAnomaly {
  id: string;
  label: string;
  confidence: number;
  bbox: BoundingBox;
  severity: 'critical' | 'warning' | 'low';
  xai_explanation?: string;
  physics_analysis?: string;
  repair_recommendation?: string;
  layer4_contribution?: number;
  layer9_contribution?: number;
}

export interface AnalysisResponse {
  scan_id: string;
  anomalies: ApiAnomaly[];
  heatmap_b64: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'NONE';
  diagnostics: string;
  processing_time_ms: number;
  location: string;
  model_version: string;
  image_url: string | null;
  heatmap_url: string | null;
}

export const analysisApi = {
  analyze: (file: File, location?: string): Promise<AnalysisResponse> => {
    const form = new FormData();
    form.append('file', file);
    if (location) form.append('location', location);
    const token = getToken();
    const url = `${BASE_URL}/api/analysis/analyze`;
    return fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then(async (res) => {
      if (res.status === 401) handleUnauthorized();
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          detail = body.detail ?? detail;
        } catch {}
        throw new Error(detail);
      }
      return res.json();
    }).catch((err) => {
      if (err instanceof Error && err.message.startsWith('HTTP')) throw err;
      throw networkError(url, err);
    });
  },
};

// ── History ───────────────────────────────────────────────────────────────────

export interface ScanRecord {
  id: string;
  user_id: string;
  timestamp: string;
  location: string;
  severity: string;
  anomaly_count: number;
  processing_time_ms: number;
  image_url: string | null;
  heatmap_url: string | null;
  model_version: string;
  diagnostics: string;
  acknowledged_at: string | null;
}

export type ScanRecordWithAnomalies = ScanRecord & { anomalies: ApiAnomaly[] };

// ── Health ───────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  version: string;
  database: string;
  env: string;
}

export const healthApi = {
  get: () => request<HealthResponse>('/api/health'),
};

// ── Model ─────────────────────────────────────────────────────────────────────

export interface ModelInfo {
  model_version: string;
  confidence_threshold: number;
  critical_area_ratio: number;
  warning_area_ratio: number;
  backbone: string;
  explainability: string;
  task: string;
}

export const modelApi = {
  getInfo: () => request<ModelInfo>('/api/model/info'),
};

export const historyApi = {
  getScans: (limit = 50, offset = 0) =>
    request<ScanRecord[]>(`/api/history/scans?limit=${limit}&offset=${offset}`),

  getScansWithAnomalies: (limit = 20, offset = 0) =>
    request<ScanRecordWithAnomalies[]>(
      `/api/history/scans/with-anomalies?limit=${limit}&offset=${offset}`
    ),

  getScan: (id: string) =>
    request<ScanRecordWithAnomalies>(`/api/history/scans/${id}`),

  acknowledge: (scanId: string) =>
    request<{ success: boolean; acknowledged_at: string }>(
      `/api/history/scans/${scanId}/acknowledge`,
      { method: 'PATCH' }
    ),
};
