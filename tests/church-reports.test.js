// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const calls = []; let rpcData = {}; let rpcError = null;
vi.mock('../src/data.js', () => {
  const chain = (table, op, payload) => { calls.push({ table, op, payload }); const c = { select: () => c, order: () => c, eq: () => c, then: (ok, bad) => Promise.resolve({ data: op === 'select' ? [] : null, error: null }).then(ok, bad) }; return c; };
  const sb = { from: t => ({ insert: p => chain(t, 'insert', p), update: p => chain(t, 'update', p), delete: () => chain(t, 'delete'), select: () => chain(t, 'select') }), rpc: (n, a) => { calls.push({ rpc: n, args: a }); return Promise.resolve({ data: { id: 'x' }, error: null }); } };
  return {
    sb, q: async p => { const { data, error } = await p; return error ? null : data ?? true; },
    reload: () => {}, loadAll: async () => {}, saveSun: async () => true, ensureSun: async () => true, timerAction: async () => true,
    whenLoaded: () => {}, subscribe: () => {}, syncClock: async () => {}, saveReport: async () => true, loadActivity: async () => {}, loadProfile: async () => {},
    loadMessages: async () => {}, loadRecipients: async () => {}, sendMessage: async () => ({ ok: true, body: {} }),
    runReport: async (key, rpc, args) => { const { ui } = await import('../src/state.js'); calls.push({ report: rpc, args }); ui.rpt.cache[key] = rpcError ? { error: rpcError.message, missing: rpcError.missing } : { rows: rpcData[rpc] || [] }; },
    loadSchedules: async () => { const { ui } = await import('../src/state.js'); Object.assign(ui.rpt.sched, { loaded: true, rows: [{ id: 'rs-1', report: 'absentees', recipients: ['jerry@x.com'], weekday: 1, active: true, last_sent: null }] }); },
  };
});

const { setState, setNow, me, ui } = await import('../src/state.js');
const { render } = await import('../src/render.js');
const { H } = await import('../src/actions.js');
const R = await import('../src/reportdefs.js');
const V = await import('../src/views/rpt.js');

function seed(admin = true) {
  setNow(new Date(2026, 9, 26, 10));   // Mon Oct 26 2026
  setState({
    people: { jerry: { name: 'Jerry Kibombo', email: 'jerry@x.com', active: true }, anna: { name: 'Anna Mukendi', email: 'anna@x.com', active: true } },
    teams: {}, pos: {}, quals: {}, sun: {}, asg: {}, swap: {}, off: {}, chk: {}, tpl: {}, cfg: {}, timers: {}, events: {}, reports: {}, att: {}, families: {}, mstats: {}, filters: {}, steps: {}, fentries: {},
    cats: { congregation: { name: 'Congregation', nameFr: 'Assemblée', sort: 0 }, visitors: { name: 'Visitors', nameFr: 'Visiteurs', sort: 2 } },
    members: { g: { name: 'Gone Gary', phone: '704-555-0102', email: 'g@x.com', active: true, categoryId: 'congregation', lang: 'fr' }, r: { name: 'Rare Ray', phone: '704-555-0103', active: true, categoryId: 'congregation', lang: 'en' } },
    flows: { newcomer: { name: 'Newcomer', nameFr: 'Nouveaux venus', active: true } },
  });
  me.admin = admin; me.email = admin ? 'jerry@x.com' : 'anna@x.com';
  Object.assign(ui, { session: { user: {} }, ready: true, needsMigration: false, timerMissing: false, membersMissing: false, reportsMissing: false, peopleMissing: false, flowsMissing: false, stage: null, tab: 'reports', rsub: 'church', lang: 'en', person: null });
  ui.rpt = { open: null, params: {}, cache: {}, sel: [], sched: { rows: [], loaded: false, loading: false, missing: false } };
  calls.length = 0; rpcError = null;
  rpcData = {
    report_absentees: [{ member_id: 'g', name: 'Gone Gary', category_id: 'congregation', phone: '704-555-0102', email: 'g@x.com', last_date: '2026-08-30', visits: 10 }, { member_id: 'r', name: 'Rare Ray', category_id: 'congregation', phone: '704-555-0103', email: null, last_date: '2026-07-26', visits: 3 }],
    report_attendance: [
      { date: '2026-10-18', svc: 'en', category_id: 'congregation', people: 40, first_time: 0 }, { date: '2026-10-18', svc: 'fr', category_id: 'congregation', people: 60, first_time: 0 },
      { date: '2026-10-25', svc: 'en', category_id: 'congregation', people: 50, first_time: 0 }, { date: '2026-10-25', svc: 'en', category_id: 'visitors', people: 4, first_time: 3 }, { date: '2026-10-25', svc: 'fr', category_id: 'congregation', people: 70, first_time: 0 },
      { date: '2026-09-27', svc: 'ev', category_id: 'congregation', people: 30, first_time: 1 },
    ],
    report_volunteers: [{ person_id: 'anna', name: 'Anna Mukendi', team: 'Media', position_name: '=Sound', scheduled: 2, confirmed: 1, declined: 1, last_date: '2026-10-25' }],
    report_person_attendance: [{ date: '2026-10-25', svc: 'en' }, { date: '2026-10-11', svc: 'fr' }],
  };
}
const $ = s => document.querySelector(s); const $$ = s => [...document.querySelectorAll(s)];
const flush = () => new Promise(r => setTimeout(r, 0));
const open = async id => { H.rptOpen({ dataset: { id } }); await flush(); render(); };

describe('report rules', () => {
  it('date ranges end today', () => {
    expect(R.rangeOf('4w', '2026-10-26')).toEqual({ from: '2026-09-29', to: '2026-10-26' });
    expect(R.rangeOf('ytd', '2026-10-26')).toEqual({ from: '2026-01-01', to: '2026-10-26' });
    expect(R.rangeOf('nonsense', '2026-10-26').from).toBe('2026-08-04');   // falls back to 12 weeks
  });
  it('settings are kept in bounds before reaching the database', () => {
    expect(R.reportDef('absentees').args({ weeks: '-3', min: 'x' })).toEqual({ p_weeks: 1, p_min: 3 });
    expect(R.reportDef('no-notes').args({ days: 99999 })).toEqual({ p_days: 3650 });
    expect(R.reportDef('person').args({ member: 'g', range: '4w' }, '2026-10-26')).toEqual({ p_member: 'g', p_from: '2026-09-29', p_to: '2026-10-26' });
  });
  it('every report has columns in English and French; giving is not a report', () => {
    for (const r of R.REPORTS) for (const c of r.columns) { expect(c.label.en, r.id).toBeTruthy(); expect(c.label.fr, r.id).toBeTruthy(); }
    expect(R.REPORTS.map(r => r.id).join()).not.toMatch(/giv|don/);
  });
  it('CSV: header in the chosen language, names for categories, formulas defused, phone numbers kept', () => {
    seed();
    const csv = R.reportCsv(R.reportDef('volunteers'), rpcData.report_volunteers, { lang: 'fr' });
    expect(csv.split('\r\n')[0]).toBe('﻿Nom,Équipe,Poste,Programmé,Confirmé,Refusé,Dernier');
    expect(csv).toContain(`"'=Sound"`);
    const abs = R.reportCsv(R.reportDef('absentees'), rpcData.report_absentees, { lang: 'en', cat: id => ({ congregation: 'Congregation' }[id]) });
    expect(abs.split('\r\n')[1]).toBe('Gone Gary,Congregation,704-555-0102,g@x.com,2026-08-30,10');
  });
  it('attendance by date, month and category', () => {
    const rows = rpcData.report_attendance || []; seed();
    expect(R.attendanceByDate(rpcData.report_attendance).map(d => [d.date, d.en, d.fr, d.ev, d.total, d.first])).toEqual([['2026-09-27', 0, 0, 30, 30, 1], ['2026-10-18', 40, 60, 0, 100, 0], ['2026-10-25', 54, 70, 0, 124, 3]]);
    expect(R.attendanceByMonth(rpcData.report_attendance).map(m => [m.month, m.total, m.dates, m.avg])).toEqual([['2026-09', 30, 1, 30], ['2026-10', 224, 2, 112]]);
    expect(R.attendanceByCategory(rpcData.report_attendance)).toEqual([{ id: 'congregation', n: 250 }, { id: 'visitors', n: 4 }]);
    expect(R.summaryOf(R.reportDef('attendance'), rpcData.report_attendance, 'fr')).toBe('3 dates · 254 présences · 4 premières visites');
  });
  it('Sundays in a period, and checking email lists', () => {
    expect(V.sundaysBetween('2026-10-01', '2026-10-26')).toEqual(['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25']);
    expect(V.parseEmails('Jerry@x.com, anna@x.com\nnot-an-email; jerry@x.com')).toEqual({ ok: ['jerry@x.com', 'anna@x.com'], bad: ['not-an-email'] });
  });
});

describe('reports screen', () => {
  beforeEach(() => { document.body.innerHTML = '<nav id="tabs"></nav><div id="who"></div><main id="main"></main><div id="overlay"></div>'; seed(); });

  it('lists the reports by group, with weekly emails for admins', async () => {
    render(); await flush(); render();
    expect($$('.rpt-group h3').map(h => h.textContent)).toEqual(['Attendance', 'People', 'Serving', 'Messages']);
    expect($$('.rpt-item b').map(b => b.textContent)).toContain('Unsubscribes');
    expect($('.rpt-srow').textContent).toContain('Absentees');
    seed(false); render();
    expect($$('.rpt-item b').map(b => b.textContent)).not.toContain('Unsubscribes');
    expect($('.rpt-srow')).toBeNull();
  });

  it('attendance: chart, category bars and month table, in English and French', async () => {
    await open('attendance');
    expect(calls.find(c => c.report).args).toEqual({ p_from: '2026-08-04', p_to: '2026-10-26' });
    expect($$('.rep-stats b').map(b => b.textContent)).toEqual(['254', '85', '4', '3']);
    expect($$('.chart .col').length).toBe(3); expect($$('.legend span').map(s => s.textContent)).toEqual(['English', 'French', 'Special']);
    expect($$('.chart .col title')[2].textContent).toContain('Total 124');
    expect($$('.hbar span:first-child').map(s => s.textContent)).toEqual(['Congregation', 'Visitors']);
    H.setLang({ dataset: { v: 'fr' } });
    expect($('main h1').textContent).toBe('Présences'); expect($$('.hbar span:first-child')[0].textContent).toBe('Assemblée');
    H.setLang({ dataset: { v: 'en' } });
  });

  it('changing the period runs the report again', async () => {
    await open('attendance');
    H.rptParam({ dataset: { k: 'range' }, value: '4w' }); await flush();
    expect(calls.filter(c => c.report).pop().args).toEqual({ p_from: '2026-09-29', p_to: '2026-10-26' });
  });

  it('absentees: pick people, then message them or add them to a follow-up', async () => {
    await open('absentees');
    expect($$('.rpt-t tbody tr').length).toBe(2);
    H.rptSel({ dataset: { id: 'g' }, checked: true });
    expect($('.pbulk b').textContent).toBe('1 selected');
    H.contact({ dataset: { src: 'report', label: '1 selected' } });
    expect(ui.compose.ids).toEqual(['g']); H.closeModal?.();
    H.rptSelAll({ checked: true }); expect(ui.rpt.sel).toEqual(['g', 'r']);
    H.rptFlow(); document.getElementById('rptFlowId').value = 'newcomer';
    await H.rptFlowGo(); await flush();
    expect(calls.filter(c => c.rpc === 'flow_enroll').map(c => c.args)).toEqual([{ p_member: 'g', p_flow: 'newcomer' }, { p_member: 'r', p_flow: 'newcomer' }]);
    expect(ui.rpt.sel).toEqual([]);
  });

  it('one person’s attendance, Sunday by Sunday', async () => {
    await open('person');
    expect($('main .card.empty').textContent).toContain('Choose a person');
    H.rptParam({ dataset: { k: 'member' }, value: 'g' }); await flush(); render();
    expect($('.pill.info').textContent).toBe('Came 2 times in 52 Sundays'); expect($$('.pa.in').map(p => p.textContent)).toEqual(['FR', 'EN']);
  });

  it('downloads the CSV', async () => {
    await open('volunteers');
    let saved = null; const orig = URL.createObjectURL; URL.createObjectURL = b => { saved = b; return 'blob:x'; }; URL.revokeObjectURL = () => {};
    H.rptCsv(); URL.createObjectURL = orig;
    expect(await saved.text()).toContain('Anna Mukendi,Media');
  });

  it('admins set up a weekly email; addresses are checked first', async () => {
    await open('absentees');
    H.rschNew(); expect($('#rsTo').value).toBe('jerry@x.com');
    $('#rsTo').value = 'jerry@x.com, oops'; await H.rschSave({ dataset: { id: 'absentees' } });
    expect($('#rsErr').textContent).toContain('oops'); expect(calls.some(c => c.table === 'report_schedules')).toBe(false);
    $('#rsTo').value = 'jerry@x.com\nanna@x.com'; $('#rsDay').value = '3'; await H.rschSave({ dataset: { id: 'absentees' } }); await flush();
    expect(calls.find(c => c.table === 'report_schedules').payload).toEqual({ report: 'absentees', params: { weeks: 4, min: 3 }, recipients: ['jerry@x.com', 'anna@x.com'], weekday: 3, lang: 'en' });
    seed(false); ui.rpt.open = 'absentees'; render(); expect($$('[data-act="rschNew"]').length).toBe(0);
  });

  it('shows the database update message before migration 009', async () => {
    rpcError = { message: 'function report_absentees does not exist', missing: true };
    await open('absentees');
    expect($('main').textContent).toContain('009-reports.sql');
  });
});
