// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { setState, setNow, me, ui, readStage } from '../src/state.js';
import { render } from '../src/render.js';
import { tickTimers, canRun, canWrite, remoteForm, remoteUrl } from '../src/views/timer.js';
import { clock } from '../src/timer.js';
import { H } from '../src/actions.js';

const items = [{ id: 'a', item: 'Welcome', min: 5 }, { id: 'b', item: 'Worship', min: 25 }];
const now = Date.now(); const min = m => m * 60000;
const timer = over => ({ items, seg: 0, extra: 0, startedAt: now - min(2), segStartedAt: now - min(2), pausedAt: null, endedAt: null, message: '', log: [], ...over });
function seed(timers = {}) {
  setNow(new Date(2026, 10, 1, 9, 5));
  setState({
    people: { anna: { name: 'Anna', email: 'anna@x.com', langs: { en: true, fr: true }, active: true, max: 4 } },
    sun: { '2026-11-01': { date: '2026-11-01', published: true, services: { en: {}, fr: {} } }, '2026-11-08': { date: '2026-11-08', published: false, services: { en: {}, fr: {} } } },
    asg: {}, swap: {}, off: {}, chk: {}, tpl: {}, cfg: {}, teams: {}, pos: {}, quals: {}, timers,
  });
  Object.assign(ui, { session: { user: {} }, ready: true, needsMigration: false, timerMissing: false, stage: null, tab: 'live', liveIdx: 0, liveSvc: 'en', lang: 'en' });
  me.admin = true; me.email = 'jerry@x.com'; me.perms = null; clock.offset = 0;
}
const $ = s => document.querySelector(s); const $$ = s => [...document.querySelectorAll(s)];

describe('phone remote', () => {
  beforeEach(() => { document.body.innerHTML = '<nav id="tabs"></nav><div id="who"></div><main id="main"></main><div id="overlay"></div>'; seed(); });

  it('opens from #remote/<sunday>/<service>; the stage link still works', () => {
    location.hash = '#remote/2026-11-01/en'; expect(readStage()).toEqual({ sun: '2026-11-01', svc: 'en', remote: true });
    location.hash = '#stage/2026-11-01/fr'; expect(readStage()).toEqual({ sun: '2026-11-01', svc: 'fr', remote: false });
    location.hash = '#remote/2026-11-01/xx'; expect(readStage()).toBeNull();
    location.hash = '';
  });

  it('shows the countdown and big buttons while the service runs', () => {
    seed({ '2026-11-01|en': timer() }); ui.stage = { sun: '2026-11-01', svc: 'en', remote: true }; render();
    expect($('.remote')).not.toBeNull(); expect($('.rm-big').textContent).toContain('Next');
    expect($$('.remote [data-act="tmr"]').map(b => b.dataset.op)).toEqual(['next', 'back', 'pause', 'add', 'add', 'add', 'message', 'end']);
    expect($('[data-f="seg"]').textContent).toBe('Welcome');
    tickTimers(); expect($('.remote').className).toMatch(/^remote lv-\w+ ph-running$/);   // ticking keeps the remote's look, not the stage's
  });

  it('starts the service from the phone when nothing is running', () => {
    ui.stage = { sun: '2026-11-01', svc: 'en', remote: true }; render();
    expect($('.rm-big').dataset.op).toBe('start');
  });

  it('watch-only for admins without Live, and for the team before publishing', () => {
    seed({ '2026-11-08|en': timer() }); me.perms = ['people']; ui.stage = { sun: '2026-11-08', svc: 'en', remote: true }; render();
    expect($$('.remote [data-act="tmr"]').length).toBe(0); expect($('.rm-note').textContent).toContain('doesn’t include Live');
    expect($('[data-f="big"]')).not.toBeNull();
    me.admin = false; me.perms = []; me.email = 'anna@x.com'; render();
    expect($('.remote').textContent).toContain('isn’t available');   // unpublished Sundays aren't visible to the team at all
  });

  it('Live decides the timer; reports and the layout stay open to every admin', () => {
    const pub = { id: '2026-11-01', published: true }, draft = { id: '2026-11-08', published: false };
    me.perms = ['people']; expect([canRun(draft), canWrite(draft)]).toEqual([false, true]);
    me.perms = ['live']; expect(canRun(draft)).toBe(true);
    me.admin = false; me.perms = []; me.email = 'anna@x.com'; expect([canRun(pub), canRun(draft), canWrite(pub)]).toEqual([true, false, true]);
  });

  it('the Live tab offers a QR code and link for the phone; French too', () => {
    render(); expect($$('[data-act="remoteShow"]').length).toBeGreaterThan(0);
    H.remoteShow({ dataset: { sun: '2026-11-01', svc: 'en' } });
    expect($('.modal .rm-qr svg')).not.toBeNull();
    expect($('.modal .rm-link input').value).toBe(remoteUrl('2026-11-01', 'en'));
    expect(remoteUrl('2026-11-01', 'en')).toMatch(/#remote\/2026-11-01\/en$/);
    H.remoteHere({ dataset: { sun: '2026-11-01', svc: 'en' } });
    expect($('.modal')).toBeNull(); expect(location.hash).toBe('#remote/2026-11-01/en'); location.hash = '';
    H.setLang({ dataset: { v: 'fr' } });
    seed({ '2026-11-01|en': timer() }); ui.lang = 'fr'; ui.stage = { sun: '2026-11-01', svc: 'en', remote: true }; render();
    expect($('.rm-big').textContent).toContain('Suivant'); expect($('.rm-live').textContent).toBe('Direct');
    ui.lang = 'en';
  });
});
