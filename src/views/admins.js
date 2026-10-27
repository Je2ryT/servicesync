/* People → Administrators (administrators only): who has administrator access, add and remove. */
import { S, me } from '../state.js';
import { esc } from '../util.js';
import { ic } from '../icons.js';
import { t, dateText } from '../i18n.js';
import { people } from '../domain.js';

/** Administrators, matched to the serving team by email; you first, then by name. */
export function adminList() {
  const byEmail = {}; people().forEach(p => { if (p.email) byEmail[String(p.email).toLowerCase()] = p; });
  const mine = String(me.email || '').toLowerCase();
  return Object.entries(S.admins || {}).map(([email, a]) => ({ email, ...a, person: byEmail[email] || null, you: email === mine }))
    .sort((a, b) => (b.you - a.you) || (a.person?.name || a.email).localeCompare(b.person?.name || b.email));
}
/** Serving-team members with an email who aren't administrators yet. */
export const adminCandidates = () => people().filter(p => p.active !== false && p.email && !S.admins?.[String(p.email).toLowerCase()]);
export const nameOf = email => adminList().find(a => a.email === email)?.person?.name || email;

export function vAdmins(seg) {
  const list = adminList(); const cands = adminCandidates(); const only = list.length <= 1;
  const by = e => { const p = people().find(x => String(x.email || '').toLowerCase() === String(e || '').toLowerCase()); return p ? p.name : e; };
  return `<div class="head"><div><h1>${esc(t('admins'))}</h1><p class="sub">${esc(t('adminsSub'))}</p></div></div>${seg}
    <section class="card adm-add"><div class="ch"><h3>${ic('plus')} ${esc(t('addAdmin'))}</h3></div>
      <div class="adm-form">${cands.length ? `<label class="f">${esc(t('adminPick'))}<select id="admPick"><option value="">—</option>${cands.map(p => `<option value="${esc(String(p.email).toLowerCase())}">${esc(p.name)} · ${esc(p.email)}</option>`).join('')}</select></label>` : ''}
        <label class="f">${esc(cands.length ? t('adminOr') : t('adminEmail'))}<input type="email" id="admEmail" class="draft" placeholder="${esc(t('adminEmailPh'))}" autocomplete="off"></label>
        <button class="btn cta" data-act="adminAdd">${esc(t('addAdmin'))}</button></div>
      <p class="sub nfoot" id="admMsg">${esc(t('adminsHelp'))}</p></section>
    <section class="card"><div class="adm-list">${list.map(a => `<div class="adm-row">
      <span class="pr-av" aria-hidden="true">${esc((a.person?.name || a.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join(''))}</span>
      <span class="adm-who"><b>${esc(a.person?.name || a.email)}${a.you ? ` <span class="pill info">${esc(t('adminIsYou'))}</span>` : ''}</b>
        <small>${esc(a.email)}${a.person ? '' : ' · ' + esc(t('adminNotRoster'))}${a.by && a.by !== a.email ? ' · ' + esc(t('adminAddedBy', { who: by(a.by) })) : ''}${a.at ? ' · ' + esc(dateText(new Date(a.at).toISOString().slice(0, 10))) : ''}</small></span>
      <button class="btn ghost sm" data-act="adminRemove" data-email="${esc(a.email)}" ${only ? `disabled title="${esc(t('adminLast'))}"` : ''}>${ic('trash')} ${esc(t('adminRemove'))}</button></div>`).join('')}</div>
      ${only ? `<p class="sub nfoot">${esc(t('adminLast'))}</p>` : ''}</section>`;
}

export function removeForm(email) {
  const you = email === String(me.email || '').toLowerCase();
  return `<h2>${esc(t('adminRemoveTitle', { name: nameOf(email) }))}</h2><p class="sub" style="margin:0">${esc(t('adminRemoveBody'))}</p>
    ${you ? `<p class="sub" style="margin:0;color:var(--bad);font-weight:600">${esc(t('adminRemoveSelf'))}</p>` : ''}
    <div class="row"><button class="btn cta" data-act="adminRemoveGo" data-email="${esc(email)}">${esc(t('adminRemove'))}</button><button class="btn ghost" data-act="closeModal">${esc(t('cancel'))}</button></div>`;
}
