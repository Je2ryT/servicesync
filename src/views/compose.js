/* The "Contact" composer: choose Email / SMS / Both, write (with {first_name}), review, send. */
import { ui } from '../state.js';
import { esc } from '../util.js';
import { ic } from '../icons.js';
import { t } from '../i18n.js';
import { audience } from '../compose.js';
import { smsInfo, merge } from '../sms.js';

const names = list => list.slice(0, 8).map(m => esc(m.name)).join(', ') + (list.length > 8 ? ` +${list.length - 8}` : '');

/** Live counter under the message box (also refreshed while typing). */
export function counterHtml() {
  const c = ui.compose; if (!c || c.channel === 'email') return '';
  const a = audience(c.ids, c.channel);
  const longest = a.sms.reduce((best, m) => ((m.first || m.name || '').length > (best.first || best.name || '').length ? m : best), { first: '' });
  const info = smsInfo(merge(c.body, longest));
  return `${esc(t('smsCount', { chars: info.length, seg: info.segments, n: info.segments }))}${info.encoding === 'Unicode' ? `<br><span class="warn-t">${esc(t('unicode'))}</span>` : ''}`;
}

export function composeView() {
  const c = ui.compose; const a = audience(c.ids, c.channel);
  const ch = (v, l) => `<label class="chip"><input type="radio" name="cmpCh" data-act="cmpChannel" value="${v}" ${c.channel === v ? 'checked' : ''}> ${esc(l)}</label>`;
  const skips = [['optSms', 'whyOptSms'], ['noPhone', 'whyNoPhone'], ['optEmail', 'whyOptEmail'], ['noEmail', 'whyNoEmail']].filter(([k]) => a.skip[k].length);
  const head = `<h2>${ic('send')} ${esc(t('composeTitle'))}</h2><p class="sub" style="margin:0">${esc(t('to'))}: <b>${esc(c.label)}</b>${['selection', 'filter'].includes(c.source.kind) ? '' : ` · ${esc(t('inUse', { n: a.people.length }))}`}</p>`;

  if (c.step === 'done') {
    const r = c.result || {};
    return `${head}<div class="cmp-done ${r.failed ? 'part' : ''}">${ic(r.failed && !r.sent ? 'alert' : 'checkc')}<b>${esc(t('sentDone'))}</b><span>${esc(t('sentSummary', { sent: r.sent || 0, failed: r.failed || 0, skipped: r.skipped || 0 }))}</span></div>
      <div class="row"><button class="btn cta" data-act="cmpViewSent">${esc(t('viewSent'))}</button><button class="btn ghost" data-act="closeModal">${esc(t('close'))}</button></div>`;
  }
  if (c.step === 'confirm' || c.step === 'sending') {
    const seg = smsInfo(c.body).segments;
    return `${head}<div class="cmp-confirm"><h3>${esc(t('confirmTitle'))}</h3>
        <p>${esc(t('confirmLine', { people: a.reachable, sms: c.channel === 'email' ? 0 : a.sms.length, email: c.channel === 'sms' ? 0 : a.email.length }))}</p>
        ${c.channel !== 'email' && a.sms.length ? `<p class="sub">${esc(t('confirmSegments', { n: a.sms.length * seg }))}</p>` : ''}
        ${c.channel !== 'sms' ? `<p class="cmp-prev-subj"><b>${esc(merge(c.subject, a.email[0] || a.sms[0] || {}))}</b></p>` : ''}
        <blockquote>${esc(merge(c.body, a.sms[0] || a.email[0] || {}))}</blockquote></div>
      ${c.error ? `<p class="imp-err">${esc(t('sendError', { msg: c.error }))}<br><small>${esc(t('retrySafe'))}</small></p>` : ''}
      <div class="row"><button class="btn cta" data-act="cmpSend" ${c.step === 'sending' ? 'disabled' : ''}>${esc(c.step === 'sending' ? t('sending') : c.error ? t('retry') : t('sendNow'))}</button>
        <button class="btn ghost" data-act="cmpBack" ${c.step === 'sending' ? 'disabled' : ''}>${esc(t('backEdit'))}</button></div>`;
  }

  return `${head}
    ${a.outside ? `<p class="callout">${esc(t('notOnTeam', { n: a.outside }))}</p>` : ''}
    <div class="chips" role="radiogroup">${ch('sms', t('channelSms'))}${ch('email', t('channelEmail'))}${ch('both', t('channelBoth'))}</div>
    ${c.channel !== 'sms' ? `<label class="f">${esc(t('subject'))}<input type="text" id="cmpSubject" class="draft" data-act="cmpSubject" maxlength="200" value="${esc(c.subject)}"></label>` : ''}
    <label class="f">${esc(t('message'))}<textarea id="cmpBody" class="draft" data-act="cmpBody" rows="5" maxlength="1600">${esc(c.body)}</textarea></label>
    <div class="cmp-tools"><button class="btn link" data-act="cmpMerge">${ic('plus')} ${esc(t('insertFirstName'))}</button><span class="sub" id="cmpCount">${counterHtml()}</span></div>
    <p class="sub" style="margin:0;font-size:.8rem">${esc(t('mergeHint'))}</p>
    <div class="cmp-aud">${c.channel !== 'email' ? `<span class="pill ok">${esc(t('willGetSms', { n: a.sms.length }))}</span>` : ''}${c.channel !== 'sms' ? `<span class="pill ok">${esc(t('willGetEmail', { n: a.email.length }))}</span>` : ''}</div>
    ${skips.length ? `<details class="cmp-skip"><summary>${esc(t('skippedTitle'))} · ${skips.reduce((n, [k]) => n + a.skip[k].length, 0)}</summary>${skips.map(([k, l]) => `<p><b>${esc(t(l))} (${a.skip[k].length}):</b> ${names(a.skip[k])}</p>`).join('')}</details>` : ''}
    <div class="row"><button class="btn cta" data-act="cmpReview" ${a.reachable ? '' : 'disabled'}>${esc(t('review'))}</button><button class="btn ghost" data-act="closeModal">${esc(t('cancel'))}</button></div>
    ${a.reachable ? '' : `<p class="sub" style="margin:0">${esc(t('nobodyToSend'))}</p>`}`;
}
