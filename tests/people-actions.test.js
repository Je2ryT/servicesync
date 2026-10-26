// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/* A stand-in database that records what the app tries to save. */
const calls = [];
vi.mock('../src/data.js', () => {
  const chain = (table, op, payload) => {
    calls.push({ table, op, payload });
    const res = { data: op === 'upsert' && !Array.isArray(payload) ? { id: payload.id || 'new-' + table } : null, error: null };
    const c = { select: () => c, single: () => c, eq: () => c, in: () => c, then: (ok, bad) => Promise.resolve(res).then(ok, bad) };
    return c;
  };
  const sb = { from: t => ({ upsert: (p) => chain(t, 'upsert', p), insert: p => chain(t, 'insert', p), delete: () => chain(t, 'delete') }), rpc: () => Promise.resolve({ data: null, error: null }) };
  return {
    sb, q: async p => { const { data, error } = await p; return error ? null : data ?? true; },
    reload: () => {}, loadAll: async () => {}, saveSun: async () => true, ensureSun: async () => true, timerAction: async () => true,
    whenLoaded: () => {}, subscribe: () => {}, syncClock: async () => {},
  };
});

const { setState, setNow, me, ui } = await import('../src/state.js');
const { render } = await import('../src/render.js');
const { H } = await import('../src/actions.js');

function shell() { document.body.innerHTML = '<nav id="tabs"></nav><div id="who"></div><main id="main"></main><div id="overlay"></div>'; }
function seed() {
  setNow(new Date(2026, 9, 26));
  setState({
    people: { anna: { name: 'Anna', email: 'anna@x.com', langs: { en: true, fr: true }, active: true, max: 4 } },
    teams: { tw: { name: 'Worship', sort: 1 } }, pos: { lead: { team: 'tw', name: 'Worship leader', min: 1, pref: 1, sort: 1, active: true } },
    quals: {}, sun: {}, asg: {}, swap: {}, off: {}, chk: {}, tpl: {}, cfg: {}, timers: {},
  });
  me.admin = true; me.email = 'admin@x.com';
  Object.assign(ui, { session: { user: {} }, ready: true, needsMigration: false, timerMissing: false, stage: null, tab: 'roster', psub: 'teams' });
  calls.length = 0;
}
const $ = s => document.querySelector(s);
const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const flush = () => new Promise(r => setTimeout(r, 0));
// main.js wires clicks to handlers; do the same here without starting Supabase.
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el && H[el.dataset.act]) H[el.dataset.act](el, e); });

describe('Teams & positions', () => {
  beforeEach(() => { shell(); seed(); render(); });

  it('saves a new position', async () => {
    click($('[data-act="editPosition"][data-team="tw"]'));
    $('#psName').value = 'Bass guitar';
    click($('[data-act="savePosition"]')); await flush();
    const saved = calls.find(c => c.table === 'positions' && c.op === 'upsert');
    expect(saved?.payload).toMatchObject({ name: 'Bass guitar', team_id: 'tw', active: true });
  });

  it('saves a paused position', async () => {
    click($('[data-act="editPosition"][data-id="lead"]'));
    $('#psAct').checked = false;
    click($('[data-act="savePosition"]')); await flush();
    expect(calls.find(c => c.table === 'positions')?.payload).toMatchObject({ id: 'lead', active: false });
  });

  it('adds a new person from Teams & positions, already set up for a position', async () => {
    const add = $('[data-act="editPerson"]'); expect(add).not.toBeNull();
    click(add);
    $('#cName').value = 'Bob'; $('#cEmail').value = 'Bob@X.com';
    $('.cPos[value="lead"]').checked = true;
    click($('[data-act="savePerson"]')); await flush(); await flush();
    expect(calls.find(c => c.table === 'coordinators')?.payload).toMatchObject({ name: 'Bob', email: 'bob@x.com' });
    expect(calls.find(c => c.table === 'person_positions')?.payload).toEqual([{ person_id: 'new-coordinators', position_id: 'lead' }]);
  });

  it('picks who can serve a position from the position itself', async () => {
    click($('[data-act="editPosition"][data-id="lead"]'));
    const box = $('.psWho[value="anna"]'); expect(box).not.toBeNull();
    box.checked = true;
    click($('[data-act="savePosition"]')); await flush(); await flush();
    expect(calls.find(c => c.table === 'person_positions' && c.op === 'upsert')?.payload).toEqual([{ person_id: 'anna', position_id: 'lead' }]);
  });
});
