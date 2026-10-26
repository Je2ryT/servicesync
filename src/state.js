import { iso, ym, nextSunday } from './util.js';
import { TABS } from './config.js';

/* Everything loaded from the database. Replaced as a whole on each reload.
   people: id → {name,email,phone,langs:{en,fr},active,max}
   teams:  id → {name,sort}
   pos:    id → {team,name,min,pref,sort,active}
   quals:  personId → {positionId: true}
   asg:    id → {sunId,svc,pos,person,status}
   sun, tpl, cfg, chk, off, swap: as before */
export const S = { people: {}, teams: {}, pos: {}, quals: {}, asg: {}, sun: {}, tpl: {}, cfg: {}, chk: {}, off: {}, swap: {} };
export function setState(next) { for (const k of Object.keys(S)) S[k] = next[k] || {}; }

export const me = { email: '', admin: false, name: '' };

/* "Today", kept in one place so tests can pin it. */
export const T = { now: new Date(), todayIso: '', thisSun: '' };
export function setNow(d) { T.now = d; T.todayIso = iso(d); T.thisSun = iso(nextSunday(d)); }
setNow(new Date());

export const ui = {
  tab: 'home', month: ym(T.now), liveIdx: null, liveSvc: 'en', tsub: 'order', psub: 'people',
  drafts: {}, chkDraft: null, authMsg: '', authSent: false, authView: 'landing', session: null, ready: false, needsMigration: false,
};
try { const t = localStorage.getItem('ss-tab'); if (t && TABS.some(x => x[0] === t)) ui.tab = t; } catch (e) { /* storage unavailable */ }
if (typeof location !== 'undefined' && TABS.some(x => x[0] === location.hash.slice(1))) ui.tab = location.hash.slice(1);
