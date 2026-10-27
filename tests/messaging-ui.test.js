// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const posted = [];
vi.mock('../src/data.js', () => {
  const c = { select: () => c, single: () => c, eq: () => c, in: () => c, order: () => c, limit: () => c, then: (ok, bad) => Promise.resolve({ data: [], error: null }).then(ok, bad) };
  const sb = { from: () => ({ upsert: () => c, insert: () => c, update: () => c, delete: () => c, select: () => c }), rpc: () => Promise.resolve({ data: null, error: null }) };
  let fail = 0;
  return {
    sb, q: async p => { const { data, error } = await p; return error ? null : data ?? true; },
    reload: () => {}, loadAll: async () => {}, saveSun: async () => true, ensureSun: async () => true, timerAction: async () => true,
    whenLoaded: () => {}, subscribe: () => {}, syncClock: async () => {}, saveReport: async () => true, loadActivity: async () => {}, loadProfile: async () => {},
    loadMessages: async () => {}, loadRecipients: async () => {},
    sendMessage: async p => { posted.push(p); if (globalThis.__failOnce && !fail++) return { ok: false, error: 'No connection.' }; return { ok: true, body: { id: 'm1', status: 'sent', sent: 2, failed: 0, skipped: 1, recipients: 2 } }; },
  };
});

const { setState, setNow, me, ui } = await import('../src/state.js');
const { render } = await import('../src/render.js');
const { H } = await import('../src/actions.js');
const { sourceIds, audience, teamOf } = await import('../src/compose.js');
const { smsInfo, toE164, merge, replyIntent } = await import('../src/sms.js');

const M = (id, o) => [id, { name: [o.first, o.last].join(' '), first: o.first, last: o.last, phone: '', email: '', lang: 'fr', active: true, categoryId: 'congregation', smsOptOut: false, emailOptOut: false, coordinatorId: null, familyId: null, ...o }];
function seed(admin = true) {
  setNow(new Date(2026, 10, 1, 10));
  setState({
    people: { anna: { name: 'Anna Mukendi', email: 'anna@x.com' }, sam: { name: 'Samuel Kasongo', email: 'sam@x.com' }, ruth: { name: 'Ruth Mwamba', email: 'ruth@x.com' } },
    teams: { tw: { name: 'Worship', sort: 0 }, tu: { name: 'Ushers', sort: 1 } },
    pos: { lead: { team: 'tw', name: 'Worship leader', active: true }, sing: { team: 'tw', name: 'Singer', active: true }, ush: { team: 'tu', name: 'Usher', active: true } },
    quals: { anna: { lead: true }, sam: { sing: true }, ruth: { ush: true } },
    sun: { '2026-11-01': { date: '2026-11-01', published: true, services: { en: {}, fr: {} } } },
    asg: { a1: { sunId: '2026-11-01', svc: 'fr', pos: 'lead', person: 'anna', status: 'confirmed' }, a2: { sunId: '2026-11-01', svc: 'fr', pos: 'ush', person: 'ruth', status: 'confirmed' } },
    swap: {}, off: {}, chk: {}, tpl: {}, cfg: {}, timers: {}, events: {}, reports: {}, att: {}, cats: {}, families: {}, mstats: {}, filters: {},
    members: Object.fromEntries([
      M('ma', { first: 'Anna', last: 'Mukendi', coordinatorId: 'anna', phone: '704-555-0101', email: 'anna@x.com' }),
      M('ms', { first: 'Samuel', last: 'Kasongo', coordinatorId: 'sam', phone: '7045550102', smsOptOut: true, email: 'sam@x.com' }),
      M('mr', { first: 'Ruth', last: 'Mwamba', coordinatorId: 'ruth', phone: '' , email: 'ruth@x.com', emailOptOut: true }),
      M('m1', { first: 'Josué', last: 'Kabila', phone: '+33 6 12 34 56 78', email: 'bad' }),
    ]),
  });
  me.admin = admin; me.email = admin ? 'boss@x.com' : 'anna@x.com';
  Object.assign(ui, { session: { user: {} }, ready: true, needsMigration: false, timerMissing: false, membersMissing: false, reportsMissing: false, peopleMissing: false, stage: null, tab: 'roster', psub: 'all', pf: {}, psel: [], person: null, prof: null, lang: 'en', compose: null, msgs: null });
  posted.length = 0;
}
const $ = s => document.querySelector(s);
const flush = () => new Promise(r => setTimeout(r, 0));

describe('text messages', () => {
  it('counts segments like a phone does', () => {
    expect(smsInfo('')).toMatchObject({ segments: 0 });
    expect(smsInfo('a'.repeat(160))).toMatchObject({ encoding: 'GSM', segments: 1 });
    expect(smsInfo('a'.repeat(161))).toMatchObject({ segments: 2, perSegment: 153 });
    expect(smsInfo('Café à 10h, merci!')).toMatchObject({ encoding: 'GSM', segments: 1 });         // é and à fit in a standard text
    expect(smsInfo('Fête de Noël 🎄')).toMatchObject({ encoding: 'Unicode', perSegment: 70 });       // ê and emoji don't
    expect(smsInfo('€'.repeat(80))).toMatchObject({ encoding: 'GSM', length: 160, segments: 1 });     // € counts double
  });
  it('formats phone numbers and fills names', () => {
    expect(['704-555-0101', '1 (704) 555 0101', '+33 6 12 34 56 78', '0033612345678', '555-0101', ''].map(toE164)).toEqual(['+17045550101', '+17045550101', '+33612345678', '+33612345678', null, null]);
    expect(merge('Hi {first_name}! {FIRST_NAME}', { first_name: 'Josué' })).toBe('Hi Josué! Josué');
    expect(merge('Hi {first_name}', { name: 'Grace Lumbu' })).toBe('Hi Grace');
  });
  it('understands STOP and START replies in English and French', () => {
    expect(['STOP', 'stop.', 'Arrêt', 'unsubscribe', 'START', 'thanks'].map(replyIntent)).toEqual(['out', 'out', 'out', 'out', 'in', null]);
  });
});

describe('who a message reaches', () => {
  beforeEach(() => seed());
  it('resolves selections, filters, services, teams and people', () => {
    expect(sourceIds({ kind: 'service', sunId: '2026-11-01', svc: 'fr' }).sort()).toEqual(['ma', 'mr']);
    expect(sourceIds({ kind: 'team', teamId: 'tw' }).sort()).toEqual(['ma', 'ms']);
    expect(sourceIds({ kind: 'person', id: 'm1' })).toEqual(['m1']);
    expect(sourceIds({ kind: 'filter', filters: { q: 'kabila' } })).toEqual(['m1']);
  });
  it('splits recipients and explains who is skipped', () => {
    const a = audience(['ma', 'ms', 'mr', 'm1'], 'both');
    expect(a.sms.map(m => m.id)).toEqual(['ma', 'm1']); expect(a.email.map(m => m.id)).toEqual(['ma', 'ms']);
    expect(Object.fromEntries(Object.entries(a.skip).map(([k, v]) => [k, v.map(m => m.id)]))).toEqual({ optSms: ['ms'], noPhone: ['mr'], optEmail: ['mr'], noEmail: ['m1'] });
    expect(a.reachable).toBe(3);
  });
  it('coordinators reach only their own team', () => {
    seed(false);
    expect([...teamOf('anna')].sort()).toEqual(['ma', 'ms']);
    const a = audience(['ma', 'ms', 'mr', 'm1'], 'sms');
    expect(a.people.map(m => m.id)).toEqual(['ma', 'ms']); expect(a.outside).toBe(2);
  });
});

describe('the composer', () => {
  beforeEach(() => { document.body.innerHTML = '<nav id="tabs"></nav><div id="who"></div><main id="main"></main><div id="overlay"></div>'; seed(); globalThis.__failOnce = false; });

  it('writes, reviews and sends once with one request key', async () => {
    render(); ui.psel = ['ma', 'm1', 'ms']; render();
    H.contact($('#pBulk [data-act="contact"]'));
    expect($('.modal h2').textContent).toContain('New message');
    const body = $('#cmpBody'); body.value = 'Bonjour {first_name}, '; H.cmpBody(body); H.cmpMerge();
    expect(ui.compose.body).toBe('Bonjour {first_name}, {first_name}');
    expect($('#cmpCount').textContent).toMatch(/1 text segment/);
    expect($('.cmp-skip').textContent).toContain('Opted out of texts (1): Samuel Kasongo');
    H.cmpReview(); expect($('.cmp-confirm').textContent).toContain('Send to 2 people: 2 texts and 0 emails.');
    expect($('.cmp-confirm blockquote').textContent).toBe('Bonjour Anna, Anna');
    await H.cmpSend(); await flush();
    expect(posted.length).toBe(1); expect(posted[0]).toMatchObject({ channel: 'sms', body: 'Bonjour {first_name}, {first_name}', recipients: ['ma', 'm1', 'ms'], source: { kind: 'selection' } });
    expect($('.cmp-done').textContent).toContain('2 sent · 0 failed · 1 skipped');
  });

  it('a failed send can be retried with the same key', async () => {
    globalThis.__failOnce = true; render(); H.contact({ dataset: { src: 'person', id: 'ma', label: 'Anna' } });
    const b = $('#cmpBody'); b.value = 'Hi'; H.cmpBody(b); H.cmpReview(); await H.cmpSend(); await flush();
    expect($('.imp-err').textContent).toContain('No connection'); expect($('[data-act="cmpSend"]').textContent).toBe('Try again');
    await H.cmpSend(); await flush();
    expect(posted.length).toBe(2); expect(posted[0].key).toBe(posted[1].key);
  });

  it('email needs a subject; switching channel keeps the message', () => {
    render(); H.contact({ dataset: { src: 'team', team: 'tw', label: 'Worship' } });
    const b = $('#cmpBody'); b.value = 'Rehearsal at 6'; H.cmpBody(b);
    const r = $('[data-act="cmpChannel"][value="email"]'); r.checked = true; H.cmpChannel(r);
    expect($('#cmpBody').value).toBe('Rehearsal at 6'); expect($('#cmpCount').textContent).toBe('');
    H.cmpReview(); expect(ui.compose.step).toBe('edit');
    const s = $('#cmpSubject'); s.value = 'Choir'; H.cmpSubject(s); H.cmpReview(); expect(ui.compose.step).toBe('confirm');
  });

  it('Contact buttons appear on people, profiles, teams and the Live screen', () => {
    render(); expect($('[data-act="contact"][data-src="filter"]')).not.toBeNull();
    ui.person = 'm1'; ui.prof = { id: 'm1', notes: [], history: [], att: [] }; render(); expect($('[data-act="contact"][data-src="person"]')).not.toBeNull();
    ui.person = null; ui.psub = 'teams'; render(); expect(document.querySelectorAll('[data-act="contact"][data-src="team"]').length).toBe(2);
    ui.tab = 'live'; ui.liveIdx = 0; ui.liveSvc = 'fr'; render(); expect($('[data-act="contact"][data-src="service"]')).not.toBeNull();
  });

  it('works in French', () => {
    ui.lang = 'fr'; render(); H.contact({ dataset: { src: 'person', id: 'ma', label: 'Anna' } });
    expect($('.modal h2').textContent).toContain('Nouveau message'); expect($('.chips').textContent).toContain('Courriel'); ui.lang = 'en';
  });
});

describe('sent messages page', () => {
  it('lists messages and opens one with its recipients', () => {
    document.body.innerHTML = '<nav id="tabs"></nav><div id="who"></div><main id="main"></main><div id="overlay"></div>'; seed();
    ui.tab = 'reports'; ui.rsub = 'messages';
    ui.msgs = { loaded: true, loading: false, error: '', open: null, recips: null, rows: [{ id: 'm1', at: Date.UTC(2026, 10, 1, 15), sender: 'boss@x.com', senderName: 'Jerry', channel: 'both', subject: 'Choir <b>', body: 'x', status: 'partial', recipients: 3, sent: 2, failed: 1, skipped: 0 }] };
    render(); expect($('.msg-it b').textContent).toBe('Choir <b>'); expect($('.msg-it').textContent).toContain('Partly sent');
    ui.msgs.open = 'm1'; ui.msgs.recips = [{ name: 'Josué', channel: 'sms', address: '+33612345678', status: 'failed', reason: 'carrier error 30005' }];
    render(); expect($('.msg-rec').textContent).toContain('carrier error 30005');
  });
});
