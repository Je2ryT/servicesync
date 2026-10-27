/* Webhooks and links that come from outside: Twilio replies (STOP/START), Twilio delivery
   updates, and the unsubscribe link in every email. */
import { httpError, twilioSignatureOk, verify, escapeHtml } from './lib.js';
import { replyIntent } from '../src/sms.js';

const last10 = p => String(p || '').replace(/\D/g, '').slice(-10);

/** Twilio inbound SMS. STOP-type words opt the sender out of texts; START-type words opt them back in. */
export async function handleInbound({ url, params, signature }, { db, env = process.env }) {
  if (!twilioSignatureOk(url, params, signature, env)) throw httpError(403, 'Bad signature');
  const intent = replyIntent(params.Body); const digits = last10(params.From);
  if (!intent || digits.length < 10) return { updated: 0, intent };
  const out = intent === 'out';
  const rows = await db.q(`update members set sms_opt_out = $2 where right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $1 and sms_opt_out <> $2 returning id`, [digits, out]);
  for (const r of rows) await db.q(`insert into optout_events (member_id, channel, action, source, detail) values ($1, 'sms', $2, 'sms-reply', $3)`, [r.id, intent, String(params.Body || '').trim().slice(0, 40)]);
  return { updated: rows.length, intent };
}

/** Twilio delivery updates for messages we sent (StatusCallback). */
export async function handleSmsStatus({ url, params, signature }, { db, env = process.env }) {
  if (!twilioSignatureOk(url, params, signature, env)) throw httpError(403, 'Bad signature');
  const st = String(params.MessageStatus || '').toLowerCase();
  const status = st === 'delivered' ? 'delivered' : ['failed', 'undelivered'].includes(st) ? 'failed' : null;
  if (!status || !params.MessageSid) return { updated: 0 };
  const rows = await db.q(`update message_recipients set status = $2, reason = case when $2 = 'failed' then $3 else reason end, updated_at = now()
                            where provider_id = $1 and channel = 'sms' and status <> 'delivered' returning message_id`,
  [params.MessageSid, status, params.ErrorCode ? `carrier error ${params.ErrorCode}` : 'not delivered']);
  for (const r of rows) {
    await db.q(`update messages m set sent = x.sent, failed = x.failed,
                  status = case when x.failed > 0 and x.sent > 0 then 'partial' when x.failed > 0 then 'failed' else m.status end
                  from (select count(*) filter (where status in ('sent','delivered'))::int sent, count(*) filter (where status = 'failed')::int failed
                          from message_recipients where message_id = $1) x
                 where m.id = $1 and m.status <> 'sending'`, [r.message_id]);
  }
  return { updated: rows.length };
}

/** The unsubscribe link: GET shows a page with a button (so link scanners don't unsubscribe people);
    POST (the button, or a mail app's one-click) records it. */
export async function handleUnsubscribe({ method, memberId, sig }, { db, env = process.env }) {
  if (!memberId || !verify('email:' + memberId, sig, env)) return { status: 400, html: page('Link not valid', 'Lien non valide', 'This unsubscribe link is incomplete or has expired.', 'Ce lien de désabonnement est incomplet ou a expiré.') };
  const [m] = await db.q(`select id, first_name, name, email_opt_out from members where id = $1`, [memberId]);
  if (!m) return { status: 404, html: page('Not found', 'Introuvable', 'We could not find you in our list.', 'Nous ne vous avons pas trouvé dans notre liste.') };
  if (method === 'POST') {
    if (!m.email_opt_out) {
      await db.q(`update members set email_opt_out = true where id = $1`, [m.id]);
      await db.q(`insert into optout_events (member_id, channel, action, source) values ($1, 'email', 'out', 'email-link')`, [m.id]);
    }
    return { status: 200, html: page('You are unsubscribed', 'Vous êtes désabonné', 'You will no longer receive emails from Mont Carmel through ServiceSync.', 'Vous ne recevrez plus de courriels de Mont Carmel via ServiceSync.') };
  }
  const who = escapeHtml(m.first_name || String(m.name || '').split(' ')[0] || '');
  return { status: 200, html: page(`Unsubscribe${who ? ', ' + who : ''}?`, `Se désabonner${who ? ', ' + who : ''} ?`, 'Stop receiving emails from Mont Carmel through ServiceSync.', 'Ne plus recevoir de courriels de Mont Carmel via ServiceSync.', true) };
}

function page(titleEn, titleFr, en, fr, form = false) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titleEn} · Mont Carmel</title>
  <style>body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#f8f9fc;color:#1c2140;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}main{background:#fff;border:1px solid #e2e5ef;border-radius:16px;padding:28px;max-width:440px;width:100%}h1{font-size:1.25rem;margin:0 0 6px;color:#1f2a5c}p{color:#5f6680;margin:0 0 14px}hr{border:0;border-top:1px solid #e2e5ef;margin:18px 0}button{background:#8a2121;color:#fff;border:0;border-radius:10px;padding:11px 20px;font-size:1rem;cursor:pointer}</style></head>
  <body><main><h1>${titleEn}</h1><p>${en}</p><hr><h1 lang="fr">${titleFr}</h1><p lang="fr">${fr}</p>${form ? '<form method="post"><button type="submit">Unsubscribe · Se désabonner</button></form>' : ''}</main></body></html>`;
}
