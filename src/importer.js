/* Importing church members from an Elvanto people export (CSV).
   No database or DOM access, so it can be unit-tested. */
import { fold } from './members.js';

/** Parse CSV text (quotes, commas or semicolons, CRLF, Excel's byte-order mark) into rows of cells. */
export function parseCsv(text) {
  const s = String(text || '').replace(/^﻿/, '');
  const first = s.split(/\r?\n/, 1)[0] || '';
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.includes('\t') && !first.includes(',') ? '\t' : ',');
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(x => x.trim())).filter(r => r.some(x => x !== ''));
}

/* What each field is called in Elvanto and similar exports (compared without case, accents or punctuation). */
export const FIELDS = [
  ['full', 'Full name', ['name', 'full name', 'display name', 'person', 'nom complet']],
  ['first', 'First name', ['first name', 'firstname', 'given name', 'first', 'prenom']],
  ['preferred', 'Preferred name', ['preferred name', 'preferred', 'nickname', 'known as']],
  ['last', 'Last name', ['last name', 'lastname', 'surname', 'last', 'nom', 'nom de famille']],
  ['email', 'Email', ['email', 'email address', 'e mail', 'primary email', 'courriel']],
  ['mobile', 'Mobile', ['mobile', 'mobile phone', 'mobile number', 'cell', 'cell phone', 'cellphone', 'portable']],
  ['phone', 'Other phone', ['phone', 'home phone', 'telephone', 'phone number', 'work phone', 'landline']],
  ['household', 'Family / household', ['family', 'family name', 'household', 'family household', 'famille']],
  ['category', 'Category / status', ['category', 'status', 'membership', 'member status', 'people category', 'categorie']],
  ['language', 'Language', ['language', 'langue', 'preferred language']],
];
const norm = h => fold(h).replace(/[^a-z0-9]+/g, ' ').trim();

/** Which column holds which field: { first: 2, last: 3, ... }. A field without a match is left out. */
export function detectColumns(headers) {
  const h = headers.map(norm); const map = {}; const used = new Set();
  for (const [key, , names] of FIELDS) {
    const i = h.findIndex((x, j) => !used.has(j) && names.includes(x));
    if (i >= 0) { map[key] = i; used.add(i); }
  }
  return map;
}

export function statusFrom(v) {
  const s = fold(v);
  if (!s) return null;
  if (/visit/.test(s)) return 'visitor';
  if (/new|nouveau|first time/.test(s)) return 'newcomer';
  if (/regular|attend|habitue/.test(s)) return 'regular';
  if (/member|membre/.test(s)) return 'member';
  return null;
}
export function langFrom(v) {
  const s = fold(v);
  if (!s) return null;
  const fr = /\b(fr|fre|fra|french|francais|franc\w*)\b/.test(s), en = /\b(en|eng|english|anglais|angl\w*)\b/.test(s);
  return fr && en ? 'both' : fr ? 'fr' : en ? 'en' : null;
}
const digits = p => String(p || '').replace(/\D/g, '').slice(-10);

/**
 * Turn CSV rows into members to add.
 * existing: current members [{name, email, phone}], so nobody is added twice.
 * Returns { add: [row for the members table], dup: [{line, name, why}], skip: [{line, why}] }.
 */
export function planImport(rows, map, opts = {}, existing = []) {
  const lang = opts.lang || 'fr'; const status = opts.status || 'member';
  const seen = { email: new Set(), phone: new Set(), name: new Set() };
  for (const m of existing) {
    if (m.email) seen.email.add(m.email.toLowerCase());
    if (digits(m.phone).length >= 7) seen.phone.add(digits(m.phone));
    seen.name.add(fold(m.name));
  }
  const get = (r, k) => (map[k] == null ? '' : String(r[map[k]] ?? '').trim());
  const out = { add: [], dup: [], skip: [] };
  rows.forEach((r, i) => {
    const line = i + 2;   // the header is line 1
    const name = (get(r, 'full') || [get(r, 'preferred') || get(r, 'first'), get(r, 'last')].filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim();
    if (!name) { out.skip.push({ line, why: 'No name' }); return; }
    const email = get(r, 'email').toLowerCase();
    const phone = get(r, 'mobile') || get(r, 'phone');
    const why = email && seen.email.has(email) ? 'same email' : digits(phone).length >= 7 && seen.phone.has(digits(phone)) ? 'same phone' : seen.name.has(fold(name)) ? 'same name' : '';
    if (why) { out.dup.push({ line, name, why }); return; }
    if (email) seen.email.add(email); if (digits(phone).length >= 7) seen.phone.add(digits(phone)); seen.name.add(fold(name));
    out.add.push({
      name, email: /^\S+@\S+\.\S+$/.test(email) ? email : null, phone: phone || null,
      household: get(r, 'household') || null,
      status: statusFrom(get(r, 'category')) || status,
      lang: langFrom(get(r, 'language')) || lang,
    });
  });
  return out;
}
