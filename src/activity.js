/* The activity log: turning raw database changes into plain sentences.
   Reads the loaded state only (no database or DOM), so it can be unit-tested. */
import { S } from './state.js';
import { SVC } from './config.js';
import { fmt } from './util.js';

export const AREAS = {
  schedule: 'Schedule', people: 'Serving team', members: 'Members & check-in', events: 'Events', reports: 'Reports', settings: 'Templates & settings',
};
const AREA_OF = {
  sundays: 'schedule', assignments: 'schedule', swaps: 'schedule', daysoff: 'schedule',
  coordinators: 'people', admins: 'people', teams: 'people', positions: 'people', person_positions: 'people',
  members: 'members', attendance: 'members', families: 'members', person_notes: 'members', categories: 'settings', flows: 'settings', flow_steps: 'settings', flow_entries: 'members', events: 'events', service_reports: 'reports', templates: 'settings', config: 'settings',
};
const ICON = { schedule: 'cal', people: 'users', members: 'checkc', events: 'cal', reports: 'pencil', settings: 'layers' };

/** A log row as the app uses it. */
export const logRow = r => ({ id: r.id, at: Date.parse(r.at), actor: r.actor || '', tbl: r.tbl, op: r.op, rowId: r.row_id, old: r.old || null, new: r.new || null });

/** Who made the change: the serving-team name for that email, or the email itself. */
export function actorName(email) {
  if (!email) return 'Someone in Supabase';
  const p = Object.values(S.people).find(x => (x.email || '').toLowerCase() === email.toLowerCase());
  return p?.name || email;
}

const q = s => `“${s}”`;
const person = (id, snap) => S.people[id]?.name || snap || 'a removed person';
const member = (id, snap) => S.members[id]?.name || snap || 'a removed member';
const position = id => S.pos[id]?.name || 'a removed position';
const team = id => S.teams[id]?.name || 'a removed team';
const day = sunId => { const d = String(sunId || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? fmt(d, { month: 'short', day: 'numeric' }) : 'a removed Sunday'; };
const service = (sunId, svc) => `${svc === 'ev' ? (S.sun[sunId]?.title || 'Special event') : (SVC[svc]?.name || 'Service')}, ${day(sunId)}`;
const STATUS_WORD = { confirmed: 'confirmed', declined: 'declined', awaiting: 'reset to awaiting' };

/** Which fields changed, as readable labels. */
const LABELS = {
  coordinators: { name: 'name', email: 'sign-in email', phone: 'phone', lang_en: 'English service', lang_fr: 'French service', active: 'active', max_per_month: 'monthly limit' },
  members: { name: 'name', first_name: 'first name', last_name: 'last name', phone: 'phone', email: 'email', lang: 'language', status: 'status', household: 'household', notes: 'notes', active: 'active', gender: 'gender', birthday: 'birthday', address: 'address', family_id: 'family', family_role: 'family role', category_id: 'category', sms_opt_out: 'text opt-out', email_opt_out: 'email opt-out', coordinator_id: 'serving-team link' },
  categories: { name: 'name', name_fr: 'French name', sort: 'order', active: 'visibility' },
  families: { name: 'name', address: 'address' },
  positions: { name: 'name', min_needed: 'minimum', preferred: 'preferred number', active: 'scheduling', team_id: 'team', sort: 'order' },
  events: { title: 'title', date: 'date', start_time: 'start time', end_time: 'end time', location: 'location', description: 'details' },
  sundays: { services: 'services', special: 'type', title: 'title', date: 'date' },
};
export function changed(e) {
  if (e.op !== 'update' || !e.old || !e.new) return [];
  const skip = new Set(['updated_at', 'updated_by', 'at', 'created_at', 'created_by']);
  return Object.keys(e.new).filter(k => !skip.has(k) && JSON.stringify(e.old[k]) !== JSON.stringify(e.new[k])).map(k => LABELS[e.tbl]?.[k] || k.replace(/_/g, ' '));
}

/** { area, icon, text } for one log entry, or null for entries not worth showing. */
export function describe(e) {
  const r = e.new || e.old || {}; const o = e.old || {}; const n = e.new || {}; const area = AREA_OF[e.tbl] || 'settings';
  const out = text => (text ? { area, icon: ICON[area], text } : null);
  const fields = changed(e).join(', ');
  switch (e.tbl) {
    case 'assignments': {
      const what = `${person(r.person_id)} as ${position(r.position_id)} · ${service(r.sunday_id, r.svc)}`;
      if (e.op === 'insert') return out(`assigned ${what}`);
      if (e.op === 'delete') return out(`removed ${what}`);
      if (o.person_id !== n.person_id) return out(`moved ${position(r.position_id)} from ${person(o.person_id)} to ${person(n.person_id)} · ${service(r.sunday_id, r.svc)}`);
      if (o.status !== n.status) return out(`${STATUS_WORD[n.status] || 'updated'}: ${what}`);
      return out(`changed ${what}`);
    }
    case 'sundays': {
      const label = r.special ? `${q(r.title || 'Special event')} on ${day(r.id)}` : `Sunday ${day(r.id)}`;
      if (e.op === 'insert') return out(`planned ${label}`);
      if (e.op === 'delete') return out(`removed ${label}`);
      if (o.published !== n.published) return out(`${n.published ? 'published' : 'unpublished'} ${label}`);
      return out(`edited ${label}${fields ? ` (${fields})` : ''}`);
    }
    case 'swaps': {
      const what = `${position(r.position_id)} · ${service(r.sunday_id, r.svc)}`;
      if (e.op === 'insert') return out(`asked for a swap: ${person(r.from_id)}, ${what}${r.note ? ` (${q(r.note)})` : ''}`);
      if (e.op === 'delete') return out(`withdrew a swap request for ${what}`);
      if (n.status === 'approved') return out(`approved a swap: ${person(n.to_id)} covers ${person(n.from_id)}, ${what}`);
      if (n.status === 'declined') return out(`declined ${person(n.from_id)}'s swap request, ${what}`);
      return out(`updated a swap request for ${what}`);
    }
    case 'daysoff':
      return out(`${e.op === 'insert' ? 'marked' : 'cleared'} ${day(r.date)} as a Sunday off for ${person(r.coordinator_id)}`);
    case 'coordinators':
      if (e.op === 'insert') return out(`added ${r.name} to the serving team`);
      if (e.op === 'delete') return out(`removed ${o.name} from the serving team`);
      return out(`edited ${person(n.id, n.name)}${fields ? ` (${fields})` : ''}`);
    case 'admins':
      return out(`${e.op === 'insert' ? 'made' : e.op === 'delete' ? 'removed' : 'changed'} ${r.email} ${e.op === 'delete' ? 'as an administrator' : 'an administrator'}`);
    case 'teams':
      return out(`${e.op === 'insert' ? 'created' : e.op === 'delete' ? 'deleted' : 'renamed'} the team ${q(e.op === 'update' ? n.name : r.name)}${e.op === 'update' && o.name !== n.name ? ` (was ${q(o.name)})` : ''}`);
    case 'positions':
      if (e.op === 'insert') return out(`created the position ${q(r.name)} in ${team(r.team_id)}`);
      if (e.op === 'delete') return out(`deleted the position ${q(o.name)}`);
      return out(`edited the position ${q(n.name)}${fields ? ` (${fields})` : ''}`);
    case 'person_positions':
      return out(e.op === 'insert' ? `set ${person(r.person_id)} to serve as ${position(r.position_id)}` : `${person(r.person_id)} no longer serves as ${position(r.position_id)}`);
    case 'members':
      if (e.op === 'insert') return out(`added ${r.name}${r.status === 'newcomer' ? ' (newcomer)' : r.status === 'visitor' ? ' (visitor)' : ''} to the members`);
      if (e.op === 'delete') return out(`removed ${o.name} from the members`);
      return out(`edited ${member(n.id, n.name)}${fields ? ` (${fields})` : ''}`);
    case 'attendance':
      return out(`${e.op === 'delete' ? 'undid the check-in of' : 'checked in'} ${member(r.member_id)} · ${service(r.date, r.svc)}`);
    case 'person_notes':
      if (e.op === 'insert') return out(`wrote a note on ${member(r.member_id)}`);
      if (e.op === 'delete') return out(`deleted a note on ${member(r.member_id)}`);
      return out(`edited a note on ${member(r.member_id)}`);
    case 'families':
      if (e.op === 'insert') return out(`created the family ${q(r.name)}`);
      if (e.op === 'delete') return out(`deleted the family ${q(o.name)}`);
      return out(`edited the family ${q(n.name)}${fields ? ` (${fields})` : ''}`);
    case 'categories':
      if (e.op === 'insert') return out(`added the category ${q(r.name)}`);
      if (e.op === 'delete') return out(`deleted the category ${q(o.name)}`);
      if (o.active !== n.active) return out(`${n.active ? 'showed' : 'hid'} the category ${q(n.name)}`);
      return out(`edited the category ${q(n.name)}${fields ? ` (${fields})` : ''}`);
    case 'flow_entries': {
      const who = member(r.member_id); const step = S.steps?.[n.step_id || o.step_id]?.title;
      if (e.op === 'insert') return out(`added ${who} to the ${S.flows?.[r.flow_id]?.name || ''} follow-up`.replace('  ', ' '));
      if (e.op === 'delete') return out(`removed ${who} from a follow-up`);
      if (o.status !== n.status && n.status === 'done') return out(`finished ${who}'s follow-up`);
      if (o.step_id !== n.step_id) return out(`moved ${who} to “${S.steps?.[n.step_id]?.title || 'the next step'}”`);
      if (o.assignee !== n.assignee) return out(`gave ${who}'s follow-up to ${n.assignee ? person(n.assignee) : 'nobody'}`);
      if (o.due_date !== n.due_date) return out(`moved ${who}'s follow-up to ${day(n.due_date)}`);
      return out(`updated ${who}'s follow-up${step ? ` (${step})` : ''}`);
    }
    case 'flows': case 'flow_steps':
      return out(`${e.op === 'insert' ? 'added' : e.op === 'delete' ? 'removed' : 'edited'} ${e.tbl === 'flows' ? 'the follow-up flow' : 'the follow-up step'} ${q(r.name || r.title)}`);
    case 'events':
      if (e.op === 'insert') return out(`added the event ${q(r.title)} on ${day(r.date)}`);
      if (e.op === 'delete') return out(`deleted the event ${q(o.title)} (${day(o.date)})`);
      return out(`edited the event ${q(n.title)}${fields ? ` (${fields})` : ''}`);
    case 'service_reports': {
      if (e.op === 'insert' && !Object.keys(n.notes || {}).length && !n.summary && !n.followups) return null;   // the empty report a first note creates
      const on = o.notes || {}, nn = n.notes || {};
      const parts = [...new Set([...Object.keys(on), ...Object.keys(nn)])].filter(k => JSON.stringify(on[k]) !== JSON.stringify(nn[k])).map(k => (nn[k] || on[k]).item || 'a segment');
      if ((o.summary || null) !== (n.summary || null)) parts.push('the summary');
      if ((o.followups || null) !== (n.followups || null)) parts.push('follow-ups');
      if (e.op === 'delete') return out(`deleted the report for ${service(r.sunday_id, r.svc)}`);
      return parts.length ? out(`wrote notes on ${parts.join(', ')} · report for ${service(r.sunday_id, r.svc)}`) : null;
    }
    case 'templates':
      return out(`${e.op === 'insert' ? 'created' : e.op === 'delete' ? 'deleted' : 'edited'} the order of service ${q(r.name)}`);
    case 'config':
      return out('changed the service templates or checklists');
    default:
      return out(`${e.op === 'insert' ? 'added to' : e.op === 'delete' ? 'removed from' : 'changed'} ${e.tbl.replace(/_/g, ' ')}`);
  }
}

const NOUN = { members: ['member', 'members'], families: ['family', 'families'], categories: ['category', 'categories'], attendance: ['check-in', 'check-ins'], assignments: ['assignment', 'assignments'], person_positions: ['position link', 'position links'], daysoff: ['Sunday off', 'Sundays off'] };
const VERB = { insert: 'added', update: 'changed', delete: 'removed' };

/**
 * Entries (newest first) described and grouped: runs of 4+ of the same kind by the same person
 * within two minutes become one line, like "imported 120 members".
 */
export function feed(entries, filter = {}) {
  const items = [];
  for (const e of entries) {
    const d = describe(e); if (!d) continue;
    if (filter.area && d.area !== filter.area) continue;
    if (filter.actor && e.actor !== filter.actor) continue;
    const who = actorName(e.actor);
    if (filter.text) { const t = filter.text.toLowerCase(); if (!(who + ' ' + d.text).toLowerCase().includes(t)) continue; }
    const last = items[items.length - 1];
    if (last && last.actor === e.actor && last.tbl === e.tbl && last.op === e.op && last.at - e.at <= 120000 && NOUN[e.tbl]) { last.items.push({ ...d, at: e.at }); last.at = e.at; continue; }
    items.push({ actor: e.actor, who, tbl: e.tbl, op: e.op, at: e.at, top: e.at, items: [{ ...d, at: e.at }] });
  }
  return items.map(g => {
    if (g.items.length < 4) return g.items.map(i => ({ who: g.who, actor: g.actor, at: i.at, area: i.area, icon: i.icon, text: i.text, more: null }));
    const [one, many] = NOUN[g.tbl]; const n = g.items.length;
    const verb = g.tbl === 'members' && g.op === 'insert' ? 'added' : g.tbl === 'attendance' && g.op === 'insert' ? 'recorded' : VERB[g.op];
    return [{ who: g.who, actor: g.actor, at: g.top, area: g.items[0].area, icon: g.items[0].icon, text: `${verb} ${n} ${n === 1 ? one : many}`, more: g.items.map(i => i.text) }];
  }).flat();
}
