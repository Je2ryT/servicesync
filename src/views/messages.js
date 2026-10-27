/* Sent messages: every email and text sent from ServiceSync (admins see all; others their own). */
import { ui, me } from '../state.js';
import { esc } from '../util.js';
import { ic } from '../icons.js';
import { t, locale } from '../i18n.js';

export const msgState = () => ui.msgs || (ui.msgs = { rows: [], loaded: false, loading: false, error: '', open: null, recips: null });
const STATUS = { sending: 'statusSending', sent: 'statusSent', partial: 'statusPartial', failed: 'statusFailed', delivered: 'statusDelivered', skipped: 'statusSkipped', queued: 'statusQueued' };
const CLS = { sent: 'ok', delivered: 'ok', partial: 'warn', sending: 'info', queued: 'mute', failed: 'bad', skipped: 'mute' };
export const statusPill = st => `<span class="pill ${CLS[st] || 'mute'}">${esc(t(STATUS[st] || st))}</span>`;
const when = ms => new Date(ms).toLocaleString(locale(), { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const chan = c => (c === 'both' ? `${ic('send')} ${esc(t('channelBoth'))}` : c === 'sms' ? esc(t('channelSms')) : esc(t('channelEmail')));

export function vMessages() {
  const s = msgState();
  const head = `<div class="head"><div><h1>${esc(t('sentMessages'))}</h1><p class="sub">${esc(t('sentSub'))}</p></div><button class="btn" data-act="msgRefresh" ${s.loading ? 'disabled' : ''}>${esc(s.loading ? t('loading') : t('refresh'))}</button></div>`;
  if (s.error) return head + `<div class="card empty">${esc(s.error)}</div>`;
  if (!s.loaded) return head + `<div class="card empty">${esc(t('loading'))}</div>`;
  if (s.open) {
    const m = s.rows.find(x => x.id === s.open);
    if (m) return head + `<section class="card msg-one"><div class="ch"><div><button class="btn link" data-act="msgClose">${ic('left')} ${esc(t('allMessages'))}</button><h3>${esc(m.subject || m.body.split('\n')[0].slice(0, 80))}</h3>
        <span class="sub" style="margin:0">${esc(when(m.at))} · ${esc(t('by', { who: m.senderName || m.sender }))} · ${chan(m.channel)}</span></div>${statusPill(m.status)}</div>
      <blockquote class="msg-body">${esc(m.body)}</blockquote>
      <p class="sub" style="padding:0 20px">${esc(t('sentSummary', { sent: m.sent, failed: m.failed, skipped: m.skipped }))}</p>
      <div class="msg-rec"><table><thead><tr><th>${esc(t('recipients'))}</th><th></th><th></th><th></th></tr></thead><tbody>${!s.recips ? `<tr><td colspan="4">${esc(t('loading'))}</td></tr>`
        : s.recips.map(r => `<tr><td>${esc(r.name || '—')}</td><td>${esc(r.channel === 'sms' ? 'SMS' : t('channelEmail'))}</td><td class="addr">${esc(r.address || '')}</td><td>${statusPill(r.status)}${r.reason ? `<small>${esc(r.reason)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div></section>`;
    s.open = null;
  }
  if (!s.rows.length) return head + `<div class="card empty">${esc(t('noMessages'))}</div>`;
  return head + `<section class="card msg-list">${s.rows.map(m => `<button class="msg-it" data-act="msgOpen" data-id="${esc(m.id)}">
      <span class="msg-when">${esc(when(m.at))}</span>
      <span class="msg-what"><b>${esc(m.subject || m.body.split('\n')[0].slice(0, 90))}</b><small>${me.admin ? esc(m.senderName || m.sender) + ' · ' : ''}${chan(m.channel)} · ${esc(t('inUse', { n: m.recipients }))}</small></span>
      <span class="msg-st">${statusPill(m.status)}<small>${esc(t('sentSummary', { sent: m.sent, failed: m.failed, skipped: m.skipped }))}</small></span></button>`).join('')}</section>`;
}

export const messageRow = r => ({ id: r.id, at: Date.parse(r.created_at), sender: r.sender_email, senderName: r.sender_name || '', channel: r.channel, subject: r.subject || '', body: r.body || '', status: r.status, recipients: r.recipients, sent: r.sent, failed: r.failed, skipped: r.skipped });
