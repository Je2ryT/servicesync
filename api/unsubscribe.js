/* The unsubscribe link at the bottom of every email (GET shows a confirm button; POST unsubscribes). */
import { handleUnsubscribe } from '../server/hooks.js';
import { serverDb } from '../server/lib.js';

export default async function handler(req, res) {
  try {
    const out = await handleUnsubscribe({ method: req.method, memberId: String(req.query.m || ''), sig: String(req.query.s || '') }, { db: await serverDb() });
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
    res.status(out.status).send(out.html);
  } catch (e) { console.error(e); res.status(500).send('Something went wrong. Please try again.'); }
}
