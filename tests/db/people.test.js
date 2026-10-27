// Migration 006: richer people. Tested as an upgrade of today's data, then the new access rules.
import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, applyMigration, as, admin, seedChurch, JERRY, ANNA, STRANGER } from './harness.js';

let db;
beforeAll(async () => {
  db = await freshDb({ upTo: 5 }); await seedChurch(db);
  // What a church has before 006: statuses, a notes field, people on the serving team.
  await db.exec(`
    insert into members (id, name, email, phone, lang, status, notes, created_at) values
      ('m1', 'Josué Kabila', 'josue@example.com', '704', 'fr', 'member', 'Leads the prayer group', '2025-01-01'),
      ('m2', 'Grace  Lumbu ', null, null, 'en', 'newcomer', null, '2026-10-25'),
      ('m3', 'Prince', null, null, 'fr', 'regular', '   ', '2025-02-01'),
      ('m4', 'Anna Mukendi', 'ANNA@montcarmel.org', null, 'both', 'member', null, '2025-01-01');
    insert into attendance (member_id, date, svc) values ('m1', '2026-10-25', 'fr'), ('m1', '2026-11-01', 'fr'), ('m2', '2026-11-01', 'en');
  `);
  await applyMigration(db, 6);
  await applyMigration(db, 6);   // safe to run twice
}, 60000);

const one = async (sql, p) => (await admin(db, sql, p))[0];

describe('upgrading existing people (006)', () => {
  it('turns statuses into categories and records where each came from', async () => {
    const rows = await admin(db, `select id, status, category_id from members where id in ('m1','m2','m3','m4') order by id`);
    expect(rows.map(r => [r.id, r.status, r.category_id])).toEqual([['m1', 'member', 'congregation'], ['m2', 'newcomer', 'visitors'], ['m3', 'regular', 'congregation'], ['m4', 'member', 'congregation']]);
    const h = await admin(db, `select member_id, to_category, note from category_history where member_id = 'm3'`);
    expect(h).toEqual([{ member_id: 'm3', to_category: 'congregation', note: 'Set from the old status “regular” (migration 006)' }]);
  });
  it('splits names into first and last', async () => {
    expect(await admin(db, `select id, first_name, last_name from members where id in ('m1','m2','m3') order by id`)).toEqual([
      { id: 'm1', first_name: 'Josué', last_name: 'Kabila' }, { id: 'm2', first_name: 'Grace', last_name: 'Lumbu' }, { id: 'm3', first_name: 'Prince', last_name: null }]);
  });
  it('moves notes into the notes timeline once, keeping their date', async () => {
    expect(await admin(db, `select member_id, body, created_at::date::text d from person_notes`)).toEqual([{ member_id: 'm1', body: 'Leads the prayer group', d: '2025-01-01' }]);
    expect((await one(`select count(*)::int n from members where notes is not null`)).n).toBe(0);
  });
  it('links people to their serving-team card and adds the missing ones as Volunteers', async () => {
    expect((await one(`select coordinator_id from members where id = 'm4'`)).coordinator_id).toBe('anna');
    const jerry = await one(`select name, first_name, email, category_id, coordinator_id from members where coordinator_id = 'jerry'`);
    expect(jerry).toEqual({ name: 'Jerry Kibombo', first_name: 'Jerry', email: 'jerry@montcarmel.org', category_id: 'volunteers', coordinator_id: 'jerry' });
    expect((await one(`select count(*)::int n from members where coordinator_id is not null`)).n).toBe(2);   // not duplicated by the second run
  });
  it('a new serving-team card gets a member record', async () => {
    await admin(db, `insert into coordinators (id, name, email, lang_en, lang_fr, active, max_per_month) values ('sam', 'Samuel Kasongo', 'sam@x.com', true, false, true, 4)`);
    expect(await one(`select name, lang, category_id from members where coordinator_id = 'sam'`)).toEqual({ name: 'Samuel Kasongo', lang: 'en', category_id: 'volunteers' });
  });
  it('the seven starting categories exist', async () => {
    expect((await admin(db, 'select id from categories order by sort')).map(r => r.id)).toEqual(['congregation', 'volunteers', 'visitors', 'community', 'new-believers', 'guest-speakers', 'online']);
  });
});

describe('people rules (006)', () => {
  it('the old check-in screen still works: a name and status become first/last and a category', async () => {
    const r = await as(db, ANNA, `insert into members (name, status) values ('Patrick  Nsimba', 'newcomer') returning first_name, last_name, category_id`);
    expect(r[0]).toEqual({ first_name: 'Patrick', last_name: 'Nsimba', category_id: 'visitors' });
  });
  it('new screens can send first and last name only', async () => {
    const r = await as(db, JERRY, `insert into members (first_name, last_name, category_id) values ('Ruth', 'Mwamba', 'online') returning name`);
    expect(r[0].name).toBe('Ruth Mwamba');
  });
  it('every category change is logged with who made it', async () => {
    await as(db, JERRY, `update members set category_id = 'new-believers' where id = 'm2'`, [], { keep: true });
    await as(db, JERRY, `update members set phone = '1' where id = 'm2'`, [], { keep: true });   // not a category change
    const h = await admin(db, `select from_category, to_category, changed_by from category_history where member_id = 'm2' order by id`);
    expect(h.slice(1)).toEqual([{ from_category: 'visitors', to_category: 'new-believers', changed_by: JERRY }]);
  });
  it('coordinators read people but only admins edit them, families and categories', async () => {
    expect((await as(db, ANNA, `select count(*)::int n from members`))[0].n).toBeGreaterThan(3);
    expect((await as(db, ANNA, `update members set phone = 'x' where id = 'm1' returning id`)).length).toBe(0);
    await expect(as(db, ANNA, `insert into families (name) values ('Kabila')`)).rejects.toThrow(/row-level security/);
    await expect(as(db, ANNA, `insert into categories (name) values ('Choir')`)).rejects.toThrow(/row-level security/);
    expect((await as(db, JERRY, `insert into families (name) values ('Kabila') returning name`))[0].name).toBe('Kabila');
    expect((await as(db, JERRY, `update members set phone = 'x' where id = 'm1' returning id`)).length).toBe(1);
  });
  it('nobody can write the category history directly', async () => {
    await expect(as(db, JERRY, `insert into category_history (member_id, to_category) values ('m1', 'online')`)).rejects.toThrow(/row-level security/);
  });
  it('notes: coordinators write as themselves and edit only their own', async () => {
    const n = await as(db, ANNA, `insert into person_notes (member_id, body) values ('m1', 'Called, will visit Sunday') returning id, author`, [], { keep: true });
    expect(n[0].author).toBe(ANNA);
    await expect(as(db, ANNA, `insert into person_notes (member_id, body, author) values ('m1', 'x', 'jerry@montcarmel.org')`)).rejects.toThrow(/row-level security/);
    const old = (await one(`select id from person_notes where author is null`)).id;
    expect((await as(db, ANNA, `delete from person_notes where id = $1 returning id`, [old])).length).toBe(0);
    expect((await as(db, ANNA, `delete from person_notes where id = $1 returning id`, [n[0].id])).length).toBe(1);
    expect((await as(db, JERRY, `delete from person_notes where id = $1 returning id`, [old])).length).toBe(1);
  });
  it('saved filters: your own and shared ones', async () => {
    await as(db, ANNA, `insert into saved_filters (id, name, filters) values ('f-anna', 'My visitors', '{"cat":"visitors"}')`, [], { keep: true });
    await as(db, JERRY, `insert into saved_filters (id, name, filters, shared) values ('f-shared', 'French regulars', '{}', true), ('f-private', 'Mine', '{}', false)`, [], { keep: true });
    expect((await as(db, ANNA, `select id from saved_filters order by id`)).map(r => r.id)).toEqual(['f-anna', 'f-shared']);
    expect((await as(db, ANNA, `delete from saved_filters where id = 'f-shared' returning id`)).length).toBe(0);
    expect((await as(db, JERRY, `select count(*)::int n from saved_filters`))[0].n).toBe(3);
  });
  it('attendance totals per person', async () => {
    expect((await as(db, ANNA, `select first_attended::text f, last_attended::text l, visits, visits_fr from member_stats where member_id = 'm1'`))[0])
      .toEqual({ f: '2026-10-25', l: '2026-11-01', visits: 2, visits_fr: 2 });
  });
  it('strangers see nothing', async () => {
    for (const t of ['members', 'families', 'categories', 'category_history', 'person_notes', 'saved_filters', 'member_stats']) {
      expect((await as(db, STRANGER, `select count(*)::int n from ${t}`))[0].n, t).toBe(0);
    }
  });
});
