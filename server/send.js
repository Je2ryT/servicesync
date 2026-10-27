/* POST /api/send — send an email and/or text message to church members.
   Rules: admins can message anyone; a coordinator can message only the people on their own team(s).
   Opted-out people and missing phone/email are skipped and recorded. A retried request (same
   idempotency key) never sends twice: each recipient is claimed before it is sent. */
import { httpError, userFromToken, roleOf, twilioSend, resendBatch, unsubscribeUrl, escapeHtml, pool2, sleep, appUrl } from './lib.js';
import { toE164, merge, smsInfo } from '../src/sms.js';

export const LIMITS = { maxRecipients: 1000, perWindow: 5, windowMinutes: 10, smsConcurrency: 4, smsGapMs: process.env.VITEST ? 0 : 120, emailBatch: 100, maxBody: 1600, maxSubject: 200 };

/** Validate and tidy the request body. */
export function parseInput(input) {
  const i = input || {};
  const key = String(i.key || ''); if (!/^[\w-]{8,100}$/.test(key)) throw httpError(400, 'Missing request key. Reload and try again.');
  const channel = String(i.channel || ''); if (!['sms', 'email', 'both'].includes(channel)) throw httpError(400, 'Choose Email, SMS or Both.');
  const body = String(i.body || '').trim(); if (!body) throw httpError(400, 'Write a message first.');
  if (body.length > LIMITS.maxBody) throw httpError(400, `Keep the message under ${LIMITS.maxBody} characters.`);
  const subject = String(i.subject || '').trim().slice(0, LIMITS.maxSubject);
  if (channel !== 'sms' && !subject) throw httpError(400, 'Emails need a subject.');
  const ids = [...new Set((Array.isArray(i.recipients) ? i.recipients : []).map(String))].filter(Boolean);
  if (!ids.length) throw httpError(400, 'Nobody to send to.');
  if (ids.length > LIMITS.maxRecipients) throw httpError(400, `Send to at most ${LIMITS.maxRecipients} people at a time.`);
  const source = i.source && typeof i.source === 'object' ? i.source : {};
  return { key, channel, body, subject, ids, source };
}

/** The member ids a coordinator may message: people linked to anyone serving in the same team(s). */
export async function teamMemberIds(db, coordinatorId) {
  const rows = await db.q(`
    select distinct m.id from members m
     where m.coordinator_id in (
       select pp2.person_id from person_positions pp1
         join positions p1 on p1.id = pp1.position_id
         join positions p2 on p2.team_id = p1.team_id
         join person_positions pp2 on pp2.position_id = p2.id
        where pp1.person_id = $1)`, [coordinatorId]);
  return new Set(rows.map(r => r.id));
}

const emailHtml = (text, unsubscribe, lang) => `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1c2140;max-width:600px;margin:0 auto;padding:24px">
  <div>${escapeHtml(text).replace(/\n/g, '<br>')}</div>
  <hr style="border:0;border-top:1px solid #e2e5ef;margin:28px 0 12px">
  <p style="font-size:12px;color:#5f6680">Mont Carmel · ServiceSync<br><a href="${unsubscribe}" style="color:#5f6680">${lang === 'en' ? 'Unsubscribe from these emails' : lang === 'fr' ? 'Se désabonner de ces courriels' : 'Unsubscribe · Se désabonner'}</a></p></body></html>`;

/**
 * Handle one send request. deps: { db, env, fetch, now }.
 * Returns { status, body } where body has the message id and totals.
 */
export async function handleSend({ token, input, req }, { db, env = process.env, fetch = globalThis.fetch } = {}) {
  const user = await userFromToken(token, { env, fetch });
  const role = await roleOf(db, user.email);
  if (!role.admin && !role.coordinatorId) throw httpError(403, 'Only the serving team and administrators with Messaging access can send messages.');
  const msg = parseInput(input);

  // Same request again (retry, double click): resume it, never start a second one.
  let [m] = await db.q(`select * from messages where idempotency_key = $1`, [msg.key]);
  if (m && m.sender_email !== user.email) throw httpError(409, 'That request key belongs to another message.');

  if (!m) {
    const [{ n }] = await db.q(`select count(*)::int n from messages where sender_email = $1 and created_at > now() - make_interval(mins => $2)`, [user.email, LIMITS.windowMinutes]);
    if (n >= LIMITS.perWindow) throw httpError(429, `You've sent ${n} messages in the last ${LIMITS.windowMinutes} minutes. Wait a few minutes and try again.`);

    const people = await db.q(`select id, name, first_name, last_name, phone, email, lang, sms_opt_out, email_opt_out, coordinator_id from members where id = any($1::text[]) and active`, [msg.ids]);
    if (!role.admin) {
      const allowed = await teamMemberIds(db, role.coordinatorId);
      const outside = people.filter(p => !allowed.has(p.id));
      if (outside.length) throw httpError(403, `You can only message people on your own team. ${outside.length} of these ${outside.length === 1 ? 'is' : 'are'} not.`, { outside: outside.map(p => p.id) });
    }

    const rows = [];
    for (const p of people) {
      if (msg.channel !== 'email') {
        const to = toE164(p.phone);
        rows.push({ p, channel: 'sms', address: to || p.phone || null, status: p.sms_opt_out ? 'skipped' : !p.phone ? 'skipped' : !to ? 'skipped' : 'queued', reason: p.sms_opt_out ? 'opted out of texts' : !p.phone ? 'no phone' : !to ? 'phone number not valid' : null });
      }
      if (msg.channel !== 'sms') {
        const ok = /^\S+@\S+\.\S+$/.test(p.email || '');
        rows.push({ p, channel: 'email', address: p.email || null, status: p.email_opt_out ? 'skipped' : !p.email ? 'skipped' : !ok ? 'skipped' : 'queued', reason: p.email_opt_out ? 'opted out of emails' : !p.email ? 'no email' : !ok ? 'email not valid' : null });
      }
    }
    const inserted = await db.q(`insert into messages (idempotency_key, sender_email, sender_name, channel, subject, body, source, recipients, skipped)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (idempotency_key) do nothing returning *`,
    [msg.key, user.email, role.name || user.name || null, msg.channel, msg.subject || null, msg.body, JSON.stringify(msg.source), people.length, rows.filter(r => r.status === 'skipped').length]);
    if (!inserted.length) { [m] = await db.q(`select * from messages where idempotency_key = $1`, [msg.key]); }   // a parallel request won the race
    else {
      m = inserted[0];
      if (rows.length) {
        await db.q(`insert into message_recipients (message_id, member_id, name, channel, address, status, reason)
          select $1, x.member_id, x.name, x.channel, x.address, x.status, x.reason
            from jsonb_to_recordset($2::jsonb) as x(member_id text, name text, channel text, address text, status text, reason text)
          on conflict do nothing`, [m.id, JSON.stringify(rows.map(r => ({ member_id: r.p.id, name: r.p.name, channel: r.channel, address: r.address, status: r.status, reason: r.reason })))]);
      }
    }
  }
  if (m.status !== 'sending') return { status: 200, body: { id: m.id, duplicate: true, ...totals(m) } };

  // Claim recipients still queued (a retry only picks up what the first attempt didn't).
  const base = appUrl(env, req);
  const people = new Map((await db.q(`select id, name, first_name, last_name, lang from members where id in (select member_id from message_recipients where message_id = $1)`, [m.id])).map(p => [p.id, p]));

  // Texts: a few at a time, spaced out.
  const sms = await db.q(`update message_recipients set status = 'sending', updated_at = now() where message_id = $1 and channel = 'sms' and status = 'queued' returning id, member_id, address`, [m.id]);
  await pool2(sms, LIMITS.smsConcurrency, async r => {
    const p = people.get(r.member_id) || {};
    const res = await twilioSend({ to: r.address, body: merge(m.body, p), statusCallback: base ? `${base}/api/twilio-status` : undefined }, { env, fetch }).catch(e => ({ ok: false, error: e.message }));
    await db.q(`update message_recipients set status = $2, provider_id = $3, reason = $4, sent_at = case when $2 = 'sent' then now() else sent_at end, updated_at = now() where id = $1`,
      [r.id, res.ok ? 'sent' : 'failed', res.id || null, res.ok ? null : String(res.error || 'failed').slice(0, 300)]);
    if (LIMITS.smsGapMs) await sleep(LIMITS.smsGapMs);
  });

  // Emails: batches of 100, each with its own idempotency key at Resend.
  const em = await db.q(`update message_recipients set status = 'sending', updated_at = now() where message_id = $1 and channel = 'email' and status = 'queued' returning id, member_id, address`, [m.id]);
  for (let i = 0; i < em.length; i += LIMITS.emailBatch) {
    const part = em.slice(i, i + LIMITS.emailBatch);
    const emails = part.map(r => {
      const p = people.get(r.member_id) || {}; const u = unsubscribeUrl(r.member_id, env, base); const text = merge(m.body, p);
      return { to: [r.address], subject: merge(m.subject || '', p), text: `${text}\n\n—\n${p.lang === 'fr' ? 'Se désabonner' : 'Unsubscribe'}: ${u}`, html: emailHtml(text, u, p.lang),
        headers: { 'List-Unsubscribe': `<${u}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
    });
    const res = await resendBatch(emails, `${m.id}-${part[0].id}`, { env, fetch }).catch(e => ({ ok: false, error: e.message }));
    await db.q(`update message_recipients r set status = $2, reason = $3, sent_at = case when $2 = 'sent' then now() else null end, updated_at = now(),
                  provider_id = coalesce((select x.pid from unnest($4::bigint[], $5::text[]) as x(rid, pid) where x.rid = r.id), r.provider_id)
                where r.id = any($1::bigint[])`,
    [part.map(r => r.id), res.ok ? 'sent' : 'failed', res.ok ? null : String(res.error || 'failed').slice(0, 300), part.map(r => r.id), part.map((r, k) => res.ids?.[k] || null)]);
  }

  // Anything claimed by an attempt that was cut off more than 5 minutes ago may or may not have gone out:
  // mark it failed rather than risk sending it twice.
  await db.q(`update message_recipients set status = 'failed', reason = 'interrupted; not resent so nobody gets it twice', updated_at = now()
               where message_id = $1 and status = 'sending' and updated_at < now() - interval '5 minutes'`, [m.id]);

  // Totals and final status.
  const [t] = await db.q(`select count(*) filter (where status in ('sent', 'delivered'))::int sent, count(*) filter (where status = 'failed')::int failed,
                                 count(*) filter (where status = 'skipped')::int skipped, count(*) filter (where status in ('queued', 'sending'))::int pending
                            from message_recipients where message_id = $1`, [m.id]);
  const status = t.pending ? 'sending' : t.failed && !t.sent ? 'failed' : t.failed ? 'partial' : t.sent ? 'sent' : 'failed';
  [m] = await db.q(`update messages set sent = $2, failed = $3, skipped = $4, status = $5, finished_at = case when $5 = 'sending' then null else now() end where id = $1 returning *`, [m.id, t.sent, t.failed, t.skipped, status]);
  return { status: 200, body: { id: m.id, ...totals(m) } };
}

const totals = m => ({ status: m.status, recipients: m.recipients, sent: m.sent, failed: m.failed, skipped: m.skipped });
export { smsInfo };
