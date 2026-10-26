import { ui, me } from '../state.js';
import { esc } from '../util.js';
import { ic } from '../icons.js';

export function vLanding() {
  const f = [['checkc', 'Check-in', 'Welcome everyone at the door and know who came, in English and in French.'],
    ['cal', 'Church calendar', 'Services, prayer nights, youth and conferences in one place.'],
    ['users', 'Serving teams', 'Coordinators, worship, sound and ushers planned for every Sunday.'],
    ['live', 'Live Sunday', 'A shared order of service and a stage timer so every service runs on time.']];
  return `<section class="land-hero" aria-labelledby="landTitle">
      <div class="land-pano" aria-hidden="true"><div class="intro-glow"></div><img src="/mc-logo.png" alt=""><div class="intro-sweep"></div></div>
      <div class="land-hero-copy">
        <p class="eyebrow">Église Mont Carmel · Mont Carmel Church</p>
        <h1 class="big" id="landTitle">Bienvenue à la maison.<br><span>Welcome home.</span></h1>
        <p class="lead">One church, two languages. Join us every Sunday for worship in English and in French.</p>
        <div class="row"><button class="btn cta lg" data-act="goSignin">Sign in</button><span class="hint">For members of the serving team</span></div>
      </div>
    </section>
    <section class="land-svcs" aria-label="Sunday services">
      <div class="card land-svc2"><span class="eyebrow">Every Sunday</span><h3>English Service</h3><b>9:00 – 10:45 AM</b></div>
      <div class="card land-svc2"><span class="eyebrow">Chaque dimanche</span><h3>Culte en français</h3><b>11 h 30 – 13 h 45</b></div>
    </section>
    <section><h2 class="land-h2">ServiceSync, for the Mont Carmel family</h2>
      <div class="stats">${f.map(([i, t, d]) => `<div class="card stat feat">${ic(i)}<h3>${t}</h3><span>${d}</span></div>`).join('')}</div></section>`;
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
