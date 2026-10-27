/* Server helpers for the /api functions: database, sign-in check, Twilio, Resend, signed links.
   Everything that talks to the outside world is passed in (db, fetch, env), so it can be tested. */
import crypto from 'node:crypto';
import { SUPABASE_URL as CLIENT_URL, SUPABASE_ANON_KEY as CLIENT_KEY } from '../src/config.js';

/* ---------- database ---------- */
let pool = null;
/** A tiny SQL interface over SUPABASE_DB_URL: q(text, params) → rows. */
export async function serverDb(env = process.env) {
  if (!env.SUPABASE_DB_URL) throw httpError(500, 'SUPABASE_DB_URL is not set in Vercel.');
  if (!pool) {
    const { default: postgres } = await import('postgres');
    pool = postgres(env.SUPABASE_DB_URL, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 });
  }
  return { q: (text, params = []) => pool.unsafe(text, params) };
}

export function httpError(status, message, extra = {}) { const e = new Error(message); e.status = status; Object.assign(e, extra); return e; }

/* ---------- who is calling ---------- */
/** The signed-in user's email from a Supabase access token, checked with Supabase Auth. */
export async function userFromToken(token, { env = process.env, fetch = globalThis.fetch } = {}) {
  if (!token) throw httpError(401, 'Sign in first.');
  const url = env.SUPABASE_URL || CLIENT_URL; const key = env.SUPABASE_ANON_KEY || CLIENT_KEY;
  const r = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: key } });
  if (!r.ok) throw httpError(401, 'Your sign-in has expired. Reload the page and try again.');
  const u = await r.json(); const email = String(u.email || '').toLowerCase();
  if (!email) throw httpError(401, 'Sign in first.');
  return { email, name: u.user_metadata?.full_name || u.user_metadata?.name || '' };
}

/** { admin, coordinatorId, name } for an email. */
export async function roleOf(db, email) {
  const [a] = await db.q(`select 1 from admins where lower(email) = $1 limit 1`, [email]);
  const [c] = await db.q(`select id, name from coordinators where lower(email) = $1 limit 1`, [email]);
  return { admin: !!a, coordinatorId: c?.id || null, name: c?.name || '' };
}

/* ---------- signed links (unsubscribe) ---------- */
export function sign(value, env = process.env) {
  if (!env.UNSUBSCRIBE_SECRET) throw httpError(500, 'UNSUBSCRIBE_SECRET is not set in Vercel.');
  return crypto.createHmac('sha256', env.UNSUBSCRIBE_SECRET).update(String(value)).digest('base64url').slice(0, 32);
}
export function verify(value, sig, env = process.env) {
  if (!sig || !env.UNSUBSCRIBE_SECRET) return false;
  const a = Buffer.from(sign(value, env)); const b = Buffer.from(String(sig));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export const appUrl = (env = process.env, req) => (env.APP_URL || (req ? `https://${req.headers['x-forwarded-host'] || req.headers.host}` : '')).replace(/\/$/, '');
export const unsubscribeUrl = (memberId, env = process.env, base = appUrl(env)) => `${base}/api/unsubscribe?m=${encodeURIComponent(memberId)}&s=${sign('email:' + memberId, env)}`;

/* ---------- Twilio ---------- */
export async function twilioSend({ to, body, statusCallback }, { env = process.env, fetch = globalThis.fetch } = {}) {
  const { TWILIO_SID: sid, TWILIO_TOKEN: token, TWILIO_FROM: from } = env;
  if (!sid || !token || !from) throw httpError(500, 'Text messages are not set up yet (TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM in Vercel).');
  const form = new URLSearchParams({ To: to, Body: body });
  if (from.startsWith('MG')) form.set('MessagingServiceSid', from); else form.set('From', from);
  if (statusCallback) form.set('StatusCallback', statusCallback);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST', body: form, headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: j.message || `Twilio error ${r.status}`, code: j.code };
  return { ok: true, id: j.sid };
}

/** Twilio's request signature: HMAC-SHA1 of the full URL plus the sorted form fields. */
export function twilioSignatureOk(url, params, signature, env = process.env) {
  if (!env.TWILIO_TOKEN || !signature) return false;
  const data = url + Object.keys(params || {}).sort().map(k => k + params[k]).join('');
  const expected = crypto.createHmac('sha1', env.TWILIO_TOKEN).update(Buffer.from(data, 'utf8')).digest('base64');
  const a = Buffer.from(expected); const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- Resend ---------- */
/** Up to 100 emails in one call. The idempotency key makes a retried batch a no-op at Resend. */
export async function resendBatch(emails, idempotencyKey, { env = process.env, fetch = globalThis.fetch } = {}) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) throw httpError(500, 'Email is not set up yet (RESEND_API_KEY, MAIL_FROM in Vercel).');
  const r = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST', body: JSON.stringify(emails.map(e => ({ from: env.MAIL_FROM, ...e }))),
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: j.message || `Resend error ${r.status}` };
  return { ok: true, ids: (j.data || []).map(x => x.id) };
}

/* ---------- small things ---------- */
export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Run fn over items, at most `limit` at a time. */
export async function pool2(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
