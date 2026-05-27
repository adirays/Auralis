-- ============================================================
-- Auralis Structural Health Monitoring — Supabase Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Users table (stores hashed passwords, NOT Supabase Auth)
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  name          text not null,
  password_hash text not null,
  role          text not null default 'engineer',   -- engineer | admin | viewer
  organization  text not null default '',
  created_at    timestamptz default now()
);

-- Scans table
create table if not exists public.scans (
  id                 text primary key,
  user_id            uuid not null references public.users(id) on delete cascade,
  location           text not null default '',
  severity           text not null default 'NONE',  -- NONE | LOW | MEDIUM | HIGH
  anomaly_count      integer not null default 0,
  processing_time_ms integer not null default 0,
  image_url          text,
  heatmap_url        text,
  model_version      text not null default '',
  diagnostics        text,
  anomalies_json     text default '[]',
  acknowledged_at    timestamptz,
  created_at         timestamptz default now()
);

-- Migration: add columns if upgrading from old schema
-- alter table public.scans add column if not exists heatmap_url text;
-- alter table public.scans add column if not exists model_version text not null default '';
alter table public.scans add column if not exists acknowledged_at timestamptz;

-- Indexes
create index if not exists scans_user_id_idx on public.scans(user_id);
create index if not exists scans_created_at_idx on public.scans(created_at desc);

-- Row Level Security
alter table public.users enable row level security;
alter table public.scans enable row level security;

-- Service role bypasses RLS — no extra policies needed when using service key

-- If you already ran the old schema, run this to add the new columns:
-- alter table public.users add column if not exists role text not null default 'engineer';
-- alter table public.users add column if not exists organization text not null default '';

-- Login events table (append-only audit log)
create table if not exists public.login_events (
  id         bigserial primary key,
  user_id    uuid        not null references public.users(id) on delete cascade,
  email      text        not null,
  event      text        not null default 'login',  -- login | signup | logout
  success    boolean     not null default true,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists login_events_user_id_idx  on public.login_events(user_id);
create index if not exists login_events_created_at_idx on public.login_events(created_at desc);
create index if not exists login_events_email_idx    on public.login_events(email);

alter table public.login_events enable row level security;
-- Service role bypasses RLS — no extra policies needed

-- Password reset tokens (single-use, 1-hour TTL)
create table if not exists public.password_reset_tokens (
  id         bigserial primary key,
  user_id    uuid        not null references public.users(id) on delete cascade,
  token      text        not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists prt_user_id_idx on public.password_reset_tokens(user_id);
create index if not exists prt_token_idx   on public.password_reset_tokens(token);

alter table public.password_reset_tokens enable row level security;
-- Service role bypasses RLS — no extra policies needed
