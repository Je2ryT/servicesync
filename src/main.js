/* ServiceSync entry point: styles, event wiring and sign-in. */
import './styles.css';
import { ui, me, readStage, pendingStage } from './state.js';
import { sb, loadAll, whenLoaded, subscribe, syncClock } from './data.js';
import { render, renderPending } from './render.js';
import { H, CHANGE, INPUT, stageKey } from './actions.js';
import { tickTimers } from './views/timer.js';
import { closeModal } from './ui.js';
import { showIntro, introName } from './intro.js';
import { profile } from './members.js';

whenLoaded(render);

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act],[data-tab]'); if (!el) return;
  if (el.dataset.tab && !el.dataset.act) { H.tab(el); return; }
  const a = el.dataset.act; if (CHANGE.has(a) || INPUT.has(a) || el.disabled) return;
  H[a] && H[a](el, e);
});
document.addEventListener('change', e => { const el = e.target.closest('[data-act]'); if (el && CHANGE.has(el.dataset.act)) H[el.dataset.act](el, e); });
document.addEventListener('input', e => {
  const el = e.target.closest('[data-act]'); if (!el || !INPUT.has(el.dataset.act)) return;
  H[el.dataset.act](el, e);
  const card = el.closest('.tpl');   // flag an edited template as unsaved without re-rendering mid-typing
  if (card && el.dataset.tid && !card.querySelector('.pill.warn')) { const r = card.querySelector('.row'); r && r.insertAdjacentHTML('beforeend', '<span class="pill warn">Unsaved</span>'); }
});
document.addEventListener('keydown', e => { stageKey(e); if (e.key === 'Escape') closeModal(); if (e.key === 'Enter' && e.target.classList?.contains('draft')) e.target.blur(); });
document.addEventListener('focusout', () => setTimeout(renderPending, 0));

/* ---------- live timer ---------- */
setInterval(tickTimers, 250);
window.addEventListener('hashchange', () => { readStage(); wakeLock(); render(); });
/* Keep a stage screen awake for the whole service. */
let lock = null;
async function wakeLock() {
  if (!ui.stage || lock || !navigator.wakeLock || document.hidden) return;
  try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch (e) { /* not allowed here */ }
}
document.addEventListener('visibilitychange', wakeLock);
/* A stage screen left open for hours: refresh every 30 s in case a live update was missed. */
setInterval(() => { if (ui.stage && ui.ready && !document.hidden) loadAll(); }, 30000);

/* ---------- sign-in ---------- */
let started = false; let clockTimer = null;
async function start(session) {
  if (started) return; started = true;
  me.email = session.user.email || '';
  me.name = session.user.user_metadata?.full_name || session.user.user_metadata?.name || '';
  if (!ui.stage) { showIntro(); introName(me.name); }   // the Mont Carmel logo while the church's data loads
  const { data } = await sb.rpc('is_admin'); me.admin = !!data;
  await Promise.all([loadAll(), syncClock()]);
  introName(profile().name);
  subscribe();
  clockTimer = clockTimer || setInterval(syncClock, 10 * 60 * 1000);
}

async function boot() {
  const { data } = await sb.auth.getSession(); ui.session = data.session;
  sb.auth.onAuthStateChange((ev, s) => {
    const had = !!ui.session; ui.session = s;
    if (s && !had) {
      if (location.hash.includes('access_token')) {
        history.replaceState(null, '', location.pathname + pendingStage()); readStage();   // return to the stage screen after signing in
      }
      start(s);
    }
    if (!s) { ui.ready = false; started = false; render(); }
  });
  if (ui.session) start(ui.session); else render();
}
boot();
wakeLock();
