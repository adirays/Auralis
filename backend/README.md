# Auralis Backend — FastAPI

## Setup

### 1. Create virtual environment
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Configure environment
```bash
copy .env.example .env
```
Edit `.env` and fill in:
- `JWT_SECRET_KEY` — any long random string
- `SUPABASE_URL` — from your Supabase project settings
- `SUPABASE_SERVICE_KEY` — service role key (not anon key)

### 4. Set up Supabase database
1. Go to your Supabase project → SQL Editor
2. Run the contents of `schema.sql`

### 5. Start the server
```bash
uvicorn main:app --reload --port 8000
```

API docs available at: http://localhost:8000/docs

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/signup | No | Register new user |
| POST | /api/auth/login | No | Login, get JWT |
| GET | /api/auth/me | JWT | Get current user |
| POST | /api/analysis/analyze | JWT | Upload image, get AI analysis |
| GET | /api/history/scans | JWT | List all scans |
| GET | /api/history/scans/{id} | JWT | Get single scan with anomalies |
| GET | /health | No | Health check |

---

## Analysis Pipeline

1. Image uploaded via multipart/form-data
2. OpenCV preprocessing: CLAHE → Gaussian blur
3. Canny edge detection (low=50, high=150)
4. Contour extraction + area filtering
5. Nearby contour merging
6. Severity classification by contour area ratio
7. JET colormap heatmap generation (blended onto original)
8. Results stored in Supabase `scans` table
9. Response returned with base64 heatmap PNG
