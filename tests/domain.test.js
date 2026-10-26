import { describe, it, expect, beforeEach } from 'vitest';
import { setState, setNow, me } from '../src/state.js';
import { planAutofill, cov, broken, clashOf, candidates, warnings, loadFor } from '../src/domain.js';

/* A small church: one Sunday already planned, two teams. Today is Mon Oct 26 2026. */
function seed(extra = {}) {
  setNow(new Date(2026, 9, 26));
  me.admin = true;
  setState({
    people: {
      anna: { name: 'Anna', langs: { en: true, fr: true }, active: true, max: 4 },
      bob: { name: 'Bob', langs: { en: true, fr: false }, active: true, max: 4 },
      cara: { name: 'Cara', langs: { en: true, fr: true }, active: true, max: 4 },
      dan: { name: 'Dan', langs: { en: false, fr: true }, active: true, max: 4 },
      eve: { name: 'Eve', langs: { en: true, fr: true }, active: false, max: 4 },
    },
    teams: { tc: { name: 'Coordination', sort: 0 }, ts: { name: 'Sound', sort: 1 } },
    pos: {
      coord: { team: 'tc', name: 'Coordinator', min: 1, pref: 2, sort: 0, active: true },
      sound: { team: 'ts', name: 'Sound desk', min: 1, pref: 1, sort: 0, active: true },
    },
    quals: { anna: { coord: true, sound: true }, bob: { coord: true }, cara: { coord: true, sound: true }, dan: { coord: true, sound: true }, eve: { coord: true } },
    sun: { '2026-11-01': { date: '2026-11-01', published: true, services: { en: {}, fr: {} } } },
    asg: {},
    off: {},
    ...extra,
  });
}
const asg = (id, sunId, svc, pos, person, status = 'awaiting') => [id, { sunId, svc, pos, person, status }];

describe('auto-fill', () => {
  beforeEach(() => seed());

  it('fills every position up to its preferred number, following the rules', () => {
    const { adds } = planAutofill('2026-11');
    // 5 Sundays in Nov 2026 (1, 8, 15, 22, 29) × 2 services × (2 coordinators + 1 sound)
    expect(adds).toHaveLength(5 * 2 * 3);
    for (const a of adds) {
      expect(a.person_id).not.toBe('eve');                                    // inactive
      if (a.svc === 'fr') expect(a.person_id).not.toBe('bob');                // Bob is English only
      if (a.svc === 'en') expect(a.person_id).not.toBe('dan');                // Dan is French only
      if (a.position_id === 'sound') expect(['anna', 'cara', 'dan']).toContain(a.person_id);
    }
    // nobody holds two positions in the same service
    const keys = adds.map(a => `${a.sunday_id}/${a.svc}/${a.person_id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('creates the Sunday rows it needs, but not the ones that exist', () => {
    const { newSundays } = planAutofill('2026-11');
    expect(newSundays.map(s => s.id)).toEqual(['2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']);
  });

  it('skips people on their Sunday off', () => {
    seed({ off: { anna: { dates: { '2026-11-08': true } } } });
    const { adds } = planAutofill('2026-11');
    expect(adds.some(a => a.sunday_id === '2026-11-08' && a.person_id === 'anna')).toBe(false);
  });

  it('keeps what is already assigned and only tops up', () => {
    seed({ asg: Object.fromEntries([asg('a1', '2026-11-01', 'en', 'coord', 'bob'), asg('a2', '2026-11-01', 'en', 'coord', 'cara')]) });
    const { adds } = planAutofill('2026-11');
    expect(adds.filter(a => a.sunday_id === '2026-11-01' && a.svc === 'en' && a.position_id === 'coord')).toHaveLength(0);
  });

  it('spreads the load evenly when the team is big enough', () => {
    const both = { en: true, fr: true };
    const people = Object.fromEntries('abcdefgh'.split('').map(k => [k, { name: k, langs: both, active: true, max: 4 }]));
    const quals = Object.fromEntries('abcdefgh'.split('').map(k => [k, { coord: true, sound: true }]));
    seed({ people, quals });
    const { adds } = planAutofill('2026-11');
    const n = {}; adds.forEach(a => { n[a.person_id] = (n[a.person_id] || 0) + 1; });
    const counts = Object.values(n);
    expect(counts).toHaveLength(8);                                       // everyone gets used
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('uses the people it must when only a few can serve a language', () => {
    // Each service needs 3 different people and only Anna and Cara speak both,
    // so they serve both services every week: 10/5/10/5 is the only valid plan.
    const { adds } = planAutofill('2026-11');
    const n = {}; adds.forEach(a => { n[a.person_id] = (n[a.person_id] || 0) + 1; });
    expect(n).toEqual({ anna: 10, bob: 5, cara: 10, dan: 5 });
  });

  it('ignores Sundays already in the past', () => {
    setNow(new Date(2026, 10, 10));
    const { adds } = planAutofill('2026-11');
    expect(adds.some(a => a.sunday_id < '2026-11-10')).toBe(false);
  });
});

describe('coverage and rules', () => {
  it('reports a service short of its minimum', () => {
    seed({ asg: Object.fromEntries([asg('a1', '2026-11-01', 'en', 'coord', 'anna')]) });
    const c = cov({ id: '2026-11-01' }, 'en');
    expect(c.cls).toBe('bad');           // no sound desk
    expect(c.label).toMatch(/sound desk/);
  });

  it('is fully covered when every position meets its preferred number', () => {
    seed({ asg: Object.fromEntries([asg('a1', '2026-11-01', 'en', 'coord', 'anna'), asg('a2', '2026-11-01', 'en', 'coord', 'bob'), asg('a3', '2026-11-01', 'en', 'sound', 'cara')]) });
    expect(cov({ id: '2026-11-01' }, 'en').cls).toBe('ok');
  });

  it('flags a double booking inside one service', () => {
    seed({ asg: Object.fromEntries([asg('a1', '2026-11-01', 'en', 'coord', 'anna'), asg('a2', '2026-11-01', 'en', 'sound', 'anna')]) });
    expect(broken({ id: 'a1', sunId: '2026-11-01', svc: 'en', pos: 'coord', person: 'anna' })).toBe('double-booked');
  });

  it('allows serving both services on the same Sunday (they do not overlap)', () => {
    seed({ asg: Object.fromEntries([asg('a1', '2026-11-01', 'en', 'coord', 'anna'), asg('a2', '2026-11-01', 'fr', 'coord', 'anna')]) });
    expect(clashOf({ id: 'a1', sunId: '2026-11-01', svc: 'en', pos: 'coord', person: 'anna' })).toBeNull();
  });

  it('flags language, qualification, Sunday off and declined', () => {
    seed({ off: { cara: { dates: { '2026-11-01': true } } } });
    expect(broken({ id: 'x', sunId: '2026-11-01', svc: 'fr', pos: 'coord', person: 'bob' })).toBe('language');
    expect(broken({ id: 'x', sunId: '2026-11-01', svc: 'en', pos: 'sound', person: 'bob' })).toBe('not on team');
    expect(broken({ id: 'x', sunId: '2026-11-01', svc: 'en', pos: 'coord', person: 'cara' })).toBe('Sunday off');
    expect(broken({ id: 'x', sunId: '2026-11-01', svc: 'en', pos: 'coord', person: 'anna', status: 'declined' })).toBe('declined');
  });

  it('lists warnings only for upcoming services', () => {
    seed();
    const w = warnings();
    expect(w.length).toBeGreaterThan(0);
    expect(w.every(x => x.date >= '2026-10-26')).toBe(true);
  });
});

describe('candidates', () => {
  it('puts people who can serve first, and explains why others cannot', () => {
    seed({ asg: Object.fromEntries([asg('a1', '2026-11-01', 'fr', 'coord', 'anna')]) });
    const list = candidates('2026-11-01', '2026-11-01', 'fr', 'sound');
    const ok = list.filter(c => !c.why).map(c => c.id);
    expect(ok).toEqual(expect.arrayContaining(['cara', 'dan']));
    expect(list.find(c => c.id === 'anna')).toBeUndefined();         // already in this service
    expect(list.find(c => c.id === 'bob').why).toMatch(/not on Sound desk/);
    expect(list.findIndex(c => c.why)).toBeGreaterThan(list.findIndex(c => !c.why));
  });

  it('counts assignments per person for the month', () => {
    seed({ asg: Object.fromEntries([asg('a1', '2026-11-01', 'en', 'coord', 'anna'), asg('a2', '2026-11-01', 'fr', 'coord', 'anna')]) });
    expect(loadFor('anna', '2026-11')).toBe(2);
  });
});

describe('declines', () => {
  it('a declined person does not count toward coverage', () => {
    seed({ asg: Object.fromEntries([asg('a1', '2026-11-01', 'en', 'coord', 'anna', 'declined'), asg('a2', '2026-11-01', 'en', 'sound', 'cara')]) });
    expect(cov({ id: '2026-11-01' }, 'en').cls).toBe('bad');
  });
});
