/* "Import from Elvanto": pick the CSV export, check the columns, preview, import. Admins only. */
import { S, ui } from '../state.js';
import { esc } from '../util.js';
import { ic } from '../icons.js';
import { FIELDS, planImport, newFamilies } from '../importer.js';
import { cats, catName } from '../people.js';
import { t } from '../i18n.js';
import { STATUS } from '../members.js';

export const importPlan = () => planImport(ui.imp.rows, ui.imp.map, { lang: ui.imp.lang, status: ui.imp.status, cat: ui.imp.cat || 'congregation', categories: cats(true) }, Object.values(S.members));

export function importView() {
  const im = ui.imp;
  const head = `<h2>${ic('users')} Import from Elvanto</h2>`;
  if (!im || !im.rows) {
    return `${head}
      <ol class="imp-steps">
        <li>In Elvanto, open <b>People</b>. Leave the filters empty to export everyone.</li>
        <li>Click <b>Export</b> (top right) and choose <b>CSV</b>.</li>
        <li>Choose that file here. Nothing is saved until you confirm.</li>
      </ol>
      <label class="imp-drop"><input type="file" accept=".csv,text/csv" data-act="impFile"><span>${ic('plus')} Choose the CSV file</span></label>
      ${im?.error ? `<p class="imp-err">${esc(im.error)}</p>` : ''}
      <div class="row"><button class="btn ghost" data-act="closeModal">Cancel</button></div>`;
  }
  const p = importPlan(); const opt = (o, v) => Object.entries(o).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const noName = im.map.full == null && im.map.first == null && im.map.preferred == null && im.map.last == null;
  return `${head}<p class="sub" style="margin:0">${esc(im.fileName)} · ${im.rows.length} row${im.rows.length === 1 ? '' : 's'}</p>
    <div class="imp-sum"><span class="pill ok">${p.add.length} to add</span>${!ui.peopleMissing && newFamilies(p.add, Object.values(S.families)).length ? `<span class="pill info">${newFamilies(p.add, Object.values(S.families)).length} new families</span>` : ''}${p.dup.length ? `<span class="pill mute">${p.dup.length} ALREADY HERE</span>` : ''}${p.skip.length ? `<span class="pill warn">${p.skip.length} without a name</span>` : ''}</div>
    <details class="imp-cols" ${noName ? 'open' : ''}><summary>Columns ${noName ? '<span class="pill bad">Pick the name column</span>' : '<span class="sub" style="display:inline">(matched automatically, change if needed)</span>'}</summary>
      <div class="imp-grid">${FIELDS.map(([k, label]) => `<label class="f">${esc(label)}<select data-act="impMap" data-k="${k}"><option value="">— not in file —</option>${im.headers.map((h, i) => `<option value="${i}" ${im.map[k] === i ? 'selected' : ''}>${esc(h || 'Column ' + (i + 1))}</option>`).join('')}</select></label>`).join('')}</div></details>
    <div class="row" style="flex-wrap:nowrap;align-items:end">
      <label class="f" style="flex:1">Language when the file doesn't say<select data-act="impOpt" data-k="lang">${opt({ fr: 'French', en: 'English', both: 'Both' }, im.lang)}</select></label>
      ${ui.peopleMissing ? `<label class="f" style="flex:1">Status when the file doesn't say<select data-act="impOpt" data-k="status">${opt(STATUS, im.status)}</select></label>`
        : `<label class="f" style="flex:1">Category when the file doesn't say<select data-act="impOpt" data-k="cat">${opt(Object.fromEntries(cats().map(c => [c.id, c.name])), im.cat || 'congregation')}</select></label>`}</div>
    ${!ui.peopleMissing && !ui.flowsMissing ? `<div class="checks"><label><input type="checkbox" data-act="impOpt" data-k="flows" ${im.flows ? 'checked' : ''}> ${esc(t('importFlows'))}</label></div>` : ''}
    ${p.add.length ? `<div class="imp-prev"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>${ui.peopleMissing ? 'Status' : 'Category'}</th></tr></thead><tbody>${p.add.slice(0, 6).map(m => `<tr><td>${esc(m.name)}${m.household ? `<small>${esc(m.household)}</small>` : ''}</td><td>${esc(m.phone || '')}</td><td>${esc(m.email || '')}</td><td>${esc(ui.peopleMissing ? STATUS[m.status] : catName(m.category_id))}${!ui.peopleMissing && m.birthday ? `<small>${esc(m.birthday)}</small>` : ''}</td></tr>`).join('')}</tbody></table>${p.add.length > 6 ? `<p class="sub" style="margin:6px 0 0">and ${p.add.length - 6} more</p>` : ''}</div>` : ''}
    ${p.dup.length ? `<p class="sub" style="margin:0">Skipped because they're already in ServiceSync: ${esc(p.dup.slice(0, 5).map(d => `${d.name} (${d.why})`).join(', '))}${p.dup.length > 5 ? '…' : ''}</p>` : ''}
    <div class="row" style="justify-content:space-between"><div class="row"><button class="btn cta" data-act="impRun" ${p.add.length ? '' : 'disabled'}>Import ${p.add.length} ${p.add.length === 1 ? 'person' : 'people'}</button><button class="btn ghost" data-act="closeModal">Cancel</button></div>
      <button class="btn link" data-act="impReset">Choose another file</button></div>`;
}
