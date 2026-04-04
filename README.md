# Payday v3 — Paycheck Calculator PWA

Personal paycheck calculator. Invite-only multi-user architecture — you're the admin, you control who gets access.

## Stack

- **Frontend**: Vanilla HTML/CSS/JS PWA (installable on phone + laptop)
- **API**: Vercel Serverless Functions (Node.js ES modules)
- **Database**: Neon (serverless Postgres) — free tier
- **Auth**: JWT (HS256) via `jose` + bcrypt password hashing via `bcryptjs`
- **Hosting**: Vercel — free tier

---

## Environment variables

Set in Vercel → your project → Settings → Environment Variables:

| Variable | Description | How to generate |
|----------|-------------|-----------------|
| `DATABASE_URL` | Neon connection string | From Neon dashboard → Connection Details |
| `JWT_SECRET` | Token signing secret (min 32 chars) | `openssl rand -base64 32` |

No `PAYDAY_PASSWORD` anymore — passwords live in the database, hashed with bcrypt (cost 12).

---

## Deploy in ~10 minutes

### 1. Push to GitHub

```bash
git init && git add . && git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/payday-app.git
git branch -M main && git push -u origin main
```

### 2. Create Neon database

1. Sign up at https://neon.tech (free)
2. New project → name it `payday` → pick US East region
3. Copy the connection string from Connection Details

### 3. Generate JWT secret

```bash
openssl rand -base64 32
```

### 4. Deploy on Vercel

1. https://vercel.com → Add New Project → import repo
2. Framework Preset: **Other**
3. Add `DATABASE_URL` and `JWT_SECRET` environment variables
4. Deploy

---

## First-time setup (run once after deploy)

### Step 1 — Create tables + your admin account

```bash
curl -X POST https://your-app.vercel.app/api/setup \
  -H "Content-Type: application/json" \
  -d '{"adminUsername":"sam","adminPassword":"YourSecurePassword"}'
```

You'll see: `{"ok":true,"message":"Database initialized. Admin account created..."}`

### Step 2 — Sign in and seed your historical data

Open your app URL, sign in, then run this in browser DevTools → Console:

```js
fetch('/api/seed', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + sessionStorage.getItem('payday_token') }
}).then(r => r.json()).then(console.log)
```

You'll see: `{"ok":true,"stubs":28,"rates":2}`

Your 28 historical paychecks (Sep 2025 – Apr 2026) and both pay rates are loaded.

---

## Adding users (when the time comes)

1. Sign in as admin → Settings → User management → Add user
2. Enter username, display name, password, role (user or admin)
3. They sign in at your app URL — their data is completely separate from yours
4. New users start with a blank slate and log their own paychecks

---

## Install on devices

- **iPhone**: Safari → Share → Add to Home Screen
- **Android**: Chrome → three-dot menu → Add to Home Screen
- **Mac/PC**: Chrome/Edge → install icon in address bar

---

## Architecture

Every table row is scoped to a `user_id` from the JWT. No cross-user data leakage is possible at the query level.

```
users             — id, username, password_hash, display_name, role, active
stubs             — PK(id, user_id), all pay fields
rate_history      — PK(id, user_id), effective date + rate
settings          — PK(user_id, key), JSON values
```

JWT payload: `{ userId, username, role }`. Admin role gates `/api/users` and re-runs of `/api/setup`.

---

## Project structure

```
payday-app/
├── api/
│   ├── _auth.js      # signToken, verifyToken, requireAuth, requireAdmin
│   ├── auth.js       # POST /api/auth — login
│   ├── setup.js      # POST /api/setup — create tables + bootstrap admin
│   ├── seed.js       # POST /api/seed — load historical paystubs
│   ├── stubs.js      # GET/POST/DELETE /api/stubs
│   ├── rates.js      # GET/POST/DELETE /api/rates
│   ├── settings.js   # GET/POST /api/settings
│   └── users.js      # GET/POST/PATCH/DELETE /api/users (admin)
├── public/
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js
│   └── icons/
├── package.json
├── vercel.json
└── .gitignore
```

## Resetting a forgotten password

No forgot-password flow by design. Use the Neon SQL editor:

```bash
# Generate a bcrypt hash locally first
node -e "const b=require('bcryptjs');b.hash('NewPassword',12).then(h=>console.log(h))"
```

```sql
-- Paste hash into Neon SQL editor
UPDATE users SET password_hash = '<hash>' WHERE username = 'sam';
```
