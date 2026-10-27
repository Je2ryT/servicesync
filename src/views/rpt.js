/* Attendance & people reports: a list of reports, one report at a time with its settings,
   charts for attendance, CSV download, and (admins) weekly report emails. English and French. */
import { S, T, ui, me } from '../state.js';
import { esc } from '../util.js';
import { ic } from '../icons.js';
import { t, lang } from '../i18n.js';
import { REPORTS, GROUPS, RANGES, reportDef, rangeOf, cellText, attendanceByDate, attendanceByMonth, attendanceByCategory } from '../reportdefs.js';
import { catName, everyone } from '../people.js';
import { flowList, flowName } from '../flows.js';
import { runReport, loadSchedules } from '../data.js';
import { dbNeeded } from './directory.js';
import { can, isFull } from '../access.js';

const MAX_ROWS = 300;
export const visibleReports = () => REPORTS.filter(r => !r.admin || can('messaging'));
export const paramsOf = id => ui.rpt.params[id] || (ui.rpt.params[id] = { ...reportDef(id).params });
export const argsOf = id => reportDef(id).args(paramsOf(id), T.todayIso);
export const keyOf = id => id + JSON.stringify(argsOf(id));
export const ctx = () => ({ lang: lang(), cat: id => catName(id, lang()) });
const L = o => o[lang()];

/** The report's rows (starting the load when needed). */
export function stateOf(id) {
  const def = reportDef(id); const key = keyOf(id); const c = ui.rpt.cache[key];
  if (id === 'person' && !paramsOf(id).member) return { idle: true };
  if (!c) { setTimeout(() => runReport(key, def.rpc, argsOf(id)), 0); return { loading: true }; }
  return c;
}

/* ---------- list ---------- */
function vList() {
  const groups = Object.keys(GROUPS).map(g => [g, visibleReports().filter(r => r.group === g)]).filter(([, l]) => l.length);
  return `<div><h1>${esc(t('churchReports'))}</h1><p class="sub">${esc(t('churchReportsSub'))}</p></div>
    <div class="rpt-groups">${groups.map(([g, list]) => `<section class="card rpt-group"><div class="ch"><h3>${esc(L(GROUPS[g]))}</h3></div>
      ${list.map(r => `<button class="rpt-item" data-act="rptOpen" data-id="${r.id}"><span><b>${esc(L(r.title))}</b><small>${esc(L(r.desc))}</small></span>${ic('right')}</button>`).join('')}</section>`).join('')}</div>
    ${can('reports') ? vSchedules() : ''}`;
}

const dayNames = () => t('weekdays').split(',');
function vSchedules() {
  const s = ui.rpt.sched; if (!s.loaded && !s.loading) setTimeout(() => loadSchedules(), 0);
  if (s.missing) return '';
  return `<section class="card"><div class="ch"><h3>${ic('send')} ${esc(t('weeklyEmails'))}</h3></div><p class="sub" style="margin:0;padding:0 16px">${esc(t('weeklyEmailsSub'))}</p>
    ${s.rows.length ? `<div class="rpt-sched">${s.rows.map(x => { const d = reportDef(x.report); return `<div class="rpt-srow ${x.active ? '' : 'off'}">
      <span><b>${esc(d ? L(d.title) : x.report)}</b><small>${esc(dayNames()[x.weekday] || '')} · ${esc((x.recipients || []).join(', '))}${x.active ? '' : ' · ' + esc(t('paused'))}${x.last_sent ? ' · ' + esc(t('lastSentOn', { d: x.last_sent })) : ''}</small></span>
      <button class="btn link" data-act="rschToggle" data-id="${esc(x.id)}">${esc(x.active ? t('pause') : t('resume'))}</button><button class="ib" data-act="rschDel" data-id="${esc(x.id)}" aria-label="${esc(t('del'))}">${ic('trash')}</button></div>`; }).join('')}</div>`
      : `<div class="empty">${esc(t('noSchedules'))}</div>`}</section>`;
}

/* ---------- one report ---------- */
function controls(id) {
  const p = paramsOf(id); const out = [];
  if (id === 'person') out.push(`<label class="f">${esc(t('person'))}<select data-act="rptParam" data-k="member"><option value="">—</option>${everyone().map(m => `<option value="${esc(m.id)}" ${m.id === p.member ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>`);
  if ('range' in p) out.push(`<label class="f">${esc(t('range'))}<select data-act="rptParam" data-k="range">${Object.entries(RANGES).map(([k, r]) => `<option value="${k}" ${k === p.range ? 'selected' : ''}>${esc(L(r.label))}</option>`).join('')}</select></label>`);
  const num = (k, label, max) => `<label class="f">${esc(t(label))}<input type="number" min="${k === 'days' ? 0 : 1}" max="${max}" data-act="rptParam" data-k="${k}" value="${esc(p[k])}"></label>`;
  if ('weeks' in p) out.push(num('weeks', 'weeksAway', 52), num('min', 'minVisits', 26));
  if ('days' in p) out.push(num('days', 'noNoteDays', 3650));
  return `<div class="rpt-ctl">${out.join('')}</div>`;
}

export function vReport(id) {
  const def = reportDef(id); const st = stateOf(id); const rows = st.rows || [];
  const r = 'range' in paramsOf(id) ? rangeOf(paramsOf(id).range, T.todayIso) : null;
  const head = `<div class="head"><div><button class="btn link" data-act="rptBack">${ic('left')} ${esc(t('allReports'))}</button><h1>${esc(L(def.title))}</h1><p class="sub">${esc(L(def.desc))}${r ? ` · ${esc(r.from)} → ${esc(r.to)}` : ''}</p></div>
    <div class="row"><button class="btn" data-act="rptCsv" ${st.rows ? '' : 'disabled'}>${ic('share')} ${esc(t('downloadCsv'))}</button>${can('reports') && !def.noSchedule ? `<button class="btn" data-act="rschNew">${ic('send')} ${esc(t('emailWeekly'))}</button>` : ''}</div></div>`;
  let body;
  if (st.missing) body = dbNeeded('migrations/009-reports.sql');
  else if (st.idle) body = `<div class="card empty">${esc(t('choosePersonFirst'))}</div>`;
  else if (st.loading) body = `<div class="card empty">${esc(t('loading'))}</div>`;
  else if (st.error) body = `<div class="card empty">${esc(st.error)}</div>`;
  else if (!rows.length) body = `<div class="card empty">${esc(t('noRows'))}</div>`;
  else body = id === 'attendance' ? vAttendance(rows) : id === 'person' ? vPerson(rows, r) : id === 'absentees' ? vAbsentees(def, rows) : `<section class="card">${table(def, rows)}</section>`;
  return head + controls(id) + body;
}

function table(def, rows, { select = false } = {}) {
  const c = ctx(); const shown = rows.slice(0, MAX_ROWS); const sel = new Set(ui.rpt.sel);
  return `<div class="rpt-wrap"><table class="rpt-t"><thead><tr>${select ? `<th class="ck"><input type="checkbox" data-act="rptSelAll" aria-label="${esc(t('selectAll'))}" ${rows.length && rows.every(x => sel.has(x.member_id)) ? 'checked' : ''}></th>` : ''}${def.columns.map(col => `<th class="${col.fmt === 'num' ? 'n' : ''}">${esc(col.label[lang()])}</th>`).join('')}</tr></thead>
    <tbody>${shown.map(x => `<tr>${select ? `<td class="ck"><input type="checkbox" data-act="rptSel" data-id="${esc(x.member_id)}" ${sel.has(x.member_id) ? 'checked' : ''} aria-label="${esc(x.name)}"></td>` : ''}${def.columns.map(col => {
      const v = esc(cellText(col, x[col.k], c));
      return `<td class="${col.fmt === 'num' ? 'n' : ''}">${col.k === 'name' && x.member_id ? `<button class="btn link" data-act="openPerson" data-id="${esc(x.member_id)}">${v}</button>` : v}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>
    ${rows.length > MAX_ROWS ? `<p class="sub nfoot">${esc(t('showingOf', { n: MAX_ROWS, total: rows.length }))}</p>` : ''}`;
}

function vAbsentees(def, rows) {
  const ids = new Set(rows.map(r => r.member_id)); ui.rpt.sel = ui.rpt.sel.filter(id => ids.has(id));
  const n = ui.rpt.sel.length;
  const bar = `<div class="pbulk"><span>${n ? '<b>' + esc(t('selectedN', { n })) + '</b>' : esc(t('selectedN', { n: 0 }))}</span><div class="row">
    <button class="btn" data-act="rptFlow" ${n && flowList().length ? '' : 'disabled'}>${ic('users')} ${esc(t('addToFollowup'))}</button>
    <button class="btn cta" data-act="contact" data-src="report" data-label="${esc(t('selectedN', { n }))}" ${n ? '' : 'disabled'}>${ic('send')} ${esc(t('contactN', { n }))}</button></div></div>`;
  return `<section class="card">${bar}${table(def, rows, { select: true })}</section>`;
}

/* ---------- attendance: charts and tables ---------- */
const SERIES = [['en', '#2a78d6'], ['fr', '#eb6834'], ['ev', '#1baf7a']];   // validated categorical slots 1–3 (colour-blind safe)
const svcLabel = s => t(s === 'en' ? 'english' : s === 'fr' ? 'french' : 'special');
const short = d => new Date(d + 'T12:00:00').toLocaleDateString(lang() === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' });
const monthLabel = m => new Date(m + '-15T12:00:00').toLocaleDateString(lang() === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', year: 'numeric' });

/** Stacked columns per service date (one colour per service), gridlines and a hover title on each column. */
export function attendanceChart(byDate) {
  const series = SERIES.filter(([s]) => byDate.some(d => d[s]));
  const W = 720, H = 220, P = { l: 36, r: 8, t: 10, b: 26 }; const pw = W - P.l - P.r, ph = H - P.t - P.b;
  const max = Math.max(1, ...byDate.map(d => d.total)); const step = Math.pow(10, Math.floor(Math.log10(max))); const top = Math.ceil(max / step) * step;
  const y = v => P.t + ph - (v / top) * ph; const bw = pw / byDate.length; const w = Math.max(2, Math.min(36, bw - 2));
  const grid = [0, top / 2, top].map(v => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" class="g"/><text x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`).join('');
  const cols = byDate.map((d, i) => {
    const x = P.l + i * bw + (bw - w) / 2; let at = 0; const segs = series.filter(([s]) => d[s]).map(([s, color], j, arr) => {
      const y0 = y(at), y1 = y(at + d[s]); at += d[s]; const last = j === arr.length - 1;
      return `<rect x="${x}" y="${y1}" width="${w}" height="${Math.max(0, y0 - y1 - (j ? 0 : 0))}" fill="${color}" ${last ? 'rx="2"' : ''} stroke="var(--surface)" stroke-width="${j ? 1 : 0}"/>`;
    }).join('');
    const tip = `${short(d.date)}: ${series.map(([s]) => `${svcLabel(s)} ${d[s]}`).join(' · ')} · ${t('total')} ${d.total}${d.first ? ` · ${t('firstVisits')} ${d.first}` : ''}`;
    return `<g class="col"><title>${esc(tip)}</title><rect x="${P.l + i * bw}" y="${P.t}" width="${bw}" height="${ph}" fill="transparent"/>${segs}</g>`;
  }).join('');
  const ticks = [...new Set([0, Math.floor((byDate.length - 1) / 2), byDate.length - 1])].map(i => `<text x="${P.l + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(short(byDate[i].date))}</text>`).join('');
  const legend = series.length > 1 ? `<div class="legend">${series.map(([s, c]) => `<span><i style="background:${c}"></i>${esc(svcLabel(s))}</span>`).join('')}</div>` : '';
  return `${legend}<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('byService'))}">${grid}${cols}${ticks}</svg>`;
}

function vAttendance(rows) {
  const byDate = attendanceByDate(rows); const byMonth = attendanceByMonth(rows); const byCat = attendanceByCategory(rows);
  const total = byDate.reduce((a, d) => a + d.total, 0); const first = byDate.reduce((a, d) => a + d.first, 0); const maxCat = Math.max(1, ...byCat.map(c => c.n));
  const hasEv = byMonth.some(m => m.ev);
  return `<div class="rep-stats"><div><span>${esc(t('totalVisits'))}</span><b>${total}</b></div><div><span>${esc(t('avgSunday'))}</span><b>${Math.round(total / byDate.length)}</b></div>
      <div><span>${esc(t('firstVisits'))}</span><b>${first}</b></div><div><span>${esc(t('serviceDates'))}</span><b>${byDate.length}</b></div></div>
    <section class="card"><div class="ch"><h3>${esc(t('byService'))}</h3></div><div class="chart-box">${attendanceChart(byDate)}</div></section>
    <div class="grid2"><section class="card"><div class="ch"><h3>${esc(t('byCategory'))}</h3></div><div class="hbars">${byCat.map(c => `<div class="hbar"><span>${esc(catName(c.id, lang()) || c.id)}</span><span class="track"><i style="width:${(c.n / maxCat) * 100}%"></i></span><b>${c.n}</b></div>`).join('')}</div></section>
      <section class="card"><div class="ch"><h3>${esc(t('byMonth'))}</h3></div><div class="rpt-wrap"><table class="rpt-t"><thead><tr><th>${esc(t('month'))}</th><th class="n">${esc(t('english'))}</th><th class="n">${esc(t('french'))}</th>${hasEv ? `<th class="n">${esc(t('special'))}</th>` : ''}<th class="n">${esc(t('total'))}</th><th class="n">${esc(t('avg'))}</th><th class="n">${esc(t('firstVisits'))}</th></tr></thead>
        <tbody>${byMonth.map(m => `<tr><td>${esc(monthLabel(m.month))}</td><td class="n">${m.en}</td><td class="n">${m.fr}</td>${hasEv ? `<td class="n">${m.ev}</td>` : ''}<td class="n"><b>${m.total}</b></td><td class="n">${m.avg}</td><td class="n">${m.first}</td></tr>`).join('')}</tbody></table></div></section></div>`;
}

/** Sundays between two dates (YYYY-MM-DD), oldest first. */
export function sundaysBetween(from, to) {
  const d = new Date(from + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7)); const out = [];
  while (d.toISOString().slice(0, 10) <= to) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 7); }
  return out;
}
function vPerson(rows, r) {
  const by = {}; rows.forEach(x => { const d = String(x.date).slice(0, 10); (by[d] = by[d] || []).push(x.svc); });
  const suns = sundaysBetween(r.from, r.to); const came = suns.filter(d => by[d]).length;
  const m = S.members[paramsOf('person').member];
  return `<section class="card"><div class="ch"><h3>${m ? `<button class="btn link" data-act="openPerson" data-id="${esc(paramsOf('person').member)}">${esc(m.name)}</button>` : ''}</h3><span class="pill info">${esc(t('cameOf', { n: came, total: suns.length }))}</span></div>
    <div class="pa-grid">${suns.map(d => `<span class="pa ${by[d] ? 'in' : ''}" title="${esc(short(d))}${by[d] ? ' · ' + esc(by[d].map(svcLabel).join(', ')) : ''}">${by[d] ? esc(by[d].map(s => s.toUpperCase()).join('+')) : ''}</span>`).join('')}</div>
    <p class="sub nfoot">${esc(short(suns[0] || r.from))} → ${esc(short(suns[suns.length - 1] || r.to))}</p></section>
    ${rows.some(x => !suns.includes(String(x.date).slice(0, 10))) ? `<section class="card">${table(reportDef('person'), rows)}</section>` : ''}`;
}

/* ---------- forms ---------- */
export function flowPickForm() {
  const n = ui.rpt.sel.length; const L2 = lang();
  return `<h2>${esc(t('addToFollowup'))}</h2><p class="sub" style="margin:0">${esc(t('selectedN', { n }))}</p>
    <label class="f">${esc(t('whichFlow'))}<select id="rptFlowId">${flowList().map(f => `<option value="${esc(f.id)}">${esc(flowName(f.id, L2))}</option>`).join('')}</select></label>
    <div class="row"><button class="btn cta" data-act="rptFlowGo">${esc(t('save'))}</button><button class="btn ghost" data-act="closeModal">${esc(t('cancel'))}</button></div>`;
}
export function scheduleForm(id) {
  const def = reportDef(id);
  return `<h2>${esc(t('emailWeekly'))}: ${esc(L(def.title))}</h2>
    <div class="grid-2"><label class="f">${esc(t('sendOn'))}<select id="rsDay">${dayNames().map((d, i) => `<option value="${i}" ${i === 1 ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
      <label class="f">${esc(t('emailLang'))}<select id="rsLang"><option value="en" ${lang() === 'en' ? 'selected' : ''}>${esc(t('english'))}</option><option value="fr" ${lang() === 'fr' ? 'selected' : ''}>${esc(t('french'))}</option></select></label></div>
    <label class="f">${esc(t('sendTo'))}<textarea id="rsTo" rows="3">${esc(me.email || '')}</textarea></label>
    <p class="sub" id="rsErr" style="margin:0;color:var(--bad)"></p>
    <div class="row"><button class="btn cta" data-act="rschSave" data-id="${esc(id)}">${esc(t('save'))}</button><button class="btn ghost" data-act="closeModal">${esc(t('cancel'))}</button></div>`;
}
/** Split and check a list of email addresses. */
export function parseEmails(text) {
  const all = String(text || '').split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const ok = [...new Set(all.filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)))]; const bad = all.filter(s => !ok.includes(s));
  return { ok, bad };
}

export function vChurchReports() {
  if (ui.rpt.open && reportDef(ui.rpt.open) && (!reportDef(ui.rpt.open).admin || can('messaging'))) return vReport(ui.rpt.open);
  ui.rpt.open = null; return vList();
}
