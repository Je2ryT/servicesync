/* POST /api/send — see server/send.js. Needs: SUPABASE_DB_URL, UNSUBSCRIBE_SECRET, and
   TWILIO_SID / TWILIO_TOKEN / TWILIO_FROM (texts) and/or RESEND_API_KEY / MAIL_FROM (email). */
import { handleSend } from '../server/send.js';
import { serverDb } from '../server/lib.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Use POST' }); }
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const input = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
    const out = await handleSend({ token, input, req }, { db: await serverDb() });
    res.status(out.status).json(out.body);
  } catch (e) {
    if (!e.status) console.error(e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong while sending. Nothing was sent twice; try again.', outside: e.outside });
  }
}
