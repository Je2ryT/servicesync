// Migration 013: adding a member to the serving team links that member instead of creating a new one.
import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, as, admin, seedChurch, JERRY, ANNA } from './harness.js';

let db;
beforeAll(async () => {
  db = await freshDb(); await seedChurch(db);
  await admin(db, `insert into members (id, name, phone, email, category_id, created_by) values ('m-grace', 'Grace Lumbu', '704-555-0103', null, 'congregation', 'import'), ('m-paul', 'Paul Mbala', '', 'paul@x.org', 'congregation', 'import')`);
}, 60000);

describe('volunteers from the members list (013)', () => {
  it('links the chosen member and fills in a missing email; no duplicate member', async () => {
    const before = (await admin(db, 'select count(*)::int n from members'))[0].n;
    const c = (await as(db, JERRY, `insert into coordinators (name, email, phone, from_member) values ('Grace Lumbu', 'grace@x.org', '704-555-0103', 'm-grace') returning id`, [], { keep: true }))[0];
    expect((await admin(db, 'select count(*)::int n from members'))[0].n).toBe(before);
    expect((await admin(db, `select coordinator_id, email, category_id from members where id = 'm-grace'`))[0]).toEqual({ coordinator_id: c.id, email: 'grace@x.org', category_id: 'congregation' });
  });
  it('a member already on the serving team cannot be added twice', async () => {
    await expect(as(db, JERRY, `insert into coordinators (name, email, from_member) values ('Grace again', 'g2@x.org', 'm-grace')`)).rejects.toThrow(/already on the serving team/);
  });
  it('without a member, it works as before (by email, or a new member)', async () => {
    const c = (await as(db, JERRY, `insert into coordinators (name, email) values ('Paul Mbala', 'PAUL@x.org') returning id`, [], { keep: true }))[0];
    expect((await admin(db, `select id from members where coordinator_id = $1`, [c.id]))[0].id).toBe('m-paul');
    const d = (await as(db, JERRY, `insert into coordinators (name, email) values ('New Person', 'new@x.org') returning id`, [], { keep: true }))[0];
    expect((await admin(db, `select category_id from members where coordinator_id = $1`, [d.id]))[0].category_id).toBe('volunteers');
  });
  it('only admins with Schedule add people to the serving team', async () => {
    await expect(as(db, ANNA, `insert into coordinators (name, from_member) values ('X', 'm-paul')`)).rejects.toThrow(/row-level security/);
  });
});
