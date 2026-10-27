import { describe, it, expect, beforeEach } from 'vitest';
import { setState } from '../src/state.js';
import { describe as say, feed, changed, actorName, logRow } from '../src/activity.js';

beforeEach(() => setState({
  people: { anna: { name: 'Anna Mukendi', email: 'anna@montcarmel.org' }, bob: { name: 'Bob' } },
  pos: { coord: { name: 'Coordinator', team: 'tc' } }, teams: { tc: { name: 'Coordination' } },
  members: { m1: { name: 'Grace Lumbu' } }, sun: {},
}));
const e = (tbl, op, o, n, extra = {}) => ({ id: 1, at: Date.UTC(2026, 10, 1, 15), actor: 'anna@montcarmel.org', tbl, op, rowId: 'x', old: o, new: n, ...extra });

describe('activity sentences', () => {
  it('reads assignments, confirmations and swaps', () => {
    const a = { sunday_id: '2026-11-01', svc: 'en', position_id: 'coord', person_id: 'anna' };
    expect(say(e('assignments', 'insert', null, a)).text).toBe('assigned Anna Mukendi as Coordinator · English Service, Nov 1');
    expect(say(e('assignments', 'update', { ...a, status: 'awaiting' }, { ...a, status: 'confirmed' })).text).toBe('confirmed: Anna Mukendi as Coordinator · English Service, Nov 1');
    expect(say(e('assignments', 'update', a, { ...a, person_id: 'bob' })).text).toBe('moved Coordinator from Anna Mukendi to Bob · English Service, Nov 1');
    expect(say(e('swaps', 'update', { status: 'open' }, { status: 'approved', from_id: 'anna', to_id: 'bob', position_id: 'coord', sunday_id: '2026-11-01', svc: 'fr' })).text)
      .toBe('approved a swap: Bob covers Anna Mukendi, Coordinator · French Service, Nov 1');
  });
  it('lists which fields changed, in plain words', () => {
    expect(changed(e('members', 'update', { name: 'G', phone: '1', updated_at: 1 }, { name: 'G', phone: '2', updated_at: 2 }))).toEqual(['phone']);
    expect(say(e('members', 'update', { id: 'm1', name: 'Grace Lumbu', status: 'newcomer' }, { id: 'm1', name: 'Grace Lumbu', status: 'member' })).text).toBe('edited Grace Lumbu (status)');
  });
  it('describes report notes by segment and hides the empty report row', () => {
    const k = { sunday_id: '2026-11-01', svc: 'en' };
    expect(say(e('service_reports', 'insert', null, { ...k, notes: {}, summary: null }))).toBeNull();
    expect(say(e('service_reports', 'update', { ...k, notes: {} }, { ...k, notes: { e5: { item: 'Sermon', text: 'x' } }, summary: 'Good' })).text)
      .toBe('wrote notes on Sermon, the summary · report for English Service, Nov 1');
  });
  it('names people by their serving-team name', () => {
    expect(actorName('ANNA@montcarmel.org')).toBe('Anna Mukendi');
    expect(actorName('x@y.com')).toBe('x@y.com');
    expect(actorName(null)).toBe('Someone in Supabase');
  });
  it('reads a database row', () => {
    expect(logRow({ id: 5, at: '2026-11-01T15:00:00Z', actor: null, tbl: 'events', op: 'delete', row_id: 'e1', old: { title: 'x' }, new: null }))
      .toEqual({ id: 5, at: Date.UTC(2026, 10, 1, 15), actor: '', tbl: 'events', op: 'delete', rowId: 'e1', old: { title: 'x' }, new: null });
  });
});

describe('the feed', () => {
  it('groups a burst of the same change into one line', () => {
    const rows = Array.from({ length: 30 }, (_, i) => e('members', 'insert', null, { name: 'P' + i }, { id: i, at: Date.UTC(2026, 10, 1, 15) - i * 1000 }));
    const f = feed(rows);
    expect(f.length).toBe(1); expect(f[0].text).toBe('added 30 members'); expect(f[0].more.length).toBe(30);
  });
  it('keeps small runs as separate lines and filters by area, person and text', () => {
    const rows = [
      e('members', 'insert', null, { name: 'A' }), e('members', 'insert', null, { name: 'B' }),
      e('events', 'insert', null, { title: 'Prayer night', date: '2026-11-04' }, { actor: 'x@y.com' }),
    ];
    expect(feed(rows).length).toBe(3);
    expect(feed(rows, { area: 'events' }).map(x => x.text)).toEqual(['added the event “Prayer night” on Nov 4']);
    expect(feed(rows, { actor: 'anna@montcarmel.org' }).length).toBe(2);
    expect(feed(rows, { text: 'anna' }).length).toBe(2);
  });
});

describe('the activity screen', () => {
  it('shows entries by day with who and what, escaped', async () => {
    const { ui } = await import('../src/state.js'); const { vActivity } = await import('../src/views/activity.js');
    ui.act = { rows: [e('events', 'insert', null, { title: 'Night <b>', date: '2026-11-04' })], loaded: true, loading: false, done: true, error: '', area: '', actor: '', text: '' };
    const h = vActivity();
    expect(h).toContain('Anna Mukendi</b> added the event “Night &lt;b&gt;”');
    expect(h).toContain('act-day'); expect(h).not.toContain('Load older');
  });
});
