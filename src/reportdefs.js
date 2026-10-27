/* Report definitions, shared by the Reports screen and the weekly report emails (server/cron.js).
   Pure: no state, DOM or database, so the server can import it and tests can check it. */

const L = (en, fr) => ({ en, fr });
const col = (k, en, fr, fmt = 'text') => ({ k, label: L(en, fr), fmt });

export const RANGES = {
  '4w': { days: 28, label: L('Last 4 weeks', '4 dernières semaines') },
  '12w': { days: 84, label: L('Last 12 weeks', '12 dernières semaines') },
  '6m': { days: 182, label: L('Last 6 months', '6 derniers mois') },
  '12m': { days: 365, label: L('Last 12 months', '12 derniers mois') },
  ytd: { days: null, label: L('This year', 'Cette année') },
};

const iso = d => d.toISOString().slice(0, 10);
/** { from, to } (YYYY-MM-DD) for a range key, ending today. */
export function rangeOf(range, today) {
  const t = new Date(today + 'T00:00:00Z'); const r = RANGES[range] || RANGES['12w'];
  if (r.days == null) return { from: today.slice(0, 4) + '-01-01', to: today };
  const f = new Date(t); f.setUTCDate(f.getUTCDate() - r.days + 1); return { from: iso(f), to: today };
}
const span = (p, today) => { const r = rangeOf(p.range, today); return { p_from: r.from, p_to: r.to }; };
const int = (v, d, lo, hi) => { const n = Math.round(+v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export const SVC_LABEL = { en: L('English', 'Anglais'), fr: L('French', 'Français'), ev: L('Special', 'Spécial') };
export const KIND_LABEL = { added: L('Added', 'Ajouté'), category: L('Category', 'Catégorie'), note: L('Note', 'Note'), followup: L('Follow-up finished', 'Suivi terminé'), optout: L('Opt-out', 'Désinscription') };

/** Every report. `args` turns the screen's settings into the database function's arguments. */
export const REPORTS = [
  { id: 'absentees', rpc: 'report_absentees', group: 'attendance', params: { weeks: 4, min: 3 },
    title: L('Absentees', 'Absents'), desc: L('Came regularly, but not lately.', 'Venaient souvent, mais plus ces derniers temps.'),
    args: p => ({ p_weeks: int(p.weeks, 4, 1, 52), p_min: int(p.min, 3, 1, 26) }),
    columns: [col('name', 'Name', 'Nom'), col('category_id', 'Category', 'Catégorie', 'cat'), col('phone', 'Mobile', 'Mobile'), col('email', 'Email', 'E-mail'), col('last_date', 'Last attended', 'Dernière présence', 'date'), col('visits', 'Visits (6 months)', 'Présences (6 mois)', 'num')] },
  { id: 'attendance', rpc: 'report_attendance', group: 'attendance', params: { range: '12w' },
    title: L('Attendance', 'Présences'), desc: L('By service, category and month, with charts.', 'Par culte, catégorie et mois, avec graphiques.'),
    args: span,
    columns: [col('date', 'Date', 'Date', 'date'), col('svc', 'Service', 'Culte', 'svc'), col('category_id', 'Category', 'Catégorie', 'cat'), col('people', 'People', 'Personnes', 'num'), col('first_time', 'First visit', 'Première visite', 'num')] },
  { id: 'person', rpc: 'report_person_attendance', group: 'attendance', params: { member: '', range: '12m' }, noSchedule: true,
    title: L('One person’s attendance', 'Présences d’une personne'), desc: L('Every Sunday someone came, week by week.', 'Chaque dimanche où la personne est venue.'),
    args: (p, today) => ({ p_member: String(p.member || ''), ...span(p, today) }),
    columns: [col('date', 'Date', 'Date', 'date'), col('svc', 'Service', 'Culte', 'svc')] },
  { id: 'people-activity', rpc: 'report_people_activity', group: 'people', params: { range: '4w' },
    title: L('People activity', 'Activité des personnes'), desc: L('New people, category changes, notes, finished follow-ups.', 'Nouvelles personnes, changements de catégorie, notes, suivis terminés.'),
    args: span,
    columns: [col('at', 'When', 'Quand', 'datetime'), col('kind', 'What', 'Quoi', 'kind'), col('name', 'Person', 'Personne'), col('detail', 'Detail', 'Détail'), col('by_whom', 'By', 'Par')] },
  { id: 'no-notes', rpc: 'report_no_notes', group: 'people', params: { days: 90 },
    title: L('No notes lately', 'Sans note récente'), desc: L('People nobody has written about in a while.', 'Personnes sans note depuis un moment.'),
    args: p => ({ p_days: int(p.days, 90, 0, 3650) }),
    columns: [col('name', 'Name', 'Nom'), col('category_id', 'Category', 'Catégorie', 'cat'), col('last_note', 'Last note', 'Dernière note', 'datetime'), col('notes', 'Notes', 'Notes', 'num'), col('last_attended', 'Last attended', 'Dernière présence', 'date')] },
  { id: 'category-history', rpc: 'report_category_history', group: 'people', params: { range: '12w' },
    title: L('Category changes', 'Changements de catégorie'), desc: L('Who moved from one category to another.', 'Qui a changé de catégorie.'),
    args: span,
    columns: [col('changed_at', 'When', 'Quand', 'datetime'), col('name', 'Person', 'Personne'), col('from_category', 'From', 'De', 'cat'), col('to_category', 'To', 'Vers', 'cat'), col('changed_by', 'By', 'Par'), col('note', 'Note', 'Note')] },
  { id: 'volunteers', rpc: 'report_volunteers', group: 'serving', params: { range: '12w' },
    title: L('Volunteer positions', 'Postes des bénévoles'), desc: L('Who served where, and how often.', 'Qui a servi où, et combien de fois.'),
    args: span,
    columns: [col('name', 'Name', 'Nom'), col('team', 'Team', 'Équipe'), col('position_name', 'Position', 'Poste'), col('scheduled', 'Scheduled', 'Programmé', 'num'), col('confirmed', 'Confirmed', 'Confirmé', 'num'), col('declined', 'Declined', 'Refusé', 'num'), col('last_date', 'Last', 'Dernier', 'date')] },
  { id: 'sms-log', rpc: 'report_sms_log', group: 'messages', params: { range: '4w' },
    title: L('Text message log', 'Journal des SMS'), desc: L('Every text sent, with its delivery status.', 'Chaque SMS envoyé, avec son statut.'),
    args: span,
    columns: [col('at', 'When', 'Quand', 'datetime'), col('name', 'To', 'À'), col('address', 'Number', 'Numéro'), col('status', 'Status', 'Statut'), col('reason', 'Reason', 'Raison'), col('sender', 'From', 'De'), col('body', 'Message', 'Message')] },
  { id: 'unsubscribes', rpc: 'report_unsubscribes', group: 'messages', params: { range: '12w' }, admin: true,
    title: L('Unsubscribes', 'Désinscriptions'), desc: L('Who stopped (or restarted) emails and texts.', 'Qui a arrêté (ou repris) les e-mails et SMS.'),
    args: span,
    columns: [col('at', 'When', 'Quand', 'datetime'), col('name', 'Person', 'Personne'), col('channel', 'Channel', 'Canal'), col('action', 'Change', 'Changement'), col('source', 'How', 'Comment')] },
];
export const GROUPS = { attendance: L('Attendance', 'Présences'), people: L('People', 'Personnes'), serving: L('Serving', 'Service'), messages: L('Messages', 'Messages') };
export const reportDef = id => REPORTS.find(r => r.id === id) || null;
export const schedulable = () => REPORTS.filter(r => !r.noSchedule);

/** A cell as text. `ctx`: { lang, cat(id) → category name, locale }. */
export function cellText(c, v, ctx = {}) {
  const lang = ctx.lang === 'fr' ? 'fr' : 'en';
  if (v == null || v === '') return '';
  switch (c.fmt) {
    case 'cat': return (ctx.cat && ctx.cat(v)) || v;
    case 'svc': return SVC_LABEL[v]?.[lang] || v;
    case 'kind': return KIND_LABEL[v]?.[lang] || v;
    case 'date': return String(v instanceof Date ? iso(v) : v).slice(0, 10);
    case 'datetime': { const d = v instanceof Date ? v : new Date(v); return isNaN(d) ? String(v) : ctx.csv ? d.toISOString().slice(0, 16).replace('T', ' ') : d.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
    default: return String(v);
  }
}

const risky = s => /^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s);   // formulas, but not phone numbers or negative numbers
const csvCell = v => { const s = v == null ? '' : String(v); const x = risky(s) ? "'" + s : s; return /[",\n\r;]/.test(x) || x !== s ? '"' + x.replace(/"/g, '""') + '"' : x; };
/** Rows as CSV that opens cleanly in Excel. */
export function reportCsv(def, rows, ctx = {}) {
  const lang = ctx.lang === 'fr' ? 'fr' : 'en'; const c2 = { ...ctx, csv: true };
  const lines = [def.columns.map(c => c.label[lang]), ...rows.map(r => def.columns.map(c => cellText(c, r[c.k], c2)))];
  return '﻿' + lines.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export const csvName = (def, today) => `servicesync-${def.id}-${today}.csv`;

/* ---------- attendance summaries (charts and tables) ---------- */
const svcOf = r => (r.svc === 'en' || r.svc === 'fr' ? r.svc : 'ev');
/** Per service date: people at each service, total and first-timers. */
export function attendanceByDate(rows) {
  const m = new Map();
  for (const r of rows) { const d = String(r.date).slice(0, 10); const x = m.get(d) || { date: d, en: 0, fr: 0, ev: 0, total: 0, first: 0 }; x[svcOf(r)] += r.people; x.total += r.people; x.first += r.first_time || 0; m.set(d, x); }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}
/** Per month: total visits, number of service dates, average per Sunday, first-timers. */
export function attendanceByMonth(rows) {
  const m = new Map();
  for (const d of attendanceByDate(rows)) { const k = d.date.slice(0, 7); const x = m.get(k) || { month: k, en: 0, fr: 0, ev: 0, total: 0, first: 0, dates: 0 }; for (const s of ['en', 'fr', 'ev', 'total', 'first']) x[s] += d[s]; x.dates++; m.set(k, x); }
  return [...m.values()].map(x => ({ ...x, avg: Math.round(x.total / x.dates) })).sort((a, b) => a.month.localeCompare(b.month));
}
/** Per category: total visits, biggest first. */
export function attendanceByCategory(rows) {
  const m = new Map(); for (const r of rows) m.set(r.category_id, (m.get(r.category_id) || 0) + r.people);
  return [...m.entries()].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
}

/** Short summary line for emails and the screen. */
export function summaryOf(def, rows, lang = 'en') {
  const fr = lang === 'fr';
  if (def.id === 'attendance') { const d = attendanceByDate(rows); const tot = d.reduce((a, x) => a + x.total, 0); const first = d.reduce((a, x) => a + x.first, 0); return fr ? `${d.length} dates · ${tot} présences · ${first} premières visites` : `${d.length} dates · ${tot} visits · ${first} first visits`; }
  return fr ? `${rows.length} ligne${rows.length === 1 ? '' : 's'}` : `${rows.length} row${rows.length === 1 ? '' : 's'}`;
}
