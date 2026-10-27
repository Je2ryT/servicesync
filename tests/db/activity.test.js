// Migration 005: the activity log is written by the database and readable by admins only.
import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, as, admin, seedChurch, JERRY, ANNA, STRANGER } from './harness.js';

let db;
beforeAll(async () => { db = await freshDb(); await seedChurch(db); await admin(db, 'delete from activity_log'); }, 60000);

describe('activity log (005)', () => {
  it('records who made a change, with the row before and after', async () => {
    await as(db, ANNA, `insert into members (id, name, status) values ('m-test', 'Grace Lumbu', 'newcomer')`, [], { keep: true });
    await as(db, JERRY, `update members set status = 'member' where id = 'm-test'`, [], { keep: true });
    const rows = await admin(db, `select actor, tbl, op, row_id, old ->> 'status' o, new ->> 'status' n from activity_log order by id`);
    expect(rows).toEqual([
      { actor: ANNA, tbl: 'members', op: 'insert', row_id: 'm-test', o: null, n: 'newcomer' },
      { actor: JERRY, tbl: 'members', op: 'update', row_id: 'm-test', o: 'newcomer', n: 'member' },
    ]);
  });
  it('skips saves that change nothing but a timestamp', async () => {
    const before = (await admin(db, 'select count(*)::int n from activity_log'))[0].n;
    await as(db, ANNA, `select save_report('2026-11-01','en','summary',null,'Good')`, [], { keep: true });
    await admin(db, `update service_reports set updated_at = now() + interval '1 minute' where sunday_id = '2026-11-01'`);
    const rows = await admin(db, `select op from activity_log where tbl = 'service_reports' order by id`);
    expect(rows.map(r => r.op)).toEqual(['insert', 'update']);   // the report row is created, then the summary saved; the timestamp-only update is ignored
    expect((await admin(db, 'select count(*)::int n from activity_log'))[0].n).toBe(before + 2);
  });
  it('a key for rows without an id', async () => {
    await as(db, ANNA, `insert into attendance (member_id, date, svc) values ('m-test', '2026-11-01', 'en')`, [], { keep: true });
    expect((await admin(db, `select row_id from activity_log where tbl = 'attendance'`))[0].row_id).toBe('m-test|en|2026-11-01');
  });
  it('only administrators can read it', async () => {
    expect((await as(db, JERRY, 'select count(*)::int n from activity_log'))[0].n).toBeGreaterThan(0);
    expect((await as(db, ANNA, 'select count(*)::int n from activity_log'))[0].n).toBe(0);
    expect((await as(db, STRANGER, 'select count(*)::int n from activity_log'))[0].n).toBe(0);
  });
  it('nobody can write, edit or delete entries through the app', async () => {
    await expect(as(db, JERRY, `insert into activity_log (tbl, op) values ('x', 'insert')`)).rejects.toThrow(/row-level security/);
    expect((await as(db, JERRY, `delete from activity_log returning id`)).length).toBe(0);
    expect((await as(db, JERRY, `update activity_log set actor = 'x' returning id`)).length).toBe(0);
  });
});
