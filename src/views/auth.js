import { ui, me } from '../state.js';
import { esc } from '../util.js';
import { ic } from '../icons.js';
import { mark, logo, TAGLINE } from '../brand.js';

export function vLanding() {
  const f = [['cal', 'Plan every event', 'Weekly services, conferences and one-off gatherings, each with its own run sheet and team.'],
    ['users', 'Fill every role', 'Teams and positions, auto-fill, swaps and confirmations, with clear warnings for gaps and double-bookings.'],
    ['live', 'Run it live', 'Cue mode puts the current segment, the countdown and what is next on the big screen, driven from any phone.'],
    ['heart', 'Care for people', 'Check-in, a people directory, newcomer follow-ups, and texts and emails that respect opt-outs.']];
  return `<section class="land-hero" aria-labelledby="landTitle">
      <div class="land-pano" aria-hidden="true"><div class="intro-glow"></div>${mark('land-mark')}</div>
      <div class="land-hero-copy">
        <p class="eyebrow">${esc(TAGLINE)}</p>
        <h1 class="big" id="landTitle">Every event, right on cue.</h1>
        <p class="lead">Cue brings scheduling, run sheets, live timing and people care into one calm place, for churches and any organization that runs events. In English and in French.</p>
        <div class="row"><button class="btn cta lg" data-act="goSignin">Sign in</button><span class="hint">For your organization's team</span></div>
      </div>
    </section>
    <section><h2 class="land-h2">What Cue does</h2>
      <div class="stats">${f.map(([i, t, d]) => `<div class="card stat feat">${ic(i)}<h3>${t}</h3><span>${d}</span></div>`).join('')}</div></section>`;
}

export function vSignin() {
  return `<div class="auth card">${logo()}
    <div><h1 style="font-size:1.6rem">Welcome</h1><p class="sub">Use the email your administrator added to the team and you'll be linked automatically.</p></div>
    ${ui.authSent ? `<div class="callout">${esc(ui.authMsg)}</div><button class="btn" data-act="authAgain">Use a different email</button>` : `
    <label class="f">Email<input type="email" id="aEmail" autocomplete="email" placeholder="you@example.com"></label>
    ${ui.authMsg ? `<div class="sub" style="color:var(--bad);margin:0">${esc(ui.authMsg)}</div>` : ''}
    <button class="btn cta wide" data-act="magic">Email me a sign-in link</button>
    <div class="or"><span>or</span></div>
    <button class="btn wide" data-act="google">Continue with Google</button>`}
    <button class="btn link" data-act="goLanding">← Back</button></div>`;
}

export function vNotMember() {
  return `<div class="auth card"><h1 style="font-size:1.5rem">You're signed in</h1><p class="sub">${esc(me.email)} isn't on this organization's team yet. Ask an administrator to add this exact email to your card on the People tab, then reload this page.</p><div class="row"><button class="btn" data-act="reloadPage">Reload</button><button class="btn ghost" data-act="signOut">Sign out</button></div></div>`;
}

export function vNeedsMigration() {
  return `<div class="auth card"><h1 style="font-size:1.5rem">Database update needed</h1><p class="sub">${me.admin ? 'This version of Cue uses teams and positions. Run <b>migrations/001-teams-and-positions.sql</b> from the GitHub repo in the Supabase SQL Editor, then reload.' : 'Cue is being updated. Please try again in a few minutes.'}</p><div class="row"><button class="btn" data-act="reloadPage">Reload</button></div></div>`;
}
