/* Church members, check-in attendance, events and notifications.
   Reads the loaded state only (no database or DOM), so it can be unit-tested. */
import { S, T, me } from './state.js';
import { ym, iso, fmt, toMin, clock } from './util.js';
import { myPerson, assignments, docOf, status, warnings, svcName, posName } from './domain.js';
import { isVisitor } from './people.js';

/* ---------- members ---------- */
export const STATUS = { member: 'Member', regular: 'Regular attender', newcomer: 'Newcomer', visitor: 'Visitor' };
export const LANG = { fr: 'French', en: 'English', both: 'English & French' };
export const membersList = () => Object.entries(S.members).map(([id, m]) => ({ id, ...m })).filter(m => m.active !== false).sort((a, b) => a.name.localeCompare(b.name));
export const mname = id => S.members[id]?.name || 'Removed member';

/** Accent- and case-insensitive: "jose" finds "José". */
export const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export function searchMembers(q) {
  const f = fold(q); const all = membersList(); if (!f) return all;
  const digits = f.replace(/\D/g, '');
  return all.filter(m => fold(m.name).split(/\s+/).some(w => w.startsWith(f)) || fold(m.name).includes(f) || (digits.length >= 3 && m.phone.replace(/\D/g, '').includes(digits)));
}

/* ---------- attendance ---------- */
export const attKey = (member, date, svc) => member + '|' + date + '|' + svc;
export const isIn = (member, date, svc) => !!S.att[attKey(member, date, svc)];
export const attendanceFor = (date, svc) => Object.values(S.att).filter(a => a.date === date && (!svc || a.svc === svc));
/** Which service to check people into right now: English on Sunday morning before 11:15, French after, otherwise a special event. */
export function defaultSvc(now = T.now) {
  if (now.getDay() !== 0) return 'ev';
  return now.getHours() * 60 + now.getMinutes() < toMin('11:15') ? 'en' : 'fr';
}
/** Head counts for a date: per service, with newcomers. */
export function attendanceSummary(date) {
  const by = { en: 0, fr: 0, ev: 0 }; let newcomers = 0; const seen = new Set();
  for (const a of attendanceFor(date)) {
    by[a.svc]++;
    if (!seen.has(a.member) && S.members[a.member] && isVisitor(S.members[a.member])) newcomers++;
    seen.add(a.member);
  }
  return { ...by, total: by.en + by.fr + by.ev, people: seen.size, newcomers };
}
/** How many of the last `n` Sundays (today included) someone came to any service. */
export function streak(member, n = 4) {
  const d = new Date(T.now.getFullYear(), T.now.getMonth(), T.now.getDate()); d.setDate(d.getDate() - d.getDay());
  let came = 0;
  for (let i = 0; i < n; i++) { const day = iso(d); if (['en', 'fr', 'ev'].some(s => isIn(member, day, s))) came++; d.setDate(d.getDate() - 7); }
  return { came, of: n };
}

/* ---------- events ---------- */
export const eventsList = () => Object.entries(S.events).map(([id, e]) => ({ id, ...e })).sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || ''));
export const eventsOn = date => eventsList().filter(e => e.date === date);
export const upcomingEvents = (n = 5, from = T.todayIso) => eventsList().filter(e => e.date >= from).slice(0, n);

/* ---------- the signed-in person ---------- */
export function profile() {
  const mp = myPerson(); const p = mp ? S.people[mp] : null;
  const name = p?.name || me.name || me.email.split('@')[0] || 'Welcome';
  const mine = mp ? assignments().filter(a => a.person === mp).map(a => ({ a, d: docOf(a.sunId) })).filter(x => x.d && x.d.published && x.d.date >= T.todayIso)
    .sort((x, y) => x.d.date.localeCompare(y.d.date) || x.a.svc.localeCompare(y.a.svc)) : [];
  const month = ym(T.now);
  return {
    id: mp, name, email: p?.email || me.email, phone: p?.phone || '', admin: me.admin, langs: p?.langs || null,
    positions: mp ? Object.keys(S.quals[mp] || {}).filter(id => S.pos[id]).map(id => posName(id)) : [],
    next: mine[0] || null, upcoming: mine,
    thisMonth: mine.filter(x => x.d.date.startsWith(month)).length,
    awaiting: mine.filter(x => status(x.a) === 'awaiting').length,
    initials: name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?',
  };
}

/* ---------- notifications ---------- */
/** What needs the signed-in person's attention. Each: { kind, icon, text, act?, data? } */
export function notifications() {
  const out = []; const pr = profile();
  for (const { a, d } of pr.upcoming.filter(x => status(x.a) === 'awaiting').slice(0, 3)) {
    out.push({ kind: 'action', icon: 'clock', text: `Please confirm: ${posName(a.pos)}, ${svcName(d, a.svc)}, ${fmt(d.date)}`, date: d.date, act: 'tab', data: 'home' });
  }
  if (me.admin) {
    const swaps = Object.values(S.swap).filter(s => s.status === 'open').length;
    if (swaps) out.push({ kind: 'action', icon: 'swap', text: `${swaps} swap request${swaps === 1 ? '' : 's'} waiting for approval`, act: 'tab', data: 'swaps' });
    const w = warnings().length;
    if (w) out.push({ kind: 'warn', icon: 'alert', text: `${w} coverage issue${w === 1 ? '' : 's'} in the next two months`, act: 'tab', data: 'calendar' });
    const weekAgo = new Date(T.now); weekAgo.setDate(weekAgo.getDate() - 7);
    const fresh = Object.values(S.members).filter(m => isVisitor(m) && m.createdAt >= weekAgo.getTime()).length;
    if (fresh) out.push({ kind: 'info', icon: 'users', text: `${fresh} newcomer${fresh === 1 ? '' : 's'} this week to follow up`, act: 'tab', data: 'checkin' });
  }
  const soon = new Date(T.now); soon.setDate(soon.getDate() + 7); const end = iso(soon);
  for (const e of eventsList().filter(e => e.date >= T.todayIso && e.date <= end).slice(0, 3)) out.push({ kind: 'info', icon: 'cal', text: `${e.title}, ${fmt(e.date)}${e.start ? ' · ' + clock(e.start) : ''}`, act: 'tab', data: 'events' });
  return out;
}
