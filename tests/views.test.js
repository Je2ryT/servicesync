// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { setState, setNow, me, ui } from '../src/state.js';
import { render } from '../src/render.js';
import { TABS } from '../src/config.js';

function shell() {
  document.body.innerHTML = '<nav id="tabs"></nav><div id="who"></div><main id="main"></main><div id="overlay"></div>';
}
function seed() {
  setNow(new Date(2026, 9, 26));
  setState({
    people: {
      anna: { name: 'Anna Mukendi', email: 'anna@x.com', langs: { en: true, fr: true }, active: true, max: 4 },
      bob: { name: 'Bob', email: 'bob@x.com', langs: { en: true, fr: false }, active: true, max: 4 },
    },
    teams: { tc: { name: 'Coordination', sort: 0 }, ts: { name: 'Sound', sort: 1 } },
    pos: { coord: { team: 'tc', name: 'Coordinator', min: 1, pref: 2, active: true }, sound: { team: 'ts', name: 'Sound desk', min: 1, pref: 1, active: true } },
    quals: { anna: { coord: true, sound: true }, bob: { coord: true } },
    sun: {
      '2026-11-01': { date: '2026-11-01', published: true, services: { en: {}, fr: {} } },
      '2026-11-08': { date: '2026-11-08', published: false, services: { en: {}, fr: {} } },
      '2026-12-24-ev-1': { date: '2026-12-24', published: true, special: true, title: 'Christmas Eve <b>', services: { ev: { start: '18:00' } } },
    },
    asg: {
      a1: { sunId: '2026-11-01', svc: 'en', pos: 'coord', person: 'anna', status: 'confirmed' },
      a2: { sunId: '2026-11-01', svc: 'en', pos: 'sound', person: 'anna', status: 'awaiting' },     // double-booked
      a3: { sunId: '2026-11-01', svc: 'fr', pos: 'coord', person: 'bob', status: 'declined' },      // wrong language
      a4: { sunId: '2026-11-08', svc: 'en', pos: 'coord', person: 'bob', status: 'awaiting' },      // unpublished
    },
    swap: { s1: { sunId: '2026-11-01', svc: 'fr', pos: 'coord', from: 'bob', to: null, note: 'Away', status: 'open', at: 1 } },
    off: {}, chk: {}, tpl: {}, cfg: {},
  });
  ui.session = { user: {} }; ui.ready = true; ui.needsMigration = false; ui.month = '2026-11';
}

describe('every screen renders', () => {
  beforeEach(() => { shell(); seed(); });

  for (const admin of [true, false]) {
    for (const [tab] of TABS) {
      it(`${tab} as ${admin ? 'administrator' : 'volunteer'}`, () => {
        me.admin = admin; me.email = admin ? 'jerry@x.com' : 'bob@x.com'; me.name = '';
        ui.tab = tab; ui.psub = 'people'; render();
        const html = document.getElementById('main').innerHTML;
        expect(html.length).toBeGreaterThan(100);
        expect(html).not.toMatch(/undefined|NaN|\[object Object\]/);
        expect(html).not.toContain('<b>Christmas');                         // titles are escaped
      });
    }
  }

  it('calendar shows positions, problems and the assign menu for admins', () => {
    me.admin = true; me.email = 'jerry@x.com'; ui.tab = 'calendar'; render();
    const html = document.getElementById('main').innerHTML;
    expect(html).toContain('Sound desk');
    expect(html).toContain('also on');                                       // double-booking explained
    expect(html).toContain('not on the FR service list');
    expect(html).toContain('data-act="assign"');
  });

  it('the schedule hides past dates; a link shows them again', async () => {
    const { H } = await import('../src/actions.js');
    me.admin = true; me.email = 'jerry@x.com'; ui.tab = 'calendar'; ui.month = '2026-10'; ui.showPast = false; render();   // today is Mon Oct 26
    const days = () => [...document.querySelectorAll('.card.sun h2')].map(h => h.textContent);
    expect(days()).toEqual([]);   // Oct 4, 11, 18, 25 have all passed
    expect(document.querySelector('.past-bar').textContent).toContain('4 past dates hidden');
    expect(document.getElementById('main').textContent).toContain('Every date in this month has passed.');
    H.togglePast(); expect(days()).toEqual(['Sunday, October 4', 'Sunday, October 11', 'Sunday, October 18', 'Sunday, October 25']);
    H.month({ dataset: { k: '1' } }); expect(ui.showPast).toBe(false);
    expect(days()[0]).toBe('Sunday, November 1'); expect(document.querySelector('.past-bar')).toBeNull();
  });

  it('volunteers do not see draft months or other people’s assign menus', () => {
    me.admin = false; me.email = 'bob@x.com'; ui.tab = 'calendar'; render();
    const html = document.getElementById('main').innerHTML;
    expect(html).toContain('Not published yet');
    expect(html).not.toContain('data-act="assign"');
  });

  it('home lists a volunteer’s own assignments with confirm and swap buttons', () => {
    me.admin = false; me.email = 'anna@x.com'; ui.tab = 'home'; render();
    const html = document.getElementById('main').innerHTML;
    expect(html).toContain('Your assignments');
    expect(html).toContain('data-act="respond"');
    expect(html).toContain('data-act="reqSwap"');
  });

  it('teams screen lists positions and who serves them', () => {
    me.admin = true; ui.tab = 'roster'; ui.psub = 'teams'; render();
    const html = document.getElementById('main').innerHTML;
    expect(html).toContain('NEED 1 · WANT 2');
    expect(html).toContain('Anna Mukendi, Bob');
  });

  it('asks the admin to run the migration when the new tables are missing', () => {
    me.admin = true; ui.needsMigration = true; render();
    expect(document.getElementById('main').innerHTML).toContain('001-teams-and-positions.sql');
  });

  it('someone not on the roster is told to ask the administrator', () => {
    me.admin = false; me.email = 'stranger@x.com'; render();
    expect(document.getElementById('main').innerHTML).toContain('not on the Mont Carmel roster');
  });
});
