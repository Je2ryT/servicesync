/* ServiceSync entry point: styles, event wiring and sign-in. */
import './styles.css';
import { ui, me } from './state.js';
import { sb, loadAll, whenLoaded, subscribe } from './data.js';
import { render, renderPending } from './render.js';
import { H, CHANGE, INPUT } from './actions.js';
import { closeModal } from './ui.js';

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
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); if (e.key === 'Enter' && e.target.classList?.contains('draft')) e.target.blur(); });
document.addEventListener('focusout', () => setTimeout(renderPending, 0));

/* ---------- sign-in ---------- */
let started = false;
async function start(session) {
  if (started) return; started = true;
  me.email = session.user.email || '';
  me.name = session.user.user_metadata?.full_name || session.user.user_metadata?.name || '';
  const { data } = await sb.rpc('is_admin'); me.admin = !!data;
  await loadAll();
  subscribe();
}

async function boot() {
  const { data } = await sb.auth.getSession(); ui.session = data.session;
  sb.auth.onAuthStateChange((ev, s) => {
    const had = !!ui.session; ui.session = s;
    if (s && !had) { if (location.hash.includes('access_token')) history.replaceState(null, '', location.pathname); start(s); }
    if (!s) { ui.ready = false; started = false; render(); }
  });
  if (ui.session) start(ui.session); else render();
}
boot();
