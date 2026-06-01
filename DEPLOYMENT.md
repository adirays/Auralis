# Auralis — Production Deployment Guide

## Prerequisites
- Docker + Docker Compose v2
- A domain name pointing to your server
- Supabase project with `scans` storage bucket (public read)

---

## 1. Supabase Setup

### Run schema migrations
In Supabase SQL editor, run `backend/schema.sql`.

If upgrading from an older schema, also run:
```sql
alter table public.scans add column if not exists heatmap_url text;
alter table public.scans add column if not exists model_version text not null default '';
```

### Create Storage bucket
1. Supabase Dashboard → Storage → New bucket
2. Name: `scans`
3. Public: ✅ (so image URLs are accessible without auth)

---

## 2. Environment Variables

Copy and fill in:
```bash
cp backend/.env.example backend/.env
```

Required for production:
```
APP_ENV=production
JWT_SECRET_KEY=<generate: python -c "import secrets; print(secrets.token_hex(32))">
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_KEY=<service-role-key>
PRODUCTION_FRONTEND_URL=https://your-domain.com
```

Frontend:
```bash
# Edit Arualisssssss/.env.production
VITE_API_URL=https://your-domain.com
```

---

## 3. Build & Deploy

```bash
# Build and start all services
VITE_API_URL=https://your-domain.com docker compose up -d --build

# Check health
curl https://your-domain.com/health
```

---

## 4. HTTPS (Let's Encrypt)

```bash
# Install certbot
apt install certbot

# Obtain certificate (stop nginx first)
docker compose stop nginx
certbot certonly --standalone -d your-domain.com

# Uncomment the HTTPS server block in nginx.conf
# Then restart
docker compose start nginx
```

---

## 5. Run Tests

```bash
cd backend
pip install -r requirements.txt
pytest tests/ -v
```

---

## 6. Rate Limiting

The in-memory rate limiter (5 req/60s per IP) is a per-process guard only.
For multi-worker production deployments, nginx handles rate limiting at the
proxy layer (configured in `nginx.conf`: 10 req/s, burst 20).

---

## 7. Monitoring

Check structured JSON logs:
```bash
docker compose logs backend --follow
```

Each log line includes `request_id`, `user_id`, `scan_id`, and `processing_time_ms`.
