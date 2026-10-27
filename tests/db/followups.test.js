// Migration 008: newcomer follow-up flows.
import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, as, admin, seedChurch, JERRY, ANNA, STRANGER } from './harness.js';

let db;
const entry = async m => (await admin(db, `select e.*, s.title from flow_entries e left join flow_steps s on s.id = e.step_id where e.member_id = $1 and e.flow_id = 'newcomer' order by e.created_at desc limit 1`, [m]))[0];
beforeAll(async () => { db = await freshDb(); await seedChurch(db); await admin(db, `update flow_steps set default_assignee = 'anna' where id = 'nc-call'`); }, 60000);

describe('follow-up flows (008)', () => {
  it('starts with a Newcomer flow of four steps', async () => {
    expect((await admin(db, `select title, due_days from flow_steps where flow_id = 'newcomer' order by sort`)).map(s => s.title + '/' + s.due_days))
      .toEqual(['Welcome text/1', 'Phone call/3', 'Second visit/7', 'Connect to a group/14']);
  });

  it('a new Visitor joins the Newcomer flow, with a due date and a note', async () => {
    await as(db, ANNA, `insert into members (id, first_name, last_name, category_id) values ('v1', 'Grace', 'Lumbu', 'visitors')`, [], { keep: true });
    const e = await entry('v1');
    expect(e).toMatchObject({ status: 'active', title: 'Welcome text', created_by: ANNA });
    expect(e.due_date.toISOString().slice(0, 10)).toBe((await admin(db, `select (current_date + 1)::text d`))[0].d);
    expect((await admin(db, `select body, author from person_notes where member_id = 'v1'`))[0]).toEqual({ body: 'Added to the Newcomer follow-up.', author: ANNA });
  });

  it('moving someone into Visitors adds them; other categories and imports do not', async () => {
    await admin(db, `insert into members (id, name, category_id) values ('c1', 'Paul Mbala', 'congregation'), ('i1', 'Old Visitor', 'visitors')`);
    await admin(db, `update members set created_by = 'import' where id = 'i1'`);
    await admin(db, `insert into members (id, name, category_id, created_by) values ('i2', 'Imported Visitor', 'visitors', 'import')`);
    expect(await entry('c1')).toBeUndefined(); expect(await entry('i2')).toBeUndefined();
    await as(db, JERRY, `update members set category_id = 'visitors' where id = 'c1'`, [], { keep: true });
    expect((await entry('c1')).status).toBe('active');
  });

  it('never two active entries for the same person', async () => {
    await as(db, JERRY, `select flow_enroll('v1', 'newcomer')`, [], { keep: true });
    await as(db, JERRY, `update members set category_id = 'congregation' where id = 'v1'`, [], { keep: true });
    await as(db, JERRY, `update members set category_id = 'visitors' where id = 'v1'`, [], { keep: true });
    expect((await admin(db, `select count(*)::int n from flow_entries where member_id = 'v1' and status = 'active'`))[0].n).toBe(1);
  });

  it('check-in can add any new person to the flow', async () => {
    await admin(db, `insert into members (id, name, category_id) values ('n1', 'Daniel Okafor', 'congregation')`);
    const id = (await as(db, ANNA, `select flow_enroll('n1') id`, [], { keep: true }))[0].id;
    expect(id).toMatch(/^fe-/);
  });

  it('marking a step done notes it on the timeline and moves on, picking up the step’s default person', async () => {
    const e = await entry('v1');
    const r = (await as(db, JERRY, `select * from flow_advance($1, 'Sent a welcome text')`, [e.id], { keep: true }))[0];
    expect(r).toMatchObject({ status: 'active', assignee: 'anna' });
    expect((await entry('v1')).title).toBe('Phone call');
    expect((await admin(db, `select body, author from person_notes where member_id = 'v1' and body like '✓%'`))).toEqual([{ body: '✓ Welcome text: Sent a welcome text', author: JERRY }]);
  });

  it('the last step finishes the follow-up', async () => {
    const e = await entry('v1');
    for (let i = 0; i < 3; i++) await as(db, ANNA, `select flow_advance($1)`, [e.id], { keep: true });
    const done = (await admin(db, `select status, step_id, completed_at from flow_entries where id = $1`, [e.id]))[0];
    expect(done.status).toBe('done'); expect(done.step_id).toBeNull(); expect(done.completed_at).not.toBeNull();
    await expect(as(db, ANNA, `select flow_advance($1)`, [e.id])).rejects.toThrow(/already finished/);
    expect((await admin(db, `select body from person_notes where member_id = 'v1' and body like 'Finished%'`)).length).toBe(1);
  });

  it('access: the serving team works the board; only admins change flows or delete; strangers see nothing', async () => {
    expect((await as(db, ANNA, `select count(*)::int n from flow_entries`))[0].n).toBeGreaterThan(0);
    const e = await entry('c1');
    expect((await as(db, ANNA, `update flow_entries set assignee = 'jerry', notes = 'Lives near Jerry' where id = $1 returning id`, [e.id])).length).toBe(1);
    expect((await as(db, ANNA, `delete from flow_entries where id = $1 returning id`, [e.id])).length).toBe(0);
    await expect(as(db, ANNA, `insert into flow_steps (flow_id, title) values ('newcomer', 'x')`)).rejects.toThrow(/row-level security/);
    await expect(as(db, ANNA, `insert into flow_entries (flow_id, member_id) values ('newcomer', 'i1')`)).rejects.toThrow(/row-level security/);
    expect((await as(db, JERRY, `insert into flow_steps (flow_id, title, sort) values ('newcomer', 'Pastor visit', 9) returning title`))[0].title).toBe('Pastor visit');
    for (const t of ['flows', 'flow_steps', 'flow_entries']) expect((await as(db, STRANGER, `select count(*)::int n from ${t}`))[0].n, t).toBe(0);
    await expect(as(db, STRANGER, `select flow_enroll('i1')`)).rejects.toThrow(/serving team/);
    await expect(as(db, STRANGER, `select flow_advance($1)`, [e.id])).rejects.toThrow(/serving team/);
  });
});

describe('weekly follow-up reminder (008)', () => {
  it('emails each person their due and overdue follow-ups once a week', async () => {
    const { followupReminders } = await import('../../server/cron.js');
    const sentMail = [];
    const fetch = async (url, o) => { const list = JSON.parse(o.body); sentMail.push({ key: o.headers['Idempotency-Key'], list }); return { ok: true, status: 200, json: async () => ({ data: list.map((_, i) => ({ id: 're-' + i })) }) }; };
    const env = { RESEND_API_KEY: 're', MAIL_FROM: 'Mont Carmel <x@y.org>', APP_URL: 'https://s.test' };
    const dbi = { q: async (t, p) => (await db.query(t, p)).rows };
    await admin(db, `update flow_entries set assignee = 'anna', due_date = current_date - 2 where member_id = 'c1' and status = 'active'`);
    await admin(db, `update flow_entries set assignee = 'anna', due_date = current_date + 30 where member_id = 'n1' and status = 'active'`);   // not due yet
    const r = await followupReminders({ db: dbi, env, fetch });
    expect(r).toMatchObject({ people: 1, sent: 1 });
    expect(sentMail[0].list[0].to).toEqual([ANNA]); expect(sentMail[0].list[0].text).toContain('Paul Mbala'); expect(sentMail[0].list[0].text).toContain('overdue');
    expect(sentMail[0].list[0].text).not.toContain('Daniel Okafor');
    const again = await followupReminders({ db: dbi, env, fetch });
    expect(again).toMatchObject({ sent: 0, skipped: 1 }); expect(sentMail.length).toBe(1);
    expect((await admin(db, `select sender_name, status, source ->> 'kind' k from messages where idempotency_key like 'followups-%'`))[0]).toEqual({ sender_name: 'ServiceSync', status: 'sent', k: 'followup-reminder' });
  });
});
