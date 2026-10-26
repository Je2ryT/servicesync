/* Database access: loading everything, saving, and live updates. */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { S, ui, setState } from './state.js';
import { toast } from './ui.js';

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

const TABLES = ['coordinators', 'sundays', 'templates', 'config', 'ticks', 'daysoff', 'swaps', 'teams', 'positions', 'person_positions', 'assignments'];

export async function loadAll() {
  const res = await Promise.all(TABLES.map(n => sb.from(n).select('*')));
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
  const asg = {}; rows('assignments').forEach(r => { asg[r.id] = { sunId: r.sunday_id, svc: r.svc, pos: r.position_id, person: r.person_id, status: r.status }; });
  setState({ people, sun, tpl, cfg, chk, off, swap, teams, pos, quals, asg });
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
