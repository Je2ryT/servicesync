// Migration 009: report functions run with the caller's own access; schedules are for admins.
import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, as, admin, seedChurch, JERRY, ANNA, STRANGER } from './harness.js';

let db;
const sundays = n => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(2026, 9, 25)); d.setUTCDate(d.getUTCDate() - 7 * i); return d.toISOString().slice(0, 10); });   // Oct 25 and back
beforeAll(async () => {
  db = await freshDb(); await seedChurch(db);
  await admin(db, `insert into members (id, name, category_id, phone, email, created_by) values
    ('reg', 'Regular Rita', 'congregation', '704-555-0101', 'rita@x.com', 'import'),
    ('gone', 'Gone Gary', 'congregation', '704-555-0102', null, 'import'),
    ('new', 'New Nina', 'visitors', null, null, 'import'),
    ('rare', 'Rare Ray', 'congregation', null, null, 'import')`);
  const s = sundays(20); const att = [];
  s.forEach((d, i) => { att.push(`('reg','${d}','en')`); if (i >= 6 && i < 16) att.push(`('gone','${d}','fr')`); });
  att.push(`('new','${s[0]}','en')`, `('rare','${s[12]}','en')`);
  await admin(db, `insert into attendance (member_id, date, svc) values ${att.join(',')}`);
  await admin(db, `insert into person_notes (member_id, body, author, created_at) values ('reg', 'Prayed with Rita', 'anna@montcarmel.org', '2026-10-20'), ('gone', 'Moved?', 'anna@montcarmel.org', '2026-03-01')`);
  await db.exec(`insert into teams (id, name) values ('t-av', 'Media'); insert into positions (id, team_id, name) values ('p-snd', 't-av', 'Sound');
    insert into assignments (sunday_id, svc, position_id, person_id, status) values ('2026-11-01', 'en', 'p-snd', 'anna', 'confirmed'), ('2026-11-08', 'fr', 'p-snd', 'anna', 'declined'), ('2026-11-01', 'fr', 'p-snd', 'jerry', 'awaiting')`);
}, 60000);

describe('reports (009)', () => {
  it('absentees: came regularly, then stopped', async () => {
    const r = await as(db, ANNA, `select member_id, last_date::text, visits from report_absentees(4, 3, 26, '2026-10-26')`);
    expect(r).toEqual([{ member_id: 'gone', last_date: sundays(20)[6], visits: 10 }]);   // Rita still comes; Ray came once; Nina is new
    expect((await as(db, ANNA, `select count(*)::int n from report_absentees(4, 1, 26, '2026-10-26')`))[0].n).toBe(2);   // with a lower bar, Ray too
  });

  it('attendance by date, service and category, with first visits', async () => {
    const r = await as(db, ANNA, `select date::text, svc, category_id, people, first_time from report_attendance('2026-10-25', '2026-10-25')`);
    expect(r).toEqual([{ date: '2026-10-25', svc: 'en', category_id: 'congregation', people: 1, first_time: 0 }, { date: '2026-10-25', svc: 'en', category_id: 'visitors', people: 1, first_time: 1 }]);
    expect((await as(db, ANNA, `select count(*)::int n from report_person_attendance('reg', '2026-01-01', '2026-12-31')`))[0].n).toBe(20);
  });

  it('people with no notes for a while (or ever)', async () => {
    const r = await as(db, ANNA, `select member_id, notes from report_no_notes(90, '2026-10-26')`);
    expect(r.map(x => x.member_id).filter(id => ['reg', 'gone', 'new', 'rare'].includes(id))).toEqual(['new', 'rare', 'gone']);   // never noted first, then the oldest note
  });

  it('people activity and category history', async () => {
    await as(db, JERRY, `update members set category_id = 'congregation' where id = 'new'`, [], { keep: true });
    const today = (await admin(db, `select current_date::text d`))[0].d;
    const act = await as(db, ANNA, `select kind, member_id, detail, by_whom from report_people_activity($1, $1) where member_id = 'new'`, [today]);
    expect(act.find(a => a.kind === 'category')).toEqual({ kind: 'category', member_id: 'new', detail: 'visitors → congregation', by_whom: JERRY });
    expect((await as(db, ANNA, `select to_category from report_category_history($1, $1)`, [today])).map(x => x.to_category)).toContain('congregation');
  });

  it('volunteer positions (team members only count published Sundays)', async () => {
    const mine = await as(db, ANNA, `select person_id, scheduled from report_volunteers('2026-11-01', '2026-11-30') where person_id = 'anna'`);
    expect(mine).toEqual([{ person_id: 'anna', scheduled: 1 }]);   // Nov 8 isn't published yet
    const r = await as(db, JERRY, `select person_id, team, position_name, scheduled, confirmed, declined from report_volunteers('2026-11-01', '2026-11-30')`);
    expect(r).toEqual([
      { person_id: 'anna', team: 'Media', position_name: 'Sound', scheduled: 2, confirmed: 1, declined: 1 },
      { person_id: 'jerry', team: 'Media', position_name: 'Sound', scheduled: 1, confirmed: 0, declined: 0 },
    ]);
  });

  it('texts and unsubscribes follow the message rules: coordinators see their own texts, only admins see opt-outs', async () => {
    await db.exec(`insert into messages (id, idempotency_key, sender_email, sender_name, channel, body, recipients) values
      ('00000000-0000-0000-0000-000000000001', 'k1', 'anna@montcarmel.org', 'Anna', 'sms', 'See you Sunday', 1),
      ('00000000-0000-0000-0000-000000000002', 'k2', 'jerry@montcarmel.org', 'Jerry', 'sms', 'Board meeting', 1);
      insert into message_recipients (message_id, member_id, name, channel, address, status) values
      ('00000000-0000-0000-0000-000000000001', 'reg', 'Regular Rita', 'sms', '+17045550101', 'delivered'),
      ('00000000-0000-0000-0000-000000000002', 'gone', 'Gone Gary', 'sms', '+17045550102', 'sent');
      insert into optout_events (member_id, channel, action, source) values ('gone', 'sms', 'out', 'sms-reply')`);
    const today = (await admin(db, `select current_date::text d`))[0].d;
    expect((await as(db, JERRY, `select body from report_sms_log($1, $1)`, [today])).length).toBe(2);
    expect((await as(db, ANNA, `select body from report_sms_log($1, $1)`, [today])).map(r => r.body)).toEqual(['See you Sunday']);
    expect((await as(db, JERRY, `select name, action from report_unsubscribes($1, $1)`, [today]))).toEqual([{ name: 'Gone Gary', action: 'out' }]);
    expect((await as(db, ANNA, `select count(*)::int n from report_unsubscribes($1, $1)`, [today]))[0].n).toBe(0);
  });

  it('strangers get empty reports', async () => {
    for (const q of [`report_absentees(4, 1, 26, '2026-10-26')`, `report_attendance('2026-01-01', '2026-12-31')`, `report_no_notes(0)`, `report_volunteers('2026-01-01', '2026-12-31')`])
      expect((await as(db, STRANGER, `select count(*)::int n from ${q}`))[0].n, q).toBe(0);
  });

  it('only admins manage scheduled report emails', async () => {
    const r = await as(db, JERRY, `insert into report_schedules (report, params, recipients) values ('absentees', '{"weeks":4}', '{jerry@montcarmel.org}') returning created_by`, [], { keep: true });
    expect(r[0].created_by).toBe(JERRY);
    await expect(as(db, ANNA, `insert into report_schedules (report, recipients) values ('absentees', '{anna@montcarmel.org}')`)).rejects.toThrow(/row-level security/);
    expect((await as(db, ANNA, `select count(*)::int n from report_schedules`))[0].n).toBe(0);
    await expect(as(db, JERRY, `insert into report_schedules (report, recipients) values ('giving', '{jerry@montcarmel.org}')`)).rejects.toThrow(/check constraint/);
  });
});

describe('weekly report emails (009)', () => {
  it('sends each schedule on its weekday, once, with the CSV attached', async () => {
    const { scheduledReports } = await import('../../server/cron.js');
    const mail = [];
    const fetch = async (url, o) => { mail.push({ url, key: o.headers['Idempotency-Key'], body: JSON.parse(o.body) }); return { ok: true, status: 200, json: async () => ({ id: 're-1' }) }; };
    const env = { RESEND_API_KEY: 're', MAIL_FROM: 'Mont Carmel <x@y.org>', APP_URL: 'https://s.test' };
    const dbi = { q: async (t, p) => (await db.query(t, p)).rows };
    await admin(db, `delete from report_schedules`);
    await admin(db, `insert into report_schedules (id, report, params, recipients, weekday, lang) values
      ('rs-abs', 'absentees', '{"weeks":4,"min":3}', '{jerry@montcarmel.org,anna@montcarmel.org}', 1, 'fr'),
      ('rs-tue', 'volunteers', '{"range":"12w"}', '{jerry@montcarmel.org}', 2, 'en')`);
    const monday = new Date('2026-10-26T12:00:00Z');
    const r = await scheduledReports({ db: dbi, env, fetch, now: monday });
    expect(r).toMatchObject({ reports: 1, sent: 1 });
    expect(mail[0].url).toBe('https://api.resend.com/emails');
    const m = mail[0].body;
    expect(m.to).toEqual([JERRY, ANNA]); expect(m.subject).toBe('Absents · 1 ligne');
    expect(m.html).toContain('Gone Gary'); expect(m.html).toContain('Dernière présence');
    const csv = Buffer.from(m.attachments[0].content, 'base64').toString('utf8');
    expect(m.attachments[0].filename).toBe('servicesync-absentees-2026-10-26.csv');
    expect(csv).toContain('Gone Gary,Assemblée,704-555-0102');
    expect((await scheduledReports({ db: dbi, env, fetch, now: monday })).reports).toBe(0);   // already sent today
    expect(mail.length).toBe(1);
    expect((await admin(db, `select last_sent::text from report_schedules where id = 'rs-abs'`))[0].last_sent).toBe('2026-10-26');
    expect((await admin(db, `select source ->> 'kind' k, status from messages where idempotency_key = 'report-rs-abs-2026-10-26'`))[0]).toEqual({ k: 'report', status: 'sent' });
  });
});
