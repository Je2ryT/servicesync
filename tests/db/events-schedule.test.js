// Migration 016: calendar events and Schedule services stay together.
import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, as, admin, seedChurch, applyMigration, JERRY } from './harness.js';

let db;
beforeAll(async () => {
  db = await freshDb({ upTo: 15 }); await seedChurch(db);
  await admin(db, `insert into events (id, title, date, start_time, end_time) values ('ev-up', 'Night of worship', current_date + 10, '19:00', '02:00'), ('ev-old', 'Old picnic', current_date - 30, '12:00', null)`);
  await admin(db, `insert into sundays (id, date, special, title, services) values ('2026-12-24-ev-xmas', '2026-12-24', true, 'Christmas Eve', '{"ev":{"start":"18:00","tpl":"@en"}}')`);
  await applyMigration(db, 16);
}, 60000);

describe('events on the Schedule (016)', () => {
  it('upcoming calendar events got a draft service with their times (ending after midnight is kept)', async () => {
    const e = (await admin(db, `select service_id from events where id = 'ev-up'`))[0];
    const s = (await admin(db, `select special, published, title, services from sundays where id = $1`, [e.service_id]))[0];
    expect(s).toEqual({ special: true, published: false, title: 'Night of worship', services: { ev: { start: '19:00', end: '02:00', tpl: '-' } } });
    expect((await admin(db, `select service_id from events where id = 'ev-old'`))[0].service_id).toBeNull();   // past events are left alone
  });
  it('special services planned on the Schedule got a calendar entry', async () => {
    expect((await admin(db, `select title, date::text d, start_time from events where service_id = '2026-12-24-ev-xmas'`))[0]).toEqual({ title: 'Christmas Eve', d: '2026-12-24', start_time: '18:00' });
  });
  it('deleting either one deletes the other', async () => {
    const sid = (await admin(db, `select service_id from events where id = 'ev-up'`))[0].service_id;
    await as(db, JERRY, `delete from events where id = 'ev-up'`, [], { keep: true });
    expect((await admin(db, `select count(*)::int n from sundays where id = $1`, [sid]))[0].n).toBe(0);
    await as(db, JERRY, `delete from sundays where id = '2026-12-24-ev-xmas'`, [], { keep: true });
    expect((await admin(db, `select count(*)::int n from events where service_id = '2026-12-24-ev-xmas' or title = 'Christmas Eve'`))[0].n).toBe(0);
  });
  it('safe to run again', async () => { await applyMigration(db, 16); await applyMigration(db, 16); });
});
