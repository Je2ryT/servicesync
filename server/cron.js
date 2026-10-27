/* Weekly jobs, run by Vercel Cron through /api/cron (every Monday morning).
   Each job writes to the messages log with a per-week idempotency key, so a repeated
   cron call never sends the same email twice. */
import { resendBatch, escapeHtml, appUrl } from './lib.js';

/** Monday of the week of `d`, as YYYY-MM-DD (UTC). */
export function weekOf(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

/** Log one system email in messages/message_recipients. Returns false when this key was already sent. */
export async function logSystemEmail(db, { key, subject, body, to, memberId, name, source }) {
  const ins = await db.q(`insert into messages (idempotency_key, sender_email, sender_name, channel, subject, body, source, recipients, status)
                          values ($1, 'servicesync@system', 'ServiceSync', 'email', $2, $3, $4, 1, 'sending') on conflict (idempotency_key) do nothing returning id`, [key, subject, body, JSON.stringify(source)]);
  if (!ins.length) return null;
  await db.q(`insert into message_recipients (message_id, member_id, name, channel, address, status) values ($1, $2, $3, 'email', $4, 'sending')`, [ins[0].id, memberId || null, name || null, to]);
  return ins[0].id;
}
export async function finishSystemEmail(db, id, ok, providerId, error) {
  await db.q(`update message_recipients set status = $2, provider_id = $3, reason = $4, sent_at = case when $2 = 'sent' then now() end, updated_at = now() where message_id = $1`, [id, ok ? 'sent' : 'failed', providerId || null, ok ? null : String(error || 'failed').slice(0, 300)]);
  await db.q(`update messages set status = $2, sent = $3, failed = $4, finished_at = now() where id = $1`, [id, ok ? 'sent' : 'failed', ok ? 1 : 0, ok ? 0 : 1]);
}

/** Phase 3: each person with follow-ups that are overdue or due within 7 days gets one email. */
export async function followupReminders({ db, env = process.env, fetch = globalThis.fetch, now = new Date() }) {
  const rows = await db.q(`
    select e.assignee, c.name as coord_name, lower(c.email) as coord_email, cm.id as coord_member, cm.email_opt_out,
           m.name as person, m.phone, s.title as step, e.due_date::text as due, (e.due_date < $1::date) as late
      from flow_entries e
      join coordinators c on c.id = e.assignee
      join members m on m.id = e.member_id and m.active
      left join flow_steps s on s.id = e.step_id
      left join members cm on cm.coordinator_id = c.id
     where e.status = 'active' and e.due_date <= $1::date + 7 and coalesce(c.email, '') <> ''
     order by e.assignee, e.due_date, m.name`, [now.toISOString().slice(0, 10)]);
  const by = new Map(); for (const r of rows) { if (r.email_opt_out) continue; (by.get(r.assignee) || by.set(r.assignee, []).get(r.assignee)).push(r); }
  const week = weekOf(now); const base = appUrl(env); let sent = 0, skipped = 0;
  for (const [cid, list] of by) {
    const first = list[0]; const late = list.filter(r => r.late).length;
    const subject = `Follow-ups this week · Suivis de la semaine (${list.length})`;
    const lines = list.map(r => `• ${r.person}${r.phone ? ' (' + r.phone + ')' : ''}: ${r.step || 'follow-up'} · ${r.late ? 'overdue / en retard' : 'due / pour le'} ${r.due}`);
    const text = `Hi ${String(first.coord_name || '').split(' ')[0]},\n\n${late ? `${late} overdue. ` : ''}Here are your follow-ups for this week / Voici vos suivis de la semaine:\n\n${lines.join('\n')}\n\n${base ? base + '/#followups' : ''}`;
    const id = await logSystemEmail(db, { key: `followups-${week}-${cid}`, subject, body: text, to: first.coord_email, memberId: first.coord_member, name: first.coord_name, source: { kind: 'followup-reminder', week } });
    if (!id) { skipped++; continue; }   // already sent this week
    const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1c2140">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`;
    const r = await resendBatch([{ to: [first.coord_email], subject, text, html }], `followups-${week}-${cid}`, { env, fetch }).catch(e => ({ ok: false, error: e.message }));
    await finishSystemEmail(db, id, r.ok, r.ids?.[0], r.error); if (r.ok) sent++;
  }
  return { people: by.size, sent, skipped };
}
