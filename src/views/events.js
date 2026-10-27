/* Events: the church calendar, by month, with Sunday services marked. */
import { S, T, ui, me } from '../state.js';
import { esc, fmt, ym, parse, iso, monthName, clock } from '../util.js';
import { ic } from '../icons.js';
import { eventsOn, upcomingEvents } from '../members.js';
import { dbUpdateCard } from './checkin.js';
import { can, isFull } from '../access.js';
import { docs, docOf, visible, svcKeys, svcName, startOf, templates, tplFor } from '../domain.js';
import { t } from '../i18n.js';
import { layoutPicker } from './layoutpick.js';

const timeText = e => (e.start ? clock(e.start) + (e.end ? ' – ' + clock(e.end) : '') : 'All day');

/* ---------- services on the calendar (Sundays and special events from the schedule) ---------- */
const linkedServices = () => new Set(Object.values(S.events).map(e => e.serviceId).filter(Boolean));
/** The services held on a date, each with a link to its layout. Special services already shown through an event are skipped. */
export function servicesOn(date) {
  const linked = linkedServices();
  return docs().filter(d => d.date === date && visible(d) && !(d.special && linked.has(d.id)))
    .flatMap(d => svcKeys(d).map(svc => ({ kind: 'svc', doc: d, svc, date, title: svcName(d, svc), start: startOf(d, svc) })));
}
/** Upcoming special services (Christmas Eve, conferences…) that aren't already an event on the calendar. */
const upcomingSpecials = from => { const linked = linkedServices(); return docs().filter(d => d.special && d.date >= from && visible(d) && !linked.has(d.id)).map(d => ({ kind: 'svc', doc: d, svc: 'ev', date: d.date, title: svcName(d, 'ev'), start: startOf(d, 'ev') })); };

/** Buttons that open a service's layout and live view. */
export const serviceLinks = (doc, svc) => `<div class="ev-links"><button class="btn sm" data-act="openLayout" data-id="${esc(doc.id)}" data-svc="${svc}">${ic('list')} ${esc(t('serviceLayout'))}</button>
  <button class="btn sm ghost" data-act="openLive" data-id="${esc(doc.id)}" data-svc="${svc}">${ic('live')} Live</button></div>`;

function svcCard(x) {
  const d = parse(x.date); const tpl = tplFor(x.doc, x.svc);
  return `<div class="evc svc"><div class="evd"><span>${d.toLocaleDateString('en-US', { month: 'short' })}</span><b>${d.getDate()}</b></div>
    <div class="evb"><b>${esc(x.title)}</b><span>${esc(fmt(x.date, { weekday: 'long' }))} · ${esc(clock(x.start))}${tpl.order?.length ? ' · ' + esc(t('partsN', { n: tpl.order.length })) : ''}${x.doc.published ? '' : ' · ' + esc(t('draftWord'))}</span>${serviceLinks(x.doc, x.svc)}</div></div>`;
}

export function eventCard(e, compact = false) {
  const d = parse(e.date); const doc = !compact && e.serviceId && docOf(e.serviceId);
  return `<div class="evc"><div class="evd"><span>${d.toLocaleDateString('en-US', { month: 'short' })}</span><b>${d.getDate()}</b></div>
    <div class="evb"><b>${esc(e.title)}</b><span>${esc(fmt(e.date, { weekday: 'long' }))} · ${esc(timeText(e))}${e.location ? ' · ' + esc(e.location) : ''}</span>${!compact && e.description ? `<p>${esc(e.description)}</p>` : ''}${doc && visible(doc) ? serviceLinks(doc, 'ev') : ''}</div>
    ${can('schedule') && !compact ? `<button class="ib" data-act="editEvent" data-id="${esc(e.id)}" aria-label="Edit ${esc(e.title)}">${ic('pencil')}</button>` : ''}</div>`;
}

export function vEvents() {
  if (ui.membersMissing) return `<div><h1>Events</h1></div>${dbUpdateCard('003-members-attendance-events.sql')}`;
  const m = ui.evMonth || ym(T.now); const first = parse(m + '-01');
  const start = new Date(first); start.setDate(1 - first.getDay());          // the Sunday on or before the 1st
  const cells = []; for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); cells.push(iso(d)); }
  while (cells.length > 35 && cells.slice(-7).every(d => !d.startsWith(m))) cells.splice(-7);
  const sel = ui.evDay && ui.evDay.startsWith(m) ? ui.evDay : null;
  const grid = cells.map(d => {
    const evs = [...eventsOn(d), ...servicesOn(d).filter(x => x.doc.special)]; const inMonth = d.startsWith(m); const sun = parse(d).getDay() === 0;
    return `<button class="cal-d ${inMonth ? '' : 'out'} ${d === T.todayIso ? 'today' : ''} ${d === sel ? 'sel' : ''}" data-act="evDay" data-date="${d}" aria-label="${esc(fmt(d, { weekday: 'long', month: 'long', day: 'numeric' }))}${evs.length ? ', ' + evs.length + ' event' + (evs.length === 1 ? '' : 's') : ''}">
      <span class="n">${parse(d).getDate()}</span>${sun && inMonth ? '<span class="svc">Services</span>' : ''}
      ${evs.slice(0, 2).map(e => `<span class="ev">${esc(e.title)}</span>`).join('')}${evs.length > 2 ? `<span class="more">+${evs.length - 2}</span>` : ''}</button>`;
  }).join('');
  const from = m === ym(T.now) ? T.todayIso : m + '-01';
  const byTime = (a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || '');
  const list = sel ? [...servicesOn(sel), ...eventsOn(sel)].sort(byTime) : [...upcomingEvents(8, from), ...upcomingSpecials(from)].sort(byTime).slice(0, 8);
  const head = sel ? esc(fmt(sel, { weekday: 'long', month: 'long', day: 'numeric' })) : 'Coming up';
  return `<div class="head"><div><h1>Events</h1><p class="sub">The Mont Carmel calendar: services, prayer nights, youth, conferences.</p></div>
      ${can('schedule') ? `<button class="btn cta" data-act="editEvent" data-date="${esc(sel || '')}">${ic('plus')} Add event</button>` : ''}</div>
    <div class="ev-wrap"><div class="card cal">
      <div class="ch"><h3>${esc(monthName(m))}</h3><div class="row"><button class="btn sq" data-act="evMonth" data-k="-1" aria-label="Previous month">${ic('left')}</button><button class="btn" data-act="evMonth" data-k="0">Today</button><button class="btn sq" data-act="evMonth" data-k="1" aria-label="Next month">${ic('right')}</button></div></div>
      <div class="cal-g">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(w => `<span class="cal-w">${w}</span>`).join('')}${grid}</div></div>
      <div class="card"><div class="ch"><h3>${head}</h3>${sel ? '<button class="btn link" data-act="evDay" data-date="">Show upcoming</button>' : ''}</div>
        <div class="evl">${list.length ? list.map(e => (e.kind === 'svc' ? svcCard(e) : eventCard(e))).join('') : `<div class="empty">${sel ? 'Nothing planned this day.' : 'No upcoming events yet.'}${can('schedule') ? ` <button class="btn link" data-act="editEvent" data-date="${esc(sel || '')}">${ic('plus')} Add one</button>` : ''}</div>`}</div></div></div>`;
}

/** The event's layout: none (just a calendar entry), a Sunday layout, or a custom one. Picking one plans the
    event as a service (order of service, team, timer, report, printable layout). */
function planBox(e) {
  const doc = e.serviceId && docOf(e.serviceId);
  return `<div class="plan-box">${layoutPicker('ev', doc ? doc.services?.ev?.tpl || '' : '', { allowNone: true, newName: e.title })}
    ${doc ? `<p class="sub" style="margin:0">${esc(t('planLinked'))}</p>` : `<p class="sub" style="margin:0">${esc(t('planAsServiceHelp'))}</p>`}</div>`;
}

export function eventForm(id, date) {
  const e = id ? S.events[id] : { title: '', date: date || T.todayIso, start: '19:00', end: '', location: 'Mont Carmel', description: '' };
  return `<h2>${id ? 'Edit event' : 'New event'}</h2>
    <label class="f">Title<input type="text" id="eTitle" value="${esc(e.title)}" placeholder="Prayer night, youth meeting…"></label>
    <div class="row" style="flex-wrap:nowrap;align-items:end"><label class="f" style="flex:1.4">Date<input type="date" id="eDate" value="${esc(e.date)}"></label>
      <label class="f" style="flex:1">Starts<input type="time" id="eStart" value="${esc(e.start)}"></label><label class="f" style="flex:1">Ends<input type="time" id="eEnd" value="${esc(e.end)}"></label></div>
    <label class="f">Location<input type="text" id="eLoc" value="${esc(e.location)}"></label>
    <label class="f">Details<textarea id="eDesc" rows="3">${esc(e.description)}</textarea></label>
    ${ui.eventLinkMissing ? '' : planBox(e)}
    <div class="row" style="justify-content:space-between"><div class="row"><button class="btn cta" data-act="saveCalEvent" data-id="${esc(id || '')}">Save</button><button class="btn ghost" data-act="closeModal">Cancel</button></div>
      ${id ? `<button class="btn danger" data-act="delCalEvent" data-id="${esc(id)}">Delete</button>` : ''}</div>`;
}
