import { iso, ym, nextSunday } from './util.js';
import { TABS } from './config.js';

/* Everything loaded from the database. Replaced as a whole on each reload.
   people: id → {name,email,phone,langs:{en,fr},active,max}
   teams:  id → {name,sort}
   pos:    id → {team,name,min,pref,sort,active}
   quals:  personId → {positionId: true}
   asg:    id → {sunId,svc,pos,person,status}
   timers: 'sunId|svc' → live timer (see timer.js)
   sun, tpl, cfg, chk, off, swap: as before */
export const S = { people: {}, teams: {}, pos: {}, quals: {}, asg: {}, sun: {}, tpl: {}, cfg: {}, chk: {}, off: {}, swap: {}, timers: {}, members: {}, att: {}, events: {} };
export function setState(next) { for (const k of Object.keys(S)) S[k] = next[k] || {}; }

export const me = { email: '', admin: false, name: '' };

/* "Today", kept in one place so tests can pin it. */
export const T = { now: new Date(), todayIso: '', thisSun: '' };
export function setNow(d) { T.now = d; T.todayIso = iso(d); T.thisSun = iso(nextSunday(d)); }
setNow(new Date());

export const ui = {
  tab: 'home', month: ym(T.now), liveIdx: null, liveSvc: 'en', tsub: 'order', psub: 'people',
  drafts: {}, chkDraft: null, stage: null, timerMissing: false, membersMissing: false, ciSvc: null, ciQuery: '', evMonth: null, evDay: null, intro: false, authMsg: '', authSent: false, authView: 'landing', session: null, ready: false, needsMigration: false,
};
try { const t = localStorage.getItem('ss-tab'); if (t && TABS.some(x => x[0] === t)) ui.tab = t; } catch (e) { /* storage unavailable */ }
if (typeof location !== 'undefined' && TABS.some(x => x[0] === location.hash.slice(1))) ui.tab = location.hash.slice(1);

/* The stage screen lives at #stage/<sunday id>/<service>, so a laptop or TV can open it directly.
   Remembered across the sign-in link, which replaces the address. */
export function readStage() {
  const m = typeof location !== 'undefined' && location.hash.match(/^#stage\/([\w-]+)\/(en|fr|ev)$/);
  ui.stage = m ? { sun: m[1], svc: m[2] } : null;
  try { if (ui.stage) localStorage.setItem('ss-stage', JSON.stringify({ hash: location.hash, at: Date.now() })); } catch (e) { /* storage unavailable */ }
  return ui.stage;
}
readStage();
/** A stage screen asked for in the last 30 minutes, to return to after the sign-in link. */
export function pendingStage() {
  try { const v = JSON.parse(localStorage.getItem('ss-stage') || 'null'); return v && Date.now() - v.at < 30 * 60 * 1000 ? v.hash : ''; } catch (e) { return ''; }
}
export function forgetStage() { try { localStorage.removeItem('ss-stage'); } catch (e) { /* ignore */ } }
