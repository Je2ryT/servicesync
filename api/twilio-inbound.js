/* Twilio "A message comes in" webhook: STOP / START replies update the person's text opt-out.
   In Twilio, set the number's (or Messaging Service's) incoming webhook to https://<your site>/api/twilio-inbound (HTTP POST). */
import { handleInbound } from '../server/hooks.js';
import { serverDb, appUrl } from '../server/lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    await handleInbound({ url: appUrl(process.env, req) + req.url, params: req.body || {}, signature: req.headers['x-twilio-signature'] }, { db: await serverDb() });
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');   // Twilio sends its own STOP confirmation
  } catch (e) { if (!e.status) console.error(e); res.status(e.status || 500).end(); }
}
