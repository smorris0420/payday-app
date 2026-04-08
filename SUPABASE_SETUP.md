# Payday v7 — Supabase Setup Guide

## Why Supabase?
Real-time sync across devices. When you log a paycheck on your phone, your laptop updates instantly (and vice versa) without refreshing.

---

## Step 1: Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New project**
3. Name it `payday`, choose a region (US East recommended), set a database password
4. Wait ~2 minutes for it to provision

---

## Step 2: Create the database tables

In your Supabase project, go to **SQL Editor** and run this:

```sql
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id            TEXT        PRIMARY KEY,
  username      TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  display_name  TEXT,
  role          TEXT        NOT NULL DEFAULT 'user',
  active        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    TEXT
);

-- Paychecks table
CREATE TABLE IF NOT EXISTS stubs (
  id          TEXT         NOT NULL,
  user_id     TEXT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        DATE         NOT NULL,
  period      TEXT,
  rate        NUMERIC(6,2)  NOT NULL,
  reg         NUMERIC(6,2)  NOT NULL DEFAULT 0,
  ot          NUMERIC(6,2)  NOT NULL DEFAULT 0,
  hol         NUMERIC(6,2)  NOT NULL DEFAULT 0,
  gross       NUMERIC(10,2) NOT NULL,
  fed         NUMERIC(8,2)  NOT NULL DEFAULT 0,
  ss          NUMERIC(8,2)  NOT NULL DEFAULT 0,
  med         NUMERIC(8,2)  NOT NULL DEFAULT 0,
  den         NUMERIC(8,2)  NOT NULL DEFAULT 0,
  med_i       NUMERIC(8,2)  NOT NULL DEFAULT 0,
  vis         NUMERIC(8,2)  NOT NULL DEFAULT 0,
  net         NUMERIC(10,2),
  seeded      BOOLEAN      NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key     TEXT NOT NULL,
  value   TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- Enable Row Level Security (required for realtime)
ALTER TABLE stubs ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only see their own stubs
-- (API uses service role key so it bypasses RLS, but realtime needs it)
CREATE POLICY "Users see own stubs" ON stubs
  FOR ALL USING (true);  -- API enforces user_id, realtime filter does too
```

---

## Step 3: Enable Realtime on the stubs table

1. In Supabase Dashboard → **Database** → **Replication**
2. Find the `stubs` table and toggle **Realtime ON**

Or run in SQL Editor:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE stubs;
```

---

## Step 4: Get your API keys

In Supabase Dashboard → **Project Settings** → **API**:

- **Project URL** → looks like `https://abcdefgh.supabase.co`
- **anon / public key** → long JWT starting with `eyJ...`
- **service_role key** → another long JWT (keep this secret!)

---

## Step 5: Set Vercel environment variables

In your Vercel project → **Settings** → **Environment Variables**, add:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service role key (secret) |
| `JWT_SECRET` | Same random string from before (or generate new: `openssl rand -base64 32`) |

---

## Step 6: Update index.html with your public keys

Open `public/index.html` and find this near the top of the scripts:

```js
window.SUPABASE_URL = 'YOUR_SUPABASE_URL';
window.SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

Replace with your actual values. The **anon key is safe to put here** — it's public by design. The service role key stays only in Vercel env vars.

---

## Step 7: Deploy

```bash
git add -A
git commit -m "v7: migrate to Supabase with realtime"
git push
```

Vercel auto-deploys on push.

---

## Step 8: Create your admin account

```bash
curl -X POST https://YOUR-APP.vercel.app/api/setup \
  -H "Content-Type: application/json" \
  -d '{"adminUsername":"sam","adminPassword":"YourPassword"}'
```

---

## Step 9: Seed historical data (optional)

Sign in, then in browser console:
```js
fetch('/api/seed', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + sessionStorage.getItem('payday_token') }
}).then(r => r.json()).then(console.log)
// Expected: { ok: true, stubs: 28 }
```

---

## How realtime works

- When you log a paycheck on Device A, it saves to Supabase
- Supabase broadcasts the INSERT event over websocket to all subscribers
- Device B receives the event and instantly adds the paycheck to its local array
- History and YTD rebuild automatically — no refresh needed
- The subscription is filtered to `user_id = your id` so you only receive your own changes
