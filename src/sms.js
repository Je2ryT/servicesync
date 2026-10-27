/* Text-message helpers shared by the composer and the server: segment counting,
   phone numbers, and {first_name} merging. No DOM or database access. */

// Characters a standard text message can carry (GSM 03.38). Anything else (é is fine; emoji, “smart quotes” are not)
// switches the whole message to Unicode, which fits far fewer characters per segment.
const GSM = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€\f';   // these count as two characters

/** { encoding: 'GSM'|'Unicode', length, segments, perSegment, left } for one message. */
export function smsInfo(text) {
  const s = String(text ?? '');
  const gsm = [...s].every(c => GSM.includes(c) || GSM_EXT.includes(c));
  if (gsm) {
    const length = [...s].reduce((n, c) => n + (GSM_EXT.includes(c) ? 2 : 1), 0);
    const per = length <= 160 ? 160 : 153; const segments = length === 0 ? 0 : Math.ceil(length / per);
    return { encoding: 'GSM', length, segments, perSegment: per, left: segments ? segments * per - length : 160 };
  }
  const length = [...s].reduce((n, c) => n + (c.codePointAt(0) > 0xffff ? 2 : 1), 0);   // UTF-16 code units
  const per = length <= 70 ? 70 : 67; const segments = Math.ceil(length / per);
  return { encoding: 'Unicode', length, segments, perSegment: per, left: segments * per - length };
}

/** A US/Canada or international number as +E.164, or null when it can't be one. */
export function toE164(phone) {
  const raw = String(phone ?? '').trim(); if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return d.length >= 8 && d.length <= 15 ? '+' + d : null;
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d.startsWith('1')) return '+' + d;
  if (raw.startsWith('00') && d.length >= 10 && d.length <= 17) return '+' + d.slice(2);
  return null;
}

/** Fill {first_name} (and {last_name}, {name}) for one person. */
export function merge(text, person = {}) {
  const first = person.first_name || person.first || String(person.name || '').split(' ')[0] || '';
  return String(text ?? '').replace(/\{\s*first_name\s*\}/gi, first).replace(/\{\s*last_name\s*\}/gi, person.last_name || person.last || '').replace(/\{\s*name\s*\}/gi, person.name || first);
}

/** Words that mean "stop texting me" / "start again" (English, French, carrier standards). */
export const STOP_WORDS = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'arret', 'arrêt', 'desabonner', 'désabonner'];
export const START_WORDS = ['start', 'unstop', 'yes', 'subscribe'];
export function replyIntent(body) {
  const w = String(body ?? '').trim().toLowerCase().replace(/[.!]+$/, '');
  return STOP_WORDS.includes(w) ? 'out' : START_WORDS.includes(w) ? 'in' : null;
}
