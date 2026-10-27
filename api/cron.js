/* GET /api/cron — weekly jobs (Vercel Cron, see vercel.json): follow-up reminders and,
   from Phase 4, scheduled report emails. Vercel sends "Authorization: Bearer $CRON_SECRET". */
import { serverDb } from '../server/lib.js';
import { followupReminders } from '../server/cron.js';

export const config = { maxDuration: 60 };
export const JOBS = { followups: followupReminders };

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Not allowed' });
  const db = await serverDb(); const only = String(req.query.job || ''); const out = {};
  for (const [name, job] of Object.entries(JOBS)) {
    if (only && only !== name) continue;
    try { out[name] = await job({ db }); } catch (e) { console.error(name, e); out[name] = { error: e.message }; }
  }
  res.status(200).json(out);
}
