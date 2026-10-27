import { S, T, me, ui } from '../state.js';
import { esc, fmt, ym, shiftMonth, monthName } from '../util.js';
import { ic } from '../icons.js';
import { activePeople, warnings, awaiting, monthState, monthRows, svcKeys, cov, status, svcName, posName } from '../domain.js';
import { profile, notifications, attendanceSummary, upcomingEvents } from '../members.js';
import { heroBlock, fairCard, timeRange } from './shared.js';
import { eventCard } from './events.js';
import { myFollowupsCard } from './followups.js';

/* ---------- profile ---------- */
function profileCard() {
  const p = profile(); const n = p.next;
  const langs = p.langs ? [p.langs.en !== false && 'English', p.langs.fr !== false && 'Français'].filter(Boolean) : [];
  return `<section class="card prof">
    <div class="prof-top"><div class="avatar" aria-hidden="true">${esc(p.initials)}</div>
      <div class="prof-id"><h2>${esc(p.name)}</h2><div class="row"><span class="pill ${p.admin ? 'info' : 'ok'}">${p.admin ? 'Administrator' : 'Serving team'}</span>${langs.map(l => `<span class="pill mute">${esc(l.toUpperCase())}</span>`).join('')}</div>
        <div class="prof-contact">${p.email ? `<span>${esc(p.email)}</span>` : ''}${p.phone ? `<span>${esc(p.phone)}</span>` : ''}</div></div>
      ${p.id ? `<button class="btn" data-act="editPerson" data-id="${esc(p.id)}">${ic('pencil')} ${me.admin ? 'Edit profile' : 'Days off'}</button>` : ''}</div>
    <div class="prof-stats">
      <div><span>Next time serving</span>${n ? `<b>${esc(fmt(n.d.date, { weekday: 'short', month: 'short', day: 'numeric' }))}</b><small>${esc(posName(n.a.pos))} · ${esc(svcName(n.d, n.a.svc))} · ${status(n.a) === 'confirmed' ? 'confirmed' : status(n.a) === 'declined' ? 'declined' : 'needs your reply'}</small>` : '<b>Not scheduled</b><small>Nothing published yet</small>'}</div>
      <div><span>This month</span><b>${p.thisMonth}</b><small>assignment${p.thisMonth === 1 ? '' : 's'}</small></div>
      <div><span>Serves as</span>${p.positions.length ? `<b class="sm">${esc(p.positions.slice(0, 3).join(', '))}</b>${p.positions.length > 3 ? `<small>and ${p.positions.length - 3} more</small>` : ''}` : `<b class="sm">${p.id ? 'No positions yet' : 'Not on the roster'}</b>${p.id ? '' : '<small>Admins can add themselves on People</small>'}`}</div>
    </div></section>`;
}

/* ---------- notifications (more settings later) ---------- */
function notifCard() {
  const list = notifications();
  return `<section class="card notif"><div class="ch"><h3>${ic('bell')} Notifications</h3>${list.length ? `<span class="pill bad">${list.length}</span>` : ''}</div>
    ${list.length ? `<ul class="nl">${list.map(x => `<li><button data-act="tab" data-tab="${esc(x.data)}" class="nb ${x.kind}">${ic(x.icon)}<span>${esc(x.text)}</span>${ic('right')}</button></li>`).join('')}</ul>` : '<div class="empty">You\'re all caught up.</div>'}
    <p class="sub nfoot">Text and email reminders will be set up here.</p></section>`;
}

/* ---------- check-in & events ---------- */
function checkinCard() {
  if (ui.membersMissing) return '';
  const sum = attendanceSummary(T.todayIso);
  return `<section class="card"><div class="ch"><h3>${ic('checkc')} Check-in today</h3><button class="btn cta" data-act="tab" data-tab="checkin">Open check-in</button></div>
    <div class="ci-stats"><div><b>${sum.people}</b><span>People</span></div><div><b>${sum.en}</b><span>English</span></div><div><b>${sum.fr}</b><span>French</span></div><div><b>${sum.newcomers}</b><span>Newcomers</span></div></div></section>`;
}
function eventsCard() {
  if (ui.membersMissing) return '';
  const list = upcomingEvents(3);
  return `<section class="card"><div class="ch"><h3>${ic('cal')} Upcoming events</h3><button class="btn" data-act="tab" data-tab="events">Calendar</button></div>
    <div class="evl">${list.length ? list.map(e => eventCard(e, true)).join('') : `<div class="empty">Nothing planned yet.${me.admin ? ' <button class="btn link" data-act="editEvent">Add an event</button>' : ''}</div>`}</div></section>`;
}

/* ---------- serving team ---------- */
function myAssignments(p) {
  if (!p.id) return '';
  return `<div class="card"><div class="ch"><h3>Your assignments</h3></div>${p.upcoming.length ? p.upcoming.map(({ a, d }) => {
    const st = status(a);
    const pend = Object.values(S.swap).some(x => x.status === 'open' && x.sunId === a.sunId && x.svc === a.svc && x.pos === a.pos && x.from === p.id);
    return `<div class="sw"><div class="row" style="justify-content:space-between"><div><b>${esc(fmt(d.date, { weekday: 'long', month: 'short', day: 'numeric' }))}</b> · ${esc(svcName(d, a.svc))} · <span class="pill info">${esc(posName(a.pos))}</span> <span class="sub" style="display:inline">${esc(timeRange(d, a.svc))}</span></div><span class="pill ${st === 'confirmed' ? 'ok' : st === 'declined' ? 'bad' : 'warn'}">${st === 'confirmed' ? 'Confirmed' : st === 'declined' ? 'Declined' : 'Awaiting your reply'}</span></div>
      <div class="row">${st !== 'confirmed' ? `<button class="btn cta" data-act="respond" data-a="${esc(a.id)}" data-v="confirmed">${ic('check')} Confirm</button>` : ''}${st !== 'declined' ? `<button class="btn" data-act="respond" data-a="${esc(a.id)}" data-v="declined">Decline</button>` : ''}${pend ? '<span class="pill info">Swap requested</span>' : `<button class="btn" data-act="reqSwap" data-a="${esc(a.id)}">${ic('swap')} Request swap</button>`}<button class="btn link" data-act="openLive" data-id="${esc(d.id)}" data-svc="${a.svc}">Live view</button></div></div>`;
  }).join('') : '<div class="empty">No published assignments yet.</div>'}</div>`;
}

function adminBlock() {
  const w = warnings();
  let h = `<div class="stats">
    <div class="card stat">${ic('users')}<b>${activePeople().length}</b><span>Serving team</span></div>
    <div class="card stat">${ic('checkc')}<b>${awaiting()}</b><span>Awaiting confirmation</span></div>
    <div class="card stat">${ic('alert')}<b>${w.length}</b><span>Coverage issues</span></div>
    <div class="card stat">${ic('heart')}<b>${Object.values(S.members).filter(m => m.active !== false).length}</b><span>Church members</span></div></div>`;
  const m1 = ym(T.now), m2 = shiftMonth(m1, 1);
  const ms = [m1, m2].map(m => { const s = monthState(m); return `<span class="pill ${s === 'published' ? 'ok' : s === 'draft' ? 'warn' : 'mute'}">${esc(monthName(m))}: ${s === 'none' ? 'not planned' : s}</span>`; }).join('');
  const nextUnplanned = [m1, m2].find(m => monthRows(m).some(r => r.date >= T.todayIso && svcKeys(r.doc).some(s => cov(r.doc, s).cls !== 'ok')));
  h += `<div class="split"><div class="card"><div class="ch"><h3>Coverage warnings</h3><div class="row">${ms}</div></div>
    ${w.length ? `<ul class="wl">${w.slice(0, 8).map(x => `<li><span class="${x.sev}">${ic('alert')}</span><span>${esc(x.text)}</span><span class="d">${esc(fmt(x.date))}</span></li>`).join('')}</ul>${w.length > 8 ? `<div class="sub" style="padding:10px 20px;margin:0">and ${w.length - 8} more on the Schedule</div>` : ''}` : '<div class="empty">Every service in the next two months is fully covered.</div>'}
    ${nextUnplanned ? `<div style="padding:14px 20px;border-top:1px solid var(--line)"><button class="btn" data-act="autofill" data-m="${nextUnplanned}">${ic('cal')} Plan ${esc(monthName(nextUnplanned))}</button></div>` : ''}</div>
    ${fairCard(m1)}</div>`;
  return h;
}

export function vHome() {
  const p = profile(); const hour = T.now.getHours();
  const greet = hour < 12 ? ['Good morning', 'Bonjour'] : hour < 18 ? ['Good afternoon', 'Bon après-midi'] : ['Good evening', 'Bonsoir'];
  const first = p.name.split(' ')[0];
  return `<div class="dash-head"><div><p class="eyebrow" style="color:var(--accent)">${esc(greet[1])} · ${esc(T.now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}</p><h1>${esc(greet[0])}, ${esc(first)}</h1></div></div>
    <div class="dash">
      <div class="dash-main">${profileCard()}${heroBlock()}${myAssignments(p)}</div>
      <div class="dash-side">${notifCard()}${myFollowupsCard()}${checkinCard()}${eventsCard()}</div>
    </div>
    ${me.admin ? adminBlock() : ''}`;
}
