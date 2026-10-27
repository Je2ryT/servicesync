// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const calls = [];
vi.mock('../src/data.js', () => {
  const chain = (table, op, payload) => { const c = { eq: (k, v) => { calls.push({ table, op, payload, where: [k, v] }); return c; }, select: () => c, then: (ok, bad) => Promise.resolve({ data: null, error: null }).then(ok, bad) }; if (op !== 'delete') calls.push({ table, op, payload }); return c; };
  const sb = { from: t => ({ insert: p => chain(t, 'insert', p), delete: () => chain(t, 'delete'), update: p => chain(t, 'update', p), upsert: p => chain(t, 'upsert', p) }), rpc: async () => ({ data: null, error: null }) };
  return {
    sb, q: async p => { const { data, error } = await p; return error ? null : data ?? true; },
    reload: () => {}, loadAll: async () => {}, saveSun: async () => true, ensureSun: async () => true, timerAction: async () => true,
    whenLoaded: () => {}, subscribe: () => {}, syncClock: async () => {}, saveReport: async () => true, loadActivity: async () => {}, loadProfile: async () => {},
    loadMessages: async () => {}, loadRecipients: async () => {}, sendMessage: async () => ({ ok: true, body: {} }), runReport: async () => {}, loadSchedules: async () => {},
  };
});

const { setState, setNow, me, ui, S } = await import('../src/state.js');
const { render } = await import('../src/render.js');
const { H } = await import('../src/actions.js');
const A = await import('../src/views/admins.js');

function seed(admins = { 'jerry@x.com': { by: '', at: null }, 'pastor@church.org': { by: 'jerry@x.com', at: Date.parse('2026-10-01') } }) {
  setNow(new Date(2026, 9, 27, 9));
  setState({
    people: { jerry: { name: 'Jerry Kibombo', email: 'Jerry@x.com', active: true }, anna: { name: 'Anna Mukendi', email: 'anna@x.com', active: true }, paul: { name: 'Paul Mbala', email: '', active: true }, old: { name: 'Old Timer', email: 'old@x.com', active: false } },
    admins,
  });
  me.admin = true; me.email = 'jerry@x.com';
  Object.assign(ui, { session: { user: {} }, ready: true, needsMigration: false, peopleMissing: false, flowsMissing: false, stage: null, tab: 'roster', psub: 'admins', person: null, lang: 'en' });
  calls.length = 0;
}
const $ = s => document.querySelector(s); const $$ = s => [...document.querySelectorAll(s)];
const flush = () => new Promise(r => setTimeout(r, 0));

describe('administrators', () => {
  beforeEach(() => { document.body.innerHTML = '<nav id="tabs"></nav><div id="who"></div><main id="main"></main><div id="overlay"></div>'; seed(); });

  it('lists administrators (you first), matched to the serving team by email', () => {
    expect(A.adminList().map(a => [a.email, a.person?.name || null, a.you])).toEqual([['jerry@x.com', 'Jerry Kibombo', true], ['pastor@church.org', null, false]]);
    expect(A.adminCandidates().map(p => p.id)).toEqual(['anna']);   // has an email, active, not already an admin
    render();
    expect($$('.adm-row b').map(b => b.textContent.trim())).toEqual(['Jerry Kibombo You', 'pastor@church.org']);
    expect($$('.adm-row small')[1].textContent).toContain('Not on the serving team');
    expect($$('.adm-row small')[1].textContent).toContain('Added by Jerry Kibombo');
    expect($$('#admPick option').map(o => o.textContent)).toEqual(['—', 'Anna Mukendi · anna@x.com']);
  });

  it('adds someone from the team, or by typing an email; checks the address first', async () => {
    render(); $('#admPick').value = 'anna@x.com'; await H.adminAdd(); await flush();
    expect(calls).toEqual([{ table: 'admins', op: 'insert', payload: { email: 'anna@x.com' } }]);
    expect($$('.adm-row').length).toBe(3);
    calls.length = 0; $('#admEmail').value = 'not an email'; await H.adminAdd();
    expect($('#admMsg').textContent).toContain('not an email'); expect(calls.length).toBe(0);
    $('#admEmail').value = 'PASTOR@church.org'; await H.adminAdd();
    expect($('#admMsg').textContent).toBe('pastor@church.org is already an administrator.');
  });

  it('removing asks first, and warns when it is you', async () => {
    render(); H.adminRemove({ dataset: { email: 'pastor@church.org' } });
    expect($('.modal h2').textContent).toBe('Remove pastor@church.org as administrator?'); expect($('.modal').textContent).not.toContain('This is you');
    await H.adminRemoveGo({ dataset: { email: 'pastor@church.org' } }); await flush();
    expect(calls).toEqual([{ table: 'admins', op: 'delete', payload: undefined, where: ['email', 'pastor@church.org'] }]);
    expect(S.admins['pastor@church.org']).toBeUndefined();
    expect($('.adm-row button').disabled).toBe(true);   // now the only one
    expect($('main').textContent).toContain('This is the only administrator');
  });

  it('removing yourself takes you out of admin screens straight away', async () => {
    render(); H.adminRemove({ dataset: { email: 'jerry@x.com' } });
    expect($('.modal').textContent).toContain('This is you');
    await H.adminRemoveGo({ dataset: { email: 'jerry@x.com' } }); await flush();
    expect(me.admin).toBe(false); expect(ui.psub).toBe('all');
  });

  it('only administrators see the tab; the serving team shows an Administrator badge', () => {
    ui.psub = 'people'; render();
    expect($$('[data-act="psub"]').map(b => b.dataset.v)).toContain('admins');
    expect($$('.mem .pill.role').map(p => p.textContent)).toContain('Administrator');
    me.admin = false; ui.psub = 'admins'; render();
    expect($$('[data-act="psub"]').map(b => b.dataset.v)).not.toContain('admins'); expect($('.adm-row')).toBeNull();
  });

  it('French', () => {
    H.setLang({ dataset: { v: 'fr' } });
    expect($('main h1').textContent).toBe('Administrateurs'); expect($('.adm-row .pill.info').textContent).toBe('Vous');
    H.setLang({ dataset: { v: 'en' } });
  });
});
