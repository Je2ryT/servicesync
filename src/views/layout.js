/* Printable service layout (Reports → a service → Service layout), and the placeholder editor
   used on Templates. The printed sheet follows the service's language: French services print in French. */
import { S, T, ui, me } from '../state.js';
import { esc } from '../util.js';
import { ic } from '../icons.js';
import { t, tIn, lang } from '../i18n.js';
import { svcName, allPositions, startOf, tplFor, total } from '../domain.js';
import { clock } from '../util.js';
import { ROLES, COLORS, tagLabel, layoutOf, openCount, positionFor } from '../layout.js';
import { canWrite as canRun } from './timer.js';
import { can, isFull } from '../access.js';

export const sheetLang = svc => (svc === 'fr' ? 'fr' : svc === 'en' ? 'en' : lang());
/** "9:30 AM" in English, "9 h 30" in French. */
export const timeIn = (hhmmAmPm, L) => {
  if (L !== 'fr') return hhmmAmPm;
  const m = /^(\d+):(\d\d) (AM|PM)$/.exec(hhmmAmPm); if (!m) return hhmmAmPm;
  const h = (+m[1] % 12) + (m[3] === 'PM' ? 12 : 0); return `${h} h ${m[2]}`;
};
const serviceTitle = (doc, svc, L) => (svc === 'ev' ? svcName(doc, svc) : tIn(L, svc === 'fr' ? 'svcFrName' : 'svcEnName'));
const tag = (x, L) => `<span class="ltag ${esc(x.color)}">${esc(tagLabel(x, L))}</span>`;

export function vLayout(doc, svc) {
  const L = sheetLang(svc); const rows = layoutOf(doc, svc); const edit = canRun(doc); const open = openCount(rows);   // `edit`, not `can`: can() is the access check
  const anyTags = rows.some(r => r.tags.length);
  const dateLong = new Date(doc.date + 'T12:00:00').toLocaleDateString(L === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const who = (r, x) => {
    const name = x.names.join(', ');
    const screen = edit
      ? `<input type="text" class="draft lay-in noprint" data-act="layName" data-sun="${esc(doc.id)}" data-svc="${esc(svc)}" data-item="${esc(r.id)}" data-tag="${esc(x.id)}" value="${esc(x.typed ? name : '')}" placeholder="${esc(!x.typed && name ? name : t('namePh'))}" aria-label="${esc(tagLabel(x, lang()) + ' · ' + r.item)}">`
      : `<span class="lay-name noprint">${name ? esc(name) : '<span class="lay-blank"></span>'}</span>`;
    return `<div class="lay-who">${tag(x, L)}${screen}<span class="lay-name print-only">${name ? esc(name) : '<span class="lay-blank"></span>'}</span>${!x.typed && x.fromSchedule && edit ? `<small class="noprint">${esc(t('fromSchedule'))}</small>` : ''}</div>`;
  };
  return `<div class="head noprint"><div><button class="btn link" data-act="layBack">${ic('left')} ${esc(t('allServices'))}</button><h1>${esc(t('serviceLayout'))}</h1>
      <p class="sub">${esc(t('layoutSub'))}${edit ? ' ' + esc(t('layoutEditHint')) : ''}</p></div>
      <div class="row">${open ? `<span class="pill warn">${esc(t('layoutOpen', { n: open }))}</span>` : anyTags ? `<span class="pill ok">${esc(t('layoutFull'))}</span>` : ''}<button class="btn cta" data-act="layPrint">${ic('printer')} ${esc(t('printLayout'))}</button></div></div>
    ${anyTags ? '' : `<div class="card empty noprint">${esc(t('noPlaceholders'))} ${can('templates') ? `<button class="btn link" data-act="tab" data-tab="templates">${esc(t('openTemplates'))}</button>` : ''}</div>`}
    <article class="card lay-sheet" lang="${L}">
      <header class="lay-head"><img src="/mc-logo.png" alt="" class="lay-logo"><div><span class="lay-church">Mont Carmel</span><h2>${esc(tIn(L, 'layoutTitle'))}</h2>
        <p>${esc(serviceTitle(doc, svc, L))} · ${esc(dateLong)} · ${esc(timeIn(clock(startOf(doc, svc)), L))} – ${esc(timeIn(clock(startOf(doc, svc), total(tplFor(doc, svc))), L))}</p></div></header>
      <table class="lay-t"><thead><tr><th>${esc(tIn(L, 'colTime'))}</th><th>${esc(tIn(L, 'colPart'))}</th><th>${esc(tIn(L, 'colWho'))}</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td class="lay-time">${esc(timeIn(r.start, L))}</td><td class="lay-part"><b>${esc(r.item)}</b><small>${esc(tIn(L, 'minShort', { n: r.min }))}</small></td>
          <td>${r.tags.length ? r.tags.map(x => who(r, x)).join('') : ''}</td></tr>`).join('')}</tbody></table>
      <footer class="lay-foot"><b>${esc(tIn(L, 'layoutNotes'))}</b><span class="lay-line"></span><span class="lay-line"></span><span class="lay-line"></span>
        <small>${esc(tIn(L, 'layoutPrinted', { d: new Date(T.todayIso + 'T12:00:00').toLocaleDateString(L === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }))}</small></footer>
    </article>`;
}

/* ---------- placeholder editor (Templates) ---------- */
export function tagsLine(tid, o, editable) {
  const list = (o.roles || []);
  return `<div class="ph-line">${list.map(x => `<span class="ltag ${esc(x.color || ROLES[x.role]?.color || 'white')}">${esc(tagLabel({ role: x.role, label: x.label }, lang()))}</span>`).join('')}
    ${editable ? `<button class="btn link sm" data-act="phEdit" data-tid="${esc(tid)}" data-id="${esc(o.id)}">${ic(list.length ? 'pencil' : 'plus')} ${esc(t(list.length ? 'editPlaceholders' : 'addPlaceholder'))}</button>` : ''}</div>`;
}

export function placeholderForm() {
  const d = ui.phDraft; const pos = allPositions().filter(p => p.active !== false);
  const colorPick = (x, i) => `<div class="ph-colors" role="radiogroup" aria-label="${esc(t('tagColor'))}">${COLORS.map(c => `<label class="ph-sw ${c}"><input type="radio" name="phc-${i}" value="${c}" data-f="color" data-i="${i}" ${x.color === c ? 'checked' : ''}><span>${esc(t('color_' + c))}</span></label>`).join('')}</div>`;
  return `<h2>${esc(t('placeholdersFor', { item: d.item || '…' }))}</h2><p class="sub" style="margin:0">${esc(t('placeholdersSub'))}</p>
    <div class="ph-rows">${d.list.map((x, i) => `<div class="ph-row">
      <select data-act="phRole" data-f="role" data-i="${i}" aria-label="${esc(t('role'))}">${Object.keys(ROLES).map(r => `<option value="${r}" ${x.role === r ? 'selected' : ''}>${esc(ROLES[r][lang()])}</option>`).join('')}</select>
      <input type="text" data-f="label" data-i="${i}" value="${esc(x.label)}" placeholder="${esc(t('customLabel'))}" aria-label="${esc(t('customLabel'))}" ${x.role === 'other' ? '' : 'hidden'}>
      ${colorPick(x, i)}
      <select data-f="pos" data-i="${i}" aria-label="${esc(t('fillFrom'))}"><option value="">${esc(t('fillAuto'))}${(() => { const p = positionFor(x); return p && !x.pos ? ' (' + esc(S.pos[p].name) + ')' : ''; })()}</option>${pos.map(p => `<option value="${esc(p.id)}" ${x.pos === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <button class="ib" data-act="phDel" data-i="${i}" aria-label="${esc(t('del'))}">${ic('trash')}</button></div>`).join('') || `<p class="empty" style="padding:6px 0">${esc(t('noPlaceholdersYet'))}</p>`}</div>
    <div><button class="btn" data-act="phAdd">${ic('plus')} ${esc(t('addPlaceholder'))}</button></div>
    <p class="sub" style="margin:0">${esc(t('fillHelp'))}</p>
    <div class="row"><button class="btn cta" data-act="phSave">${esc(t('done'))}</button><button class="btn ghost" data-act="closeModal">${esc(t('cancel'))}</button></div>`;
}
