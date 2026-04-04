import { neon } from '@neondatabase/serverless';
import { requireAuth } from './_auth.js';

export default async function handler(req, res) {
  const payload = await requireAuth(req, res);
  if (!payload) return;

  const sql = neon(process.env.DATABASE_URL);
  const userId = payload.userId;

  if (req.method === 'GET') {
    const rows = await sql`SELECT key, value FROM settings WHERE user_id = ${userId}`;
    const obj = {};
    rows.forEach(r => {
      try { obj[r.key] = JSON.parse(r.value); } catch { obj[r.key] = r.value; }
    });
    return res.status(200).json(obj);
  }

  if (req.method === 'POST') {
    const body = req.body;
    if (!body) return res.status(400).json({ error: 'No body' });
    for (const [key, value] of Object.entries(body)) {
      if (value === null || value === undefined) {
        await sql`DELETE FROM settings WHERE user_id = ${userId} AND key = ${key}`;
      } else {
        const val = JSON.stringify(value);
        await sql`
          INSERT INTO settings (user_id, key, value) VALUES (${userId}, ${key}, ${val})
          ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value
        `;
      }
    }
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
