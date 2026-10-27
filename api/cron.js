/* GET /api/cron — daily at 12:00 UTC (Vercel Cron, see vercel.json): follow-up reminders on Mondays,
   and the weekly report emails due that weekday. Vercel sends "Authorization: Bearer $CRON_SECRET".
   ?job=followups or ?job=reports runs just that one (follow-ups then run whatever the day). */
import { serverDb } from '../server/lib.js';
import { followupReminders, scheduledReports } from '../server/cron.js';

export const config = { maxDuration: 60 };
export const JOBS = { followups: followupReminders, reports: scheduledReports };
const MONDAY_ONLY = new Set(['followups']);

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Not allowed' });
  const db = await serverDb(); const only = String(req.query.job || ''); const out = {};
  for (const [name, job] of Object.entries(JOBS)) {
    if (only && only !== name) continue;
    if (!only && MONDAY_ONLY.has(name) && new Date().getUTCDay() !== 1) continue;
    try { out[name] = await job({ db }); } catch (e) { console.error(name, e); out[name] = { error: e.message }; }
  }
  res.status(200).json(out);
}
