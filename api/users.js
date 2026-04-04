// Admin-only user management: list, create, deactivate users.
// GET  /api/users          — list all users (admin only)
// POST /api/users          — create a user (admin only)
// PATCH /api/users?id=xxx  — update user (admin: any user; user: own password only)
// DELETE /api/users?id=xxx — deactivate user (admin only, cannot deactivate self)
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { requireAuth, requireAdmin } from './_auth.js';

function safeUser(u) {
  return { id: u.id, username: u.username, displayName: u.display_name, role: u.role, active: u.active, createdAt: u.created_at };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = neon(process.env.DATABASE_URL);

  // GET — admin only
  if (req.method === 'GET') {
    const payload = await requireAdmin(req, res);
    if (!payload) return;
    const rows = await sql`SELECT id, username, display_name, role, active, created_at FROM users ORDER BY created_at ASC`;
    return res.status(200).json(rows.map(safeUser));
  }

  // POST — create user (admin only)
  if (req.method === 'POST') {
    const payload = await requireAdmin(req, res);
    if (!payload) return;

    const { username, password, displayName, role = 'user' } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'role must be admin or user' });

    const hash = await bcrypt.hash(password, 12);
    const id = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2);

    try {
      await sql`
        INSERT INTO users (id, username, password_hash, display_name, role, created_by)
        VALUES (${id}, ${username.toLowerCase().trim()}, ${hash}, ${displayName || username}, ${role}, ${payload.userId})
      `;
      return res.status(201).json({ ok: true, id, username: username.toLowerCase().trim() });
    } catch (err) {
      if (err.message.includes('unique')) return res.status(409).json({ error: 'Username already taken' });
      return res.status(500).json({ error: err.message });
    }
  }

  // PATCH — change password (own account) or update any field (admin)
  if (req.method === 'PATCH') {
    const payload = await requireAuth(req, res);
    if (!payload) return;

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    // Non-admins can only update their own password
    if (payload.role !== 'admin' && id !== payload.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { password, displayName, role, active } = req.body || {};
    const updates = [];

    if (password) {
      const hash = await bcrypt.hash(password, 12);
      await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${id}`;
    }
    if (payload.role === 'admin') {
      if (displayName !== undefined) await sql`UPDATE users SET display_name = ${displayName} WHERE id = ${id}`;
      if (role !== undefined) await sql`UPDATE users SET role = ${role} WHERE id = ${id}`;
      if (active !== undefined) await sql`UPDATE users SET active = ${active} WHERE id = ${id}`;
    }

    return res.status(200).json({ ok: true });
  }

  // DELETE — deactivate (soft delete) — admin only, cannot deactivate self
  if (req.method === 'DELETE') {
    const payload = await requireAdmin(req, res);
    if (!payload) return;

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    if (id === payload.userId) return res.status(400).json({ error: 'Cannot deactivate your own account' });

    await sql`UPDATE users SET active = false WHERE id = ${id}`;
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
