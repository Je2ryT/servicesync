import { ui, me } from './state.js';
import { TABS } from './config.js';
import { esc } from './util.js';
import { ic } from './icons.js';
import { myPerson, pname } from './domain.js';
import { vHome } from './views/home.js';
import { vCalendar } from './views/calendar.js';
import { vLive } from './views/live.js';
import { vPeople } from './views/people.js';
import { vSwaps } from './views/swaps.js';
import { vTemplates } from './views/templates.js';
import { vLanding, vSignin, vNotMember, vNeedsMigration } from './views/auth.js';

export const VIEWS = { home: vHome, calendar: vCalendar, live: vLive, roster: vPeople, swaps: vSwaps, templates: vTemplates };

let pending = false;
export function render() {
  const a = document.activeElement;
  if (ui.ready && a && a.classList && a.classList.contains('draft')) { pending = true; return; }   // don't wipe a field mid-typing
  pending = false;
  const tabs = document.getElementById('tabs'); const main = document.getElementById('main'); const who = document.getElementById('who');
  tabs.innerHTML = TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${ui.tab === k}">${l}</button>`).join('');
  if (!ui.session) {
    tabs.hidden = true; who.innerHTML = ui.authView === 'landing' ? '<button class="btn cta" data-act="goSignin">Sign in</button>' : '';
    main.className = 'wrap' + (ui.authView === 'signin' ? ' center' : ''); main.innerHTML = ui.authView === 'signin' ? vSignin() : vLanding(); return;
  }
  const mp = ui.ready ? myPerson() : null;
  main.className = 'wrap';
  who.innerHTML = `<div class="row" style="flex-wrap:nowrap"><div>${esc(me.name || (mp ? pname(mp) : me.email))}<span>${me.admin ? 'Administrator' : mp ? 'Team member' : ''}</span></div><button class="ib" data-act="signOut" aria-label="Sign out" title="Sign out">${ic('out')}</button></div>`;
  if (!ui.ready) { tabs.hidden = true; main.innerHTML = '<div class="empty">Loading the church schedule…</div>'; return; }
  if (ui.needsMigration) { tabs.hidden = true; main.className = 'wrap center'; main.innerHTML = vNeedsMigration(); return; }
  if (!me.admin && !mp) { tabs.hidden = true; main.className = 'wrap center'; main.innerHTML = vNotMember(); return; }
  tabs.hidden = false;
  main.innerHTML = (VIEWS[ui.tab] || vHome)();
}
export const renderPending = () => { if (pending) render(); };
