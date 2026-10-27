// Migration 015: a calendar event can be linked to its service plan.
import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, as, admin, seedChurch, JERRY } from './harness.js';

let db;
beforeAll(async () => { db = await freshDb(); await seedChurch(db); }, 60000);

describe('events linked to a service (015)', () => {
  it('links, and unlinks when the service is removed (the event stays)', async () => {
    await admin(db, `insert into sundays (id, date, special, title, services) values ('2026-11-20-ev-x', '2026-11-20', true, 'Prayer night', '{"ev":{"start":"19:00","tpl":"tpl-en"}}')`);
    const e = (await as(db, JERRY, `insert into events (title, date, service_id) values ('Prayer night', '2026-11-20', '2026-11-20-ev-x') returning id`, [], { keep: true }))[0];
    expect((await admin(db, `select service_id from events where id = $1`, [e.id]))[0].service_id).toBe('2026-11-20-ev-x');
    await admin(db, `delete from sundays where id = '2026-11-20-ev-x'`);
    expect((await admin(db, `select service_id, title from events where id = $1`, [e.id]))[0]).toEqual({ service_id: null, title: 'Prayer night' });
  });
  it('rejects a link to a service that does not exist', async () => {
    await expect(as(db, JERRY, `insert into events (title, date, service_id) values ('X', '2026-11-20', 'nope')`)).rejects.toThrow(/foreign key/);
  });
});
