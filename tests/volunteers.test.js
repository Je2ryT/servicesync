// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const calls = []; let failFromMember = false;
vi.mock('../src/data.js', () => {
  const chain = (table, op, payload) => { calls.push({ table, op, payload }); const c = { select: () => c, single: () => c, eq: () => c, in: () => c,
    then: (ok, bad) => Promise.resolve(op === 'upsert' && failFromMember && payload?.from_member ? { data: null, error: { message: 'column "from_member" does not exist' } } : { data: { id: 'c-new' }, error: null }).then(ok, bad) }; return c; };
  const sb = { from: t => ({ upsert: p => chain(t, 'upsert', p), insert: p => chain(t, 'insert', p), delete: () => chain(t, 'delete'), update: p => chain(t, 'update', p) }), rpc: async () => ({ data: null, error: null }) };
  return {
    sb, q: async p => { const { data, error } = await p; return error ? null : data ?? true; },
    reload: () => {}, loadAll: async () => {}, saveSun: async () => true, ensureSun: async () => true, timerAction: async () => true,
    whenLoaded: () => {}, subscribe: () => {}, syncClock: async () => {}, saveReport: async () => true, loadActivity: async () => {}, loadProfile: async () => {},
    loadMessages: async () => {}, loadRecipients: async () => {}, sendMessage: async () => ({ ok: true, body: {} }), runReport: async () => {}, loadSchedules: async () => {},
  };
});

const { setState, setNow, me, ui } = await import('../src/state.js');
const { render } = await import('../src/render.js');
const { H } = await import('../src/actions.js');

function seed() {
  setNow(new Date(2026, 9, 27, 10));
  setState({
    people: { jerry: { name: 'Jerry Kibombo', email: 'jerry@x.com', active: true, langs: { en: true, fr: true } } },
    teams: { tw: { name: 'Worship', sort: 0 } }, pos: { lead: { team: 'tw', name: 'Worship leader', min: 1, pref: 1, active: true }, choir: { team: 'tw', name: 'Choir', min: 1, pref: 4, active: true } },
    quals: {}, asg: {}, sun: {}, swap: {}, off: {}, chk: {}, tpl: {}, cfg: {}, cats: { congregation: { name: 'Congregation', sort: 0 } }, families: {}, mstats: {}, filters: {}, admins: {},
    members: {
      grace: { name: 'Grace Lumbu', first: 'Grace', last: 'Lumbu', phone: '704-555-0103', email: '', lang: 'fr', active: true, categoryId: 'congregation', coordinatorId: null },
      gr2: { name: 'Gregory Mbala', first: 'Gregory', last: 'Mbala', phone: '', email: 'greg@x.org', lang: 'both', active: true, categoryId: 'congregation', coordinatorId: null },
      jk: { name: 'Jerry Kibombo', first: 'Jerry', last: 'Kibombo', phone: '', email: 'jerry@x.com', lang: 'both', active: true, categoryId: 'congregation', coordinatorId: 'jerry' },
    },
  });
  me.admin = true; me.email = 'jerry@x.com'; me.perms = null;
  Object.assign(ui, { session: { user: {} }, ready: true, needsMigration: false, peopleMissing: false, stage: null, tab: 'roster', psub: 'people', person: null, lang: 'en' });
  calls.length = 0; failFromMember = false;
}
const $ = s => document.querySelector(s); const $$ = s => [...document.querySelectorAll(s)];
const flush = () => new Promise(r => setTimeout(r, 0));

describe('add volunteers from the members list', () => {
  beforeEach(() => { document.body.innerHTML = '<nav id="tabs"></nav><div id="who"></div><main id="main"></main><div id="overlay"></div>'; seed(); render(); });

  it('search the members, pick one, and the form fills in', () => {
    H.editPerson({ dataset: {} });
    $('#cFind').value = 'gr'; H.cFind($('#cFind'));
    expect($$('.vpick-item b').map(b => b.textContent)).toEqual(['Grace Lumbu', 'Gregory Mbala']);
    $('#cFind').value = 'jer'; H.cFind($('#cFind'));
    expect($('.vpick-item').disabled).toBe(true); expect($('.vpick-item').textContent).toContain('already on the serving team');
    $('#cFind').value = 'grace'; H.cFind($('#cFind')); H.pickMember($('.vpick-item'));
    expect([$('#cName').value, $('#cPhone').value, $('#cFrom').value, $('#cEn').checked, $('#cFr').checked]).toEqual(['Grace Lumbu', '704-555-0103', 'grace', false, true]);
    expect($('.vpick-chip').textContent).toContain('Linked to Grace Lumbu’s member profile');
    expect($('#cFindRes').innerHTML).toBe('');
  });

  it('saving sends the member, with the positions ticked', async () => {
    H.editPerson({ dataset: {} }); $('#cFind').value = 'grace'; H.cFind($('#cFind')); H.pickMember($('.vpick-item'));
    $('#cEmail').value = 'grace@x.org'; $$('.cPos').find(b => b.value === 'choir').checked = true;
    await H.savePerson({ dataset: {} }); await flush();
    expect(calls[0]).toMatchObject({ table: 'coordinators', op: 'upsert', payload: { name: 'Grace Lumbu', email: 'grace@x.org', phone: '704-555-0103', lang_en: false, lang_fr: true, from_member: 'grace' } });
    expect(calls.find(c => c.table === 'person_positions').payload).toEqual([{ person_id: 'c-new', position_id: 'choir' }]);
  });

  it('unlink goes back to a brand-new person; before migration 013 it still saves', async () => {
    H.editPerson({ dataset: {} }); $('#cFind').value = 'grace'; H.cFind($('#cFind')); H.pickMember($('.vpick-item')); H.unpickMember();
    expect($('#cFrom').value).toBe('');
    H.pickMember({ dataset: { id: 'gr2' } }); failFromMember = true;
    await H.savePerson({ dataset: {} }); await flush();
    expect(calls.filter(c => c.table === 'coordinators').map(c => c.payload.from_member)).toEqual(['gr2', undefined]);
  });

  it('a member’s profile offers “Add to serving team”; the form opens filled in', () => {
    ui.tab = 'roster'; ui.psub = 'all'; ui.person = 'grace'; ui.prof = { notes: [], history: [], att: [] }; render();
    expect($('[data-act="editPerson"][data-member="grace"]').textContent).toContain('Add to serving team');
    H.editPerson($('[data-act="editPerson"][data-member="grace"]'));
    expect($('#cName').value).toBe('Grace Lumbu'); expect($('#cFrom').value).toBe('grace');
    document.getElementById('overlay').innerHTML = ''; ui.person = 'jk'; ui.prof = { notes: [], history: [], att: [] }; render(); expect($('main').textContent).toContain('On the serving team');
  });

  it('from a position: “Add someone from the members list” ticks that position', () => {
    H.editPosition({ dataset: { id: 'choir' } });
    H.editPerson($('[data-act="editPerson"][data-pos="choir"]'));
    expect($$('.cPos:checked').map(b => b.value)).toEqual(['choir']); expect($('#cFind')).not.toBeNull();
  });

  it('only admins with Schedule see the picker and the profile button', () => {
    me.perms = ['people']; ui.psub = 'all'; ui.person = 'grace'; ui.prof = { notes: [], history: [], att: [] }; render();
    expect($('[data-act="editPerson"][data-member]')).toBeNull();
  });
});
