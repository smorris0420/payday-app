import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { signToken } from './_auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });

  // Artificial delay to slow brute force
  await new Promise(r => setTimeout(r, 400));

  const sql = neon(process.env.DATABASE_URL);
  try {
    const rows = await sql`
      SELECT id, username, password_hash, role
      FROM users
      WHERE username = ${username.toLowerCase().trim()}
        AND active = true
      LIMIT 1
    `;

    if (!rows.length) return res.status(401).json({ error: 'Invalid username or password' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

    const token = await signToken(user.id, user.username, user.role);
    return res.status(200).json({ token, username: user.username, role: user.role, userId: user.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
