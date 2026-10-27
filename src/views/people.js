import { S, T, ui, me } from '../state.js';
import { esc, fmt, ym } from '../util.js';
import { t, t as tr } from '../i18n.js';
import { vDirectory } from './directory.js';
import { vAdmins } from './admins.js';
import { ic } from '../icons.js';
import { people, activePeople, myPerson, loadFor, fairness, heavy, positionsOf, teamsList, allPositions, qualified } from '../domain.js';
import { can, isFull } from '../access.js';

export function vPeople() {
  const seg = `<div><div class="seg"><button data-act="psub" data-v="all" aria-pressed="${ui.psub === 'all'}">${esc(t('everyone'))}</button><button data-act="psub" data-v="people" aria-pressed="${ui.psub === 'people'}">${esc(t('servingTeam'))}</button><button data-act="psub" data-v="teams" aria-pressed="${ui.psub === 'teams'}">${esc(t('teamsPositions'))}</button>${isFull() ? `<button data-act="psub" data-v="admins" aria-pressed="${ui.psub === 'admins'}">${esc(t('admins'))}</button>` : ''}</div></div>`;
  if (ui.psub === 'admins' && isFull()) return vAdmins(seg);   // only full administrators see who the administrators are
  return ui.psub === 'teams' ? vTeams(seg) : ui.psub === 'people' ? vRoster(seg) : vDirectory(seg);
}

function vRoster(seg) {
  const list = people(); const m = ym(T.now); const mp = myPerson(); const f = fairness(m);
  let h = `<div class="head"><div><h1>People</h1><p class="sub">${activePeople().length} active ${activePeople().length === 1 ? 'person' : 'people'} serving</p></div>${can('schedule') ? `<button class="btn cta" data-act="editPerson">${ic('plus')} Add person</button>` : ''}</div>${seg}`;
  if (!list.length) return h + `<div class="card empty">${can('schedule') ? 'Nobody yet. Tap Add person to build the team.' : 'The administrator has not added anyone yet.'}</div>`;
  h += '<div class="roster">' + list.map(t => {
    const n = loadFor(t.id, m);
    const offs = Object.entries(S.off[t.id]?.dates || {}).filter(([d, v]) => v && d >= T.todayIso).map(([d]) => d).sort();
    const canEdit = can('schedule') || t.id === mp; const pos = positionsOf(t.id);
    return `<div class="card mem"><div class="top"><div><div class="row"><b>${esc(t.name)}</b>${isFull() && t.email && S.admins[String(t.email).toLowerCase()] ? `<span class="pill role">${esc(tr('adminPill'))}</span>` : ''}${t.active === false ? '<span class="pill mute">INACTIVE</span>' : ''}</div><div class="ph">${esc(t.phone || 'No phone')}</div></div>${canEdit ? `<button class="ib" data-act="editPerson" data-id="${esc(t.id)}" aria-label="Edit ${esc(t.name)}">${ic('pencil')}</button>` : ''}</div>
      <div class="row">${pos.length ? pos.map(p => `<span class="pill role">${esc(p.name)}</span>`).join('') : '<span class="pill warn">No positions yet</span>'}</div>
      <div class="row">${t.langs?.en !== false ? '<span class="pill info">English</span>' : ''}${t.langs?.fr !== false ? '<span class="pill info">French</span>' : ''}${heavy(n, f.avg) ? '<span class="pill bad">Heavy load</span>' : ''}</div>
      <div class="meta"><strong>${n}</strong> assignment${n === 1 ? '' : 's'} this month${offs.length ? ' · Off: ' + offs.slice(0, 3).map(d => esc(fmt(d, { month: 'short', day: 'numeric' }))).join(', ') : ''}</div>
      ${can('schedule') ? `<div class="meta">${t.email ? 'Signs in as ' + esc(t.email) : '<span style="color:var(--warn)">No sign-in email yet</span>'}</div>` : ''}</div>`;
  }).join('') + '</div>';
  return h;
}

function vTeams(seg) {
  const teams = teamsList(); const pos = allPositions(); const ppl = people();
  let h = `<div class="head"><div><h1>Teams &amp; positions</h1><p class="sub">Each position is filled for every service. Minimum is what a service can't run without; preferred is the goal.</p></div>${can('schedule') ? `<div class="row"><button class="btn" data-act="editPerson">${ic('plus')} Add person</button><button class="btn cta" data-act="editTeam">${ic('plus')} New team</button></div>` : ''}</div>${seg}`;
  if (!teams.length) return h + `<div class="card empty">${can('schedule') ? 'No teams yet. Create one, for example Worship, Sound or Ushers.' : 'No teams set up yet.'}</div>`;
  h += '<div class="grid2">' + teams.map(t => {
    const list = pos.filter(p => p.team === t.id);
    return `<div class="card"><div class="ch"><h3>${esc(t.name)}</h3><div class="row">${ui.peopleMissing ? '' : `<button class="ib" data-act="contact" data-src="team" data-team="${esc(t.id)}" data-label="${esc(t.name)}" aria-label="${esc(tr('contactTeam'))}" title="${esc(tr('contactTeam'))}">${ic('send')}</button>`}${can('schedule') ? `<button class="btn link" data-act="editPosition" data-team="${esc(t.id)}">${ic('plus')} Position</button><button class="ib" data-act="editTeam" data-id="${esc(t.id)}" aria-label="Edit ${esc(t.name)}">${ic('pencil')}</button>` : ''}</div></div>
      ${list.length ? list.map(p => {
        const who = ppl.filter(x => qualified(x.id, p.id));
        return `<div class="prow"><div class="row" style="justify-content:space-between"><div class="row"><b>${esc(p.name)}</b>${p.active === false ? '<span class="pill mute">PAUSED</span>' : ''}</div><div class="row"><span class="pill mute">NEED ${p.min} · WANT ${p.pref}</span>${can('schedule') ? `<button class="ib" data-act="editPosition" data-id="${esc(p.id)}" aria-label="Edit ${esc(p.name)}">${ic('pencil')}</button>` : ''}</div></div>
          <div class="meta">${who.length ? esc(who.map(x => x.name).join(', ')) : '<span style="color:var(--warn)">Nobody set up for this position yet</span>'}</div></div>`;
      }).join('') : `<div class="empty">No positions in this team yet.</div>`}</div>`;
  }).join('') + '</div>';
  return h;
}
