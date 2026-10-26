export const pad = n => String(n).padStart(2, '0');
export const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const ym = d => d.getFullYear() + '-' + pad(d.getMonth() + 1);
export const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
export const nextSunday = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + ((7 - x.getDay()) % 7)); return x; };
export const sundaysOf = m => { const d = parse(m + '-01'); const o = []; d.setDate(1 + ((7 - d.getDay()) % 7)); while (ym(d) === m) { o.push(iso(d)); d.setDate(d.getDate() + 7); } return o; };
export const fmt = (s, o) => parse(s).toLocaleDateString('en-US', o || { weekday: 'short', month: 'short', day: 'numeric' });
export const monthName = m => parse(m + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
export const shiftMonth = (m, k) => { const d = parse(m + '-01'); d.setMonth(d.getMonth() + k); return ym(d); };
export const toMin = hhmm => { const [h, m] = String(hhmm || '00:00').split(':').map(Number); return h * 60 + (m || 0); };
export function clock(hhmm, add = 0) { const t = toMin(hhmm) + add; const H = Math.floor(t / 60) % 24, M = t % 60; return `${(H % 12) || 12}:${pad(M)} ${H < 12 ? 'AM' : 'PM'}`; }
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Math.random().toString(36).slice(2, 9);
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
