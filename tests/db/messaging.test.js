// Phase 2: /api/send, Twilio webhooks and unsubscribe, run against a local Postgres with stand-in Twilio/Resend.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { freshDb, as, admin, seedChurch, JERRY, ANNA, STRANGER } from './harness.js';
import { handleSend, LIMITS } from '../../server/send.js';
import { handleInbound, handleSmsStatus, handleUnsubscribe } from '../../server/hooks.js';
import { sign } from '../../server/lib.js';

const ENV = { TWILIO_SID: 'AC1', TWILIO_TOKEN: 'tw-secret', TWILIO_FROM: '+17045550000', RESEND_API_KEY: 're_1', MAIL_FROM: 'Mont Carmel <hello@montcarmel.org>', UNSUBSCRIBE_SECRET: 'unsub-secret', APP_URL: 'https://servicesync.test', SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon' };
const TOKENS = { 'tok-jerry': JERRY, 'tok-anna': ANNA, 'tok-stranger': STRANGER };

let db, sent;
const fakeFetch = (fail = {}) => async (url, opts = {}) => {
  const ok = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
  if (url.endsWith('/auth/v1/user')) { const e = TOKENS[String(opts.headers.Authorization).replace('Bearer ', '')]; return e ? ok({ email: e }) : ok({}, 401); }
  if (url.includes('api.twilio.com')) {
    const f = new URLSearchParams(opts.body); sent.sms.push({ to: f.get('To'), body: f.get('Body'), cb: f.get('StatusCallback') });
    return fail.sms?.(f.get('To')) ? ok({ message: 'Invalid number', code: 21211 }, 400) : ok({ sid: 'SM' + sent.sms.length });
  }
  if (url.includes('api.resend.com')) { const list = JSON.parse(opts.body); sent.email.push({ key: opts.headers['Idempotency-Key'], list }); return ok({ data: list.map((_, i) => ({ id: 're-' + sent.email.length + '-' + i })) }); }
  throw new Error('unexpected fetch ' + url);
};
const deps = (fail) => ({ db: { q: async (t, p) => (await db.query(t, p)).rows }, env: ENV, fetch: fakeFetch(fail) });
const send = (token, input, fail) => handleSend({ token, input }, deps(fail));
const key = () => 'k-' + crypto.randomUUID();
const twilioSig = (url, params) => crypto.createHmac('sha1', ENV.TWILIO_TOKEN).update(url + Object.keys(params).sort().map(k => k + params[k]).join('')).digest('base64');

beforeAll(async () => {
  db = await freshDb(); await seedChurch(db);
  await db.exec(`
    insert into coordinators (id, name, email, lang_en, lang_fr, active, max_per_month) values ('sam', 'Samuel Kasongo', 'sam@x.com', true, true, true, 4), ('ruth', 'Ruth Mwamba', 'ruth@x.com', true, true, true, 4);
    insert into teams (id, name) values ('tw', 'Worship'), ('tu', 'Ushers');
    insert into positions (id, team_id, name) values ('lead', 'tw', 'Worship leader'), ('sing', 'tw', 'Singer'), ('ush', 'tu', 'Usher');
    insert into person_positions (person_id, position_id) values ('anna', 'lead'), ('sam', 'sing'), ('ruth', 'ush');
    update members set phone = '(704) 555-0101' where coordinator_id = 'sam';
    insert into members (id, first_name, last_name, phone, email, lang, sms_opt_out, email_opt_out) values
      ('p1', 'Josué', 'Kabila', '704-555-0102', 'josue@x.com', 'fr', false, false),
      ('p2', 'Grace', 'Lumbu', '7045550103', 'grace@x.com', 'en', true, false),
      ('p3', 'Prince', 'Mbala', null, 'not-an-email', 'fr', false, false),
      ('p4', 'Esther', 'Ngoy', '12', null, 'fr', false, true);
  `);
}, 60000);
beforeEach(async () => { sent = { sms: [], email: [] }; await admin(db, `delete from messages`); });

describe('sending (007)', () => {
  it('admins send email + SMS; opted-out and unreachable people are skipped and recorded', async () => {
    const r = await send('tok-jerry', { key: key(), channel: 'both', subject: 'Bonjour {first_name}', body: 'Hi {first_name}, see you Sunday!', recipients: ['p1', 'p2', 'p3', 'p4'], source: { kind: 'selection' } });
    expect(r.body).toMatchObject({ status: 'sent', recipients: 4, sent: 3, failed: 0, skipped: 5 });
    expect(sent.sms).toEqual([{ to: '+17045550102', body: 'Hi Josué, see you Sunday!', cb: 'https://servicesync.test/api/twilio-status' }]);
    expect(sent.email.length).toBe(1); const mails = sent.email[0].list;
    expect(mails.map(m => m.to[0])).toEqual(['josue@x.com', 'grace@x.com']);
    expect(mails[0].subject).toBe('Bonjour Josué');
    expect(mails[0].from).toBe(ENV.MAIL_FROM);
    expect(mails[0].headers['List-Unsubscribe']).toMatch(/^<https:\/\/servicesync\.test\/api\/unsubscribe\?m=p1&s=[\w-]{32}>$/);
    expect(mails[0].html).toContain('Se désabonner'); expect(mails[1].html).toContain('Unsubscribe from these emails');
    const why = await admin(db, `select member_id, channel, status, reason from message_recipients where status = 'skipped' order by member_id, channel`);
    expect(why.map(w => [w.member_id, w.channel, w.reason])).toEqual([
      ['p2', 'sms', 'opted out of texts'], ['p3', 'email', 'email not valid'], ['p3', 'sms', 'no phone'], ['p4', 'email', 'opted out of emails'], ['p4', 'sms', 'phone number not valid']]);
  });

  it('a retried request never sends twice, even two at once', async () => {
    const k = key(); const input = { key: k, channel: 'sms', body: 'Choir at 6', recipients: ['p1', 'sam-member'] };
    input.recipients = ['p1', (await admin(db, `select id from members where coordinator_id = 'sam'`))[0].id];
    const [a, b] = await Promise.all([send('tok-jerry', input), send('tok-jerry', input)]);
    expect(sent.sms.length).toBe(2);
    const again = await send('tok-jerry', input);
    expect(again.body).toMatchObject({ duplicate: true, sent: 2 }); expect(sent.sms.length).toBe(2);
    expect([a.body.id, b.body.id, again.body.id].every(id => id === a.body.id)).toBe(true);
  });

  it('coordinators can message their own team only', async () => {
    const samM = (await admin(db, `select id from members where coordinator_id = 'sam'`))[0].id;
    const ruthM = (await admin(db, `select id from members where coordinator_id = 'ruth'`))[0].id;
    await expect(send('tok-anna', { key: key(), channel: 'sms', body: 'x', recipients: [samM, ruthM] })).rejects.toMatchObject({ status: 403, outside: [ruthM] });
    await expect(send('tok-anna', { key: key(), channel: 'sms', body: 'x', recipients: ['p1'] })).rejects.toMatchObject({ status: 403 });
    const ok = await send('tok-anna', { key: key(), channel: 'sms', body: 'Rehearsal moved to 7', recipients: [samM] });
    expect(ok.body.sent).toBe(1); expect(sent.sms[0].to).toBe('+17045550101');
  });

  it('strangers and bad sign-ins are refused', async () => {
    await expect(send('tok-stranger', { key: key(), channel: 'sms', body: 'x', recipients: ['p1'] })).rejects.toMatchObject({ status: 403 });
    await expect(send('nope', { key: key(), channel: 'sms', body: 'x', recipients: ['p1'] })).rejects.toMatchObject({ status: 401 });
    await expect(send('', {})).rejects.toMatchObject({ status: 401 });
    expect(sent.sms.length).toBe(0);
  });

  it('checks the request', async () => {
    await expect(send('tok-jerry', { key: 'short', channel: 'sms', body: 'x', recipients: ['p1'] })).rejects.toMatchObject({ status: 400 });
    await expect(send('tok-jerry', { key: key(), channel: 'email', body: 'x', recipients: ['p1'] })).rejects.toThrow(/subject/);
    await expect(send('tok-jerry', { key: key(), channel: 'sms', body: ' ', recipients: ['p1'] })).rejects.toThrow(/Write a message/);
    await expect(send('tok-jerry', { key: key(), channel: 'sms', body: 'x', recipients: Array.from({ length: LIMITS.maxRecipients + 1 }, (_, i) => 'x' + i) })).rejects.toMatchObject({ status: 400 });
  });

  it('rate-limits each sender', async () => {
    for (let i = 0; i < LIMITS.perWindow; i++) await send('tok-jerry', { key: key(), channel: 'sms', body: 'x', recipients: ['p1'] });
    await expect(send('tok-jerry', { key: key(), channel: 'sms', body: 'x', recipients: ['p1'] })).rejects.toMatchObject({ status: 429 });
  });

  it('records failures from Twilio and marks the message partial', async () => {
    const samM = (await admin(db, `select id from members where coordinator_id = 'sam'`))[0].id;
    const r = await send('tok-jerry', { key: key(), channel: 'sms', body: 'x', recipients: ['p1', samM] }, { sms: to => to === '+17045550102' });
    expect(r.body).toMatchObject({ status: 'partial', sent: 1, failed: 1 });
    expect((await admin(db, `select reason from message_recipients where status = 'failed'`))[0].reason).toBe('Invalid number');
  });
});

describe('Twilio webhooks and unsubscribe (007)', () => {
  it('STOP opts a person out of texts; START opts them back in; forged requests are refused', async () => {
    const url = 'https://servicesync.test/api/twilio-inbound';
    const stop = { From: '+17045550102', Body: 'Stop', MessageSid: 'SMx' };
    await expect(handleInbound({ url, params: stop, signature: 'forged' }, deps())).rejects.toMatchObject({ status: 403 });
    expect((await handleInbound({ url, params: stop, signature: twilioSig(url, stop) }, deps())).updated).toBe(1);
    expect((await admin(db, `select sms_opt_out from members where id = 'p1'`))[0].sms_opt_out).toBe(true);
    const start = { ...stop, Body: 'START' };
    await handleInbound({ url, params: start, signature: twilioSig(url, start) }, deps());
    expect((await admin(db, `select sms_opt_out from members where id = 'p1'`))[0].sms_opt_out).toBe(false);
    expect((await admin(db, `select action, source from optout_events where member_id = 'p1' order by id`)).map(e => e.action + '/' + e.source)).toEqual(['out/sms-reply', 'in/sms-reply']);
  });

  it('delivery updates mark texts delivered or failed', async () => {
    const r = await send('tok-jerry', { key: key(), channel: 'sms', body: 'x', recipients: ['p1'] });
    const sid = (await admin(db, `select provider_id from message_recipients where message_id = $1`, [r.body.id]))[0].provider_id;
    const url = 'https://servicesync.test/api/twilio-status'; const p = { MessageSid: sid, MessageStatus: 'undelivered', ErrorCode: '30005' };
    await handleSmsStatus({ url, params: p, signature: twilioSig(url, p) }, deps());
    expect((await admin(db, `select status, reason from message_recipients where message_id = $1`, [r.body.id]))[0]).toEqual({ status: 'failed', reason: 'carrier error 30005' });
    expect((await admin(db, `select status from messages where id = $1`, [r.body.id]))[0].status).toBe('failed');
  });

  it('the unsubscribe link asks first, then records the opt-out', async () => {
    const s = sign('email:p1', ENV);
    expect((await handleUnsubscribe({ method: 'GET', memberId: 'p1', sig: 'bad' }, deps())).status).toBe(400);
    const get = await handleUnsubscribe({ method: 'GET', memberId: 'p1', sig: s }, deps());
    expect(get.html).toContain('<form method="post">'); expect(get.html).toContain('Josué');
    expect((await admin(db, `select email_opt_out from members where id = 'p1'`))[0].email_opt_out).toBe(false);
    await handleUnsubscribe({ method: 'POST', memberId: 'p1', sig: s }, deps());
    expect((await admin(db, `select email_opt_out from members where id = 'p1'`))[0].email_opt_out).toBe(true);
    expect((await admin(db, `select source from optout_events where member_id = 'p1' and channel = 'email'`))[0].source).toBe('email-link');
  });
});

describe('who can read messages (007)', () => {
  it('admins read all; coordinators only their own; nobody writes from the app', async () => {
    const samM = (await admin(db, `select id from members where coordinator_id = 'sam'`))[0].id;
    await send('tok-jerry', { key: key(), channel: 'sms', body: 'from jerry', recipients: ['p1'] });
    await send('tok-anna', { key: key(), channel: 'sms', body: 'from anna', recipients: [samM] });
    expect((await as(db, JERRY, `select count(*)::int n from messages`))[0].n).toBe(2);
    expect((await as(db, ANNA, `select body from messages`)).map(r => r.body)).toEqual(['from anna']);
    expect((await as(db, ANNA, `select count(*)::int n from message_recipients`))[0].n).toBe(1);
    expect((await as(db, STRANGER, `select count(*)::int n from messages`))[0].n).toBe(0);
    await expect(as(db, JERRY, `insert into messages (idempotency_key, sender_email, channel, body) values ('x', 'x', 'sms', 'x')`)).rejects.toThrow(/row-level security/);
    expect((await as(db, ANNA, `select count(*)::int n from optout_events`))[0].n).toBe(0);
  });
  it('an admin changing an opt-out in the app is recorded', async () => {
    await as(db, JERRY, `update members set sms_opt_out = true where id = 'p3'`, [], { keep: true });
    expect((await admin(db, `select action, source, detail from optout_events where member_id = 'p3'`))[0]).toEqual({ action: 'out', source: 'admin', detail: JERRY });
  });
});
