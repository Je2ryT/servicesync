// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const calls = [];
vi.mock('../src/data.js', () => {
  const chain = (table, op, payload) => { calls.push({ table, op, payload }); const c = { select: () => c, single: () => c, eq: () => c, in: () => c, then: (ok, bad) => Promise.resolve({ data: op === 'insert' ? { id: 'new-' + table } : null, error: null }).then(ok, bad) }; return c; };
  const sb = { from: t => ({ upsert: p => chain(t, 'upsert', p), insert: p => chain(t, 'insert', p), update: p => chain(t, 'update', p), delete: () => chain(t, 'delete') }), rpc: (n, a) => { calls.push({ rpc: n, args: a }); return Promise.resolve({ data: { id: 'x' }, error: null }); } };
  return {
    sb, q: async p => { const { data, error } = await p; return error ? null : data ?? true; },
    reload: () => {}, loadAll: async () => {}, saveSun: async () => true, ensureSun: async () => true, timerAction: async () => true,
    whenLoaded: () => {}, subscribe: () => {}, syncClock: async () => {}, saveReport: async () => true, loadActivity: async () => {}, loadProfile: async () => {},
    loadMessages: async () => {}, loadRecipients: async () => {}, sendMessage: async () => ({ ok: true, body: {} }),
  };
});

const { setState, setNow, me, ui } = await import('../src/state.js');
const { render } = await import('../src/render.js');
const { H } = await import('../src/actions.js');
const F = await import('../src/flows.js');

const M = (id, name, o = {}) => [id, { name, first: name.split(' ')[0], last: name.split(' ')[1] || '', phone: '', email: '', lang: 'fr', active: true, categoryId: 'visitors', coordinatorId: null, ...o }];
function seed(admin = true) {
  setNow(new Date(2026, 10, 4, 10));   // Wed Nov 4
  setState({
    people: { anna: { name: 'Anna Mukendi', email: 'anna@x.com', active: true }, jerry: { name: 'Jerry Kibombo', email: 'jerry@x.com', active: true } },
    teams: {}, pos: {}, quals: {}, sun: {}, asg: {}, swap: {}, off: {}, chk: {}, tpl: {}, cfg: {}, timers: {}, events: {}, reports: {}, att: {}, cats: {}, families: {}, mstats: {}, filters: {},
    members: Object.fromEntries([M('g', 'Grace Lumbu', { phone: '704-555-0103' }), M('p', 'Paul Mbala'), M('d', 'Daniel Okafor'), M('z', 'Zoe Gone', { active: false })]),
    flows: { newcomer: { name: 'Newcomer', nameFr: 'Nouveaux venus', active: true } },
    steps: { s1: { flow: 'newcomer', sort: 0, title: 'Welcome text', titleFr: 'SMS de bienvenue', assignee: null, days: 1 }, s2: { flow: 'newcomer', sort: 1, title: 'Phone call', titleFr: 'Appel', assignee: 'anna', days: 3 } },
    fentries: {
      e1: { flow: 'newcomer', member: 'g', step: 's1', assignee: 'anna', due: '2026-11-02', status: 'active', created: 1 },
      e2: { flow: 'newcomer', member: 'p', step: 's2', assignee: 'jerry', due: '2026-11-04', status: 'active', created: 2 },
      e3: { flow: 'newcomer', member: 'd', step: 's2', assignee: 'anna', due: '2026-11-09', status: 'active', created: 3 },
      e4: { flow: 'newcomer', member: 'd', step: null, assignee: 'anna', due: null, status: 'done', created: 0, completed: 5 },
      e5: { flow: 'newcomer', member: 'z', step: 's1', assignee: 'anna', due: '2026-11-01', status: 'active', created: 4 },
    },
  });
  me.admin = admin; me.email = admin ? 'jerry@x.com' : 'anna@x.com';
  Object.assign(ui, { session: { user: {} }, ready: true, needsMigration: false, timerMissing: false, membersMissing: false, reportsMissing: false, peopleMissing: false, flowsMissing: false, stage: null, tab: 'followups', flow: 'newcomer', fmine: false, lang: 'en', person: null });
  calls.length = 0;
}
const $ = s => document.querySelector(s); const $$ = s => [...document.querySelectorAll(s)];
const flush = () => new Promise(r => setTimeout(r, 0));

describe('board rules', () => {
  beforeEach(() => seed());
  it('one column per step, soonest due first; inactive people hidden', () => {
    const b = F.board('newcomer');
    expect(b.cols.map(c => [c.step.title, c.items.map(e => e.id)])).toEqual([['Welcome text', ['e1']], ['Phone call', ['e2', 'e3']]]);
    expect(b).toMatchObject({ active: 3, overdue: 1, done: 1 });
  });
  it('overdue, due today and days late', () => {
    expect(F.isOverdue({ status: 'active', due: '2026-11-02' })).toBe(true); expect(F.isDueToday({ status: 'active', due: '2026-11-04' })).toBe(true);
    expect(F.daysLate({ status: 'active', due: '2026-11-02' })).toBe(2); expect(F.isOverdue({ status: 'done', due: '2026-11-02' })).toBe(false);
  });
  it('my follow-ups: overdue first', () => {
    seed(false);
    expect(F.myFollowups('anna').map(e => e.id)).toEqual(['e1', 'e3']);
    expect(F.board('newcomer', { mine: true, assignee: 'anna' }).active).toBe(2);
  });
});

describe('follow-up screens', () => {
  beforeEach(() => { document.body.innerHTML = '<nav id="tabs"></nav><div id="who"></div><main id="main"></main><div id="overlay"></div>'; seed(); });

  it('the board shows columns, late cards in red, in English and French', () => {
    render();
    expect($$('.col header b').map(b => b.textContent)).toEqual(['Welcome text', 'Phone call']);
    expect($('.fu.late .fu-who b').textContent).toBe('Grace Lumbu'); expect($('.fu.late .fu-due').textContent).toContain('2 days late');
    expect($('.fu.today .fu-due').textContent).toContain('Due today');
    H.setLang({ dataset: { v: 'fr' } });
    expect($$('.col header b').map(b => b.textContent)).toEqual(['SMS de bienvenue', 'Appel']); expect($('main h1').textContent).toBe('Suivis');
    H.setLang({ dataset: { v: 'en' } });
  });

  it('marking done sends the note to the database and moves on', async () => {
    render(); H.fuDone({ dataset: { id: 'e1' } });
    expect($('.modal').textContent).toContain('Next: Phone call');
    $('#fuNote').value = 'Sent welcome text'; await H.fuDoneGo({ dataset: { id: 'e1' }, disabled: false }); await flush();
    expect(calls[0]).toEqual({ rpc: 'flow_advance', args: { p_entry: 'e1', p_note: 'Sent welcome text' } });
  });

  it('reassigns and changes due dates', async () => {
    render();
    await H.fuAssign({ dataset: { id: 'e3' }, value: 'jerry' }); await H.fuDue({ dataset: { id: 'e3' }, value: '2026-11-12' });
    expect(calls.map(c => c.payload)).toEqual([{ assignee: 'jerry' }, { due_date: '2026-11-12' }]);
  });

  it('adds someone to a flow', async () => {
    render(); H.fuAdd({ dataset: { member: 'd' } }); $('#fuMember').value = 'd';
    await H.fuAddGo(); await flush();
    expect(calls[0]).toEqual({ rpc: 'flow_enroll', args: { p_member: 'd', p_flow: 'newcomer' } });
  });

  it('admins edit the steps', async () => {
    render(); H.flowEdit({ dataset: { id: 'newcomer' } });
    expect($$('.fl-step').length).toBe(2);
    H.flowStepAdd(); const rows = $$('.fl-step'); rows[2].querySelector('[data-f="title"]').value = 'Pastor visit'; rows[2].querySelector('[data-f="days"]').value = '10';
    H.flowStepDel({ dataset: { i: '0' } });
    await H.flowSave(); await flush();
    expect(calls.find(c => c.op === 'upsert').payload).toEqual([{ id: 's2', flow_id: 'newcomer', sort: 0, title: 'Phone call', title_fr: 'Appel', default_assignee: 'anna', due_days: 3 }]);
    expect(calls.find(c => c.op === 'insert').payload).toEqual([{ flow_id: 'newcomer', sort: 1, title: 'Pastor visit', title_fr: null, default_assignee: null, due_days: 10 }]);
    expect(calls.find(c => c.op === 'delete').table).toBe('flow_steps');
  });

  it('Home shows my follow-ups; profiles show a person’s follow-ups', () => {
    seed(false); me.email = 'anna@x.com'; ui.tab = 'home'; render();
    expect($('.fu-home').textContent).toContain('Grace Lumbu'); expect($('.fu-home .pill.bad').textContent).toBe('1 overdue');
    expect($('.notif').textContent).toContain('1 follow-up overdue');
  });

  it('the database update message before migration 008', () => {
    ui.flowsMissing = true; render(); expect($('main').textContent).toContain('008-followups.sql');
  });
});
