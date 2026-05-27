# Auralis — Structural Health Monitoring System

AI-powered structural defect detection platform. Upload images of concrete structures and get instant crack detection, EigenCAM heatmaps, severity classification, and engineering repair recommendations.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS v4, shadcn/ui |
| Backend | FastAPI, Python 3.11, Pydantic v2 |
| AI Model | YOLOv8 Segmentation (`Top_Performance.pt`) |
| Explainability | EigenCAM — SVD fusion of backbone layers 4 × 9 |
| Database | Supabase (PostgreSQL + Storage) |
| Auth | JWT (access 15 min + refresh 7 days), bcrypt |
| Deployment | Docker Compose, nginx reverse proxy |
| CI/CD | GitHub Actions (lint + pytest on every push) |

---

## Project Structure

```
├── Arualisssssss/          # React frontend
├── backend/                # FastAPI backend
│   ├── api/                # Route handlers (auth, analysis, history, model)
│   ├── core/               # Config, database, security
│   ├── models/             # Pydantic schemas
│   ├── services/           # Business logic (analyzer, auth)
│   └── tests/              # pytest test suite
├── mlops/                  # Model training, weights, notebooks
│   └── README.md           # Weight version history
├── docker-compose.yml      # Production deployment
├── Dockerfile.backend
├── Dockerfile.frontend
├── nginx.conf              # Reverse proxy + rate limiting
└── Top_Performance.pt      # Active model weights (production)
```

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node 18+
- A [Supabase](https://supabase.com) project

### 1. Database Setup

Run `backend/schema.sql` in your Supabase SQL editor. This creates:

- `users` — operator accounts
- `scans` — analysis records
- `login_events` — audit log
- `password_reset_tokens` — single-use reset tokens

Create a Storage bucket named `scans` and set it to **public**.

### 2. Backend

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Edit .env with your values

uvicorn main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### 3. Frontend

```bash
cd Arualisssssss
npm install
# Create .env with: VITE_API_URL=http://localhost:8000
npm run dev
```

App: http://localhost:5173

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET_KEY` | ✅ | Random secret for access tokens. Generate: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `JWT_REFRESH_SECRET_KEY` | ✅ | Separate secret for refresh tokens |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | — | Default: `15` |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | — | Default: `7` |
| `SUPABASE_URL` | ✅ | Supabase Dashboard → Project Settings → API |
| `SUPABASE_SERVICE_KEY` | ✅ | Service role key (not anon key) |
| `CORS_ORIGINS` | — | Comma-separated allowed origins |
| `APP_ENV` | — | `development` or `production` |
| `PRODUCTION_FRONTEND_URL` | production | Required when `APP_ENV=production` |
| `SMTP_HOST` | — | SMTP server for password reset emails |
| `SMTP_PORT` | — | Default: `587` |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASSWORD` | — | SMTP password |
| `SMTP_FROM` | — | Sender address |
| `FRONTEND_URL` | — | Used in reset email links. Default: `http://localhost:5173` |

### Frontend (`Arualisssssss/.env`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL. Default: `http://127.0.0.1:8000` |

---

## API Endpoints

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | — | Register new operator |
| POST | `/api/auth/login` | — | Login, returns access + refresh tokens |
| POST | `/api/auth/refresh` | — | Exchange refresh token for new token pair |
| GET | `/api/auth/me` | JWT | Get current user profile |
| POST | `/api/auth/password-reset/request` | — | Send password reset email |
| POST | `/api/auth/password-reset/confirm` | — | Set new password with reset token |

### Analysis
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/analysis/analyze` | JWT | Upload image, run YOLO inference, get heatmap + anomalies |

### History
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/history/scans` | JWT | List scans (paginated) |
| GET | `/api/history/scans/with-anomalies` | JWT | List scans with embedded anomaly data |
| GET | `/api/history/scans/{id}` | JWT | Get single scan detail |
| PATCH | `/api/history/scans/{id}/acknowledge` | JWT | Mark scan as acknowledged |

### Model
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/model/info` | — | Live model config (version, thresholds, backbone) |

### Health
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Server + database connectivity check |

---

## Production Deployment

```bash
export VITE_API_URL=https://your-domain.com
docker compose up -d --build
curl https://your-domain.com/health
```

For HTTPS setup, see `DEPLOYMENT.md`.

---

## Running Tests

```bash
cd backend
pip install -r requirements-ci.txt
pytest tests/ -v
```

CI runs automatically on every push via GitHub Actions (`.github/workflows/`).

---

## Model Weights

See `mlops/README.md` for model version history and performance notes.

The active production model is `Top_Performance.pt` in the project root.
