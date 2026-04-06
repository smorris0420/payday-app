import { requireAuth } from './_auth.js';
import { query } from './_db.js';

// Ensure table exists
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS dashboards (
      user_id TEXT PRIMARY KEY,
      config   JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
  if(req.method==='OPTIONS') return res.status(200).end();

  const user = await requireAuth(req, res);
  if(!user) return;

  await ensureTable();

  if(req.method==='GET') {
    const r = await query('SELECT config FROM dashboards WHERE user_id=$1', [user.username]);
    return res.status(200).json({ config: r.rows[0]?.config || null });
  }

  if(req.method==='POST') {
    const { config } = req.body;
    if(!Array.isArray(config)) return res.status(400).json({ error: 'config must be array' });
    await query(
      `INSERT INTO dashboards(user_id,config,updated_at) VALUES($1,$2,now())
       ON CONFLICT(user_id) DO UPDATE SET config=$2, updated_at=now()`,
      [user.username, JSON.stringify(config)]
    );
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
