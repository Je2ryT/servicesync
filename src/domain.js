/* Scheduling rules. Reads the loaded state; no database or DOM access, so it can be unit-tested. */
import { S, me, T } from './state.js';
import { SVC, DEFAULT_TPL, DEFAULT_CHECK } from './config.js';
import { ym, sundaysOf, shiftMonth, toMin } from './util.js';

/* ---------- people ---------- */
export const people = () => Object.entries(S.people).map(([id, d]) => ({ id, ...d })).sort((a, b) => String(a.name).localeCompare(b.name));
export const activePeople = () => people().filter(p => p.active !== false);
export const pname = id => S.people[id]?.name || 'Removed person';
export function myPerson() {
  const e = (me.email || '').toLowerCase(); if (!e) return null;
  const f = Object.entries(S.people).find(([, p]) => p.email && p.email.toLowerCase() === e);
  return f ? f[0] : null;
}
export const isOff = (p, d) => !!S.off[p]?.dates?.[d];
export const speaks = (p, svc) => svc === 'ev' || S.people[p]?.langs?.[svc] !== false;

/* ---------- teams & positions ---------- */
export const teamsList = () => Object.entries(S.teams).map(([id, t]) => ({ id, ...t })).sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name));
const teamOrder = () => { const o = {}; teamsList().forEach((t, i) => { o[t.id] = i; }); return o; };
/** Every position whose team still exists, in team order. */
export function allPositions() {
  const o = teamOrder();
  return Object.entries(S.pos).map(([id, p]) => ({ id, ...p })).filter(p => p.team in o)
    .sort((a, b) => o[a.team] - o[b.team] || (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name));
}
export const positionsList = () => allPositions().filter(p => p.active !== false);
export const posName = id => S.pos[id]?.name || 'Removed position';
export const teamName = id => S.teams[id]?.name || '';
export const qualified = (person, pos) => !!S.quals[person]?.[pos];
export const positionsOf = person => allPositions().filter(p => qualified(person, p.id));

/* ---------- templates & times ---------- */
export const templates = () => (Object.keys(S.tpl).length ? S.tpl : DEFAULT_TPL);
export const cfg = () => ({ enTpl: 'tpl-en', frTpl: 'tpl-fr', checklist: DEFAULT_CHECK, ...(S.cfg.main || {}) });
export const checklist = () => cfg().checklist;
export function tplFor(doc, svc) {
  const t = templates(); const id = svc === 'ev' ? doc?.services?.ev?.tpl : cfg()[svc + 'Tpl'];
  return t[id] || Object.values(t).find(x => x.lang === SVC[svc].lang) || Object.values(t)[0] || { name: '', order: [] };
}
export const startOf = (doc, svc) => (svc === 'ev' ? (doc?.services?.ev?.start || '18:00') : SVC[svc].start);
export const total = t => (t.order || []).reduce((a, o) => a + (+o.min || 0), 0);
/** Minutes from midnight when a service starts and ends. */
export function windowOf(doc, svc) { const s = toMin(startOf(doc, svc)); return { start: s, end: s + Math.max(total(tplFor(doc, svc)), 1) }; }
export const svcKeys = doc => (doc?.special ? ['ev'] : ['en', 'fr']);
export const svcName = (doc, svc) => (svc === 'ev' ? (doc?.title || 'Special event') : SVC[svc].name);

/* ---------- Sundays ---------- */
export const docOf = id => (S.sun[id] ? { id, ...S.sun[id] } : null);
export const docs = () => Object.entries(S.sun).map(([id, d]) => ({ id, ...d })).sort((a, b) => a.date.localeCompare(b.date) || (a.special ? 1 : -1));
export const visible = d => me.admin || d.published;
export function monthRows(m) {
  const rows = sundaysOf(m).map(date => ({ date, id: date, doc: docOf(date) }));
  docs().filter(d => d.special && d.date.startsWith(m)).forEach(d => rows.push({ date: d.date, id: d.id, doc: d }));
  return rows.sort((a, b) => a.date.localeCompare(b.date) || (a.doc?.special ? 1 : 0) - (b.doc?.special ? 1 : 0));
}
export function monthState(m) { const r = monthRows(m).filter(x => x.doc); if (!r.length) return 'none'; return r.every(x => x.doc.published) ? 'published' : 'draft'; }
export const newSun = date => ({ date, published: false, special: false, services: { en: {}, fr: {} } });

/* ---------- assignments ---------- */
export const assignments = () => Object.entries(S.asg).map(([id, a]) => ({ id, ...a })).filter(a => S.people[a.person] && S.pos[a.pos] && S.sun[a.sunId]);
/** Assignments for one service, optionally one position, sorted by name. */
export const asgOf = (sunId, svc, pos) => assignments().filter(a => a.sunId === sunId && a.svc === svc && (!pos || a.pos === pos)).sort((a, b) => pname(a.person).localeCompare(pname(b.person)));
export const status = a => a.status || 'awaiting';
const overlaps = (a, b) => a.start < b.end && b.start < a.end;

/** Another assignment the same person holds at the same time, if any. */
export function clashOf(a) {
  const doc = docOf(a.sunId); if (!doc) return null;
  const w = windowOf(doc, a.svc);
  for (const b of assignments()) {
    if (b.id === a.id || b.person !== a.person) continue;
    const d2 = docOf(b.sunId); if (!d2 || d2.date !== doc.date) continue;
    if (b.sunId === a.sunId && b.svc === a.svc) return b;               // two positions in one service
    if (overlaps(w, windowOf(d2, b.svc))) return b;                      // services that overlap in time
  }
  return null;
}

/** Why an assignment breaks a rule, or '' when it is fine. */
export function broken(a) {
  if (!S.people[a.person]) return 'removed';
  if (!speaks(a.person, a.svc)) return 'language';
  if (!qualified(a.person, a.pos)) return 'not on team';
  const doc = docOf(a.sunId);
  if (doc && isOff(a.person, doc.date)) return 'Sunday off';
  if (status(a) === 'declined') return 'declined';
  if (clashOf(a)) return 'double-booked';
  return '';
}
export function brokenText(a) {
  const b = broken(a); const doc = docOf(a.sunId);
  if (b === 'language') return `not on the ${SVC[a.svc].lang.toUpperCase()} service list`;
  if (b === 'not on team') return `not set up for ${posName(a.pos)}`;
  if (b === 'Sunday off') return 'asked for this Sunday off';
  if (b === 'declined') return 'declined';
  if (b === 'double-booked') { const c = clashOf(a); return `also on ${posName(c.pos)} at ${svcName(docOf(c.sunId), c.svc)} at the same time`; }
  return b;
}

/* ---------- coverage ---------- */
export function posCov(sunId, svc, pos) {
  const p = S.pos[pos]; const n = sunId ? asgOf(sunId, svc, pos).filter(a => status(a) !== 'declined').length : 0;   // a decline leaves the spot open
  const cls = n < (p?.min ?? 1) ? 'bad' : n < (p?.pref ?? 1) ? 'warn' : 'ok';
  return { n, cls, min: p?.min ?? 1, pref: p?.pref ?? 1 };
}
export function cov(doc, svc) {
  const list = positionsList();
  if (!list.length) return { n: 0, cls: 'mute', label: 'No positions set up', filled: 0, wanted: 0 };
  let filled = 0, wanted = 0, n = 0; const short = [], under = [];
  for (const p of list) {
    const c = posCov(doc?.id, svc, p.id);
    n += c.n; filled += Math.min(c.n, c.pref); wanted += c.pref;
    if (c.n < c.min) short.push(p); else if (c.n < c.pref) under.push(p);
  }
  const ratio = `${filled}/${wanted}`;
  if (short.length) return { n, cls: 'bad', filled, wanted, label: short.length === 1 ? `Needs ${short[0].name.toLowerCase()} · ${ratio}` : `${short.length} positions short · ${ratio}` };
  if (under.length) return { n, cls: 'warn', filled, wanted, label: `Minimum only · ${ratio}` };
  return { n, cls: 'ok', filled, wanted, label: `Fully covered · ${ratio}` };
}

/* ---------- workload ---------- */
export function loadFor(person, m) { let n = 0; for (const a of assignments()) if (a.person === person && S.sun[a.sunId].date.startsWith(m)) n++; return n; }
export function fairness(m) {
  const t = activePeople().map(x => ({ id: x.id, name: x.name, n: loadFor(x.id, m) })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  const avg = t.length ? t.reduce((a, x) => a + x.n, 0) / t.length : 0;
  return { t, avg, mx: Math.max(1, ...t.map(x => x.n)) };
}
export const heavy = (n, avg) => n >= 2 && n > avg + 1;

/* ---------- home dashboard ---------- */
export function warnings() {
  const out = []; const months = [ym(T.now), shiftMonth(ym(T.now), 1)]; const list = positionsList();
  for (const m of months) for (const r of monthRows(m)) {
    if (r.date < T.todayIso) continue;
    for (const s of svcKeys(r.doc)) {
      const name = r.doc ? svcName(r.doc, s) : SVC[s].name;
      if (!r.doc || !asgOf(r.id, s).length) { if (list.length) out.push({ sev: 'bad', text: `${name}: nobody assigned yet`, date: r.date }); continue; }
      for (const p of list) {
        const c = posCov(r.id, s, p.id);
        if (c.n < c.min) out.push({ sev: 'bad', text: `${name}: ${c.n ? `${p.name} has ${c.n} of ${c.min} needed` : `no ${p.name.toLowerCase()}`}`, date: r.date });
        else if (c.n < c.pref) out.push({ sev: 'warn', text: `${name}: ${p.name} has ${c.n} of ${c.pref} preferred`, date: r.date });
      }
      for (const a of asgOf(r.id, s)) { const b = broken(a); if (b && b !== 'removed') out.push({ sev: 'bad', text: `${pname(a.person)}: ${brokenText(a)} (${name})`, date: r.date }); }
    }
  }
  return out;
}
export function awaiting() { return assignments().filter(a => S.sun[a.sunId].date >= T.todayIso && status(a) === 'awaiting').length; }

/* ---------- auto-fill ----------
   For each upcoming service in the month, fill every position up to its preferred number.
   Never: someone not set up for the position, the wrong language, a Sunday they asked off,
   two positions in one service, or two services that overlap in time.
   Prefer: people not already serving that day, people under their monthly maximum, the lightest load. */
export function planAutofill(m) {
  const team = activePeople(); const list = positionsList();
  const load = {}; team.forEach(p => { load[p.id] = loadFor(p.id, m); });
  const busy = assignments().map(a => { const d = docOf(a.sunId); return { person: a.person, date: d.date, sunId: a.sunId, svc: a.svc, ...windowOf(d, a.svc) }; });
  const newSundays = [], adds = [];
  for (const r of monthRows(m)) {
    if (r.date < T.todayIso) continue;
    const doc = r.doc || { id: r.id, ...newSun(r.date) };
    for (const svc of svcKeys(doc)) {
      const w = windowOf(doc, svc);
      for (const p of list) {
        let n = asgOf(r.doc ? r.id : null, svc, p.id).length + adds.filter(x => x.sunday_id === r.id && x.svc === svc && x.position_id === p.id).length;
        while (n < p.pref) {
          const free = team.filter(t => qualified(t.id, p.id) && speaks(t.id, svc) && !isOff(t.id, r.date)
            && !busy.some(b => b.person === t.id && b.date === r.date && ((b.sunId === r.id && b.svc === svc) || overlaps(b, w))));
          const usedToday = id => busy.some(b => b.person === id && b.date === r.date);
          const over = t => load[t.id] >= (t.max || 4);
          const pick = free.sort((a, b) => (usedToday(a.id) - usedToday(b.id)) || (over(a) - over(b)) || (load[a.id] - load[b.id]) || a.name.localeCompare(b.name))[0];
          if (!pick) break;
          if (!r.doc && !newSundays.some(x => x.id === r.id)) newSundays.push({ id: r.id, ...newSun(r.date) });
          adds.push({ sunday_id: r.id, svc, position_id: p.id, person_id: pick.id });
          busy.push({ person: pick.id, date: r.date, sunId: r.id, svc, ...w });
          load[pick.id]++; n++;
        }
      }
    }
  }
  return { newSundays, adds };
}

/** People who could take an assignment, best first. Used for the Assign menu and swap replacements. */
export function candidates(sunId, date, svc, pos, exclude = []) {
  const doc = docOf(sunId) || { id: sunId, ...newSun(date) }; const w = windowOf(doc, svc); const m = date.slice(0, 7);
  const inSvc = new Set(asgOf(sunId, svc).map(a => a.person));
  return activePeople().filter(p => !exclude.includes(p.id) && !inSvc.has(p.id)).map(p => {
    const clash = assignments().some(a => a.person === p.id && S.sun[a.sunId].date === date && overlaps(w, windowOf(docOf(a.sunId), a.svc)));
    const why = !qualified(p.id, pos) ? `not on ${posName(pos)}` : !speaks(p.id, svc) ? `not ${svc.toUpperCase()}` : isOff(p.id, date) ? 'Sunday off' : clash ? 'busy then' : '';
    return { ...p, why, load: loadFor(p.id, m) };
  }).sort((a, b) => (!!a.why - !!b.why) || (a.load - b.load) || a.name.localeCompare(b.name));
}
