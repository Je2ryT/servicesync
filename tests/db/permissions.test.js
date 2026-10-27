// Migration 012: each administrator manages only the areas they were given.
import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, as, admin, seedChurch, JERRY, ANNA } from './harness.js';

let db;
const PASTOR = 'pastor@montcarmel.org';   // admin for people + follow-ups only
beforeAll(async () => {
  db = await freshDb(); await seedChurch(db);
  await admin(db, `delete from admins where email <> $1`, [JERRY]);
  await admin(db, `insert into admins (email, perms) values ($1, '{people,followups}')`, [PASTOR]);
  await admin(db, `insert into members (id, name, category_id, created_by) values ('m1', 'Grace Lumbu', 'congregation', 'import')`);
  await admin(db, `insert into teams (id, name) values ('t1', 'Media')`);
}, 60000);

describe('administrator access levels (012)', () => {
  it('helpers: full admins have every area; others only theirs', async () => {
    expect((await as(db, JERRY, `select has_perm('schedule') s, has_perm('messaging') m, is_full_admin() f`))[0]).toEqual({ s: true, m: true, f: true });
    expect((await as(db, PASTOR, `select has_perm('people') p, has_perm('schedule') s, is_admin() a, is_full_admin() f`))[0]).toEqual({ p: true, s: false, a: true, f: false });
    expect((await as(db, ANNA, `select has_perm('people') p, is_admin() a`))[0]).toEqual({ p: false, a: false });
  });

  it('a People admin edits people but not the schedule or templates', async () => {
    expect((await as(db, PASTOR, `update members set category_id = 'visitors' where id = 'm1' returning id`)).length).toBe(1);
    expect((await as(db, PASTOR, `update sundays set published = true where id = '2026-11-08' returning id`)).length).toBe(0);
    await expect(as(db, PASTOR, `insert into teams (name) values ('Ushers')`)).rejects.toThrow(/row-level security/);
    await expect(as(db, PASTOR, `insert into templates (id, name) values ('x', 'x')`)).rejects.toThrow(/row-level security/);
    expect((await as(db, PASTOR, `insert into flow_steps (flow_id, title, sort) values ('newcomer', 'Pastor visit', 9) returning title`))[0].title).toBe('Pastor visit');
  });

  it('every administrator still reads everything, including unpublished Sundays', async () => {
    expect((await as(db, PASTOR, `select count(*)::int n from sundays`))[0].n).toBe(2);
    expect((await as(db, PASTOR, `select count(*)::int n from admins`))[0].n).toBe(2);
  });

  it('activity log and opt-outs need Reports / Messaging', async () => {
    expect((await as(db, PASTOR, `select count(*)::int n from activity_log`))[0].n).toBe(0);
    expect((await as(db, JERRY, `select count(*)::int n from activity_log`))[0].n).toBeGreaterThan(0);
  });

  it('swaps and assignments need the Schedule area', async () => {
    await admin(db, `insert into positions (id, team_id, name) values ('p1', 't1', 'Sound')`);
    await admin(db, `insert into assignments (id, sunday_id, svc, position_id, person_id) values ('a1', '2026-11-08', 'en', 'p1', 'anna')`);
    await expect(as(db, PASTOR, `select respond_assignment('a1', 'confirmed')`)).rejects.toThrow(/own published/);
    await as(db, JERRY, `select respond_assignment('a1', 'confirmed')`);
    await expect(as(db, PASTOR, `select approve_swap('nope', 'anna')`)).rejects.toThrow(/Only administrators/);
  });

  it('only full administrators manage administrators, and one full administrator always remains', async () => {
    await expect(as(db, PASTOR, `insert into admins (email) values ('x@y.org')`)).rejects.toThrow(/row-level security/);
    expect((await as(db, PASTOR, `update admins set perms = null where email = $1 returning email`, [PASTOR])).length).toBe(0);   // can't give themselves full access
    expect((await as(db, JERRY, `update admins set perms = '{people,followups,reports}' where email = $1 returning perms`, [PASTOR]))[0].perms).toEqual(['people', 'followups', 'reports']);
    await expect(as(db, JERRY, `update admins set perms = '{schedule}' where email = $1`, [JERRY])).rejects.toThrow(/full access/);
    await expect(as(db, JERRY, `delete from admins where email = $1`, [JERRY])).rejects.toThrow(/full access/);
    await expect(as(db, JERRY, `update admins set perms = '{giving}' where email = $1`, [PASTOR])).rejects.toThrow(/admins_perms_known/);
  });

  it('safe to run again', async () => {
    const { applyMigration } = await import('./harness.js');
    await applyMigration(db, 12);
    expect((await as(db, PASTOR, `update members set name = 'Grace L' where id = 'm1' returning id`)).length).toBe(1);
    await expect(as(db, PASTOR, `insert into teams (name) values ('Ushers')`)).rejects.toThrow(/row-level security/);
  });

  it('the send server treats only Messaging (or full) administrators as able to message anyone', async () => {
    const { roleOf } = await import('../../server/lib.js');
    const dbi = { q: async (t, p) => (await db.query(t, p)).rows };
    expect(await roleOf(dbi, JERRY)).toMatchObject({ admin: true, perms: null });
    expect(await roleOf(dbi, PASTOR)).toMatchObject({ admin: false, anyAdmin: true });
    await admin(db, `update admins set perms = '{people,messaging}' where email = $1`, [PASTOR]);
    expect((await roleOf(dbi, PASTOR)).admin).toBe(true);
    expect(await roleOf(dbi, ANNA)).toMatchObject({ admin: false, anyAdmin: false, coordinatorId: 'anna' });
  });

  it('Live area: admins need it to run the timer; the serving team still can on published Sundays', async () => {
    const items = JSON.stringify({ items: [{ id: 'e1', item: 'Welcome', min: 5 }] });
    await admin(db, `update admins set perms = '{people}' where email = $1`, [PASTOR]);
    await expect(as(db, PASTOR, `select timer_control('2026-11-08', 'en', 'start', $1::jsonb)`, [items])).rejects.toThrow(/roster/);
    await admin(db, `update admins set perms = '{people,live}' where email = $1`, [PASTOR]);
    expect((await as(db, PASTOR, `select (timer_control('2026-11-08', 'en', 'start', $1::jsonb)).seg`, [items]))[0].seg).toBe(0);   // unpublished Sunday, but Live
    expect((await as(db, ANNA, `select (timer_control('2026-11-01', 'en', 'start', $1::jsonb)).seg`, [items]))[0].seg).toBe(0);     // roster, published
    await expect(as(db, ANNA, `select timer_control('2026-11-08', 'en', 'start', $1::jsonb)`, [items])).rejects.toThrow(/roster/);  // roster, unpublished
    await expect(as(db, JERRY, `update admins set perms = '{live,cooking}' where email = $1`, [PASTOR])).rejects.toThrow(/admins_perms_known/);
  });
});
