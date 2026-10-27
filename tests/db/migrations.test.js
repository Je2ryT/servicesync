// Database tests: schema.sql + every migration, run on a local Postgres. Nothing touches the live project.
import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, as, admin, seedChurch, migrationFiles, JERRY, ANNA, STRANGER } from './harness.js';

let db;
beforeAll(async () => { db = await freshDb(); await seedChurch(db); }, 60000);

describe('every migration', () => {
  it('applies cleanly on a new install, in order', () => {
    expect(migrationFiles().length).toBeGreaterThanOrEqual(5);
  });
  it('can be run a second time without errors', async () => {
    const { readFileSync } = await import('node:fs'); const { join } = await import('node:path');
    for (const f of migrationFiles()) await db.exec(readFileSync(join(import.meta.dirname, '..', '..', 'migrations', f), 'utf8'));
  }, 60000);
});

describe('existing access rules still hold', () => {
  it('strangers see nothing', async () => {
    expect((await as(db, STRANGER, 'select count(*)::int n from coordinators'))[0].n).toBe(0);
    expect((await as(db, null, 'select count(*)::int n from sundays'))[0].n).toBe(0);
  });
  it('coordinators see published Sundays only; admins see all', async () => {
    expect((await as(db, ANNA, 'select count(*)::int n from sundays'))[0].n).toBe(1);
    expect((await as(db, JERRY, 'select count(*)::int n from sundays'))[0].n).toBe(2);
  });
  it('the live timer and reports enforce who may write', async () => {
    await expect(as(db, STRANGER, `select timer_control('2026-11-01','en','start','{"items":[{"id":"a","item":"x","min":5}]}')`)).rejects.toThrow(/roster/);
    await expect(as(db, ANNA, `select save_report('2026-11-08','en','summary',null,'x')`)).rejects.toThrow(/roster/);
    const r = await as(db, ANNA, `select (save_report('2026-11-01','en','summary',null,'Good')).summary s`);
    expect(r[0].s).toBe('Good');
  });
});

export { db, admin };
