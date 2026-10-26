/* Database access: loading everything, saving, and live updates. */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { S, ui, setState } from './state.js';
import { toast } from './ui.js';
import { clock, timerRow, timerKey } from './timer.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let onLoaded = () => {};
export const whenLoaded = fn => { onLoaded = fn; };

/** Run a query; show a friendly message and return null on failure. */
export async function q(p) {
  const { data, error } = await p;
  if (error) {
    console.error(error);
    toast(error.code === '42501' || /row-level security|not allowed|only/i.test(error.message) ? "You don't have permission to change that." : 'Could not save: ' + error.message);
    return null;
  }
  return data ?? true;
}

const TABLES = ['coordinators', 'sundays', 'templates', 'config', 'ticks', 'daysoff', 'swaps', 'teams', 'positions', 'person_positions', 'assignments', 'service_timers', 'members', 'attendance', 'events'];

export async function loadAll() {
  const since = new Date(); since.setDate(since.getDate() - 180);   // attendance: the last six months is plenty for the screens
  const res = await Promise.all(TABLES.map(n => (n === 'attendance' ? sb.from(n).select('*').gte('date', since.toISOString().slice(0, 10)) : sb.from(n).select('*'))));
  const by = Object.fromEntries(TABLES.map((n, i) => [n, res[i]]));
  if (['teams', 'positions', 'person_positions', 'assignments'].some(n => by[n].error && /does not exist|schema cache|42P01|PGRST205/i.test(by[n].error.code + ' ' + by[n].error.message))) {
    ui.needsMigration = true; ui.ready = true; onLoaded(); return;
  }
  const rows = n => by[n].data || [];
  const people = {}; rows('coordinators').forEach(r => { people[r.id] = { name: r.name, email: r.email || '', phone: r.phone || '', langs: { en: r.lang_en, fr: r.lang_fr }, active: r.active, max: r.max_per_month }; });
  const sun = {}; rows('sundays').forEach(r => { sun[r.id] = { date: r.date, published: r.published, special: r.special, title: r.title, services: r.services || {} }; });
  const tpl = {}; rows('templates').forEach(r => { tpl[r.id] = { name: r.name, lang: r.lang, order: r.items || [] }; });
  const cfg = {}; rows('config').forEach(r => { cfg[r.id] = r.data || {}; });
  const chk = {}; rows('ticks').forEach(r => {
    const c = chk[r.sunday_id] || (chk[r.sunday_id] = { ticks: {}, live: {} });
    if (r.key.startsWith('live:')) { const [, s, i] = r.key.split(':'); (c.live[s] || (c.live[s] = {}))[i] = true; } else c.ticks[r.key] = { by: r.by_coord, at: Date.parse(r.at) };
  });
  const off = {}; rows('daysoff').forEach(r => { ((off[r.coordinator_id] || (off[r.coordinator_id] = { dates: {} })).dates)[r.date] = true; });
  const swap = {}; rows('swaps').forEach(r => { swap[r.id] = { sunId: r.sunday_id, svc: r.svc, pos: r.position_id, from: r.from_id, to: r.to_id, note: r.note, status: r.status, at: Date.parse(r.created_at) }; });
  const teams = {}; rows('teams').forEach(r => { teams[r.id] = { name: r.name, sort: r.sort }; });
  const pos = {}; rows('positions').forEach(r => { pos[r.id] = { team: r.team_id, name: r.name, min: r.min_needed, pref: r.preferred, sort: r.sort, active: r.active }; });
  const quals = {}; rows('person_positions').forEach(r => { (quals[r.person_id] || (quals[r.person_id] = {}))[r.position_id] = true; });
  const timers = {}; ui.timerMissing = !!by.service_timers.error;   // migration 002 not run yet: everything else still works
  rows('service_timers').forEach(r => { timers[timerKey(r.sunday_id, r.svc)] = timerRow(r); });
  ui.membersMissing = !!(by.members.error || by.attendance.error || by.events.error);   // migration 003 not run yet
  const members = {}; rows('members').forEach(r => { members[r.id] = { name: r.name, phone: r.phone || '', email: r.email || '', lang: r.lang, status: r.status, household: r.household || '', notes: r.notes || '', active: r.active !== false, createdAt: Date.parse(r.created_at) }; });
  const att = {}; rows('attendance').forEach(r => { att[r.member_id + '|' + r.date + '|' + r.svc] = { member: r.member_id, date: r.date, svc: r.svc, at: Date.parse(r.at), by: r.by_coord }; });
  const events = {}; rows('events').forEach(r => { events[r.id] = { title: r.title, date: r.date, start: r.start_time || '', end: r.end_time || '', location: r.location || '', description: r.description || '' }; });
  const asg = {}; rows('assignments').forEach(r => { asg[r.id] = { sunId: r.sunday_id, svc: r.svc, pos: r.position_id, person: r.person_id, status: r.status }; });
  setState({ people, sun, tpl, cfg, chk, off, swap, teams, pos, quals, asg, timers, members, att, events });
  ui.needsMigration = false;
  if (ui.chkDraft && !ui.chkDraft.dirty) ui.chkDraft = null;
  ui.ready = true; onLoaded();
}

let lt;
export const reload = () => { clearTimeout(lt); lt = setTimeout(loadAll, 250); };

export const sunRow = (id, d) => ({ id, date: d.date, published: !!d.published, special: !!d.special, title: d.title || null, services: d.services || {} });
export async function saveSun(id, d) { const r = await q(sb.from('sundays').upsert(sunRow(id, d))); if (r) reload(); return r; }
export async function ensureSun(id, d) { if (S.sun[id]) return true; S.sun[id] = d; return saveSun(id, d); }

let subscribed = false;
export function subscribe() {
  if (subscribed) return; subscribed = true;   // signing out and back in must not add a second listener
  sb.channel('servicesync').on('postgres_changes', { event: '*', schema: 'public' }, reload).subscribe();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reload(); });
}

/** Measure how far this device's clock is from the server's, so every screen shows the same countdown. */
export async function syncClock() {
  const t0 = Date.now(); const { data, error } = await sb.rpc('timer_now'); const t1 = Date.now();
  if (!error && data) clock.offset = Number(data) - (t0 + t1) / 2;
}

/** Press a timer button. Applies the server's answer right away instead of waiting for the live update. */
export async function timerAction(sunId, svc, op, arg = {}) {
  const r = await q(sb.rpc('timer_control', { p_sunday: sunId, p_svc: svc, p_action: op, p_arg: arg }));
  if (r === null) return false;
  const k = timerKey(sunId, svc);
  if (r && r !== true && r.sunday_id) S.timers[k] = timerRow(r); else delete S.timers[k];
  onLoaded(); reload(); return true;
}
