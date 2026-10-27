// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const calls = [];
vi.mock('../src/data.js', () => {
  const chain = (table, op, payload) => { calls.push({ table, op, payload }); const c = { eq: (k, v) => { c.where = [k, v]; calls[calls.length - 1].where = [k, v]; return c; }, select: () => c, single: () => c, then: (ok, bad) => Promise.resolve({ data: { id: 'ev-new' }, error: null }).then(ok, bad) }; return c; };
  const sb = { from: t => ({ insert: p => chain(t, 'insert', p), update: p => chain(t, 'update', p), upsert: p => chain(t, 'upsert', p), delete: () => chain(t, 'delete') }), rpc: async () => ({ data: null, error: null }) };
  return {
    sb, q: async p => { const { data, error } = await p; return error ? null : data ?? true; },
    reload: () => {}, loadAll: async () => {}, saveSun: async (id, d) => { calls.push({ saveSun: id, d }); return true; }, ensureSun: async () => true, timerAction: async () => true,
    whenLoaded: () => {}, subscribe: () => {}, syncClock: async () => {}, saveReport: async () => true, loadActivity: async () => {}, loadProfile: async () => {},
    loadMessages: async () => {}, loadRecipients: async () => {}, sendMessage: async () => ({ ok: true, body: {} }), runReport: async () => {}, loadSchedules: async () => {},
  };
});

const { setState, setNow, me, ui, S } = await import('../src/state.js');
const { render } = await import('../src/render.js');
const { H } = await import('../src/actions.js');
const { servicesOn } = await import('../src/views/events.js');

function seed() {
  setNow(new Date(2026, 10, 2, 10));   // Mon Nov 2
  setState({
    people: { jerry: { name: 'Jerry Kibombo', email: 'jerry@x.com', active: true } }, teams: {}, pos: {}, quals: {}, asg: {}, swap: {}, off: {}, chk: {}, cfg: {}, members: {}, att: {}, reports: {}, timers: {},
    tpl: { 'tpl-en': { name: 'English Sunday Service', lang: 'en', order: [{ id: 'e1', item: 'Welcome', min: 5 }] }, 'tpl-pr': { name: 'Prayer night', lang: 'fr', order: [{ id: 'p1', item: 'Louange', min: 20 }, { id: 'p2', item: 'Prière', min: 40 }] } },
    sun: {
      '2026-11-08': { date: '2026-11-08', published: true, services: { en: {}, fr: {} } },
      '2026-11-15': { date: '2026-11-15', published: false, services: { en: {}, fr: {} } },
      '2026-11-20-ev-a': { date: '2026-11-20', published: true, special: true, title: 'Prayer night', services: { ev: { start: '19:00', tpl: 'tpl-pr' } } },
      '2026-11-27-ev-b': { date: '2026-11-27', published: true, special: true, title: 'Thanksgiving service', services: { ev: { start: '18:00', tpl: 'tpl-en' } } },
    },
    events: {
      e1: { title: 'Prayer night', date: '2026-11-20', start: '19:00', end: '21:00', location: 'Sanctuary', description: '', serviceId: '2026-11-20-ev-a' },
      e2: { title: 'Choir rehearsal', date: '2026-11-07', start: '10:00', end: '', location: '', description: '', serviceId: null },
    },
  });
  me.admin = true; me.email = 'jerry@x.com'; me.perms = null;
  Object.assign(ui, { session: { user: {} }, ready: true, needsMigration: false, membersMissing: false, eventLinkMissing: false, stage: null, tab: 'events', evMonth: '2026-11', evDay: null, layout: null, lang: 'en' });
  calls.length = 0;
}
const $ = s => document.querySelector(s); const $$ = s => [...document.querySelectorAll(s)];
const flush = () => new Promise(r => setTimeout(r, 0));

describe('calendar ↔ layouts', () => {
  beforeEach(() => { document.body.innerHTML = '<nav id="tabs"></nav><div id="who"></div><main id="main"></main><div id="overlay"></div>'; seed(); });

  it('a Sunday lists its services, each with a Layout button', () => {
    expect(servicesOn('2026-11-08').map(x => [x.title, x.svc])).toEqual([['English Service', 'en'], ['French Service', 'fr']]);
    H.evDay({ dataset: { date: '2026-11-08' } });
    expect($$('.evc.svc .evb > b').map(b => b.textContent)).toEqual(['English Service', 'French Service']);
    expect($$('.evc.svc [data-act="openLayout"]').map(b => b.dataset.id + '|' + b.dataset.svc)).toEqual(['2026-11-08|en', '2026-11-08|fr']);
  });

  it('an event planned as a service shows its layout; a special service from the schedule shows on the calendar too', () => {
    render();
    const prayer = $$('.evc').find(c => c.textContent.includes('Prayer night'));
    expect(prayer.querySelector('[data-act="openLayout"]').dataset.id).toBe('2026-11-20-ev-a');
    expect($$('.evc').filter(c => c.textContent.includes('Prayer night')).length).toBe(1);   // not shown twice
    const thanks = $$('.evc.svc').find(c => c.textContent.includes('Thanksgiving service'));
    expect(thanks.textContent).toContain('1 part'); expect(thanks.querySelector('[data-act="openLayout"]').dataset.id).toBe('2026-11-27-ev-b');
    expect($$('.evc').find(c => c.textContent.includes('Choir rehearsal')).querySelector('[data-act="openLayout"]')).toBeNull();
  });

  it('Layout opens the printable layout, and Back returns to the calendar', () => {
    H.evDay({ dataset: { date: '2026-11-20' } });
    H.openLayout($('[data-act="openLayout"]'));
    expect(ui.tab).toBe('reports'); expect($('.lay-head h2').textContent).toBe('Order of service');
    expect($$('.lay-part b').map(b => b.textContent)).toEqual(['Louange', 'Prière']);
    expect($('main').textContent).toContain('No placeholders yet');   // a layout with no placeholders still opens (it used to crash)
    H.layBack(); expect(ui.tab).toBe('events'); expect(ui.evDay).toBe('2026-11-20');
  });

  it('team members see services on published Sundays only', () => {
    me.admin = false; me.perms = []; me.email = 'bob@x.com';
    expect(servicesOn('2026-11-15')).toEqual([]); expect(servicesOn('2026-11-08').length).toBe(2);
  });

  const pick = (mode, tpl) => { for (const r of $$('input[name="evMode"]')) r.checked = r.value === mode; if (tpl) $('#evTpl').value = tpl; };

  it('a new event offers: no layout, Sunday, French, or custom', () => {
    H.editEvent({ dataset: { date: '2026-11-07' } });
    expect($$('input[name="evMode"]').map(r => r.value)).toEqual(['none', 'en', 'fr', 'custom']);
    expect($('input[name="evMode"]:checked').value).toBe('none');
    expect($$('#evTpl option').map(o => o.textContent)).toEqual(['Prayer night', '＋ Create a new layout']);   // the Sunday layouts aren't repeated under Custom
  });

  it('picking the Sunday layout plans the event as a service that follows the Sunday layout', async () => {
    H.editEvent({ dataset: { date: '2026-11-07' } });
    $('#eTitle').value = 'Youth night'; $('#eStart').value = '19:30'; pick('en');
    await H.saveCalEvent({ dataset: {} }); await flush();
    const svc = calls.find(c => c.saveSun);
    expect(svc.saveSun).toMatch(/^2026-11-07-ev-/);
    expect(svc.d).toMatchObject({ date: '2026-11-07', title: 'Youth night', special: true, published: false, services: { ev: { start: '19:30', tpl: '@en' } } });
    expect(calls.find(c => c.op === 'update' && c.table === 'events')).toMatchObject({ payload: { service_id: svc.saveSun }, where: ['id', 'ev-new'] });
  });

  it('custom: pick a layout already built', async () => {
    H.editEvent({ dataset: { date: '2026-11-07' } }); $('#eTitle').value = 'Prayer'; pick('custom', 'tpl-pr');
    await H.saveCalEvent({ dataset: {} }); await flush();
    expect(calls.find(c => c.saveSun).d.services.ev.tpl).toBe('tpl-pr');
  });

  it('custom: create a new layout (blank or a copy of a Sunday layout)', async () => {
    H.editEvent({ dataset: { date: '2026-11-07' } }); $('#eTitle').value = 'Conference'; pick('custom', '__new');
    $('#evNewName').value = ''; await H.saveCalEvent({ dataset: {} });
    expect(calls.length).toBe(0);   // a new layout needs a name
    $('#evNewName').value = 'Conference day'; $('#evFrom').value = '@en';
    await H.saveCalEvent({ dataset: {} }); await flush();
    const tpl = calls.find(c => c.table === 'templates' && c.op === 'insert').payload;
    expect(tpl).toMatchObject({ name: 'Conference day', lang: 'en', items: [{ id: 'e1', item: 'Welcome', min: 5, roles: [] }] });
    expect(calls.find(c => c.saveSun).d.services.ev.tpl).toBe(tpl.id);
    expect(S.tpl[tpl.id].name).toBe('Conference day');
  });

  it('editing a linked event keeps its service in step; “No layout” unlinks it', async () => {
    H.editEvent({ dataset: { id: 'e1' } }); expect($('input[name="evMode"]:checked').value).toBe('custom'); expect($('#evTpl').value).toBe('tpl-pr');
    $('#eStart').value = '19:15'; await H.saveCalEvent({ dataset: { id: 'e1' } }); await flush();
    expect(calls.find(c => c.saveSun)).toMatchObject({ saveSun: '2026-11-20-ev-a', d: { title: 'Prayer night', published: true, services: { ev: { start: '19:15', tpl: 'tpl-pr' } } } });
    calls.length = 0;
    H.editEvent({ dataset: { id: 'e1' } }); pick('none'); await H.saveCalEvent({ dataset: { id: 'e1' } }); await flush();
    expect(calls.some(c => c.saveSun)).toBe(false);
    expect(calls.filter(c => c.table === 'events').map(c => c.payload.service_id)).toContain(null);
  });

  it('a Sunday service can switch to another layout for that day only', async () => {
    const { tplFor, docOf } = await import('../src/domain.js');
    ui.layout = '2026-11-08|en'; ui.tab = 'reports'; render();
    expect($('.lay-used').textContent).toContain('Layout: English Sunday Service');
    H.layChange($('[data-act="layChange"]'));
    for (const r of $$('input[name="svcMode"]')) r.checked = r.value === 'custom'; $('#svcTpl').value = 'tpl-pr';
    await H.layChangeGo({ dataset: { id: '2026-11-08', svc: 'en' } }); await flush();
    expect(calls.find(c => c.saveSun)).toMatchObject({ saveSun: '2026-11-08', d: { services: { en: { tpl: 'tpl-pr' }, fr: {} } } });
    expect(tplFor(docOf('2026-11-08'), 'en').name).toBe('Prayer night');
    expect(tplFor({ services: { ev: { tpl: '@fr' } } }, 'ev').name).toBeTruthy();
  });

  it('“Edit this layout” opens it on Templates', () => {
    ui.layout = '2026-11-20-ev-a|ev'; ui.tab = 'reports'; render();
    H.layEdit($('[data-act="layEdit"]'));
    expect(ui.tab).toBe('templates'); expect($('#tpl-card-tpl-pr').classList.contains('focus')).toBe(true);
  });

  it('a layout used by an upcoming service can’t be deleted', async () => {
    ui.tab = 'templates'; render();
    await H.tDel({ dataset: { tid: 'tpl-pr' } });
    expect(calls.some(c => c.table === 'templates' && c.op === 'delete')).toBe(false);
  });
});
