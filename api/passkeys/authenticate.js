import { db } from '../_db.js';
import { signToken } from '../_auth.js';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';

const getRpId   = req => (req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(':')[0];
const getOrigin = req => {
  const h = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return h.includes('localhost') ? `http://${h}` : `https://${h}`;
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).end();

  const { credential } = req.body || {};
  if(!credential?.id) return res.status(400).json({ error: 'Missing credential' });

  const supabase = db();
  const rpId   = getRpId(req);
  const origin = getOrigin(req);

  // Find the passkey record by credential ID
  const { data: passkey, error: pkErr } = await supabase
    .from('passkeys')
    .select('id, credential_id, public_key, counter, user_id, users(id, username, email, display_name, role, active)')
    .eq('credential_id', credential.id)
    .maybeSingle();

  if(pkErr) {
    console.error('Passkey lookup error:', pkErr.message);
    return res.status(500).json({ error: 'Passkey lookup failed' });
  }
  if(!passkey) return res.status(401).json({ error: 'Passkey not found for this device' });
  if(!passkey.users?.active) return res.status(401).json({ error: 'Account inactive' });

  // Find the most recent valid authentication challenge
  const { data: ch, error: chErr } = await supabase
    .from('webauthn_challenges')
    .select('challenge, id')
    .eq('type', 'authentication')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if(chErr || !ch) {
    console.error('Auth challenge lookup error:', chErr?.message);
    return res.status(400).json({ error: 'Challenge expired — please try again' });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: ch.challenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
      authenticator: {
        credentialID:        Uint8Array.from(Buffer.from(passkey.credential_id, 'base64url')),
        credentialPublicKey: Uint8Array.from(Buffer.from(passkey.public_key, 'base64')),
        counter:             passkey.counter || 0,
      },
      requireUserVerification: false,
    });
  } catch(e) {
    console.error('Auth verification error:', e.message, { origin, rpId });
    return res.status(401).json({ error: 'Verification failed: ' + e.message });
  }

  if(!verification.verified) return res.status(401).json({ error: 'Authentication not verified' });

  // Update counter to prevent replay attacks
  await supabase.from('passkeys')
    .update({ counter: verification.authenticationInfo.newCounter })
    .eq('id', passkey.id);

  // Delete used challenge
  await supabase.from('webauthn_challenges').delete().eq('id', ch.id);

  const u = passkey.users;
  const token = await signToken(u.id, u.username, u.role);

  return res.status(200).json({
    token,
    username:    u.username,
    displayName: u.display_name || u.username,
    role:        u.role,
    userId:      u.id,
  });
}
