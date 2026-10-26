/* Live service timer: timing maths (no database or DOM, so it can be unit-tested)
   and the offset between this device's clock and the server's. */
import { S } from './state.js';
import { parse, toMin, pad } from './util.js';

/** Server time minus this device's time, in ms. Every screen counts from the server's clock. */
export const clock = { offset: 0 };
export const serverNow = () => Date.now() + clock.offset;

const ms = v => (v ? Date.parse(v) : null);
/** A service_timers row as the app uses it (times in ms). */
export const timerRow = r => ({
  items: Array.isArray(r.items) ? r.items : [], seg: r.seg || 0, extra: r.extra_sec || 0,
  startedAt: ms(r.started_at), segStartedAt: ms(r.seg_started_at), pausedAt: ms(r.paused_at), endedAt: ms(r.ended_at),
  message: r.message || '', log: Array.isArray(r.log) ? r.log : [],
});
export const timerKey = (sunId, svc) => sunId + '|' + svc;
export const timerOf = (sunId, svc) => S.timers[timerKey(sunId, svc)] || null;

/** When a service is due to start on this device's calendar, in ms. */
export function scheduledStart(date, hhmm) { const d = parse(date); d.setMinutes(toMin(hhmm)); return d.getTime(); }

const secs = items => items.reduce((a, o) => a + (+o.min || 0) * 60, 0);

/**
 * Everything a timer screen shows, at time `now` (ms).
 * `plan` is the order of service to show before the timer starts.
 * remaining < 0 means the segment is running over. drift > 0 means the service is behind schedule.
 */
export function timerView(t, plan, now, start = null) {
  if (!t) {
    const items = plan || []; const cur = items[0] || null; const planned = cur ? (+cur.min || 0) * 60 : 0;
    return {
      phase: 'idle', items, seg: 0, cur, next: items[1] || null, planned, elapsed: 0, remaining: planned, progress: 0,
      level: 'ok', drift: 0, serviceElapsed: 0, total: secs(items), untilStart: start == null ? null : Math.round((start - now) / 1000), message: '', log: [],
    };
  }
  const items = t.items; const cur = items[t.seg] || null; const base = cur ? (+cur.min || 0) * 60 : 0;
  const planned = Math.max(0, base + t.extra);
  const phase = t.endedAt ? 'ended' : t.pausedAt ? 'paused' : 'running';
  const stopAt = t.endedAt ?? t.pausedAt ?? now;
  const elapsed = Math.max(0, (stopAt - t.segStartedAt) / 1000);
  const remaining = planned - elapsed;
  const total = secs(items);
  const serviceElapsed = Math.max(0, ((t.endedAt ?? now) - t.startedAt) / 1000);
  let drift;
  if (phase === 'ended') drift = serviceElapsed - total;
  else {
    const before = secs(items.slice(0, t.seg));                         // where this segment should start
    const segStart = (t.segStartedAt - t.startedAt) / 1000;              // where it actually started
    const pausedFor = t.pausedAt ? Math.max(0, (now - t.pausedAt) / 1000) : 0;
    drift = segStart + pausedFor + Math.max(planned, elapsed) - (before + base);
  }
  const warnAt = Math.min(120, Math.max(30, planned / 4));
  const level = remaining < 0 ? 'over' : remaining <= warnAt ? 'warn' : 'ok';
  return {
    phase, items, seg: t.seg, cur, next: items[t.seg + 1] || null, planned, elapsed, remaining,
    progress: phase === 'ended' || !planned ? 1 : Math.min(1, elapsed / planned), level: phase === 'ended' ? 'ok' : level,
    drift, serviceElapsed, total, untilStart: null, message: t.message, log: t.log,
  };
}

/** 754 → "12:34"; 3725 → "1:02:05"; -45 → "+0:45" (running over). */
export function countdown(sec) {
  const over = sec < 0; const s = over ? Math.ceil(-sec) : Math.ceil(sec);
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (over ? '+' : '') + (h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`);
}
/** Elapsed time, counting up: 125 → "2:05". */
export const elapsedText = sec => countdown(Math.max(0, Math.floor(sec)));
/** Whole minutes, for planned-vs-actual: 2820 → "47m". */
export const minutes = sec => `${Math.round(sec / 60)}m`;

const LABELS = {
  en: { next: 'Next: ', last: 'Last segment', service: 'Service', elapsed: 'Elapsed', planned: 'Planned', title: null, locale: 'en-US', ontime: 'On time', behind: m => `${m} min behind`, ahead: m => `${m} min ahead`,
    paused: 'Paused', ended: 'Service ended', over: m => `${m} min over`, under: m => `${m} min under`, startsIn: 'Starts in', startsAt: 'Starts at', notStarted: 'Not started', late: 'Waiting to start' },
  fr: { next: 'Suivant : ', last: 'Dernière partie', service: 'Culte', elapsed: 'Écoulé', planned: 'Prévu', title: 'Culte en français', locale: 'fr-FR', ontime: "À l'heure", behind: m => `${m} min de retard`, ahead: m => `${m} min d'avance`,
    paused: 'En pause', ended: 'Culte terminé', over: m => `${m} min de plus`, under: m => `${m} min de moins`, startsIn: 'Début dans', startsAt: 'Début à', notStarted: 'Pas commencé', late: 'En attente du début' },
};
export const labels = lang => LABELS[lang] || LABELS.en;

/** "On time", "3 min behind", "2 min ahead" (or the French). Under a minute counts as on time. */
export function driftText(v, lang = 'en') {
  const L = labels(lang); const m = Math.round(Math.abs(v.drift) / 60);
  if (v.phase === 'ended') return m < 1 ? L.ontime : v.drift > 0 ? L.over(m) : L.under(m);
  return m < 1 ? L.ontime : v.drift > 0 ? L.behind(m) : L.ahead(m);
}
