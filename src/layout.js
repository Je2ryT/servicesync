/* Printable service layout: each part of the order of service can carry placeholders
   ("tags") for who leads it — pastor, moderator, interpreter, choir, or anything else —
   each in a tag colour (blue, white or yellow). Names come from what was typed for that
   service, otherwise from the schedule. Reads loaded state only, so it can be unit-tested. */
import { S } from './state.js';
import { tplFor, startOf, asgOf, pname, allPositions, status } from './domain.js';
import { clock } from './util.js';
import { fold } from './members.js';

export const ROLES = {
  pastor: { en: 'Pastor', fr: 'Pasteur', color: 'blue' },
  moderator: { en: 'Moderator', fr: 'Modérateur', color: 'yellow' },
  interpreter: { en: 'Interpreter', fr: 'Interprète', color: 'white' },
  choir: { en: 'Choir', fr: 'Chorale', color: 'blue' },
  other: { en: 'Other', fr: 'Autre', color: 'white' },
};
export const COLORS = ['blue', 'white', 'yellow', 'red', 'green', 'purple', 'orange', 'pink', 'gray'];

/** A placeholder's label in a language ("other" uses the label typed for it). */
export const tagLabel = (tag, lang = 'en') => (tag.role === 'other' || !ROLES[tag.role] ? (tag.label || ROLES.other[lang === 'fr' ? 'fr' : 'en']) : ROLES[tag.role][lang === 'fr' ? 'fr' : 'en']);
/** Clean a placeholder as saved in a template. */
export const cleanTag = (x, i = 0) => {
  const role = ROLES[x?.role] ? x.role : 'other';
  return { id: String(x?.id || 'r' + i), role, label: role === 'other' ? String(x?.label || '').trim().slice(0, 40) : '', color: COLORS.includes(x?.color) ? x.color : ROLES[role].color, pos: x?.pos || '' };
};
export const tagsOf = item => (Array.isArray(item?.roles) ? item.roles.map(cleanTag) : []);

/** The position a placeholder fills from: the one chosen, or one with the same name (either language). */
export function positionFor(tag) {
  if (tag.pos && S.pos[tag.pos]) return tag.pos;
  const names = new Set([tagLabel(tag, 'en'), tagLabel(tag, 'fr'), tag.label].filter(Boolean).map(fold));
  return allPositions().find(p => p.active !== false && names.has(fold(p.name)))?.id || '';
}

/** Who fills a placeholder at one service. The box starts empty: only a typed name fills it.
    Whoever the schedule has for that position is offered as a suggestion (not those who declined). */
export function namesFor(doc, svc, itemId, tag) {
  const typed = S.reports[doc.id + '|' + svc]?.layout?.[itemId]?.[tag.id];
  const pos = positionFor(tag);
  const suggest = pos ? asgOf(doc.id, svc, pos).filter(a => status(a) !== 'declined').map(a => pname(a.person)) : [];
  if (typed != null && String(typed).trim()) return { names: [String(typed).trim()], typed: true, suggest };
  return { names: [], typed: false, suggest };
}

/** The whole layout of a service: each part with its time and filled-in placeholders. */
export function layoutOf(doc, svc) {
  const order = tplFor(doc, svc).order || []; let at = 0;
  return order.map(o => {
    const row = { id: o.id, item: o.item, min: +o.min || 0, start: clock(startOf(doc, svc), at), tags: tagsOf(o).map(tag => ({ ...tag, ...namesFor(doc, svc, o.id, tag) })) };
    at += +o.min || 0; return row;
  });
}
/** How many placeholders still have nobody. */
export const openCount = rows => rows.reduce((n, r) => n + r.tags.filter(x => !x.names.length).length, 0);
