// Migration 010: administrators managed from the app.
import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, as, admin, seedChurch, JERRY, ANNA } from './harness.js';

let db;
beforeAll(async () => { db = await freshDb(); await seedChurch(db); await admin(db, 'delete from admins where email <> $1', [JERRY]); }, 60000);   // Jerry is the only administrator to start

describe('administrators (010)', () => {
  it('an admin adds another; the address is cleaned and the change logged', async () => {
    const r = await as(db, JERRY, `insert into admins (email) values ('  Anna@MontCarmel.org ') returning email, added_by`, [], { keep: true });
    expect(r[0]).toEqual({ email: ANNA, added_by: JERRY });
    expect((await as(db, ANNA, `select is_admin() a`))[0].a).toBe(true);
    expect((await admin(db, `select actor, op, row_id from activity_log where tbl = 'admins' and actor is not null`))).toEqual([{ actor: JERRY, op: 'insert', row_id: ANNA }]);
  });
  it('rejects things that are not email addresses', async () => {
    await expect(as(db, JERRY, `insert into admins (email) values ('anna')`)).rejects.toThrow(/not an email/);
  });
  it('team members and strangers can neither see nor change the list', async () => {
    await admin(db, `delete from admins where email = $1`, [ANNA]);
    expect((await as(db, ANNA, `select count(*)::int n from admins`))[0].n).toBe(0);
    await expect(as(db, ANNA, `insert into admins (email) values ('anna@montcarmel.org')`)).rejects.toThrow(/row-level security/);
    expect((await as(db, ANNA, `delete from admins returning email`)).length).toBe(0);
  });
  it('the last administrator cannot be removed', async () => {
    await expect(as(db, JERRY, `delete from admins where email = $1`, [JERRY])).rejects.toThrow(/at least one administrator/);
    await as(db, JERRY, `insert into admins (email) values ('anna@montcarmel.org')`, [], { keep: true });
    await expect(as(db, JERRY, `delete from admins`)).rejects.toThrow(/at least one administrator/);
    expect((await as(db, JERRY, `delete from admins where email = $1 returning email`, [JERRY]))[0].email).toBe(JERRY);   // fine while Anna remains
  });
});
