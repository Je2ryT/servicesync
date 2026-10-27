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
  ['gender', 'Gender', ['gender', 'sex', 'sexe', 'genre']],
  ['birthday', 'Birthday', ['birthday', 'date of birth', 'birth date', 'birthdate', 'dob', 'date de naissance', 'anniversaire']],
  ['familyRole', 'Family role', ['family relationship', 'relationship', 'family role', 'family position', 'role dans la famille']],
  ['address', 'Address', ['address', 'home address', 'full address', 'adresse', 'street address']],
  ['street', 'Street', ['street', 'address line 1', 'address 1', 'home address line 1', 'rue']],
  ['city', 'City', ['city', 'suburb', 'town', 'home city', 'ville']],
  ['state', 'State', ['state', 'province', 'region', 'home state', 'etat']],
  ['zip', 'ZIP / postcode', ['zip', 'zip code', 'postcode', 'postal code', 'post code', 'home postcode', 'code postal']],
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
  if (/believ|convert/.test(s)) return 'member';
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

export function genderFrom(v) {
  const s = fold(v); if (!s) return null;
  if (/^(m|male|man|homme|h|masculin)$/.test(s)) return 'male';
  if (/^(f|female|woman|femme|feminin)$/.test(s)) return 'female';
  return null;
}
export function familyRoleFrom(v) {
  const s = fold(v); if (!s) return null;
  if (/child|kid|son|daughter|enfant|fils|fille|dependent/.test(s)) return 'child';
  if (/primary|spouse|adult|parent|husband|wife|head|epou|mari|femme|adulte/.test(s)) return 'adult';
  return null;
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MOIS = ['janv', 'fevr', 'mars', 'avr', 'mai', 'juin', 'juil', 'aout', 'sept', 'oct', 'nov', 'dec'];
/** A birthday as YYYY-MM-DD: 1990-04-23, 04/23/1990 (US), 23/04/1990 (when the day is over 12), 23 Apr 1990, April 23, 1990. */
export function dateFrom(v) {
  const s = fold(v).replace(/,/g, ' ').replace(/\s+/g, ' ').trim(); if (!s) return null;
  const ok = (y, m, d) => { y = +y; m = +m; d = +d; if (y < 100) y += y > 30 ? 1900 : 2000; const dt = new Date(y, m - 1, d); return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d && y > 1890 && y < 2100 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null; };
  let x;
  if ((x = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return ok(x[1], x[2], x[3]);
  if ((x = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) return +x[1] > 12 ? ok(x[3], x[2], x[1]) : ok(x[3], x[1], x[2]);
  const mon = w => { const k = w.slice(0, 3); let i = MONTHS.indexOf(k); if (i < 0) i = MOIS.findIndex(p => w.startsWith(p.slice(0, 3))); return i + 1; };
  if ((x = s.match(/^(\d{1,2}) ([a-z]+)\.? (\d{4})$/)) && mon(x[2])) return ok(x[3], mon(x[2]), x[1]);
  if ((x = s.match(/^([a-z]+)\.? (\d{1,2}) (\d{4})$/)) && mon(x[1])) return ok(x[3], mon(x[1]), x[2]);
  return null;
}
/** The id of the category whose English or French name matches, or null. */
export function categoryFrom(v, categories = []) {
  const s = fold(v); if (!s) return null;
  const hit = categories.find(c => fold(c.name) === s || fold(c.nameFr) === s) || categories.find(c => s.length > 3 && (fold(c.name).startsWith(s) || s.startsWith(fold(c.name))));
  if (hit) return hit.id;
  const st = statusFrom(v);
  return st === 'visitor' || st === 'newcomer' ? 'visitors' : st === 'member' || st === 'regular' ? 'congregation' : null;
}

/**
 * Turn CSV rows into members to add.
 * existing: current members [{name, email, phone}], so nobody is added twice.
 * Returns { add: [row for the members table], dup: [{line, name, why}], skip: [{line, why}] }.
 */
export function planImport(rows, map, opts = {}, existing = []) {
  const lang = opts.lang || 'fr'; const status = opts.status || 'member'; const cat = opts.cat || 'congregation'; const categories = opts.categories || [];
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
    const first = get(r, 'preferred') || get(r, 'first'); const last = get(r, 'last');
    const nameParts = !first && !last ? name.split(' ') : null;
    const address = get(r, 'address') || [get(r, 'street'), [get(r, 'city'), [get(r, 'state'), get(r, 'zip')].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', ');
    out.add.push({
      name, email: /^\S+@\S+\.\S+$/.test(email) ? email : null, phone: phone || null,
      household: get(r, 'household') || null,
      status: statusFrom(get(r, 'category')) || status,
      lang: langFrom(get(r, 'language')) || lang,
      // migration 006 fields
      first_name: (first || nameParts?.[0] || '').replace(/\s+/g, ' ').trim() || null,
      last_name: (last || nameParts?.slice(1).join(' ') || '').replace(/\s+/g, ' ').trim() || null,
      gender: genderFrom(get(r, 'gender')), birthday: dateFrom(get(r, 'birthday')), address: address || null,
      category_id: categoryFrom(get(r, 'category'), categories) || cat, family_role: familyRoleFrom(get(r, 'familyRole')),
    });
  });
  return out;
}

const OLD_FIELDS = ['name', 'email', 'phone', 'household', 'status', 'lang'];
/** Rows for the members table: everything after migration 006, the original fields before it. */
export const memberRows = (add, rich) => add.map(m => (rich ? (({ status, household, ...x }) => ({ ...x, household }))(m) : Object.fromEntries(OLD_FIELDS.map(k => [k, m[k]]))));
/** Family names in the file that don't exist yet (compared without case or accents). */
export function newFamilies(add, families = []) {
  const have = new Set(families.map(f => fold(f.name))); const out = new Map();
  for (const m of add) { const h = (m.household || '').trim(); if (h && !have.has(fold(h)) && !out.has(fold(h))) out.set(fold(h), h); }
  return [...out.values()];
}
