/* Follow-up flows: board columns, overdue items, "my follow-ups".
   Reads the loaded state only (no database or DOM), so it can be unit-tested. */
import { S, T } from './state.js';
import { myPerson } from './domain.js';

export const flowList = () => Object.entries(S.flows || {}).map(([id, f]) => ({ id, ...f })).filter(f => f.active !== false).sort((a, b) => (a.id === 'newcomer' ? -1 : b.id === 'newcomer' ? 1 : a.name.localeCompare(b.name)));
export const stepsOf = flowId => Object.entries(S.steps || {}).map(([id, s]) => ({ id, ...s })).filter(s => s.flow === flowId).sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
export const flowName = (id, lang = 'en') => { const f = S.flows?.[id]; return f ? ((lang === 'fr' && f.nameFr) || f.name) : ''; };
export const stepTitle = (id, lang = 'en') => { const s = S.steps?.[id]; return s ? ((lang === 'fr' && s.titleFr) || s.title) : ''; };

export const entries = () => Object.entries(S.fentries || {}).map(([id, e]) => ({ id, ...e })).filter(e => S.members[e.member] && S.members[e.member].active !== false);
export const isOverdue = (e, today = T.todayIso) => e.status === 'active' && !!e.due && e.due < today;
export const isDueToday = (e, today = T.todayIso) => e.status === 'active' && e.due === today;
/** Whole days a follow-up is late (0 when on time). */
export const daysLate = (e, today = T.todayIso) => (isOverdue(e, today) ? Math.round((Date.parse(today) - Date.parse(e.due)) / 86400000) : 0);

const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (S.members[a.member]?.name || '').localeCompare(S.members[b.member]?.name || '');

/** The board: one column per step, with that step's active people, soonest due first. */
export function board(flowId, { mine = false, assignee = myPerson() } = {}) {
  const list = entries().filter(e => e.flow === flowId && e.status === 'active' && (!mine || e.assignee === assignee));
  const cols = stepsOf(flowId).map(s => ({ step: s, items: list.filter(e => e.step === s.id).sort(byDue) }));
  const orphan = list.filter(e => !S.steps?.[e.step]);
  if (orphan.length && cols.length) cols[0].items = [...cols[0].items, ...orphan].sort(byDue);   // a deleted step's people show in the first column
  const done = entries().filter(e => e.flow === flowId && e.status === 'done' && (!mine || e.assignee === assignee));
  return { cols, active: list.length, overdue: list.filter(e => isOverdue(e)).length, done: done.length };
}

/** Follow-ups assigned to a serving-team member, overdue first. */
export const myFollowups = (cid = myPerson()) => (cid ? entries().filter(e => e.status === 'active' && e.assignee === cid).sort((a, b) => (isOverdue(b) - isOverdue(a)) || byDue(a, b)) : []);
/** A person's follow-ups (active first). */
export const entriesOfMember = memberId => entries().filter(e => e.member === memberId).sort((a, b) => (a.status === 'active' ? -1 : 1) - (b.status === 'active' ? -1 : 1) || b.created - a.created);
