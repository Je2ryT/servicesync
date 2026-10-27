/* The church directory: categories, filters, families, ages and CSV export.
   Reads the loaded state only (no database or DOM), so it can be unit-tested. */
import { S, T } from './state.js';
import { fold } from './members.js';
import { iso } from './util.js';

/* ---------- categories ---------- */
export const DEFAULT_CATS = {
  congregation: { name: 'Congregation', nameFr: 'Assemblée', sort: 0, active: true },
  volunteers: { name: 'Volunteers', nameFr: 'Serviteurs', sort: 1, active: true },
  visitors: { name: 'Visitors', nameFr: 'Visiteurs', sort: 2, active: true },
  community: { name: 'Community Contacts', nameFr: 'Contacts de la communauté', sort: 3, active: true },
  'new-believers': { name: 'New Believers', nameFr: 'Nouveaux convertis', sort: 4, active: true },
  'guest-speakers': { name: 'Guest Speakers', nameFr: 'Orateurs invités', sort: 5, active: true },
  online: { name: 'Online Attendees', nameFr: 'Participants en ligne', sort: 6, active: true },
};
const catMap = () => (Object.keys(S.cats || {}).length ? S.cats : DEFAULT_CATS);
/** Categories in order. Hidden ones are left out unless asked for. */
export const cats = (withHidden = false) => Object.entries(catMap()).map(([id, c]) => ({ id, ...c })).filter(c => withHidden || c.active !== false).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
export const catName = (id, lang = 'en') => { const c = catMap()[id]; return c ? ((lang === 'fr' && c.nameFr) || c.name) : ''; };
/** A person's category, worked out from the old status before migration 006 has run. */
export const catOf = m => m?.categoryId || (['newcomer', 'visitor'].includes(m?.status) ? 'visitors' : 'congregation');
export const isVisitor = m => catOf(m) === 'visitors';

/* ---------- people ---------- */
export const everyone = () => Object.entries(S.members).map(([id, m]) => ({ id, ...m })).filter(m => m.active !== false)
  .sort((a, b) => (a.last || a.name).localeCompare(b.last || b.name) || a.name.localeCompare(b.name));
export const familyOf = id => { const f = S.members[id]?.familyId; return f ? Object.entries(S.members).filter(([x, m]) => m.familyId === f && m.active !== false).map(([x, m]) => ({ id: x, ...m })) : []; };
export const lastAttended = id => S.mstats?.[id]?.last || null;

/** Age in whole years on `today` (YYYY-MM-DD), or null. */
export function ageOn(birthday, today = T.todayIso) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(birthday || '')) return null;
  const [y, m, d] = birthday.split('-').map(Number); const [Y, M, D] = today.split('-').map(Number);
  return Y - y - (M < m || (M === m && D < d) ? 1 : 0);
}
const daysAgo = n => { const d = new Date(T.now); d.setDate(d.getDate() - n); return iso(d); };

/* ---------- filters ---------- */
export const EMPTY = { q: '', cat: '', lang: '', svc: '', last: '', phone: '', email: '' };
export const isFiltered = f => Object.keys(EMPTY).some(k => (f?.[k] || '') !== '');

/** People matching the filters: { q, cat, lang, svc ('en'|'fr'), last, phone/email ('yes'|'no') }. */
export function filterPeople(f = {}, list = everyone()) {
  const q = fold(f.q); const digits = q.replace(/\D/g, '');
  const cut = { within2w: daysAgo(14), within1m: daysAgo(30), within3m: daysAgo(91), notIn1m: daysAgo(30), notIn3m: daysAgo(91) };
  return list.filter(m => {
    if (q && !(fold(m.name).includes(q) || fold(m.email).includes(q) || (digits.length >= 3 && m.phone.replace(/\D/g, '').includes(digits)))) return false;
    if (f.cat && catOf(m) !== f.cat) return false;
    if (f.lang && !(m.lang === f.lang || m.lang === 'both' || (f.lang === 'both' && m.lang === 'both'))) return false;
    const st = S.mstats?.[m.id];
    if (f.svc && !(st?.[f.svc] > 0)) return false;
    if (f.last) {
      const l = st?.last || null;
      if (f.last === 'never') { if (l) return false; }
      else if (f.last.startsWith('within')) { if (!l || l < cut[f.last]) return false; }
      else if (f.last.startsWith('notIn')) { if (l && l >= cut[f.last]) return false; }
    }
    if (f.phone === 'yes' && !m.phone) return false;
    if (f.phone === 'no' && m.phone) return false;
    if (f.email === 'yes' && !m.email) return false;
    if (f.email === 'no' && m.email) return false;
    return true;
  });
}

/** Saved filters this person can use: their own and shared ones. */
export const savedFilters = email => Object.entries(S.filters || {}).map(([id, x]) => ({ id, ...x })).filter(x => x.shared || x.owner === (email || '').toLowerCase()).sort((a, b) => a.name.localeCompare(b.name));

/* ---------- CSV ---------- */
/* Values starting with = + - @ could run as formulas in Excel; phone numbers like +1 704… are left alone. */
const risky = s => /^[=+\-@]/.test(s) && !/^[+\-]?[\d\s().-]+$/.test(s);
const cell = v => { const s = v == null ? '' : String(v); const x = risky(s) ? "'" + s : s; return /[",\n\r;]/.test(x) || x !== s ? '"' + x.replace(/"/g, '""') + '"' : x; };
export const CSV_COLUMNS = ['First Name', 'Last Name', 'Email', 'Mobile', 'Gender', 'Birthday', 'Address', 'Family', 'Family Role', 'Category', 'Language', 'Last Attended', 'Visits', 'SMS Opt-out', 'Email Opt-out'];
/** People as CSV (opens in Excel and re-imports into ServiceSync). */
export function toCsv(list) {
  const rows = list.map(m => [m.first || m.name, m.last, m.email, m.phone, m.gender, m.birthday, m.address, S.families[m.familyId]?.name || m.household || '', m.familyRole,
    catName(catOf(m)), m.lang === 'both' ? 'English, French' : m.lang === 'en' ? 'English' : 'French', S.mstats?.[m.id]?.last || '', S.mstats?.[m.id]?.visits || 0,
    m.smsOptOut ? 'yes' : '', m.emailOptOut ? 'yes' : '']);
  return '﻿' + [CSV_COLUMNS, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
