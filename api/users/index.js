import bcrypt from 'bcryptjs';
import { requireAuth, requireAdmin } from '../_auth.js';
import { db } from '../_db.js';

const DEFAULT_PASSWORD = 'Password1';

function safeUser(u) {
  return { id: u.id, username: u.username, displayName: u.display_name, role: u.role, active: u.active, createdAt: u.created_at };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const supabase = db();

  if (req.method === 'GET') {
    const payload = await requireAdmin(req, res);
    if (!payload) return;
    const { data } = await supabase.from('users').select('id,username,display_name,role,active,created_at').order('created_at');
    return res.status(200).json((data || []).map(safeUser));
  }

  if (req.method === 'POST') {
    const payload = await requireAdmin(req, res);
    if (!payload) return;
    const { username, password, displayName, role = 'user' } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'invalid role' });
    const hash = await bcrypt.hash(password, 12);
    const id = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
    const { error } = await supabase.from('users').insert({
      id, username: username.toLowerCase().trim(),
      password_hash: hash, display_name: displayName || username,
      role, created_by: payload.userId,
    });
    if (error) {
      if (error.message.includes('unique') || error.code === '23505') return res.status(409).json({ error: 'Username already taken' });
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json({ ok: true, id, username: username.toLowerCase().trim() });
  }

  if (req.method === 'PATCH') {
    const payload = await requireAuth(req, res);
    if (!payload) return;
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    if (payload.role !== 'admin' && id !== payload.userId) return res.status(403).json({ error: 'Forbidden' });

    const { password, resetPassword, displayName, username, role, active } = req.body || {};

    if (resetPassword || password) {
      const pw = resetPassword ? DEFAULT_PASSWORD : password;
      const hash = await bcrypt.hash(pw, 12);
      await supabase.from('users').update({ password_hash: hash }).eq('id', id);
    }
    if (payload.role === 'admin') {
      const updates = {};
      if (username !== undefined) updates.username = username.toLowerCase().trim();
      if (displayName !== undefined) updates.display_name = displayName;
      if (role !== undefined) updates.role = role;
      if (active !== undefined) updates.active = active;
      if (Object.keys(updates).length) {
        const { error } = await supabase.from('users').update(updates).eq('id', id);
        if (error) {
          if (error.code === '23505') return res.status(409).json({ error: 'Username already taken' });
          return res.status(500).json({ error: error.message });
        }
      }
    }
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const payload = await requireAdmin(req, res);
    if (!payload) return;
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    if (id === payload.userId) return res.status(400).json({ error: 'Cannot deactivate your own account' });
    await supabase.from('users').update({ active: false }).eq('id', id);
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
