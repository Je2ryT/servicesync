// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { setState, setNow, me, ui } from '../src/state.js';
import { timerView, timerRow, countdown, driftText, scheduledStart } from '../src/timer.js';
import { render } from '../src/render.js';
import { tickTimers } from '../src/views/timer.js';
import { clock } from '../src/timer.js';

const items = [{ id: 'a', item: 'Welcome', min: 5 }, { id: 'b', item: 'Worship', min: 25 }, { id: 'c', item: 'Sermon', min: 45 }];
const T0 = Date.UTC(2026, 10, 1, 14, 0, 0);           // service started
const min = m => m * 60 * 1000;
const timer = over => ({ items, seg: 0, extra: 0, startedAt: T0, segStartedAt: T0, pausedAt: null, endedAt: null, message: '', log: [], ...over });

describe('timing', () => {
  it('counts down the current segment', () => {
    const v = timerView(timer(), null, T0 + min(2));
    expect(v.phase).toBe('running'); expect(v.remaining).toBe(180); expect(v.cur.item).toBe('Welcome'); expect(v.next.item).toBe('Worship');
    expect(v.level).toBe('ok'); expect(v.drift).toBe(0);
  });
  it('warns near the end and goes over after it', () => {
    expect(timerView(timer(), null, T0 + min(4)).level).toBe('warn');             // 1 minute left of 5
    const v = timerView(timer(), null, T0 + min(6));
    expect(v.level).toBe('over'); expect(v.remaining).toBe(-60); expect(v.drift).toBe(60);
    expect(countdown(v.remaining)).toBe('+1:00');
  });
  it('added time moves the end of the segment', () => {
    const v = timerView(timer({ extra: 120 }), null, T0 + min(6));
    expect(v.remaining).toBe(60); expect(v.level).toBe('warn'); expect(v.drift).toBe(120);   // 2 minutes longer than planned
  });
  it('a later segment that started late shows the service behind', () => {
    const t = timer({ seg: 1, segStartedAt: T0 + min(8) });                        // Welcome ran 8 min instead of 5
    const v = timerView(t, null, T0 + min(10));
    expect(v.remaining).toBe(23 * 60); expect(v.drift).toBe(180); expect(driftText(v)).toBe('3 min behind');
    expect(driftText(v, 'fr')).toBe('3 min de retard');
  });
  it('freezes while paused and counts the pause as lost time', () => {
    const t = timer({ pausedAt: T0 + min(1) });
    const v = timerView(t, null, T0 + min(3));
    expect(v.phase).toBe('paused'); expect(v.remaining).toBe(240); expect(v.drift).toBe(120);
  });
  it('compares the whole service once it ends', () => {
    const t = timer({ seg: 2, endedAt: T0 + min(80), log: [] });
    const v = timerView(t, null, T0 + min(90));
    expect(v.phase).toBe('ended'); expect(v.progress).toBe(1); expect(v.serviceElapsed).toBe(80 * 60); expect(v.drift).toBe(300); expect(driftText(v)).toBe('5 min over');
  });
  it('before the start, counts down to the scheduled start', () => {
    const start = scheduledStart('2026-11-01', '09:00');
    expect(new Date(start).getHours()).toBe(9);
    const v = timerView(null, items, start - min(12) - 5000, start);
    expect(v.phase).toBe('idle'); expect(countdown(v.untilStart)).toBe('12:05'); expect(v.total).toBe(75 * 60);
  });
  it('formats long and short times', () => {
    expect(countdown(754)).toBe('12:34'); expect(countdown(3725)).toBe('1:02:05'); expect(countdown(59.2)).toBe('1:00'); expect(countdown(0)).toBe('0:00');
  });
  it('reads a database row', () => {
    const r = timerRow({ items, seg: 1, extra_sec: 60, started_at: '2026-11-01T14:00:00Z', seg_started_at: '2026-11-01T14:05:00Z', paused_at: null, ended_at: null, message: 'Wrap up', log: [] });
    expect(r.seg).toBe(1); expect(r.extra).toBe(60); expect(r.segStartedAt).toBe(T0 + min(5)); expect(r.pausedAt).toBeNull(); expect(r.message).toBe('Wrap up');
  });
});

/* ---------- screens ---------- */
function shell() { document.body.innerHTML = '<nav id="tabs"></nav><div id="who"></div><main id="main"></main><div id="overlay"></div>'; }
function seed(timers = {}) {
  setNow(new Date(2026, 10, 1, 9, 5));
  setState({
    people: { anna: { name: 'Anna', email: 'anna@x.com', langs: { en: true, fr: true }, active: true, max: 4 } },
    teams: { tc: { name: 'Coordination', sort: 0 } }, pos: { coord: { team: 'tc', name: 'Coordinator', min: 1, pref: 1, active: true } },
    quals: { anna: { coord: true } },
    sun: { '2026-11-01': { date: '2026-11-01', published: true, services: { en: {}, fr: {} } }, '2026-11-08': { date: '2026-11-08', published: false, services: { en: {}, fr: {} } } },
    asg: {}, swap: {}, off: {}, chk: {}, tpl: {}, cfg: {}, timers,
  });
  ui.session = { user: {} }; ui.ready = true; ui.needsMigration = false; ui.timerMissing = false; ui.stage = null;
  ui.tab = 'live'; ui.liveIdx = 0; ui.liveSvc = 'en';
  clock.offset = 0;
}
const main = () => document.getElementById('main');
const now = Date.now();
const running = { '2026-11-01|en': timer({ startedAt: now - min(2), segStartedAt: now - min(2), message: 'Wrap <up>' }) };

describe('timer screens', () => {
  beforeEach(() => { shell(); });

  it('Live tab offers Start before the service begins', () => {
    seed(); me.admin = true; me.email = 'x@x.com'; render();
    expect(main().textContent).toContain('Service timer');
    expect(main().querySelector('[data-op="start"]')).not.toBeNull();
    expect(main().querySelector('[data-act="stageOpen"]')).not.toBeNull();
  });

  it('Live tab shows controls and the running segment', () => {
    seed(running); me.admin = false; me.email = 'anna@x.com'; render();
    for (const op of ['next', 'back', 'pause', 'add', 'end', 'message']) expect(main().querySelector(`[data-op="${op}"]`), op).not.toBeNull();
    expect(main().querySelector('.it.cur .nm').textContent).toBe('Welcome');
    expect(main().querySelector('[data-f="big"]').textContent).toMatch(/^[23]:\d\d$/);
    expect(main().querySelector('up')).toBeNull();                              // message is escaped, not turned into markup
    expect(main().querySelector('.tmsg input').value).toBe('Wrap <up>');
  });

  it('people not on the roster cannot run it', () => {
    seed(running); me.admin = false; me.email = 'nobody@x.com'; render();
    expect(main().querySelector('[data-op]')).toBeNull();
  });

  it('shows planned against actual after the service', () => {
    const log = [{ seg: 0, id: 'a', item: 'Welcome', planned: 300, actual: 480 }, { seg: 1, id: 'b', item: 'Worship', planned: 1500, actual: 1500 }];
    seed({ '2026-11-01|en': timer({ seg: 1, endedAt: T0 + min(33), log }) }); me.admin = true; me.email = 'x@x.com'; render();
    expect(main().querySelector('.tlog').textContent).toContain('Welcome');
    expect(main().querySelector('.tlog .over').textContent).toContain('+3');
    expect(main().querySelector('.it .act.over')).not.toBeNull();
    expect(main().querySelector('[data-op="back"]')).not.toBeNull();
    expect(main().querySelector('.it.cur')).toBeNull();
  });

  it('the stage screen fills the page and speaks the service language', () => {
    seed({ '2026-11-01|fr': timer({ items: [{ id: 'f1', item: 'Accueil', min: 10 }, { id: 'f2', item: 'Louange', min: 30 }], startedAt: now, segStartedAt: now }) });
    me.admin = true; me.email = 'x@x.com'; ui.stage = { sun: '2026-11-01', svc: 'fr' }; render();
    expect(document.body.classList.contains('stage-mode')).toBe(true);
    expect(main().querySelector('.stage [data-f="seg"]').textContent).toBe('Accueil');
    expect(main().querySelector('[data-f="next"]').textContent).toContain('Suivant : Louange');
    tickTimers();
    expect(main().querySelector('[data-f="big"]').textContent).toMatch(/^(10:00|9:5\d)$/);
    expect(main().querySelector('[data-f="now"]').textContent).toMatch(/\d:\d\d/);
    expect(main().querySelector('.stop').textContent).toContain('Culte en français');
    expect(main().querySelector('.stop').textContent).toContain('dimanche');
  });

  it('the stage screen refuses unpublished Sundays for team members', () => {
    seed(); me.admin = false; me.email = 'anna@x.com'; ui.stage = { sun: '2026-11-08', svc: 'en' }; render();
    expect(main().textContent).toContain("isn't available");
  });

  it('leaving the stage screen brings the header back', () => {
    seed(); me.admin = true; ui.stage = { sun: '2026-11-01', svc: 'en' }; render();
    ui.stage = null; render();
    expect(document.body.classList.contains('stage-mode')).toBe(false);
  });

  it('asks for the database update when migration 002 has not run', () => {
    seed(); me.admin = true; ui.timerMissing = true; render();
    expect(main().textContent).toContain('002-live-timer.sql');
  });
});
