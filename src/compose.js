/* Who a message goes to, and who will actually receive it. Mirrors the server's rules so the
   composer can show the counts before sending (the server checks everything again).
   Reads the loaded state only (no database or DOM), so it can be unit-tested. */
import { S, ui, me } from './state.js';
import { toE164 } from './sms.js';
import { filterPeople } from './people.js';
import { myPerson, asgOf, allPositions } from './domain.js';

const memberOfCoord = () => { const m = {}; for (const [id, x] of Object.entries(S.members)) if (x.coordinatorId) m[x.coordinatorId] = id; return m; };

/** Member ids for a source: { kind: 'selection' | 'filter' | 'person' | 'service' | 'team', … }. */
export function sourceIds(src) {
  const link = memberOfCoord();
  switch (src.kind) {
    case 'selection': return [...(src.ids || ui.psel)];
    case 'filter': return filterPeople(src.filters || ui.pf).map(m => m.id);
    case 'person': return [src.id];
    case 'service': return [...new Set(asgOf(src.sunId, src.svc).map(a => link[a.person]).filter(Boolean))];
    case 'team': {
      const pos = new Set(allPositions().filter(p => p.team === src.teamId).map(p => p.id));
      return [...new Set(Object.entries(S.quals).filter(([, q]) => Object.keys(q).some(p => pos.has(p))).map(([cid]) => link[cid]).filter(Boolean))];
    }
    default: return [];
  }
}

/** Members a coordinator may message: anyone serving in a team they serve in (same rule as the server). */
export function teamOf(cid = myPerson()) {
  if (!cid) return new Set();
  const myTeams = new Set(Object.keys(S.quals[cid] || {}).map(p => S.pos[p]?.team).filter(Boolean));
  const link = memberOfCoord(); const out = new Set();
  for (const [person, q] of Object.entries(S.quals)) if (Object.keys(q).some(p => myTeams.has(S.pos[p]?.team)) && link[person]) out.add(link[person]);
  return out;
}

/** Split recipients into who gets a text, who gets an email, and who is skipped (and why). */
export function audience(ids, channel) {
  let list = [...new Set(ids)].map(id => ({ id, ...S.members[id] })).filter(m => m.name && m.active !== false);
  let outside = 0;
  if (!me.admin) { const team = teamOf(); const before = list.length; list = list.filter(m => team.has(m.id)); outside = before - list.length; }
  const out = { people: list, sms: [], email: [], skip: { optSms: [], noPhone: [], optEmail: [], noEmail: [] }, outside };
  for (const m of list) {
    if (channel !== 'email') { if (m.smsOptOut) out.skip.optSms.push(m); else if (!toE164(m.phone)) out.skip.noPhone.push(m); else out.sms.push(m); }
    if (channel !== 'sms') { if (m.emailOptOut) out.skip.optEmail.push(m); else if (!/^\S+@\S+\.\S+$/.test(m.email || '')) out.skip.noEmail.push(m); else out.email.push(m); }
  }
  out.reachable = new Set([...out.sms, ...out.email].map(m => m.id)).size;
  return out;
}

/** A fresh idempotency key for one composed message (reused if the send is retried). */
export const newKey = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : 'k-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
