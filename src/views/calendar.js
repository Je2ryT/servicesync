import { ui, me, T } from '../state.js';
import { SVC } from '../config.js';
import { esc, fmt, monthName } from '../util.js';
import { ic } from '../icons.js';
import { monthState, monthRows, svcKeys, svcName, visible, cov, posCov, positionsList, teamsList, teamName, asgOf, status, broken, brokenText, pname, candidates } from '../domain.js';
import { fairCard, stIcon, timeRange } from './shared.js';
import { can, isFull } from '../access.js';

export function vCalendar() {
  const m = ui.month; const st = monthState(m); const rows = monthRows(m);
  const crit = rows.some(r => r.date >= T.todayIso && r.doc && svcKeys(r.doc).some(s => asgOf(r.id, s).some(a => broken(a))));
  let h = `<div class="head"><div><h1>${esc(monthName(m))}</h1><p class="sub">Fill every position for each service. The number on each position is assigned / preferred.</p></div>
    <div class="row"><button class="btn sq" data-act="month" data-k="-1" aria-label="Previous month">${ic('left')}</button><button class="btn sq" data-act="month" data-k="1" aria-label="Next month">${ic('right')}</button>
    <button class="btn navy" data-act="share">${ic('share')} Share</button>
    ${can('schedule') ? `<button class="btn" data-act="autofill" data-m="${m}">Auto-fill</button><button class="btn ${st === 'published' ? '' : 'cta'}" data-act="publishMonth" ${st === 'none' ? 'disabled' : ''}>${st === 'published' ? 'Unpublish' : 'Publish'}</button>` : ''}</div></div>
    <div class="row">${st === 'none' ? '<span class="pill mute">NOT PLANNED</span>' : `<span class="pill ${st === 'published' ? 'ok' : 'warn'}">${st === 'published' ? 'Published' : 'Draft'}</span>`}${st !== 'none' ? `<span class="pill ${crit ? 'bad' : 'ok'}">${crit ? 'Rule conflicts' : 'No critical issues'}</span>` : ''}${can('schedule') ? `<button class="btn link" data-act="newEvent">${ic('plus')} Special event</button>` : ''}</div>`;
  // Past dates are hidden (today stays until the day is over); a link shows them again.
  const past = rows.filter(r => r.date < T.todayIso); const shown = ui.showPast ? rows : rows.filter(r => r.date >= T.todayIso);
  h += '<div class="split"><div style="display:grid;gap:16px">';
  if (past.length) h += `<div class="past-bar"><span class="sub" style="margin:0">${ui.showPast ? `Showing ${past.length} past date${past.length === 1 ? '' : 's'}` : `${past.length} past date${past.length === 1 ? '' : 's'} hidden`}</span><button class="btn link" data-act="togglePast">${ui.showPast ? 'Hide past dates' : 'Show past dates'}</button></div>`;
  if (!shown.length) h += `<div class="card empty">${rows.length ? 'Every date in this month has passed.' : 'No Sundays this month.'} ${m < T.todayIso.slice(0, 7) ? '<button class="btn link" data-act="monthNow">Go to this month</button>' : '<button class="btn link" data-act="month" data-k="1">Next month</button>'}</div>`;
  for (const r of shown) {
    const show = !r.doc || visible(r.doc);
    h += `<div class="card sun"><div class="sh"><h2>${esc(r.doc?.special ? r.doc.title || 'Special event' : fmt(r.date, { weekday: 'long', month: 'long', day: 'numeric' }))}</h2><div class="row">${r.doc?.special ? `<span class="sub" style="margin:0">${esc(fmt(r.date, { weekday: 'long', month: 'long', day: 'numeric' }))}</span>` : ''}${r.doc && show ? `<button class="btn link" data-act="openLive" data-id="${esc(r.id)}" data-svc="${svcKeys(r.doc)[0]}">Live view</button>` : ''}${can('schedule') && r.doc?.special ? `<button class="btn danger" data-act="delEvent" data-id="${esc(r.id)}">Remove</button>` : ''}</div></div>
      <div class="svcs" ${r.doc?.special ? 'style="grid-template-columns:1fr"' : ''}>${svcKeys(r.doc).map(s => svcCell(r, s, show)).join('')}</div></div>`;
  }
  h += `</div><div class="side">${fairCard(m)}<div class="card legend"><b>Legend</b>✓ confirmed · clock awaiting · ✕ declined. A red chip breaks a rule: wrong language, not set up for that position, Sunday off, declined, or booked twice at the same time. People may serve both services on the same Sunday.</div></div></div>`;
  return h;
}

function svcCell(r, s, show) {
  const doc = r.doc; const c = cov(doc, s);
  let h = `<div><div class="svch"><div><h3>${esc(doc ? svcName(doc, s) : SVC[s].name)}</h3><div class="tm">${esc(timeRange(doc, s))}</div></div><span class="pill ${c.cls}">${esc(c.label)}</span></div>`;
  if (!show) return h + '<span class="sub">Not published yet</span></div>';
  const list = positionsList();
  if (!list.length) return h + `<span class="sub">${can('schedule') ? 'Set up teams and positions on the People tab.' : 'No positions set up yet.'}</span></div>`;
  const multiTeam = teamsList().length > 1; let lastTeam = null;
  for (const p of list) {
    if (multiTeam && p.team !== lastTeam) { lastTeam = p.team; h += `<div class="teamh">${esc(teamName(p.team))}</div>`; }
    const pc = posCov(doc ? r.id : null, s, p.id); const held = doc ? asgOf(r.id, s, p.id) : [];
    h += `<div class="pos"><div class="posh"><span>${esc(p.name)}</span><span class="pc ${pc.cls}">${pc.n}/${pc.pref}</span></div><div class="chips">`;
    for (const a of held) {
      const b = broken(a);
      h += `<span class="chip ${b ? 'bad' : ''}" ${b ? `title="${esc(brokenText(a))}"` : ''}>${stIcon(status(a))}${esc(pname(a.person))}${can('schedule') ? `<button data-act="unassign" data-a="${esc(a.id)}" aria-label="Remove ${esc(pname(a.person))}">${ic('x')}</button>` : ''}</span>`;
    }
    if (!held.length && !can('schedule')) h += '<span class="sub" style="margin:0">Open</span>';
    if (can('schedule')) {
      const opts = candidates(r.id, r.date, s, p.id); let sugg = false;
      h += `<span class="chip add">${ic('plus')}<span class="sr">Assign ${esc(p.name)}</span><select data-act="assign" data-id="${esc(r.id)}" data-date="${r.date}" data-svc="${s}" data-pos="${esc(p.id)}" aria-label="Assign ${esc(p.name)}"><option value="">Assign ${esc(p.name)}…</option>${opts.map(t => {
        const tag = t.why ? ` (${t.why})` : !sugg ? ' · suggested' : ''; if (!t.why) sugg = true;
        return `<option value="${esc(t.id)}">${esc(t.name)}${esc(tag)} · ${t.load} this month</option>`;
      }).join('')}</select></span>`;
    }
    h += '</div></div>';
  }
  return h + '</div>';
}
