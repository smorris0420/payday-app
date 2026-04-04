import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { requireAuth } from './_auth.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = neon(process.env.DATABASE_URL);

  try {
    // Users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        username      TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name  TEXT,
        role          TEXT NOT NULL DEFAULT 'user',
        active        BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by    TEXT
      )
    `;

    // Paychecks — rate is stored per-stub, that's it
    await sql`
      CREATE TABLE IF NOT EXISTS stubs (
        id          TEXT NOT NULL,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date        DATE NOT NULL,
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
        seeded      BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id, user_id)
      )
    `;

    // Settings — includes default_rate as just another key
    await sql`
      CREATE TABLE IF NOT EXISTS settings (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key     TEXT NOT NULL,
        value   TEXT NOT NULL,
        PRIMARY KEY (user_id, key)
      )
    `;

    // Bootstrap first admin if no users exist
    const existing = await sql`SELECT COUNT(*) as c FROM users`;
    if (parseInt(existing[0].c) === 0) {
      const { adminUsername, adminPassword } = req.body || {};
      if (!adminUsername || !adminPassword) {
        return res.status(400).json({
          error: 'No users exist yet. POST { adminUsername, adminPassword } to bootstrap.'
        });
      }
      const hash = await bcrypt.hash(adminPassword, 12);
      const adminId = 'admin_' + Date.now().toString(36);
      await sql`
        INSERT INTO users (id, username, password_hash, display_name, role)
        VALUES (${adminId}, ${adminUsername.toLowerCase().trim()}, ${hash}, ${adminUsername}, 'admin')
      `;
      return res.status(200).json({
        ok: true,
        message: `Tables created. Admin account "${adminUsername}" ready. Sign in, then POST /api/seed to load your historical paychecks.`
      });
    }

    // Already initialized — require admin auth for re-runs
    const payload = await requireAuth(req, res);
    if (!payload) return;
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    return res.status(200).json({ ok: true, message: 'Tables verified.' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
