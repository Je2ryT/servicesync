import { ui, me } from '../state.js';
import { esc } from '../util.js';
import { ic } from '../icons.js';

export function vLanding() {
  const f = [['cal', 'Monthly planning', 'Fill every team and position for the English (9:00) and French (11:30) services, with live coverage checks.'],
    ['swap', 'Confirm &amp; swap', 'Volunteers confirm, mark Sundays off and request swaps from their phone.'],
    ['live', 'Live Sunday', 'Follow the order of service and checklists in real time, together.'],
    ['shield', 'Secure roles', 'Admins plan and publish. Everyone else sees only what is published.']];
  return `<section class="land"><div class="land-copy"><div class="eyebrow" style="color:var(--accent)">Mont Carmel · Service coordination</div><h1 class="big">Every Sunday, covered and calm.</h1>
    <p class="sub" style="font-size:1.02rem;max-width:46ch">ServiceSync helps the whole serving team plan both services, share the schedule by text, and run each Sunday on time.</p>
    <div><button class="btn cta lg" data-act="goSignin">Open ServiceSync</button></div></div>
    <div class="land-art" aria-hidden="true"><img class="mc xl" src="/mc-logo.png" alt=""><div class="land-svc"><b>English Service</b><span>9:00 – 10:45 AM</span></div><div class="land-svc"><b>Culte en français</b><span>11:30 AM – 1:45 PM</span></div></div></section>
    <div class="stats">${f.map(([i, t, d]) => `<div class="card stat feat">${ic(i)}<h3>${t}</h3><span>${d}</span></div>`).join('')}</div>`;
}

export function vSignin() {
  return `<div class="auth card"><div class="logo"><img class="mc" src="/mc-logo.png" alt="Mont Carmel"><div><b>ServiceSync</b><small>MONT CARMEL</small></div></div>
    <div><h1 style="font-size:1.6rem">Welcome</h1><p class="sub">Use the email the administrator has on the roster and you'll be linked automatically.</p></div>
    ${ui.authSent ? `<div class="callout">${esc(ui.authMsg)}</div><button class="btn" data-act="authAgain">Use a different email</button>` : `
    <label class="f">Email<input type="email" id="aEmail" autocomplete="email" placeholder="you@example.com"></label>
    ${ui.authMsg ? `<div class="sub" style="color:var(--bad);margin:0">${esc(ui.authMsg)}</div>` : ''}
    <button class="btn cta wide" data-act="magic">Email me a sign-in link</button>
    <div class="or"><span>or</span></div>
    <button class="btn wide" data-act="google">Continue with Google</button>`}
    <button class="btn link" data-act="goLanding">← Back</button></div>`;
}

export function vNotMember() {
  return `<div class="auth card"><h1 style="font-size:1.5rem">You're signed in</h1><p class="sub">${esc(me.email)} is not on the Mont Carmel roster yet. Ask the administrator to add this exact email to your card on the People tab, then reload this page.</p><div class="row"><button class="btn" data-act="reloadPage">Reload</button><button class="btn ghost" data-act="signOut">Sign out</button></div></div>`;
}

export function vNeedsMigration() {
  return `<div class="auth card"><h1 style="font-size:1.5rem">Database update needed</h1><p class="sub">${me.admin ? 'This version of ServiceSync uses teams and positions. Run <b>migrations/001-teams-and-positions.sql</b> from the GitHub repo in the Supabase SQL Editor, then reload.' : 'ServiceSync is being updated. Please try again in a few minutes.'}</p><div class="row"><button class="btn" data-act="reloadPage">Reload</button></div></div>`;
}
