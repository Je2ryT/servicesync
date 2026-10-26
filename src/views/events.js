/* Events: the church calendar, by month, with Sunday services marked. */
import { S, T, ui, me } from '../state.js';
import { esc, fmt, ym, parse, iso, monthName, clock } from '../util.js';
import { ic } from '../icons.js';
import { eventsOn, upcomingEvents } from '../members.js';
import { dbUpdateCard } from './checkin.js';

const timeText = e => (e.start ? clock(e.start) + (e.end ? ' – ' + clock(e.end) : '') : 'All day');

export function eventCard(e, compact = false) {
  const d = parse(e.date);
  return `<div class="evc"><div class="evd"><span>${d.toLocaleDateString('en-US', { month: 'short' })}</span><b>${d.getDate()}</b></div>
    <div class="evb"><b>${esc(e.title)}</b><span>${esc(fmt(e.date, { weekday: 'long' }))} · ${esc(timeText(e))}${e.location ? ' · ' + esc(e.location) : ''}</span>${!compact && e.description ? `<p>${esc(e.description)}</p>` : ''}</div>
    ${me.admin && !compact ? `<button class="ib" data-act="editEvent" data-id="${esc(e.id)}" aria-label="Edit ${esc(e.title)}">${ic('pencil')}</button>` : ''}</div>`;
}

export function vEvents() {
  if (ui.membersMissing) return `<div><h1>Events</h1></div>${dbUpdateCard('003-members-attendance-events.sql')}`;
  const m = ui.evMonth || ym(T.now); const first = parse(m + '-01');
  const start = new Date(first); start.setDate(1 - first.getDay());          // the Sunday on or before the 1st
  const cells = []; for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); cells.push(iso(d)); }
  while (cells.length > 35 && cells.slice(-7).every(d => !d.startsWith(m))) cells.splice(-7);
  const sel = ui.evDay && ui.evDay.startsWith(m) ? ui.evDay : null;
  const grid = cells.map(d => {
    const evs = eventsOn(d); const inMonth = d.startsWith(m); const sun = parse(d).getDay() === 0;
    return `<button class="cal-d ${inMonth ? '' : 'out'} ${d === T.todayIso ? 'today' : ''} ${d === sel ? 'sel' : ''}" data-act="evDay" data-date="${d}" aria-label="${esc(fmt(d, { weekday: 'long', month: 'long', day: 'numeric' }))}${evs.length ? ', ' + evs.length + ' event' + (evs.length === 1 ? '' : 's') : ''}">
      <span class="n">${parse(d).getDate()}</span>${sun && inMonth ? '<span class="svc">Services</span>' : ''}
      ${evs.slice(0, 2).map(e => `<span class="ev">${esc(e.title)}</span>`).join('')}${evs.length > 2 ? `<span class="more">+${evs.length - 2}</span>` : ''}</button>`;
  }).join('');
  const list = sel ? eventsOn(sel) : upcomingEvents(8, m === ym(T.now) ? T.todayIso : m + '-01');
  const head = sel ? esc(fmt(sel, { weekday: 'long', month: 'long', day: 'numeric' })) : 'Coming up';
  return `<div class="head"><div><h1>Events</h1><p class="sub">The Mont Carmel calendar: services, prayer nights, youth, conferences.</p></div>
      ${me.admin ? `<button class="btn cta" data-act="editEvent" data-date="${esc(sel || '')}">${ic('plus')} Add event</button>` : ''}</div>
    <div class="ev-wrap"><div class="card cal">
      <div class="ch"><h3>${esc(monthName(m))}</h3><div class="row"><button class="btn sq" data-act="evMonth" data-k="-1" aria-label="Previous month">${ic('left')}</button><button class="btn" data-act="evMonth" data-k="0">Today</button><button class="btn sq" data-act="evMonth" data-k="1" aria-label="Next month">${ic('right')}</button></div></div>
      <div class="cal-g">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(w => `<span class="cal-w">${w}</span>`).join('')}${grid}</div></div>
      <div class="card"><div class="ch"><h3>${head}</h3>${sel ? '<button class="btn link" data-act="evDay" data-date="">Show upcoming</button>' : ''}</div>
        <div class="evl">${list.length ? list.map(e => eventCard(e)).join('') : `<div class="empty">${sel ? 'Nothing planned this day.' : 'No upcoming events yet.'}${me.admin ? ` <button class="btn link" data-act="editEvent" data-date="${esc(sel || '')}">${ic('plus')} Add one</button>` : ''}</div>`}</div></div></div>`;
}

export function eventForm(id, date) {
  const e = id ? S.events[id] : { title: '', date: date || T.todayIso, start: '19:00', end: '', location: 'Mont Carmel', description: '' };
  return `<h2>${id ? 'Edit event' : 'New event'}</h2>
    <label class="f">Title<input type="text" id="eTitle" value="${esc(e.title)}" placeholder="Prayer night, youth meeting…"></label>
    <div class="row" style="flex-wrap:nowrap;align-items:end"><label class="f" style="flex:1.4">Date<input type="date" id="eDate" value="${esc(e.date)}"></label>
      <label class="f" style="flex:1">Starts<input type="time" id="eStart" value="${esc(e.start)}"></label><label class="f" style="flex:1">Ends<input type="time" id="eEnd" value="${esc(e.end)}"></label></div>
    <label class="f">Location<input type="text" id="eLoc" value="${esc(e.location)}"></label>
    <label class="f">Details<textarea id="eDesc" rows="3">${esc(e.description)}</textarea></label>
    <div class="row" style="justify-content:space-between"><div class="row"><button class="btn cta" data-act="saveCalEvent" data-id="${esc(id || '')}">Save</button><button class="btn ghost" data-act="closeModal">Cancel</button></div>
      ${id ? `<button class="btn danger" data-act="delCalEvent" data-id="${esc(id)}">Delete</button>` : ''}</div>`;
}
