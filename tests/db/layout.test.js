// Migration 011: names typed on a service layout.
import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, as, admin, seedChurch, JERRY, ANNA, STRANGER } from './harness.js';

let db;
const layout = async () => (await admin(db, `select layout from service_reports where sunday_id = '2026-11-01' and svc = 'fr'`))[0]?.layout;
beforeAll(async () => { db = await freshDb(); await seedChurch(db); }, 60000);

describe('service layout (011)', () => {
  it('fills in, changes and clears names by part and placeholder', async () => {
    await as(db, ANNA, `select save_layout('2026-11-01', 'fr', 'f5', 'r1', '  Pasteur Kabeya ')`, [], { keep: true });
    await as(db, ANNA, `select save_layout('2026-11-01', 'fr', 'f5', 'r2', 'Grace')`, [], { keep: true });
    await as(db, JERRY, `select save_layout('2026-11-01', 'fr', 'f1', 'r1', 'Paul')`, [], { keep: true });
    expect(await layout()).toEqual({ f5: { r1: 'Pasteur Kabeya', r2: 'Grace' }, f1: { r1: 'Paul' } });
    await as(db, ANNA, `select save_layout('2026-11-01', 'fr', 'f5', 'r2', '')`, [], { keep: true });
    await as(db, ANNA, `select save_layout('2026-11-01', 'fr', 'f1', 'r1', null)`, [], { keep: true });
    expect(await layout()).toEqual({ f5: { r1: 'Pasteur Kabeya' } });
  });
  it('keeps the report notes as they were', async () => {
    await as(db, ANNA, `select save_report('2026-11-01', 'fr', 'summary', null, 'Bon culte')`, [], { keep: true });
    await as(db, ANNA, `select save_layout('2026-11-01', 'fr', 'f2', 'r1', 'Chorale Shalom')`, [], { keep: true });
    expect((await admin(db, `select summary from service_reports where sunday_id = '2026-11-01' and svc = 'fr'`))[0].summary).toBe('Bon culte');
  });
  it('same access as reports: team members only on published Sundays; strangers never', async () => {
    await expect(as(db, ANNA, `select save_layout('2026-11-08', 'fr', 'f5', 'r1', 'X')`)).rejects.toThrow(/roster/);   // Nov 8 isn't published
    expect((await as(db, JERRY, `select (save_layout('2026-11-08', 'fr', 'f5', 'r1', 'X')).layout`))[0].layout).toEqual({ f5: { r1: 'X' } });
    await expect(as(db, STRANGER, `select save_layout('2026-11-01', 'fr', 'f5', 'r1', 'X')`)).rejects.toThrow(/roster/);
    await expect(as(db, JERRY, `select save_layout('2026-11-01', 'xx', 'f5', 'r1', 'X')`)).rejects.toThrow(/Unknown service/);
  });
});
