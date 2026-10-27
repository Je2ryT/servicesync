// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseCsv, detectColumns, planImport, langFrom, statusFrom } from '../src/importer.js';

const calls = [];
vi.mock('../src/data.js', () => {
  const chain = (table, op, payload) => {
    calls.push({ table, op, payload });
    const c = { select: () => c, single: () => c, eq: () => c, in: () => c, then: (ok, bad) => Promise.resolve({ data: null, error: null }).then(ok, bad) };
    return c;
  };
  const sb = { from: t => ({ upsert: p => chain(t, 'upsert', p), insert: p => chain(t, 'insert', p), update: p => chain(t, 'update', p), delete: () => chain(t, 'delete') }), rpc: () => Promise.resolve({ data: null, error: null }) };
  return { sb, q: async p => { const { data, error } = await p; return error ? null : data ?? true; }, reload: () => {}, loadAll: async () => {}, saveSun: async () => true, ensureSun: async () => true, timerAction: async () => true, whenLoaded: () => {}, subscribe: () => {}, syncClock: async () => {} };
});

/* Shaped like an Elvanto People → Export → CSV file, with the awkward bits real files have. */
const ELVANTO = '﻿"First Name","Preferred Name","Last Name","Email","Mobile","Home Phone","Family","Category"\r\n'
  + '"Josué","","Kabila","josue@example.com","(704) 555-0101","","Kabila Family","Member"\r\n'
  + '"Béatrice","Bea","Ilunga","","","704-555-0102","","Regular Attender"\r\n'
  + '"Anna","","Mukendi","ANNA@montcarmel.org","","","","Member"\r\n'
  + '"","","","nobody@example.com","","","",""\r\n'
  + '"Paul ""PJ""","","Mbala, Jr.","pj@example.com","","","","Visitor"\r\n'
  + '"Josué","","Kabila","josue@example.com","","","","Member"\r\n';

describe('reading an Elvanto export', () => {
  it('parses quotes, commas inside quotes and Windows line ends', () => {
    const rows = parseCsv(ELVANTO);
    expect(rows.length).toBe(7);
    expect(rows[0][0]).toBe('First Name');                   // byte-order mark removed
    expect(rows[5][0]).toBe('Paul "PJ"'); expect(rows[5][2]).toBe('Mbala, Jr.');
  });
  it('reads semicolon files from European Excel', () => {
    expect(parseCsv('Nom;Prénom;Courriel\nKabila;Josué;j@x.com')).toEqual([['Nom', 'Prénom', 'Courriel'], ['Kabila', 'Josué', 'j@x.com']]);
  });
  it('finds the columns by name, in English or French', () => {
    expect(detectColumns(parseCsv(ELVANTO)[0])).toEqual({ first: 0, preferred: 1, last: 2, email: 3, mobile: 4, phone: 5, household: 6, category: 7 });
    expect(detectColumns(['Nom', 'Prénom', 'Courriel', 'Téléphone'])).toEqual({ last: 0, first: 1, email: 2, phone: 3 });
  });
  it('maps categories and languages', () => {
    expect(['Member', 'Regular Attender', 'Visitor', 'New Comer', 'Staff'].map(statusFrom)).toEqual(['member', 'regular', 'visitor', 'newcomer', null]);
    expect(['French', 'Français', 'English', 'English, French', 'Spanish'].map(langFrom)).toEqual(['fr', 'fr', 'en', 'both', null]);
  });
  it('plans the import: new people in, duplicates and blank names out', () => {
    const rows = parseCsv(ELVANTO); const map = detectColumns(rows[0]);
    const p = planImport(rows.slice(1), map, { lang: 'fr', status: 'member' }, [{ name: 'Anna M.', email: 'anna@montcarmel.org', phone: '' }]);
    expect(p.add.map(m => m.name)).toEqual(['Josué Kabila', 'Bea Ilunga', 'Paul "PJ" Mbala, Jr.']);
    expect(p.add[0]).toMatchObject({ name: 'Josué Kabila', first_name: 'Josué', last_name: 'Kabila', email: 'josue@example.com', phone: '(704) 555-0101', household: 'Kabila Family', status: 'member', category_id: 'congregation', lang: 'fr' });
    expect(p.add[1]).toMatchObject({ phone: '704-555-0102', status: 'regular', email: null });
    expect(p.add[2].status).toBe('visitor');
    expect(p.dup.map(d => [d.name, d.why])).toEqual([['Anna Mukendi', 'same email'], ['Josué Kabila', 'same email']]);
    expect(p.skip).toEqual([{ line: 5, why: 'No name' }]);
  });
});

describe('the import window', () => {
  let S, ui, me, H;
  const $ = s => document.querySelector(s);
  const flush = () => new Promise(r => setTimeout(r, 0));
  beforeEach(async () => {
    ({ S, ui, me } = await import('../src/state.js')); ({ H } = await import('../src/actions.js'));
    const { setState, setNow } = await import('../src/state.js');
    document.body.innerHTML = '<nav id="tabs"></nav><div id="who"></div><main id="main"></main><div id="overlay"></div>';
    setNow(new Date(2026, 10, 1, 10));
    setState({ people: {}, teams: {}, pos: {}, quals: {}, sun: {}, asg: {}, swap: {}, off: {}, chk: {}, tpl: {}, cfg: {}, timers: {}, events: {}, att: {}, members: { x: { name: 'Anna Mukendi', email: 'anna@montcarmel.org', phone: '', active: true } } });
    me.admin = true; me.email = 'boss@x.com'; ui.imp = null; calls.length = 0;
  });
  const pick = async (name, text) => {
    const input = $('[data-act="impFile"]');
    Object.defineProperty(input, 'files', { value: [new File([text], name, { type: 'text/csv' })], configurable: true });
    await H.impFile(input); await flush();
  };

  it('previews the file and imports only the new people', async () => {
    H.impOpen(); expect($('.imp-steps')).not.toBeNull();
    await pick('people.csv', ELVANTO);
    expect($('.imp-sum').textContent).toMatch(/3 to add.*2 ALREADY HERE.*1 without a name/);
    expect($('.imp-prev tbody tr td').textContent).toContain('Josué Kabila');
    await H.impRun($('[data-act="impRun"]')); await flush();
    const ins = calls.find(c => c.table === 'members' && c.op === 'insert');
    expect(ins.payload.map(m => m.name)).toEqual(['Josué Kabila', 'Bea Ilunga', 'Paul "PJ" Mbala, Jr.']);
    expect($('#overlay').innerHTML).toBe('');
  });

  it('lets you pick the name column when it is not recognised', async () => {
    H.impOpen(); await pick('odd.csv', 'Who,Cell\nJosué Kabila,704 555 0101\n');
    expect($('.imp-cols').open).toBe(true); expect($('[data-act="impRun"]').disabled).toBe(true);
    const sel = $('[data-act="impMap"][data-k="full"]'); sel.value = '0'; H.impMap(sel);
    expect($('.imp-sum').textContent).toContain('1 to add');
  });

  it('explains what to do with an Excel file', async () => {
    H.impOpen(); await pick('people.xlsx', 'binary');
    expect($('.imp-err').textContent).toContain('choose CSV');
  });
});
