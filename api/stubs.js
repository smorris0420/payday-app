import { neon } from '@neondatabase/serverless';
import { requireAuth } from './_auth.js';

function fromRow(r) {
  return {
    id:     r.id,
    date:   r.date instanceof Date ? r.date.toISOString().slice(0,10) : String(r.date).slice(0,10),
    period: r.period,
    rate:   parseFloat(r.rate),
    reg:    parseFloat(r.reg),
    ot:     parseFloat(r.ot),
    hol:    parseFloat(r.hol),
    gross:  parseFloat(r.gross),
    fed:    parseFloat(r.fed),
    ss:     parseFloat(r.ss),
    med:    parseFloat(r.med),
    den:    parseFloat(r.den),
    medI:   parseFloat(r.med_i),
    vis:    parseFloat(r.vis),
    net:    r.net != null ? parseFloat(r.net) : null,
    seeded: r.seeded
  };
}

export default async function handler(req, res) {
  const payload = await requireAuth(req, res);
  if (!payload) return;

  const sql  = neon(process.env.DATABASE_URL);
  const uid  = payload.userId;

  // GET — all stubs for this user
  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM stubs WHERE user_id = ${uid} ORDER BY date DESC`;
    return res.status(200).json(rows.map(fromRow));
  }

  // POST — insert new stub
  if (req.method === 'POST') {
    const s = req.body;
    if (!s?.id || !s?.date) return res.status(400).json({ error: 'Missing id or date' });
    try {
      await sql`
        INSERT INTO stubs (id,user_id,date,period,rate,reg,ot,hol,gross,fed,ss,med,den,med_i,vis,net,seeded)
        VALUES (${s.id},${uid},${s.date},${s.period||null},${s.rate},${s.reg},
                ${s.ot||0},${s.hol||0},${s.gross},${s.fed},${s.ss},${s.med},
                ${s.den},${s.medI},${s.vis},${s.net||null},false)
      `;
      return res.status(201).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // PATCH — edit individual fields on an existing stub (rate, hours, deductions, net)
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const s = req.body;

    // Recalculate gross if hours or rate changed
    const gross = s.rate * s.reg + s.rate * 1.5 * (s.ot||0) + s.rate * (s.hol||0);

    try {
      await sql`
        UPDATE stubs SET
          date    = ${s.date},
          rate    = ${s.rate},
          reg     = ${s.reg},
          ot      = ${s.ot||0},
          hol     = ${s.hol||0},
          gross   = ${parseFloat(gross.toFixed(2))},
          fed     = ${s.fed},
          ss      = ${s.ss},
          med     = ${s.med},
          den     = ${s.den},
          med_i   = ${s.medI},
          vis     = ${s.vis},
          net     = ${s.net||null}
        WHERE id = ${id} AND user_id = ${uid}
      `;
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE — own stubs only
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    await sql`DELETE FROM stubs WHERE id = ${id} AND user_id = ${uid}`;
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
