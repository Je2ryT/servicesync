// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const calls = [];
vi.mock('../src/data.js', () => {
  const chain = (table, op, payload) => {
    calls.push({ table, op, payload });
    const one = payload && !Array.isArray(payload) ? { id: payload.id || 'new-' + table } : null;
    const many = Array.isArray(payload) ? payload.map((p, i) => ({ id: 'new-' + table + '-' + i, ...p })) : null;
    const res = { data: op === 'delete' ? null : (many || one), error: null };
    const c = { select: () => c, single: () => c, eq: () => c, in: () => c, then: (ok, bad) => Promise.resolve(res).then(ok, bad) };
    return c;
  };
  const sb = { from: t => ({ upsert: p => chain(t, 'upsert', p), insert: p => chain(t, 'insert', p), update: p => chain(t, 'update', p), delete: () => chain(t, 'delete') }), rpc: () => Promise.resolve({ data: null, error: null }) };
  return {
    sb, q: async p => { const { data, error } = await p; return error ? null : data ?? true; },
    reload: () => {}, loadAll: async () => {}, saveSun: async () => true, ensureSun: async () => true, timerAction: async () => true,
    whenLoaded: () => {}, subscribe: () => {}, syncClock: async () => {}, saveReport: async () => true, loadActivity: async () => {},
    loadProfile: async () => {},
  };
});

const { setState, setNow, me, ui, S } = await import('../src/state.js');
const { render } = await import('../src/render.js');
const { H } = await import('../src/actions.js');
const P = await import('../src/people.js');
const I = await import('../src/importer.js');
const { t, keys } = await import('../src/i18n.js');

const NOW = new Date(2026, 10, 1, 10, 0);
const M = (id, o) => [id, { name: [o.first, o.last].filter(Boolean).join(' '), first: '', last: '', phone: '', email: '', lang: 'fr', status: 'member', household: '', notes: '', active: true, createdAt: 0, gender: '', birthday: '', address: '', familyId: null, familyRole: '', categoryId: 'congregation', smsOptOut: false, emailOptOut: false, coordinatorId: null, ...o }];
function seed({ admin = true } = {}) {
  setNow(NOW);
  setState({
    people: { anna: { name: 'Anna Mukendi', email: 'anna@x.com', langs: { en: true, fr: true }, active: true, max: 4 } },
    teams: { tc: { name: 'Coordination', sort: 0 } }, pos: { coord: { team: 'tc', name: 'Coordinator', min: 1, pref: 1, active: true } }, quals: { anna: { coord: true } },
    sun: { '2026-11-08': { date: '2026-11-08', published: true, services: { en: {}, fr: {} } } },
    asg: { a1: { sunId: '2026-11-08', svc: 'fr', pos: 'coord', person: 'anna', status: 'awaiting' } },
    swap: {}, off: {}, chk: {}, tpl: {}, cfg: {}, timers: {}, events: {}, reports: {}, att: {},
    members: Object.fromEntries([
      M('m1', { first: 'Josué', last: 'Kabila', phone: '(704) 555-0101', email: 'josue@x.com', familyId: 'f1', familyRole: 'adult', birthday: '1985-11-02', gender: 'male' }),
      M('m2', { first: 'Ruth', last: 'Kabila', familyId: 'f1', familyRole: 'child', birthday: '2014-03-09', lang: 'en' }),
      M('m3', { first: 'Grace', last: 'Lumbu', categoryId: 'visitors', email: 'grace@x.com', lang: 'both' }),
      M('m4', { first: 'Anna', last: 'Mukendi', categoryId: 'volunteers', coordinatorId: 'anna', email: 'anna@x.com' }),
      M('m5', { first: 'Old', last: 'Friend', active: false }),
      M('m6', { first: 'Pre', last: 'Six', categoryId: null, status: 'newcomer' }),
    ]),
    cats: Object.fromEntries(Object.entries(P.DEFAULT_CATS)), families: { f1: { name: 'Kabila Family', address: '' } },
    mstats: { m1: { first: '2025-01-05', last: '2026-11-01', visits: 40, en: 0, fr: 40 }, m3: { first: '2026-10-25', last: '2026-10-25', visits: 1, en: 1, fr: 0 }, m2: { first: '2025-06-01', last: '2026-08-02', visits: 9, en: 9, fr: 0 } },
    filters: { s1: { name: 'Visitors', filters: { cat: 'visitors' }, owner: 'boss@x.com', shared: true }, s2: { name: 'Private', filters: {}, owner: 'other@x.com', shared: false } },
  });
  me.admin = admin; me.email = admin ? 'boss@x.com' : 'anna@x.com'; me.name = '';
  Object.assign(ui, { session: { user: {} }, ready: true, needsMigration: false, timerMissing: false, membersMissing: false, reportsMissing: false, peopleMissing: false, stage: null, tab: 'roster', psub: 'all', pf: {}, psel: [], person: null, prof: null, lang: 'en' });
  calls.length = 0;
}
const $ = s => document.querySelector(s); const $$ = s => [...document.querySelectorAll(s)];
const flush = () => new Promise(r => setTimeout(r, 0));
const shell = () => { document.body.innerHTML = '<nav id="tabs"></nav><div id="who"></div><main id="main"></main><div id="overlay"></div>'; };
const ids = list => list.map(m => m.id);

describe('directory rules', () => {
  beforeEach(() => seed());
  it('lists active people by last name', () => { expect(ids(P.everyone())).toEqual(['m1', 'm2', 'm3', 'm4', 'm6']); });
  it('filters by search, category, language, service, last attended, phone and email', () => {
    expect(ids(P.filterPeople({ q: 'josu' }))).toEqual(['m1']);
    expect(ids(P.filterPeople({ q: 'KABILA' }))).toEqual(['m1', 'm2']);
    expect(ids(P.filterPeople({ q: '0101' }))).toEqual(['m1']);
    expect(ids(P.filterPeople({ cat: 'visitors' }))).toEqual(['m3', 'm6']);            // m6 has no category yet: worked out from its status
    expect(ids(P.filterPeople({ lang: 'en' }))).toEqual(['m2', 'm3']);
    expect(ids(P.filterPeople({ lang: 'both' }))).toEqual(['m3']);
    expect(ids(P.filterPeople({ svc: 'fr' }))).toEqual(['m1']);
    expect(ids(P.filterPeople({ last: 'within2w' }))).toEqual(['m1', 'm3']);
    expect(ids(P.filterPeople({ last: 'notIn1m' }))).toEqual(['m2', 'm4', 'm6']);
    expect(ids(P.filterPeople({ last: 'never' }))).toEqual(['m4', 'm6']);
    expect(ids(P.filterPeople({ phone: 'yes' }))).toEqual(['m1']);
    expect(ids(P.filterPeople({ email: 'no', cat: 'congregation' }))).toEqual(['m2']);
  });
  it('ages, families and saved filters', () => {
    expect(P.ageOn('1985-11-02')).toBe(40); expect(P.ageOn('1985-11-01')).toBe(41); expect(P.ageOn('')).toBeNull();
    expect(ids(P.familyOf('m1'))).toEqual(['m1', 'm2']);
    expect(P.savedFilters('boss@x.com').map(f => f.id)).toEqual(['s1']);
    expect(P.savedFilters('other@x.com').map(f => f.id)).toEqual(['s2', 's1']);
  });
  it('exports CSV that Excel opens safely and ServiceSync re-imports', () => {
    S.members.m3.address = '=HYPERLINK("x")'; S.members.m3.phone = '+1 704 555 0199';
    const csv = P.toCsv(P.filterPeople({ cat: 'visitors' }));
    const rows = I.parseCsv(csv);
    expect(rows[0].slice(0, 4)).toEqual(['First Name', 'Last Name', 'Email', 'Mobile']);
    expect(rows[1].slice(0, 4)).toEqual(['Grace', 'Lumbu', 'grace@x.com', '+1 704 555 0199']);   // phone numbers left alone
    expect(rows[1][6]).toBe(`'=HYPERLINK("x")`);                                                // formulas neutralised
    expect(I.detectColumns(rows[0])).toMatchObject({ first: 0, last: 1, email: 2, mobile: 3, gender: 4, birthday: 5, address: 6, household: 7, familyRole: 8, category: 9, language: 10 });
  });
});

describe('importer: new fields (006)', () => {
  it('reads birthdays in the common formats', () => {
    expect(['1990-04-23', '04/23/1990', '23/04/1990', '4/5/1990', '23 Apr 1990', 'April 23, 1990', '23 avr. 1990', '02/30/1990', 'soon'].map(I.dateFrom))
      .toEqual(['1990-04-23', '1990-04-23', '1990-04-23', '1990-04-05', '1990-04-23', '1990-04-23', '1990-04-23', null, null]);
  });
  it('reads gender, family role and category (English or French names)', () => {
    expect(['Male', 'F', 'Femme', 'x'].map(I.genderFrom)).toEqual(['male', 'female', 'female', null]);
    expect(['Primary Contact', 'Spouse', 'Child', 'Fille', ''].map(I.familyRoleFrom)).toEqual(['adult', 'adult', 'child', 'child', null]);
    const c = P.cats(true);
    expect(['Congregation', 'visiteurs', 'Guest Speaker', 'Visitor', 'Choir'].map(v => I.categoryFrom(v, c))).toEqual(['congregation', 'visitors', 'guest-speakers', 'visitors', null]);
  });
  it('fills first/last name, address, family and category, and creates families once', () => {
    const csv = 'First Name,Last Name,Gender,Birthday,Street,City,State,Zip,Family,Family Relationship,Category\n'
      + 'Paul,Mbala,Male,1980-02-01,1 Main St,Charlotte,NC,28202,Mbala Family,Primary Contact,New Believers\n'
      + 'Léa,Mbala,F,03/04/2012,,,,,MBALA family,Child,\n'
      + 'Zoe,,,,,,,,Kabila Family,,Guest Speakers\n';
    const rows = I.parseCsv(csv); const map = I.detectColumns(rows[0]);
    const p = I.planImport(rows.slice(1), map, { cat: 'online', categories: P.cats(true) }, []);
    expect(p.add[0]).toMatchObject({ first_name: 'Paul', last_name: 'Mbala', gender: 'male', birthday: '1980-02-01', address: '1 Main St, Charlotte, NC 28202', family_role: 'adult', category_id: 'new-believers' });
    expect(p.add[1]).toMatchObject({ first_name: 'Léa', birthday: '2012-03-04', family_role: 'child', category_id: 'online' });
    expect(I.newFamilies(p.add, [{ name: 'Kabila Family' }])).toEqual(['Mbala Family']);
    expect(I.memberRows(p.add, false)[0]).toEqual({ name: 'Paul Mbala', email: null, phone: null, household: 'Mbala Family', status: 'member', lang: 'fr' });
    expect(I.memberRows(p.add, true)[0]).not.toHaveProperty('status');
  });
});

describe('French', () => {
  it('every new label has a French version', () => {
    const missing = keys('en').filter(k => !keys('fr').includes(k));
    expect(missing).toEqual([]);
  });
  it('fills placeholders', () => { ui.lang = 'fr'; expect(t('visits', { n: 3 })).toBe('3 présences'); ui.lang = 'en'; expect(t('visits', { n: 3 })).toBe('3 visits'); });
});

describe('People screens', () => {
  beforeEach(() => { shell(); seed(); });

  it('Everyone is the first sub-tab, in English and French', () => {
    render();
    expect($('.seg [aria-pressed="true"]').dataset.v).toBe('all');
    expect($$('.pr').length).toBe(5);
    expect($('main h1').textContent).toBe('People');
    H.setLang({ dataset: { v: 'fr' } });
    expect($('main h1').textContent).toBe('Personnes');
    expect($('.pr .pill.cat').textContent).toBe('Assemblée');
    H.setLang({ dataset: { v: 'en' } });
  });

  it('filters, selects all shown and sets a category in bulk', async () => {
    render();
    const sel = $('[data-act="pf"][data-k="cat"]'); sel.value = 'congregation'; H.pf(sel);
    expect($$('.pr').length).toBe(2);
    H.pSelAll(); expect(ui.psel).toEqual(['m1', 'm2']); expect($('#pBulk').textContent).toContain('2 selected');
    const bulk = $('[data-act="pBulkCat"]'); bulk.value = 'online'; await H.pBulkCat(bulk); await flush();
    expect(calls[0]).toMatchObject({ table: 'members', op: 'update', payload: { category_id: 'online' } });
    expect(ui.psel).toEqual([]);
  });

  it('coordinators see the list but no bulk category or edit buttons', () => {
    seed({ admin: false }); render();
    expect($$('.pr').length).toBe(5); expect($('[data-act="catEdit"]')).toBeNull();
    H.pSelAll(); expect($('[data-act="pBulkCat"]')).toBeNull(); expect($('[data-act="pExport"]')).not.toBeNull();
  });

  it('exports the selection as a CSV download', () => {
    render(); const made = [];
    globalThis.URL.createObjectURL = b => { made.push(b); return 'blob:x'; }; globalThis.URL.revokeObjectURL = () => {};
    ui.psel = ['m3']; H.pExport();
    expect(made.length).toBe(1); expect(made[0].type).toContain('text/csv');
  });

  it('saves and loads a filter', async () => {
    render(); ui.pf = { cat: 'visitors', lang: 'both' };
    H.pfSave(); $('#sfName').value = 'Bilingual visitors'; await H.pfSaveGo(); await flush();
    expect(calls[0]).toMatchObject({ table: 'saved_filters', op: 'insert', payload: { name: 'Bilingual visitors', filters: { cat: 'visitors', lang: 'both' }, shared: true } });
    ui.pf = {}; H.pfLoad({ value: 's1' }); expect(ui.pf).toEqual({ cat: 'visitors' });
  });

  it('a profile shows details, family, serving, notes, attendance and category history', () => {
    ui.person = 'm1'; ui.prof = { id: 'm1', loaded: true, notes: [{ id: 'n1', body: 'Leads the <b>prayer</b> group', author: 'anna@x.com', at: 0 }], history: [{ from: 'visitors', to: 'congregation', by: 'anna@x.com', at: 0, note: '' }], att: [{ date: '2026-11-01', svc: 'fr' }] };
    render();
    expect($('main h1').textContent).toBe('Josué Kabila');
    expect($('.kv').textContent).toContain('40 years old');
    expect($('.fam-p b').textContent).toBe('Ruth Kabila');
    expect($('.notes p').textContent).toBe('Leads the <b>prayer</b> group');
    expect($('.notes .note-h b').textContent).toBe('Anna Mukendi');
    expect($('.hist').textContent).toContain('Visitors → Congregation');
    expect($$('.att-strip i.on').length).toBe(1);
  });

  it('a serving-team member’s profile shows positions and upcoming Sundays', () => {
    ui.person = 'm4'; ui.prof = { id: 'm4', loaded: true, notes: [], history: [], att: [] }; render();
    expect($('.up').textContent).toMatch(/Coordinator/); expect($('.up .pill').textContent).toBe('Awaiting reply');
  });

  it('adds a person in a new family', async () => {
    render(); H.personEdit({ dataset: {} });
    $('#pFirst').value = ' Paul '; $('#pLast').value = 'Mbala'; $('#pBirthday').value = '1980-02-01';
    $('#pCat').value = 'new-believers'; $('#pRole').value = 'adult';
    const fam = $('#pFam'); fam.value = '__new'; H.pFamPick(fam); $('#pFamNew').value = 'Mbala Family';
    await H.personSave({ dataset: { id: '' } }); await flush();
    expect(calls[0]).toMatchObject({ table: 'families', op: 'insert', payload: { name: 'Mbala Family' } });
    expect(calls[1]).toMatchObject({ table: 'members', op: 'insert', payload: { first_name: 'Paul', last_name: 'Mbala', name: 'Paul Mbala', birthday: '1980-02-01', category_id: 'new-believers', family_id: 'new-families', family_role: 'adult' } });
    expect(ui.person).toBe('new-members');
  });

  it('writes a note', async () => {
    ui.person = 'm1'; ui.prof = { id: 'm1', notes: [], history: [], att: [] }; seed({ admin: false }); ui.person = 'm1'; ui.prof = { id: 'm1', notes: [], history: [], att: [] }; render();
    $('#noteNew').value = 'Called; visiting Sunday'; await H.noteAdd({ dataset: { id: 'm1' }, disabled: false }); await flush();
    expect(calls[0]).toMatchObject({ table: 'person_notes', op: 'insert', payload: { member_id: 'm1', body: 'Called; visiting Sunday' } });
  });

  it('admins rename, reorder, hide and add categories', async () => {
    render(); H.catEdit();
    const rows = $$('.cat-row'); expect(rows.length).toBe(7);
    rows[2].querySelector('[data-f="name"]').value = 'First-time guests';
    rows[3].querySelector('[data-f="hidden"]').checked = true;
    H.catMove({ dataset: { i: '2' } });
    $('#catNew').value = 'Choir'; H.catAdd();
    await H.catSave(); await flush();
    const up = calls.find(c => c.op === 'upsert').payload; const ins = calls.find(c => c.op === 'insert').payload;
    expect(up.slice(0, 3).map(c => [c.id, c.name, c.sort])).toEqual([['congregation', 'Congregation', 0], ['visitors', 'First-time guests', 1], ['volunteers', 'Volunteers', 2]]);
    expect(up.find(c => c.id === 'community').active).toBe(false);
    expect(ins).toEqual([{ name: 'Choir', name_fr: null, sort: 7, active: true }]);
  });

  it('shows the database update message before migration 006', () => {
    ui.peopleMissing = true; render();
    expect($('main').textContent).toContain('006-people.sql');
    ui.psub = 'people'; render(); expect($('main').textContent).not.toContain('006-people.sql');   // the serving team still works
  });
});
