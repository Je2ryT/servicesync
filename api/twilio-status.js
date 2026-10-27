/* Twilio delivery updates for each text we send (set automatically as the StatusCallback). */
import { handleSmsStatus } from '../server/hooks.js';
import { serverDb, appUrl } from '../server/lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    await handleSmsStatus({ url: appUrl(process.env, req) + req.url, params: req.body || {}, signature: req.headers['x-twilio-signature'] }, { db: await serverDb() });
    res.status(204).end();
  } catch (e) { if (!e.status) console.error(e); res.status(e.status || 500).end(); }
}
