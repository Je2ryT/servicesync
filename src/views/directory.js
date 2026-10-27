/* People: the church directory (filters, saved filters, bulk actions, CSV) and each person's profile. */
import { S, T, ui, me } from '../state.js';
import { esc, iso } from '../util.js';
import { ic } from '../icons.js';
import { t, lang, dateText } from '../i18n.js';
import { everyone, filterPeople, cats, catName, catOf, familyOf, lastAttended, ageOn, savedFilters, isFiltered, EMPTY } from '../people.js';
import { positionsOf, assignments, docOf, svcName, posName, status } from '../domain.js';
import { profileFollowups } from './followups.js';
import { can, isFull } from '../access.js';

const pf = () => ({ ...EMPTY, ...ui.pf });
const opt = (pairs, v) => pairs.map(([k, l]) => `<option value="${esc(k)}" ${k === (v || '') ? 'selected' : ''}>${esc(l)}</option>`).join('');
const initials = m => ((m.first || m.name || '?')[0] + ((m.last || '')[0] || '')).toUpperCase();
const catPill = m => { const c = catOf(m); return `<span class="pill cat c-${esc(c)}">${esc(catName(c, lang()))}</span>`; };
export const dbNeeded = file => `<div class="card empty">${esc(t('dbUpdate', { file })).replace(esc(file), `<code>${esc(file)}</code>`)}</div>`;

/* ---------- list ---------- */
export function peopleRowsHtml() {
  const list = filterPeople(pf()); const sel = new Set(ui.psel);
  if (!everyone().length) return `<div class="empty">${esc(t('noPeople'))}</div>`;
  if (!list.length) return `<div class="empty">${esc(t('noMatch'))}</div>`;
  return list.slice(0, 500).map(m => {
    const last = lastAttended(m.id); const fam = S.families[m.familyId]?.name;
    return `<div class="pr ${sel.has(m.id) ? 'sel' : ''}"><label class="pr-chk"><input type="checkbox" data-act="pSel" value="${esc(m.id)}" ${sel.has(m.id) ? 'checked' : ''} aria-label="${esc(m.name)}"></label>
      <button class="pr-main" data-act="openPerson" data-id="${esc(m.id)}"><span class="pr-av" aria-hidden="true">${esc(initials(m))}</span>
        <span class="pr-id"><b>${esc(m.name)}</b><small>${[m.phone, m.email].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</small></span>
        <span class="pr-meta">${catPill(m)}${fam ? `<small>${ic('users')} ${esc(fam)}</small>` : ''}<small>${last ? esc(t('lastSeen', { d: dateText(last, { month: 'short', day: 'numeric' }) })) : esc(t('neverSeen'))}</small></span></button></div>`;
  }).join('') + (list.length > 500 ? `<div class="empty">+${list.length - 500}</div>` : '');
}

export function bulkBarHtml() {
  const list = filterPeople(pf()); const n = ui.psel.length;
  return `<span>${esc(t('shown', { n: list.length }))}${n ? ' · <b>' + esc(t('selected', { n })) + '</b>' : ''}</span>
    <div class="row">${n ? `<button class="btn link" data-act="pSelNone">${esc(t('clearSelection'))}</button>` : `<button class="btn link" data-act="pSelAll" ${list.length ? '' : 'disabled'}>${esc(t('selectAll'))}</button>`}
      ${can('people') && n ? `<select data-act="pBulkCat" aria-label="${esc(t('setCategory'))}"><option value="">${esc(t('setCategory'))}</option>${opt(cats().map(c => [c.id, catName(c.id, lang())]), '')}</select>` : ''}
      <button class="btn" data-act="pExport" ${list.length ? '' : 'disabled'}>${ic('share')} ${esc(t('exportCsv'))}${n ? ` (${n})` : ''}</button>
      ${n ? `<button class="btn cta" data-act="contact" data-src="selection" data-label="${esc(t('selected', { n }))}">${ic('send')} ${esc(t('contactN', { n }))}</button>`
        : `<button class="btn" data-act="contact" data-src="filter" data-label="${esc(t('shown', { n: list.length }))}" ${list.length ? '' : 'disabled'}>${ic('send')} ${esc(t('contactShown'))}</button>`}</div>`;
}

export function vDirectory(seg) {
  if (ui.peopleMissing) return `<div><h1>${esc(t('people'))}</h1></div>${seg}${dbNeeded('migrations/006-people.sql')}`;
  if (ui.person) { if (S.members[ui.person]) return seg + vProfile(ui.person); ui.person = null; }
  const f = pf(); const saved = savedFilters(me.email); const all = everyone().length;
  const L = lang();
  return `<div class="head"><div><h1>${esc(t('people'))}</h1><p class="sub">${esc(t('peopleSub', { n: all }))}</p></div>
      <div class="row">${can('people') ? `<button class="btn" data-act="catEdit">${ic('layers')} ${esc(t('categories'))}</button><button class="btn cta" data-act="personEdit">${ic('plus')} ${esc(t('addPerson'))}</button>` : ''}</div></div>
    ${seg}
    <section class="card pf">
      <div class="ci-search">${ic('search')}<input type="search" class="draft" id="pfQ" data-act="pfQ" value="${esc(f.q)}" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}" autocomplete="off"></div>
      <div class="pf-row">
        <label class="f">${esc(t('category'))}<select data-act="pf" data-k="cat">${opt([['', t('allCategories')], ...cats().map(c => [c.id, catName(c.id, L)])], f.cat)}</select></label>
        <label class="f">${esc(t('language'))}<select data-act="pf" data-k="lang">${opt([['', t('anyLanguage')], ['en', t('english')], ['fr', t('french')], ['both', t('both')]], f.lang)}</select></label>
        <label class="f">${esc(t('service'))}<select data-act="pf" data-k="svc">${opt([['', t('anyService')], ['en', t('attendedEn')], ['fr', t('attendedFr')]], f.svc)}</select></label>
        <label class="f">${esc(t('lastAttended'))}<select data-act="pf" data-k="last">${opt([['', t('anyTime')], ['within2w', t('within2w')], ['within1m', t('within1m')], ['within3m', t('within3m')], ['notIn1m', t('notIn1m')], ['notIn3m', t('notIn3m')], ['never', t('never')]], f.last)}</select></label>
        <label class="f">${esc(t('phone'))}<select data-act="pf" data-k="phone">${opt([['', t('any')], ['yes', t('hasPhone')], ['no', t('noPhone')]], f.phone)}</select></label>
        <label class="f">${esc(t('email'))}<select data-act="pf" data-k="email">${opt([['', t('any')], ['yes', t('hasEmail')], ['no', t('noEmail')]], f.email)}</select></label>
      </div>
      <div class="pf-saved"><label class="f">${esc(t('savedFilters'))}<select data-act="pfLoad"><option value="">—</option>${saved.map(x => `<option value="${esc(x.id)}">${esc(x.name)}${x.shared ? ' · ' + esc(t('shared')) : ''}</option>`).join('')}</select></label>
        <div class="row">${isFiltered(f) ? `<button class="btn" data-act="pfSave">${esc(t('saveFilter'))}</button><button class="btn link" data-act="pfClear">${esc(t('clear'))}</button>` : ''}
          ${saved.some(x => x.owner === me.email.toLowerCase() || can('people')) ? `<button class="btn link" data-act="pfManage">${esc(t('savedFilters'))}…</button>` : ''}</div></div>
    </section>
    <div class="pbulk" id="pBulk">${bulkBarHtml()}</div>
    <section class="card plist" id="pList">${peopleRowsHtml()}</section>`;
}

/* ---------- profile ---------- */
function vProfile(id) {
  const m = { id, ...S.members[id] }; const p = ui.prof?.id === id ? ui.prof : null; const L = lang();
  const fam = familyOf(id).filter(x => x.id !== id); const famName = S.families[m.familyId]?.name;
  const age = ageOn(m.birthday); const st = S.mstats?.[id];
  const cid = m.coordinatorId && S.people[m.coordinatorId] ? m.coordinatorId : null;
  const mine = cid ? assignments().filter(a => a.person === cid).map(a => ({ a, d: docOf(a.sunId) })).filter(x => x.d && x.d.date >= T.todayIso && (me.admin || x.d.published)).sort((x, y) => x.d.date.localeCompare(y.d.date)).slice(0, 6) : [];
  const row = (k, v) => (v ? `<div><span>${esc(k)}</span><b>${v}</b></div>` : '');
  const catHistory = p ? p.history.map(h => `<li><span>${esc(dateText(new Date(h.at).toISOString().slice(0, 10)))}</span>${esc(h.from ? t('fromTo', { from: catName(h.from, L) || h.from, to: catName(h.to, L) || h.to }) : t('joined', { to: catName(h.to, L) || h.to }))}${h.by ? ` <small>${esc(t('setBy', { who: whoName(h.by) }))}</small>` : ''}${h.note ? ` <small>· ${esc(h.note)}</small>` : ''}</li>`).join('') : '';
  const weeks = attendanceStrip(p?.att || []);
  return `<div class="head prof-head"><div><button class="btn link noprint" data-act="personBack">${ic('left')} ${esc(t('back'))}</button>
      <div class="row" style="gap:14px;flex-wrap:nowrap"><div class="avatar sm" aria-hidden="true">${esc(initials(m))}</div><div><h1>${esc(m.name)}</h1><div class="row">${catPill(m)}${famName ? `<span class="pill mute">${esc(famName.toUpperCase())}</span>` : ''}${m.smsOptOut ? `<span class="pill warn">${esc(t('smsOptOut'))}</span>` : ''}${m.emailOptOut ? `<span class="pill warn">${esc(t('emailOptOut'))}</span>` : ''}</div></div></div></div>
      <div class="row"><button class="btn" data-act="contact" data-src="person" data-id="${esc(id)}" data-label="${esc(m.name)}">${ic('send')} ${esc(t('contact'))}</button>${can('people') ? `<button class="btn" data-act="personEdit" data-id="${esc(id)}">${ic('pencil')} ${esc(t('edit'))}</button>` : ''}${m.coordinatorId && S.people[m.coordinatorId] ? `<span class="pill role">${esc(t('onServingTeam'))}</span>` : can('schedule') ? `<button class="btn" data-act="editPerson" data-member="${esc(id)}">${ic('plus')} ${esc(t('addToServing'))}</button>` : ''}</div></div>
    <div class="prof-grid">
      <div class="prof-col">
        <section class="card"><div class="ch"><h3>${esc(t('details'))}</h3></div><div class="kv">
          ${row(t('phone'), esc(m.phone))}${row(t('email'), esc(m.email))}
          ${row(t('birthday'), m.birthday ? esc(dateText(m.birthday, { month: 'long', day: 'numeric', year: 'numeric' })) + (age != null ? ` <small>· ${esc(t('age', { n: age }))}</small>` : '') : '')}
          ${row(t('gender'), m.gender ? esc(t(m.gender)) : '')}${row(t('address'), esc(m.address).replace(/\n/g, '<br>'))}
          ${row(t('language'), esc(m.lang === 'both' ? t('both') : m.lang === 'en' ? t('english') : t('french')))}
          ${!m.phone && !m.email && !m.birthday && !m.address ? `<p class="sub" style="margin:0">${esc(t('unknown'))}</p>` : ''}</div></section>
        <section class="card"><div class="ch"><h3>${esc(t('familyMembers'))}${famName ? ` · ${esc(famName)}` : ''}</h3>${m.familyRole ? `<span class="pill mute">${esc(t(m.familyRole).toUpperCase())}</span>` : ''}</div>
          ${fam.length ? `<div class="fam">${fam.map(x => `<button class="fam-p" data-act="openPerson" data-id="${esc(x.id)}"><span class="pr-av" aria-hidden="true">${esc(initials(x))}</span><span><b>${esc(x.name)}</b><small>${x.familyRole ? esc(t(x.familyRole)) : ''}${x.birthday && ageOn(x.birthday) != null ? ' · ' + esc(t('age', { n: ageOn(x.birthday) })) : ''}</small></span></button>`).join('')}</div>`
            : `<div class="empty">${esc(famName ? '—' : t('noFamily'))}</div>`}</section>
        <section class="card"><div class="ch"><h3>${esc(t('servesAs'))}</h3></div>${cid ? `<div class="kv">${row(t('servesAs'), esc(positionsOf(cid).map(x => x.name).join(', ')) || '—')}</div>
          <div class="up">${mine.length ? mine.map(({ a, d }) => `<div><b>${esc(dateText(d.date, { weekday: 'short', month: 'short', day: 'numeric' }))}</b> ${esc(svcName(d, a.svc))} · ${esc(posName(a.pos))} <span class="pill ${status(a) === 'confirmed' ? 'ok' : status(a) === 'declined' ? 'bad' : 'warn'}">${esc(t(status(a)))}</span></div>`).join('') : `<p class="sub" style="margin:0">${esc(t('nothingScheduled'))}</p>`}</div>` : `<div class="empty">${esc(t('notServing'))}</div>`}</section>
      </div>
      <div class="prof-col">
        <section class="card"><div class="ch"><h3>${esc(t('notes'))}</h3></div>
          <div class="note-new"><textarea class="draft" id="noteNew" rows="2" placeholder="${esc(t('notePh'))}" aria-label="${esc(t('addNote'))}"></textarea><button class="btn cta" data-act="noteAdd" data-id="${esc(id)}">${esc(t('addNote'))}</button></div>
          ${!p ? `<div class="empty">${esc(t('loading'))}</div>` : p.notes.length ? `<ol class="notes">${p.notes.map(n => `<li><div class="note-h"><b>${esc(n.author ? whoName(n.author) : 'Elvanto / ServiceSync')}</b><span>${esc(new Date(n.at).toLocaleString(L === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }))}</span>
            ${can('people') || n.author === me.email.toLowerCase() ? `<button class="btn link danger" data-act="noteDel" data-id="${esc(n.id)}">${esc(t('del'))}</button>` : ''}</div><p>${esc(n.body)}</p></li>`).join('')}</ol>` : `<div class="empty">${esc(t('noNotes'))}</div>`}</section>
        ${profileFollowups(id)}
        <section class="card"><div class="ch"><h3>${esc(t('attendance'))}</h3>${st ? `<span class="sub" style="margin:0;font-size:.82rem">${esc(t('visits', { n: st.visits }))}</span>` : ''}</div>
          ${st ? `<div class="att-strip" aria-label="${esc(t('attendance'))}">${weeks}</div><p class="sub" style="padding:0 20px;margin:0 0 10px">${esc(t('firstVisit', { d: dateText(st.first) }))} · ${esc(t('lastSeen', { d: dateText(st.last) }))}</p>
            ${p ? `<ul class="att-list">${p.att.slice(0, 12).map(a => `<li>${esc(dateText(a.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }))}<span class="pill mute">${a.svc.toUpperCase()}</span></li>`).join('')}</ul>` : ''}` : `<div class="empty">${esc(t('noAttendance'))}</div>`}</section>
        <section class="card"><div class="ch"><h3>${esc(t('categoryHistory'))}</h3></div>${p ? (catHistory ? `<ul class="hist">${catHistory}</ul>` : '<div class="empty">—</div>') : `<div class="empty">${esc(t('loading'))}</div>`}</section>
      </div>
    </div>`;
}
const whoName = email => Object.values(S.people).find(x => (x.email || '').toLowerCase() === email)?.name || email;

/** The last 26 Sundays as squares: filled when they came to any service. */
export function attendanceStrip(att, n = 26) {
  const came = new Set(att.map(a => a.date)); const d = new Date(T.now.getFullYear(), T.now.getMonth(), T.now.getDate()); d.setDate(d.getDate() - d.getDay());
  const out = [];
  for (let i = 0; i < n; i++) { const k = iso(d); out.unshift(`<i class="${came.has(k) ? 'on' : ''}" title="${esc(dateText(k))}"></i>`); d.setDate(d.getDate() - 7); }
  return out.join('');
}

/* ---------- forms ---------- */
export function personForm(id) {
  const m = id ? S.members[id] : { first: '', last: '', phone: '', email: '', gender: '', birthday: '', address: '', lang: 'fr', categoryId: 'congregation', familyId: null, familyRole: '', smsOptOut: false, emailOptOut: false };
  const L = lang(); const fams = Object.entries(S.families).map(([fid, f]) => [fid, f.name]).sort((a, b) => a[1].localeCompare(b[1]));
  return `<h2>${esc(id ? m.name : t('addPerson'))}</h2>
    <div class="grid-2"><label class="f">${esc(t('firstName'))}<input type="text" id="pFirst" value="${esc(m.first)}"></label><label class="f">${esc(t('lastName'))}<input type="text" id="pLast" value="${esc(m.last)}"></label></div>
    <div class="grid-2"><label class="f">${esc(t('phone'))}<input type="tel" id="pPhone" value="${esc(m.phone)}"></label><label class="f">${esc(t('email'))}<input type="email" id="pEmail" value="${esc(m.email)}"></label></div>
    <div class="grid-3"><label class="f">${esc(t('gender'))}<select id="pGender">${opt([['', '—'], ['male', t('male')], ['female', t('female')]], m.gender)}</select></label>
      <label class="f">${esc(t('birthday'))}<input type="date" id="pBirthday" value="${esc(m.birthday)}"></label>
      <label class="f">${esc(t('language'))}<select id="pLang">${opt([['fr', t('french')], ['en', t('english')], ['both', t('both')]], m.lang)}</select></label></div>
    <label class="f">${esc(t('address'))}<textarea id="pAddress" rows="2">${esc(m.address)}</textarea></label>
    <div class="grid-2"><label class="f">${esc(t('category'))}<select id="pCat">${opt(cats().map(c => [c.id, catName(c.id, L)]), catOf(m))}</select></label>
      <label class="f">${esc(t('role'))}<select id="pRole">${opt([['', '—'], ['adult', t('adult')], ['child', t('child')]], m.familyRole)}</select></label></div>
    <div class="grid-2"><label class="f">${esc(t('family'))}<select id="pFam" data-act="pFamPick">${opt([['', t('noFamily')], ...fams, ['__new', t('newFamily')]], m.familyId || '')}</select></label>
      <label class="f" id="pFamNewWrap" hidden>${esc(t('familyName'))}<input type="text" id="pFamNew" placeholder="${esc((m.last || '') + (L === 'fr' ? '' : ' family'))}"></label></div>
    <div class="checks"><label><input type="checkbox" id="pSmsOut" ${m.smsOptOut ? 'checked' : ''}> ${esc(t('smsOptOut'))}</label><label><input type="checkbox" id="pEmailOut" ${m.emailOptOut ? 'checked' : ''}> ${esc(t('emailOptOut'))}</label></div>
    <div class="row" style="justify-content:space-between"><div class="row"><button class="btn cta" data-act="personSave" data-id="${esc(id || '')}">${esc(t('save'))}</button><button class="btn ghost" data-act="closeModal">${esc(t('cancel'))}</button></div>
      ${id ? `<button class="btn danger" data-act="personDel" data-id="${esc(id)}">${esc(t('remove'))}</button>` : ''}</div>`;
}

/** Categories editor; works on ui.catDraft (ordered) until Save. */
export function categoryForm() {
  const count = {}; Object.values(S.members).forEach(m => { const c = catOf(m); count[c] = (count[c] || 0) + 1; });
  const d = ui.catDraft || [];
  return `<h2>${ic('layers')} ${esc(t('catEditor'))}</h2><p class="sub" style="margin:0">${esc(t('catEditorSub'))}</p>
    <div class="cat-ed">${d.map((c, i) => `<div class="cat-row ${c.hidden ? 'off' : ''}">
      <input type="text" data-ci="${i}" data-f="name" value="${esc(c.name)}" aria-label="${esc(t('nameEn'))}">
      <input type="text" data-ci="${i}" data-f="nameFr" value="${esc(c.nameFr || '')}" aria-label="${esc(t('nameFr'))}" placeholder="${esc(t('nameFr'))}">
      <span class="sub" style="margin:0;font-size:.8rem;white-space:nowrap">${c.id ? esc(t('inUse', { n: count[c.id] || 0 })) : ''}</span>
      <label class="cat-hide"><input type="checkbox" data-ci="${i}" data-f="hidden" ${c.hidden ? 'checked' : ''}> ${esc(t('hidden'))}</label>
      <button class="ib" data-act="catMove" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${ic('up')}</button></div>`).join('')}</div>
    <div class="row"><input type="text" id="catNew" placeholder="${esc(t('addCategory'))}" style="flex:1;min-width:0"><button class="btn" data-act="catAdd">${ic('plus')} ${esc(t('addCategory'))}</button></div>
    <div class="row"><button class="btn cta" data-act="catSave">${esc(t('save'))}</button><button class="btn ghost" data-act="closeModal">${esc(t('cancel'))}</button></div>`;
}

export function saveFilterForm() {
  return `<h2>${esc(t('saveFilter'))}</h2><label class="f">${esc(t('filterName'))}<input type="text" id="sfName"></label>
    <div class="checks"><label><input type="checkbox" id="sfShared" ${can('people') ? 'checked' : ''}> ${esc(t('shareFilter'))}</label></div>
    <div class="row"><button class="btn cta" data-act="pfSaveGo">${esc(t('save'))}</button><button class="btn ghost" data-act="closeModal">${esc(t('cancel'))}</button></div>`;
}
export function manageFiltersForm() {
  const list = savedFilters(me.email).filter(x => can('people') || x.owner === me.email.toLowerCase());
  return `<h2>${esc(t('savedFilters'))}</h2><div class="sf-list">${list.map(x => `<div class="row" style="justify-content:space-between"><span>${esc(x.name)}${x.shared ? ` <span class="pill mute">${esc(t('shared').toUpperCase())}</span>` : ''}</span><button class="btn link danger" data-act="pfDel" data-id="${esc(x.id)}">${esc(t('deleteFilter'))}</button></div>`).join('') || '<p class="sub">—</p>'}</div>
    <div class="row"><button class="btn ghost" data-act="closeModal">${esc(t('cancel'))}</button></div>`;
}
