// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const calls = [];
vi.mock('../src/data.js', () => {
  const chain = (table, op, payload) => { calls.push({ table, op, payload }); const c = { eq: () => c, select: () => c, single: () => c, then: (ok, bad) => Promise.resolve({ data: null, error: null }).then(ok, bad) }; return c; };
  const sb = { from: t => ({ insert: p => chain(t, 'insert', p), upsert: p => chain(t, 'upsert', p), delete: () => chain(t, 'delete'), update: p => chain(t, 'update', p) }),
    rpc: async (n, a) => { calls.push({ rpc: n, args: a }); return { data: { layout: { [a.p_item]: { [a.p_tag]: a.p_name } } }, error: null }; } };
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
const LY = await import('../src/layout.js');
const { timeIn } = await import('../src/views/layout.js');

function seed() {
  setNow(new Date(2026, 9, 31, 10));
  setState({
    people: { jerry: { name: 'Jerry Kibombo', email: 'jerry@x.com', active: true }, naomi: { name: 'Naomi Ilunga', email: 'n@x.com', active: true }, dorcas: { name: 'Dorcas Mbuyi', email: 'd@x.com', active: true } },
    teams: { tc: { name: 'Coordination', sort: 0 } },
    pos: { pmod: { team: 'tc', name: 'Moderator', min: 1, pref: 1, sort: 0, active: true }, pint: { team: 'tc', name: 'Interprète', min: 1, pref: 1, sort: 1, active: true }, pchoir: { team: 'tc', name: 'Worship team', min: 1, pref: 1, sort: 2, active: true } },
    quals: {}, off: {}, swap: {}, chk: {}, cfg: {}, timers: {}, events: {}, att: {}, members: {}, cats: {}, families: {}, mstats: {}, filters: {}, flows: {}, steps: {}, fentries: {}, admins: {},
    sun: { '2026-11-01': { date: '2026-11-01', published: true, special: false, services: { en: {}, fr: {} } } },
    asg: { a1: { sunId: '2026-11-01', svc: 'en', pos: 'pmod', person: 'naomi', status: 'confirmed' }, a2: { sunId: '2026-11-01', svc: 'en', pos: 'pint', person: 'dorcas', status: 'declined' }, a3: { sunId: '2026-11-01', svc: 'en', pos: 'pchoir', person: 'jerry', status: 'awaiting' } },
    tpl: { 'tpl-en': { name: 'English', lang: 'en', order: [
      { id: 'e1', item: 'Welcome', min: 5, roles: [{ id: 'r1', role: 'moderator', color: 'yellow' }] },
      { id: 'e2', item: 'Worship', min: 25, roles: [{ id: 'r1', role: 'choir', color: 'blue', pos: 'pchoir' }] },
      { id: 'e5', item: 'Sermon', min: 45, roles: [{ id: 'r1', role: 'pastor', color: 'blue' }, { id: 'r2', role: 'interpreter', color: 'white' }, { id: 'r3', role: 'other', label: 'Reader', color: 'purple' }] },
    ] }, 'tpl-fr': { name: 'Français', lang: 'fr', order: [{ id: 'f1', item: 'Accueil', min: 10, roles: [{ id: 'r1', role: 'moderator', color: 'yellow' }] }] } },
    reports: { '2026-11-01|en': { notes: {}, summary: '', followups: '', layout: { e5: { r1: 'Pastor Kabeya' } } } },
  });
  me.admin = true; me.email = 'jerry@x.com';
  Object.assign(ui, { session: { user: {} }, ready: true, needsMigration: false, reportsMissing: false, stage: null, tab: 'reports', rsub: 'reports', layout: '2026-11-01|en', rep: null, lang: 'en', drafts: {}, tsub: 'order' });
  calls.length = 0;
}
const $ = s => document.querySelector(s); const $$ = s => [...document.querySelectorAll(s)];
const flush = () => new Promise(r => setTimeout(r, 0));

describe('layout rules', () => {
  beforeEach(seed);
  it('cleans placeholders: unknown roles become Other, unknown colours fall back to the role’s colour', () => {
    expect(LY.cleanTag({ id: 'x', role: 'bishop', label: ' Usher ', color: 'teal' })).toEqual({ id: 'x', role: 'other', label: 'Usher', color: 'white', pos: '' });
    expect(LY.cleanTag({ role: 'pastor' }, 2)).toEqual({ id: 'r2', role: 'pastor', label: '', color: 'blue', pos: '' });
    expect(LY.COLORS).toEqual(['blue', 'white', 'yellow', 'red', 'green', 'purple', 'orange', 'pink', 'gray']);
    expect(LY.cleanTag({ role: 'choir', color: 'green' }).color).toBe('green');
    expect(LY.tagLabel({ role: 'interpreter' }, 'fr')).toBe('Interprète'); expect(LY.tagLabel({ role: 'other', label: 'Reader' }, 'fr')).toBe('Reader');
  });
  it('names start empty; only typed names fill them. The schedule (chosen position, else same name in either language, declined left out) is a suggestion', () => {
    const rows = LY.layoutOf({ id: '2026-11-01', ...S.sun['2026-11-01'] }, 'en');
    expect(rows.map(r => [r.start, r.item, r.tags.map(x => [LY.tagLabel(x), x.color, x.names.join(',') || '—', x.suggest.join(',') || '—'])])).toEqual([
      ['9:00 AM', 'Welcome', [['Moderator', 'yellow', '—', 'Naomi Ilunga']]],
      ['9:05 AM', 'Worship', [['Choir', 'blue', '—', 'Jerry Kibombo']]],
      ['9:30 AM', 'Sermon', [['Pastor', 'blue', 'Pastor Kabeya', '—'], ['Interpreter', 'white', '—', '—'], ['Reader', 'purple', '—', '—']]],
    ]);
    expect(LY.positionFor({ role: 'interpreter' })).toBe('pint');   // "Interprète" matches Interpreter
    expect(LY.openCount(rows)).toBe(4);
  });
  it('French times', () => { expect(timeIn('11:30 AM', 'fr')).toBe('11 h 30'); expect(timeIn('1:45 PM', 'fr')).toBe('13 h 45'); expect(timeIn('12:05 AM', 'fr')).toBe('0 h 05'); expect(timeIn('9:00 AM', 'en')).toBe('9:00 AM'); });
});

describe('layout screens', () => {
  beforeEach(() => { document.body.innerHTML = '<nav id="tabs"></nav><div id="who"></div><main id="main"></main><div id="overlay"></div>'; seed(); });

  it('shows the sheet with coloured tags and names, and a count of empty places', () => {
    render();
    expect($('.lay-head h2').textContent).toBe('Order of service');
    expect($$('.ltag').map(x => x.className.replace('ltag ', '') + ':' + x.textContent)).toEqual(['yellow:Moderator', 'blue:Choir', 'blue:Pastor', 'white:Interpreter', 'purple:Reader']);
    expect($$('.lay-name.print-only').map(x => x.textContent || '___')).toEqual(['___', '___', 'Pastor Kabeya', '___', '___']);   // empty until someone types a name
    expect($('.pill.warn').textContent).toBe('4 places still empty');
    expect($$('.lay-in').map(i => [i.value, i.placeholder])).toEqual([['', 'Name'], ['', 'Name'], ['Pastor Kabeya', 'Name'], ['', 'Name'], ['', 'Name']]);
    expect($$('.lay-sug').map(b => b.textContent)).toEqual(['Scheduled: Naomi Ilunga · use', 'Scheduled: Jerry Kibombo · use']);
  });

  it('“use” fills in the scheduled person', async () => {
    render(); await H.layUse($('.lay-sug')); await flush();
    expect(calls).toEqual([{ rpc: 'save_layout', args: { p_sunday: '2026-11-01', p_svc: 'en', p_item: 'e1', p_tag: 'r1', p_name: 'Naomi Ilunga' } }]);
  });

  it('typing a name saves it for this service only', async () => {
    render(); const i = $$('.lay-in')[3]; i.value = 'Grace';
    await H.layName(i); await flush();
    expect(calls).toEqual([{ rpc: 'save_layout', args: { p_sunday: '2026-11-01', p_svc: 'en', p_item: 'e5', p_tag: 'r2', p_name: 'Grace' } }]);
  });

  it('French services print in French whatever the screen language', () => {
    ui.layout = '2026-11-01|fr'; render();
    expect($('.lay-head h2').textContent).toBe('Ordre du culte'); expect($('.lay-head p').textContent).toContain('Culte en français');
    expect($('.lay-head p').textContent).toContain('11 h 30'); expect($('.ltag').textContent).toBe('Modérateur');
    expect($('main h1').textContent).toBe('Service layout');
  });

  it('team members fill it in once the Sunday is published (like reports)', () => {
    me.admin = false; me.email = 'n@x.com'; S.sun['2026-11-01'].published = false; render();
    expect($('.lay-sheet')).toBeNull(); expect(ui.layout).toBeNull();   // unpublished Sundays aren't visible to them
    S.sun['2026-11-01'].published = true; ui.layout = '2026-11-01|en'; render();
    expect($$('.lay-in').length).toBe(5);
  });

  it('admins add placeholders on Templates: role, colour, label for Other', () => {
    ui.layout = null; ui.tab = 'templates'; render();
    H.phEdit({ dataset: { tid: 'tpl-en', id: 'e1' } });
    expect($$('.modal .ph-row').length).toBe(1);
    H.phAdd(); const r = () => $$('.modal .ph-row')[1];
    r().querySelector('[data-f="role"]').value = 'other'; H.phRole({ dataset: { i: '1' } });
    expect(r().querySelector('[data-f="label"]').hidden).toBe(false);
    r().querySelector('[data-f="label"]').value = 'Usher';
    for (const [i, v] of [[0, 'moderator'], [1, 'other']]) $$('.modal [data-f="role"]')[i].value = v;   // happy-dom misreads pre-selected options after a redraw
    r().querySelector('.ph-sw.yellow input').checked = true;
    H.phSave();
    expect(ui.drafts['tpl-en'].order[0].roles).toEqual([{ id: 'r1', role: 'moderator', label: '', color: 'yellow', pos: '' }, { id: 'r2', role: 'other', label: 'Usher', color: 'yellow', pos: '' }]);
    expect($$('.ph-line')[0].textContent).toContain('Usher');
  });

  it('saving the template keeps the placeholders', async () => {
    ui.layout = null; ui.tab = 'templates'; render();
    await H.tSave({ dataset: { tid: 'tpl-en' } }); await flush();
    const saved = calls.find(c => c.table === 'templates' && c.op === 'upsert').payload;
    expect(saved.items[2].roles).toEqual([{ id: 'r1', role: 'pastor', color: 'blue' }, { id: 'r2', role: 'interpreter', color: 'white' }, { id: 'r3', role: 'other', color: 'purple', label: 'Reader' }]);
    expect(saved.items[1].roles).toEqual([{ id: 'r1', role: 'choir', color: 'blue', pos: 'pchoir' }]);
  });
});
