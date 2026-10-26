// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const calls = [];
vi.mock('../src/data.js', () => {
  const chain = (table, op, payload) => {
    calls.push({ table, op, payload });
    const res = { data: (op === 'insert' || op === 'upsert' || op === 'update') && payload && !Array.isArray(payload) ? { id: payload.id || 'new-' + table } : null, error: null };
    const c = { select: () => c, single: () => c, eq: () => c, in: () => c, then: (ok, bad) => Promise.resolve(res).then(ok, bad) };
    return c;
  };
  const sb = { from: t => ({ upsert: p => chain(t, 'upsert', p), insert: p => chain(t, 'insert', p), update: p => chain(t, 'update', p), delete: () => chain(t, 'delete') }), rpc: () => Promise.resolve({ data: null, error: null }) };
  return {
    sb, q: async p => { const { data, error } = await p; return error ? null : data ?? true; },
    reload: () => {}, loadAll: async () => {}, saveSun: async () => true, ensureSun: async () => true, timerAction: async () => true,
    whenLoaded: () => {}, subscribe: () => {}, syncClock: async () => {},
  };
});

const { setState, setNow, me, ui, S } = await import('../src/state.js');
const { render } = await import('../src/render.js');
const { H } = await import('../src/actions.js');
const { searchMembers, defaultSvc, attendanceSummary, streak, profile, notifications, upcomingEvents } = await import('../src/members.js');

function shell() { document.body.innerHTML = '<nav id="tabs"></nav><div id="who"></div><main id="main"></main><div id="overlay"></div>'; }
const NOW = new Date(2026, 10, 1, 10, 0);   // Sunday Nov 1 2026, 10:00
function seed(admin = true) {
  setNow(NOW);
  setState({
    people: { anna: { name: 'Anna Mukendi', email: 'anna@x.com', phone: '704-555-0101', langs: { en: true, fr: true }, active: true, max: 4 } },
    teams: { tc: { name: 'Coordination', sort: 0 } }, pos: { coord: { team: 'tc', name: 'Coordinator', min: 1, pref: 1, active: true } },
    quals: { anna: { coord: true } },
    sun: { '2026-11-08': { date: '2026-11-08', published: true, services: { en: {}, fr: {} } } },
    asg: { a1: { sunId: '2026-11-08', svc: 'fr', pos: 'coord', person: 'anna', status: 'awaiting' } },
    swap: {}, off: {}, chk: {}, tpl: {}, cfg: {}, timers: {},
    members: {
      m1: { name: 'José Kabila', phone: '(704) 555-0199', lang: 'fr', status: 'member', active: true, createdAt: 0 },
      m2: { name: 'Grace Lumbu', phone: '', lang: 'en', status: 'newcomer', active: true, createdAt: NOW.getTime() - 86400000 },
      m3: { name: 'Old Friend', phone: '', lang: 'fr', status: 'member', active: false, createdAt: 0 },
    },
    att: {
      'm1|2026-11-01|en': { member: 'm1', date: '2026-11-01', svc: 'en', at: NOW.getTime(), by: 'anna' },
      'm2|2026-11-01|en': { member: 'm2', date: '2026-11-01', svc: 'en', at: NOW.getTime(), by: 'anna' },
      'm1|2026-10-25|fr': { member: 'm1', date: '2026-10-25', svc: 'fr', at: 0, by: 'anna' },
    },
    events: {
      e1: { title: 'Prayer night <b>', date: '2026-11-04', start: '19:00', end: '21:00', location: 'Sanctuary', description: '' },
      e2: { title: 'Old event', date: '2026-10-01', start: '', end: '', location: '', description: '' },
    },
  });
  me.admin = admin; me.email = admin ? 'boss@x.com' : 'anna@x.com'; me.name = '';
  Object.assign(ui, { session: { user: {} }, ready: true, needsMigration: false, timerMissing: false, membersMissing: false, stage: null, ciSvc: null, ciQuery: '', evMonth: null, evDay: null });
  calls.length = 0;
}
const $ = s => document.querySelector(s);
const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const flush = () => new Promise(r => setTimeout(r, 0));
document.addEventListener('click', e => { const el = e.target.closest('[data-act],[data-tab]'); if (!el) return; const a = el.dataset.act || 'tab'; if (H[a]) H[a](el, e); });

describe('members and attendance', () => {
  beforeEach(() => seed());
  it('finds people by name without accents, or by phone', () => {
    expect(searchMembers('jose').map(m => m.id)).toEqual(['m1']);
    expect(searchMembers('lum').map(m => m.id)).toEqual(['m2']);
    expect(searchMembers('0199').map(m => m.id)).toEqual(['m1']);
    expect(searchMembers('').map(m => m.id)).toEqual(['m2', 'm1']);    // inactive members are hidden
  });
  it('picks the service from the time of day', () => {
    expect(defaultSvc(new Date(2026, 10, 1, 9, 30))).toBe('en');
    expect(defaultSvc(new Date(2026, 10, 1, 11, 40))).toBe('fr');
    expect(defaultSvc(new Date(2026, 10, 4, 19, 0))).toBe('ev');
  });
  it('counts today and recent Sundays', () => {
    expect(attendanceSummary('2026-11-01')).toEqual({ en: 2, fr: 0, ev: 0, total: 2, people: 2, newcomers: 1 });
    expect(streak('m1')).toEqual({ came: 2, of: 4 });
  });
});

describe('profile and notifications', () => {
  it('describes the signed-in team member', () => {
    seed(false); const p = profile();
    expect(p).toMatchObject({ id: 'anna', name: 'Anna Mukendi', initials: 'AM', admin: false, positions: ['Coordinator'], awaiting: 1 });
    expect(p.next.d.date).toBe('2026-11-08');
    expect(notifications().map(n => n.icon)).toEqual(['clock', 'cal']);
  });
  it('tells admins about newcomers', () => {
    seed(true);
    expect(notifications().some(n => /1 newcomer/.test(n.text))).toBe(true);
    expect(upcomingEvents().map(e => e.id)).toEqual(['e1']);
  });
});

describe('screens', () => {
  beforeEach(() => { shell(); });

  it('the dashboard leads with the profile, notifications, check-in and events', () => {
    seed(false); ui.tab = 'home'; render();
    expect($('.prof h2').textContent).toBe('Anna Mukendi');
    expect($('.avatar').textContent).toBe('AM');
    expect($('.notif .nl li')).not.toBeNull();
    expect($('[data-tab="checkin"]')).not.toBeNull();
    expect($('.evb b').textContent).toBe('Prayer night <b>');     // escaped
  });

  it('checks someone in with one tap, and undoes with two', async () => {
    seed(false); ui.tab = 'checkin'; render();
    expect($('.stabs [aria-pressed="true"]').dataset.svc).toBe('en');
    click($('[data-act="ciToggle"][data-id="m1"]')); await flush();        // already in: first tap only asks
    expect(calls.length).toBe(0);
    click($('[data-act="ciToggle"][data-id="m1"]')); await flush();
    expect(calls[0]).toMatchObject({ table: 'attendance', op: 'delete' });
    ui.ciSvc = 'fr'; render(); calls.length = 0;
    click($('[data-act="ciToggle"][data-id="m2"]')); await flush();
    expect(calls[0]).toMatchObject({ table: 'attendance', op: 'upsert', payload: { member_id: 'm2', date: '2026-11-01', svc: 'fr' } });
  });

  it('adds a newcomer from a search with no match and checks them in', async () => {
    seed(false); ui.tab = 'checkin'; ui.ciQuery = 'Patrick'; render();
    click($('[data-act="addMember"][data-name="Patrick"]'));
    expect($('#mName').value).toBe('Patrick');
    $('#mName').value = '  Patrick   Tshivuadi '; $('#mPhone').value = '704 555 0123';
    expect($('#mStatus option[selected]').value).toBe('newcomer');
    $('#mStatus').value = 'newcomer';   // the test browser misreads pre-selected options; real browsers don't
    click($('[data-act="saveMember"]')); await flush(); await flush();
    expect(calls[0]).toMatchObject({ table: 'members', op: 'insert', payload: { name: 'Patrick Tshivuadi', phone: '704 555 0123', status: 'newcomer' } });
    expect(calls[1]).toMatchObject({ table: 'attendance', payload: { member_id: 'new-members', svc: 'en' } });
  });

  it('only admins can edit members and events', () => {
    seed(false); ui.tab = 'checkin'; render(); expect($('[data-act="editMember"]')).toBeNull();
    ui.tab = 'events'; render(); expect($('[data-act="editEvent"]')).toBeNull();
    seed(true); ui.tab = 'checkin'; render(); expect($('[data-act="editMember"]')).not.toBeNull();
  });

  it('shows the month with events and saves a new one', async () => {
    seed(true); ui.tab = 'events'; render();
    const cell = $('[data-date="2026-11-04"]'); expect(cell.querySelector('.ev').textContent).toBe('Prayer night <b>');
    expect($('[data-date="2026-11-01"] .svc')).not.toBeNull();
    click($('.head [data-act="editEvent"]'));
    $('#eTitle').value = 'Youth night'; $('#eDate').value = '2026-11-13'; $('#eStart').value = '19:00'; $('#eEnd').value = '18:00';
    click($('[data-act="saveCalEvent"]')); await flush();
    expect(calls.length).toBe(0);                                          // end before start is refused
    $('#eEnd').value = '21:00'; click($('[data-act="saveCalEvent"]')); await flush();
    expect(calls[0]).toMatchObject({ table: 'events', op: 'insert', payload: { title: 'Youth night', date: '2026-11-13', start_time: '19:00', end_time: '21:00' } });
  });

  it('asks for the database update when migration 003 has not run', () => {
    seed(true); ui.membersMissing = true; ui.tab = 'checkin'; render();
    expect($('main').textContent).toContain('003-members-attendance-events.sql');
  });
});
