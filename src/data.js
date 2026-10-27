/* Database access: loading everything, saving, and live updates. */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { S, ui, setState } from './state.js';
import { toast } from './ui.js';
import { clock, timerRow, timerKey } from './timer.js';
import { logRow } from './activity.js';

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

const TABLES = ['coordinators', 'sundays', 'templates', 'config', 'ticks', 'daysoff', 'swaps', 'teams', 'positions', 'person_positions', 'assignments', 'service_timers', 'members', 'attendance', 'events', 'service_reports', 'categories', 'families', 'saved_filters', 'member_stats'];

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
  const members = {}; rows('members').forEach(r => { members[r.id] = memberRow(r); });
  ui.peopleMissing = !!(by.categories.error || by.families.error);   // migration 006 not run yet
  const cats = {}; rows('categories').forEach(r => { cats[r.id] = { name: r.name, nameFr: r.name_fr || '', sort: r.sort || 0, active: r.active !== false }; });
  const families = {}; rows('families').forEach(r => { families[r.id] = { name: r.name, address: r.address || '' }; });
  const filters = {}; rows('saved_filters').forEach(r => { filters[r.id] = { name: r.name, filters: r.filters || {}, owner: r.owner || '', shared: !!r.shared }; });
  const mstats = {}; rows('member_stats').forEach(r => { mstats[r.member_id] = { first: r.first_attended, last: r.last_attended, visits: r.visits, en: r.visits_en, fr: r.visits_fr }; });
  const att = {}; rows('attendance').forEach(r => { att[r.member_id + '|' + r.date + '|' + r.svc] = { member: r.member_id, date: r.date, svc: r.svc, at: Date.parse(r.at), by: r.by_coord }; });
  const events = {}; rows('events').forEach(r => { events[r.id] = { title: r.title, date: r.date, start: r.start_time || '', end: r.end_time || '', location: r.location || '', description: r.description || '' }; });
  ui.reportsMissing = !!by.service_reports.error;   // migration 004 not run yet
  const reports = {}; rows('service_reports').forEach(r => { reports[r.sunday_id + '|' + r.svc] = reportRow(r); });
  const asg = {}; rows('assignments').forEach(r => { asg[r.id] = { sunId: r.sunday_id, svc: r.svc, pos: r.position_id, person: r.person_id, status: r.status }; });
  setState({ people, sun, tpl, cfg, chk, off, swap, teams, pos, quals, asg, timers, members, att, events, reports, cats, families, filters, mstats });
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

/** A service_reports row as the app uses it. */
export const reportRow = r => ({ notes: r.notes || {}, summary: r.summary || '', followups: r.followups || '', updatedAt: Date.parse(r.updated_at), by: r.updated_by });

/** Save one part of a service report (a segment's note, the summary or follow-ups). */
export async function saveReport(sunId, svc, key, item, text) {
  const r = await q(sb.rpc('save_report', { p_sunday: sunId, p_svc: svc, p_key: key, p_item: item || null, p_text: text }));
  if (r && r !== true && r.sunday_id) S.reports[sunId + '|' + svc] = reportRow(r);
  return r !== null;
}

/** Load the activity log, 300 entries at a time (admins only; others get nothing back). */
export async function loadActivity(more = false) {
  const a = ui.act; if (!a || a.loading) return;
  a.loading = true; a.error = '';
  let query = sb.from('activity_log').select('*').order('at', { ascending: false }).order('id', { ascending: false }).limit(300);
  const oldest = a.rows[a.rows.length - 1];
  if (more && oldest) query = query.lt('at', new Date(oldest.at).toISOString());
  const { data, error } = await query;
  a.loading = false;
  if (error) { a.error = /does not exist|schema cache|PGRST205|42P01/i.test(error.code + ' ' + error.message) ? 'This needs a database update. Run migrations/005-activity-log.sql in Supabase, then reload.' : 'Could not load the activity log: ' + error.message; a.loaded = true; onLoaded(); return; }
  const rows = (data || []).map(logRow);
  a.rows = more ? [...a.rows, ...rows] : rows; a.loaded = true; a.done = rows.length < 300;
  onLoaded();
}

/** A members row as the app uses it (fields from migration 006 are empty before it runs). */
export const memberRow = r => ({
  name: r.name || [r.first_name, r.last_name].filter(Boolean).join(' '), first: r.first_name || '', last: r.last_name || '',
  phone: r.phone || '', email: r.email || '', lang: r.lang, status: r.status, household: r.household || '', notes: r.notes || '',
  active: r.active !== false, createdAt: Date.parse(r.created_at),
  gender: r.gender || '', birthday: r.birthday || '', address: r.address || '', familyId: r.family_id || null, familyRole: r.family_role || '',
  categoryId: r.category_id || null, smsOptOut: !!r.sms_opt_out, emailOptOut: !!r.email_opt_out, coordinatorId: r.coordinator_id || null,
});

/** One person's notes, category history and full attendance, loaded when their profile opens. */
export async function loadProfile(id) {
  const [n, h, a] = await Promise.all([
    sb.from('person_notes').select('*').eq('member_id', id).order('created_at', { ascending: false }),
    sb.from('category_history').select('*').eq('member_id', id).order('changed_at', { ascending: true }),
    sb.from('attendance').select('date,svc,at').eq('member_id', id).order('date', { ascending: false }),
  ]);
  if (ui.person !== id) return;
  ui.prof = {
    id, loaded: true,
    notes: (n.data || []).map(r => ({ id: r.id, body: r.body, author: r.author || '', at: Date.parse(r.created_at) })).sort((a, b) => b.at - a.at),   // newest first
    history: (h.data || []).map(r => ({ from: r.from_category, to: r.to_category, by: r.changed_by || '', at: Date.parse(r.changed_at), note: r.note || '' })).sort((a, b) => a.at - b.at),   // oldest first, as a story
    att: (a.data || []).map(r => ({ date: r.date, svc: r.svc })).sort((a, b) => b.date.localeCompare(a.date)),
  };
  onLoaded();
}
