/* Service reports: notes for each segment of the order of service, timing, team and attendance. */
import { S, T, ui, me } from '../state.js';
import { esc, fmt, clock } from '../util.js';
import { ic } from '../icons.js';
import { docs, docOf, visible, svcKeys, svcName, tplFor, startOf, asgOf, pname, posName, status, allPositions } from '../domain.js';
import { timerOf, minutes } from '../timer.js';
import { attendanceFor, mname } from '../members.js';
import { isVisitor } from '../people.js';
import { canRun } from './timer.js';
import { timeRange } from './shared.js';
import { vActivity, actState } from './activity.js';
import { loadActivity, loadMessages } from '../data.js';
import { vMessages, msgState } from './messages.js';
import { t } from '../i18n.js';

export const reportOf = (sunId, svc) => S.reports[sunId + '|' + svc] || { notes: {}, summary: '', followups: '' };

/** The segments a report covers: what the timer ran if it was used, otherwise the order of service. */
export function reportSegments(doc, svc) {
  const t = timerOf(doc.id, svc); const items = t ? t.items : (tplFor(doc, svc).order || []);
  const log = {}; (t?.log || []).forEach(e => { log[e.id] = e; });
  let at = 0;
  const segs = items.map(o => { const s = { id: o.id, item: o.item, min: +o.min || 0, start: clock(startOf(doc, svc), at), actual: log[o.id]?.actual ?? null, planned: log[o.id]?.planned ?? (+o.min || 0) * 60 }; at += +o.min || 0; return s; });
  const known = new Set(segs.map(s => s.id));
  const rep = reportOf(doc.id, svc);
  const orphans = Object.entries(rep.notes).filter(([id]) => !known.has(id)).map(([id, n]) => ({ id, item: n.item || 'Earlier segment', min: null, start: '', actual: null, orphan: true }));
  return [...segs, ...orphans];
}

/** Totals for the strip at the top and the list. */
export function reportStats(doc, svc) {
  const att = attendanceFor(doc.date, svc); const t = timerOf(doc.id, svc); const rep = reportOf(doc.id, svc);
  const newcomers = att.filter(a => S.members[a.member] && isVisitor(S.members[a.member])).length;
  let ran = null;
  if (t?.endedAt && t.startedAt) { const total = t.items.reduce((a, o) => a + (+o.min || 0) * 60, 0); const actual = (t.endedAt - t.startedAt) / 1000; ran = { actual, diff: Math.round((actual - total) / 60) }; }
  const notes = Object.keys(rep.notes).length + (rep.summary ? 1 : 0) + (rep.followups ? 1 : 0);
  return { people: att.length, newcomers, ran, notes, team: new Set(asgOf(doc.id, svc).map(a => a.person)).size };
}

const saveState = key => { const s = ui.repSave[key]; return s === 'saving' ? 'Saving…' : s === 'saved' ? 'Saved' : s === 'error' ? 'Not saved' : ''; };

function noteBox(doc, svc, key, item, text, placeholder, can, rows = 2) {
  const st = saveState(doc.id + '|' + svc + '|' + key);
  if (!can) return text ? `<p class="rep-text">${esc(text)}</p>` : '<p class="rep-text empty-note">No notes.</p>';
  return `<textarea class="draft rep-note" rows="${rows}" data-act="repNote" data-sun="${esc(doc.id)}" data-svc="${svc}" data-key="${esc(key)}" data-item="${esc(item || '')}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}">${esc(text)}</textarea>
    <div class="rep-meta"><span class="rep-st ${ui.repSave[doc.id + '|' + svc + '|' + key] || ''}">${st}</span></div><p class="rep-text print-only">${esc(text)}</p>`;
}

/* ---------- one report ---------- */
function vReport(doc, svc) {
  const rep = reportOf(doc.id, svc); const st = reportStats(doc, svc); const can = canRun(doc);
  const segs = reportSegments(doc, svc); const timed = segs.some(s => s.actual != null);
  const byPos = allPositions().map(p => [p, asgOf(doc.id, svc, p.id)]).filter(([, l]) => l.length);
  const who = n => (n?.by ? pname(n.by) : '') + (n?.at ? ' · ' + new Date(n.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
  const ranText = st.ran ? `${minutes(st.ran.actual)}<small>${st.ran.diff === 0 ? 'on time' : st.ran.diff > 0 ? st.ran.diff + ' min over' : -st.ran.diff + ' min under'}</small>` : `—<small>timer not used</small>`;
  return `<div class="head rep-head"><div><button class="btn link noprint" data-act="repBack">${ic('left')} All reports</button>
      <h1>${esc(svcName(doc, svc))}</h1><p class="sub">${esc(fmt(doc.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))} · ${esc(timeRange(doc, svc))}</p></div>
      <div class="row noprint"><button class="btn" data-act="openLive" data-id="${esc(doc.id)}" data-svc="${svc}">${ic('live')} Live view</button><button class="btn" data-act="repPrint">${ic('share')} Print / PDF</button></div></div>
    ${can ? '' : '<p class="sub noprint">Reports can be written by people on the roster once the Sunday is published.</p>'}
    <div class="rep-stats"><div><span>Attendance</span><b>${st.people}</b><small>checked in</small></div><div><span>Newcomers</span><b>${st.newcomers}</b><small>first visits</small></div>
      <div><span>Length</span><b>${ranText}</b></div><div><span>Serving</span><b>${st.team}</b><small>on the team</small></div></div>
    <section class="card"><div class="ch"><h3>Order of service &amp; notes</h3><span class="sub" style="margin:0;font-size:.82rem">${timed ? 'Planned and actual times from the live timer' : 'Times as planned'}</span></div>
      <div class="rep-segs">${segs.map(s => {
        const n = rep.notes[s.id]; const over = s.actual != null && s.actual - s.planned >= 60;
        return `<div class="rep-seg ${n?.text ? 'has' : ''}"><div class="rep-seg-h"><span class="tm">${esc(s.start)}</span><b>${esc(s.item)}</b>
          <span class="rep-time">${s.min != null ? `${s.min}m planned` : ''}${s.actual != null ? ` · <span class="${over ? 'over' : ''}">${minutes(s.actual)} actual</span>` : ''}</span></div>
          ${noteBox(doc, svc, s.id, s.item, n?.text || '', `Notes on ${s.item}…`, can)}${n?.text ? `<div class="rep-by">${esc(who(n))}</div>` : ''}</div>`;
      }).join('') || '<div class="empty">No order of service yet. Add one on the Templates tab.</div>'}</div></section>
    <div class="grid2"><section class="card"><div class="ch"><h3>Summary</h3></div><div class="rep-box">${noteBox(doc, svc, 'summary', '', rep.summary, 'How did the service go overall? Highlights, testimonies, what to repeat…', can, 4)}</div></section>
      <section class="card"><div class="ch"><h3>Follow-ups</h3></div><div class="rep-box">${noteBox(doc, svc, 'followups', '', rep.followups, 'Who to call, what to fix before next Sunday, prayer requests…', can, 4)}</div></section></div>
    <section class="card"><div class="ch"><h3>Who served</h3></div>${byPos.length ? `<div class="rep-team">${byPos.map(([p, l]) => `<div><span>${esc(p.name)}</span><b>${l.map(a => esc(pname(a.person)) + (status(a) === 'declined' ? ' <small>(declined)</small>' : '')).join(', ')}</b></div>`).join('')}</div>` : '<div class="empty">Nobody was scheduled.</div>'}</section>
    ${st.people ? `<section class="card"><div class="ch"><h3>Checked in</h3><span class="sub" style="margin:0;font-size:.82rem">${st.people}</span></div><p class="rep-names">${attendanceFor(doc.date, svc).map(a => esc(mname(a.member))).sort().join(', ')}</p></section>` : ''}`;
}

/* ---------- list of reports ---------- */
const subnav = () => `<div><div class="seg"><button data-act="rsub" data-v="reports" aria-pressed="${!['activity', 'messages'].includes(ui.rsub)}">${esc(t('serviceReports'))}</button><button data-act="rsub" data-v="messages" aria-pressed="${ui.rsub === 'messages'}">${esc(t('sentMessages'))}</button>${me.admin ? `<button data-act="rsub" data-v="activity" aria-pressed="${ui.rsub === 'activity'}">${esc(t('activityLog'))}</button>` : ''}</div></div>`;

export function vReports() {
  if (ui.rsub === 'messages') {
    const m = msgState(); if (!m.loaded && !m.loading) setTimeout(() => loadMessages(), 0);
    return subnav() + vMessages();
  }
  if (me.admin && ui.rsub === 'activity') {
    const a = actState(); if (!a.loaded && !a.loading) setTimeout(() => loadActivity(), 0);
    return subnav() + vActivity();
  }
  return subnav() + vServiceReports();
}

function vServiceReports() {
  if (ui.reportsMissing) return '<div><h1>Reports</h1></div><div class="card empty">This needs a database update. Run <code>migrations/004-service-reports.sql</code> in Supabase, then reload.</div>';
  if (ui.rep) { const [sun, svc] = ui.rep.split('|'); const doc = docOf(sun); if (doc && visible(doc)) return vReport(doc, svc); ui.rep = null; }
  const week = new Date(T.now); week.setDate(week.getDate() + 7); const until = week.toISOString().slice(0, 10);
  const list = docs().filter(d => visible(d) && d.date <= until).reverse().slice(0, 16);
  if (!list.length) return '<div><h1>Reports</h1><p class="sub">Once Sundays are planned, each service gets a report here.</p></div>';
  return `<div><h1>Reports</h1><p class="sub">A report for every service: notes on each part of the order of service, timing, attendance and follow-ups.</p></div>
    <div class="card rep-list">${list.map(d => `<div class="rep-day"><div class="rep-date"><b>${esc(fmt(d.date, { month: 'short', day: 'numeric' }))}</b><span>${esc(fmt(d.date, { weekday: 'long' }))}${d.date === T.todayIso ? ' · today' : d.date > T.todayIso ? ' · upcoming' : ''}</span></div>
      <div class="rep-svcs">${svcKeys(d).map(s => { const st = reportStats(d, s); return `<button class="rep-item" data-act="openReport" data-id="${esc(d.id)}" data-svc="${s}"><b>${esc(svcName(d, s))}</b>
        <span>${st.notes ? `<span class="pill info">${st.notes} note${st.notes === 1 ? '' : 's'}</span>` : '<span class="pill mute">NO NOTES</span>'}${st.people ? `<span class="pill ok">${st.people} present</span>` : ''}${st.ran ? `<span class="pill ${st.ran.diff > 2 ? 'warn' : 'mute'}">${st.ran.diff > 0 ? '+' : ''}${st.ran.diff} MIN</span>` : ''}</span>${ic('right')}</button>`; }).join('')}</div></div>`).join('')}</div>`;
}
