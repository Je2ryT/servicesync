// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const rpcs = [];
vi.mock('../src/data.js', () => {
  const c = { select: () => c, single: () => c, eq: () => c, in: () => c, then: (ok, bad) => Promise.resolve({ data: null, error: null }).then(ok, bad) };
  const sb = { from: () => ({ upsert: () => c, insert: () => c, update: () => c, delete: () => c }), rpc: () => Promise.resolve({ data: null, error: null }) };
  return {
    sb, q: async p => { const { data, error } = await p; return error ? null : data ?? true; },
    reload: () => {}, loadAll: async () => {}, saveSun: async () => true, ensureSun: async () => true, timerAction: async () => true,
    whenLoaded: () => {}, subscribe: () => {}, syncClock: async () => {},
    saveReport: async (...a) => { rpcs.push(a); return true; },
  };
});

const { setState, setNow, me, ui } = await import('../src/state.js');
const { render } = await import('../src/render.js');
const { H } = await import('../src/actions.js');
const { reportSegments, reportStats } = await import('../src/views/reports.js');

const T0 = new Date(2026, 10, 1, 9, 0).getTime(); const min = m => m * 60000;
const items = [{ id: 'e1', item: 'Welcome', min: 5 }, { id: 'e2', item: 'Worship', min: 25 }, { id: 'e3', item: 'Sermon', min: 45 }];
function seed({ admin = true, timer = true, reports = {} } = {}) {
  setNow(new Date(2026, 10, 1, 13, 0));
  setState({
    people: { anna: { name: 'Anna Mukendi', email: 'anna@x.com', langs: { en: true, fr: true }, active: true, max: 4 } },
    teams: { tc: { name: 'Coordination', sort: 0 } }, pos: { coord: { team: 'tc', name: 'Coordinator', min: 1, pref: 1, active: true } }, quals: { anna: { coord: true } },
    sun: { '2026-11-01': { date: '2026-11-01', published: true, services: { en: {}, fr: {} } }, '2026-11-08': { date: '2026-11-08', published: false, services: { en: {}, fr: {} } } },
    asg: { a1: { sunId: '2026-11-01', svc: 'en', pos: 'coord', person: 'anna', status: 'confirmed' } },
    swap: {}, off: {}, chk: {}, cfg: {}, events: {},
    tpl: { 'tpl-en': { name: 'English', lang: 'en', order: items }, 'tpl-fr': { name: 'Français', lang: 'fr', order: [{ id: 'f1', item: 'Accueil', min: 10 }] } },
    timers: timer ? { '2026-11-01|en': { items, seg: 2, extra: 0, startedAt: T0, segStartedAt: T0 + min(33), pausedAt: null, endedAt: T0 + min(81), message: '', log: [
      { seg: 0, id: 'e1', item: 'Welcome', planned: 300, actual: 360 }, { seg: 1, id: 'e2', item: 'Worship', planned: 1500, actual: 1620 }, { seg: 2, id: 'e3', item: 'Sermon', planned: 2700, actual: 2880 }] } } : {},
    members: { m1: { name: 'Grace Lumbu', status: 'newcomer', active: true }, m2: { name: 'José Kabila', status: 'member', active: true } },
    att: { 'm1|2026-11-01|en': { member: 'm1', date: '2026-11-01', svc: 'en', at: 0 }, 'm2|2026-11-01|en': { member: 'm2', date: '2026-11-01', svc: 'en', at: 0 } },
    reports,
  });
  me.admin = admin; me.email = admin ? 'boss@x.com' : 'nobody@x.com';
  Object.assign(ui, { session: { user: {} }, ready: true, needsMigration: false, timerMissing: false, membersMissing: false, reportsMissing: false, stage: null, tab: 'reports', rep: null, repSave: {} });
  rpcs.length = 0;
}
const $ = s => document.querySelector(s); const $$ = s => [...document.querySelectorAll(s)];
const flush = () => new Promise(r => setTimeout(r, 0));

describe('report contents', () => {
  it('uses what the timer ran, with planned and actual times', () => {
    seed(); const segs = reportSegments({ id: '2026-11-01', date: '2026-11-01', services: {} }, 'en');
    expect(segs.map(s => [s.item, s.start, s.min, s.actual])).toEqual([['Welcome', '9:00 AM', 5, 360], ['Worship', '9:05 AM', 25, 1620], ['Sermon', '9:30 AM', 45, 2880]]);
  });
  it('falls back to the order of service, and keeps notes on segments that were removed', () => {
    seed({ timer: false, reports: { '2026-11-01|en': { notes: { gone: { item: 'Baptism', text: 'Two baptisms' } }, summary: '', followups: '' } } });
    const segs = reportSegments({ id: '2026-11-01', date: '2026-11-01', services: {} }, 'en');
    expect(segs.map(s => s.item)).toEqual(['Welcome', 'Worship', 'Sermon', 'Baptism']);
    expect(segs[0].actual).toBeNull(); expect(segs[3].orphan).toBe(true);
  });
  it('totals attendance, newcomers, length and notes', () => {
    seed({ reports: { '2026-11-01|en': { notes: { e3: { text: 'x' } }, summary: 'Good', followups: '' } } });
    expect(reportStats({ id: '2026-11-01', date: '2026-11-01' }, 'en')).toEqual({ people: 2, newcomers: 1, ran: { actual: 81 * 60, diff: 6 }, notes: 2, team: 1 });
  });
});

describe('report screens', () => {
  beforeEach(() => { document.body.innerHTML = '<nav id="tabs"></nav><div id="who"></div><main id="main"></main><div id="overlay"></div>'; });

  it('lists each service with its notes, attendance and timing', () => {
    seed({ reports: { '2026-11-01|en': { notes: { e3: { text: 'Strong altar call' } }, summary: '', followups: '' } } }); render();
    const en = $('[data-act="openReport"][data-id="2026-11-01"][data-svc="en"]'); expect(en.textContent).toMatch(/1 note.*2 present.*\+6 MIN/);
    expect($('[data-act="openReport"][data-id="2026-11-01"][data-svc="fr"]').textContent).toContain('NO NOTES');
  });

  it('opens a report with a note box for every segment, and saves a note when you leave the box', async () => {
    seed(); render();
    H.openReport({ dataset: { id: '2026-11-01', svc: 'en' } });
    const boxes = $$('.rep-seg textarea'); expect(boxes.map(b => b.dataset.item)).toEqual(['Welcome', 'Worship', 'Sermon']);
    expect(boxes[2].placeholder).toBe('Notes on Sermon…');
    expect($('.rep-seg:nth-child(3) .rep-time').textContent).toContain('48m actual');
    expect($('.rep-seg:nth-child(3) .over')).not.toBeNull();
    boxes[2].value = 'Pastor ran long; strong altar response';
    await H.repNote(boxes[2]); await flush();
    expect(rpcs[0]).toEqual(['2026-11-01', 'en', 'e3', 'Sermon', 'Pastor ran long; strong altar response']);
    expect(boxes[2].parentElement.querySelector('.rep-st').textContent).toBe('Saved');
    expect($('.rep-stats').textContent.replace(/\s+/g, ' ')).toMatch(/2 ?checked in.*1 ?first visits.*81m ?6 min over/);
    expect($('.rep-names').textContent).toBe('Grace Lumbu, José Kabila');
  });

  it('team members on the roster can write reports for published Sundays only', () => {
    seed({ admin: false }); me.email = 'anna@x.com'; render();
    expect($$('[data-act="openReport"]').map(b => b.dataset.id)).toEqual(['2026-11-01', '2026-11-01']);   // the unpublished Sunday is hidden
    ui.rep = '2026-11-01|en'; render();
    expect($$('.rep-seg textarea').length).toBe(3);
  });

  it('keeps written notes in the printed version', () => {
    seed({ reports: { '2026-11-01|en': { notes: { e2: { text: 'Mic 2 crackled', by: 'anna', at: 0 } }, summary: 'Good service', followups: 'Fix mic 2' } } });
    ui.rep = '2026-11-01|en'; render();
    expect($$('.print-only').map(p => p.textContent)).toEqual(['', 'Mic 2 crackled', '', 'Good service', 'Fix mic 2']);
    expect($('.rep-seg.has .rep-by').textContent).toContain('Anna Mukendi');
  });

  it('asks for the database update when migration 004 has not run', () => {
    seed(); ui.reportsMissing = true; render();
    expect($('main').textContent).toContain('004-service-reports.sql');
  });
});
