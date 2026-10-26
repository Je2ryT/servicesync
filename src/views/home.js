import { S, T, me } from '../state.js';
import { esc, fmt, ym, shiftMonth, monthName } from '../util.js';
import { ic } from '../icons.js';
import { myPerson, pname, activePeople, warnings, awaiting, monthState, monthRows, svcKeys, cov, assignments, docOf, status, svcName, posName } from '../domain.js';
import { heroBlock, fairCard, timeRange } from './shared.js';

export function vHome() {
  const mp = myPerson();
  const first = (me.name || (mp ? pname(mp) : '')).split(' ')[0];
  let h = `<div><h1>Welcome${first ? ', ' + esc(first) : ''}</h1><p class="sub">${esc(T.now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</p></div>`;
  if (me.admin) {
    const w = warnings(); const open = Object.values(S.swap).filter(s => s.status === 'open').length;
    h += `<div class="stats">
      <div class="card stat">${ic('users')}<b>${activePeople().length}</b><span>Active people</span></div>
      <div class="card stat">${ic('checkc')}<b>${awaiting()}</b><span>Awaiting confirmation</span></div>
      <div class="card stat">${ic('alert')}<b>${w.length}</b><span>Coverage issues</span></div>
      <div class="card stat">${ic('swap')}<b>${open}</b><span>Open swap requests</span></div></div>`;
    h += heroBlock();
    const m1 = ym(T.now), m2 = shiftMonth(m1, 1);
    const ms = [m1, m2].map(m => { const s = monthState(m); return `<span class="pill ${s === 'published' ? 'ok' : s === 'draft' ? 'warn' : 'mute'}">${esc(monthName(m))}: ${s === 'none' ? 'not planned' : s}</span>`; }).join('');
    const nextUnplanned = [m1, m2].find(m => monthRows(m).some(r => r.date >= T.todayIso && svcKeys(r.doc).some(s => cov(r.doc, s).cls !== 'ok')));
    h += `<div class="split"><div class="card"><div class="ch"><h3>Coverage warnings</h3><div class="row">${ms}</div></div>
      ${w.length ? `<ul class="wl">${w.slice(0, 12).map(x => `<li><span class="${x.sev}">${ic('alert')}</span><span>${esc(x.text)}</span><span class="d">${esc(fmt(x.date))}</span></li>`).join('')}</ul>${w.length > 12 ? `<div class="sub" style="padding:10px 20px;margin:0">and ${w.length - 12} more on the Calendar</div>` : ''}` : '<div class="empty">Every service in the next two months is fully covered.</div>'}
      ${nextUnplanned ? `<div style="padding:14px 20px;border-top:1px solid var(--line)"><button class="btn" data-act="autofill" data-m="${nextUnplanned}">${ic('cal')} Plan ${esc(monthName(nextUnplanned))}</button></div>` : ''}</div>
      ${fairCard(m1)}</div>`;
    return h;
  }
  h += heroBlock();
  if (mp) {
    const mine = assignments().filter(a => a.person === mp).map(a => ({ a, d: docOf(a.sunId) }))
      .filter(x => x.d.published && x.d.date >= T.todayIso).sort((x, y) => x.d.date.localeCompare(y.d.date) || x.a.svc.localeCompare(y.a.svc));
    h += `<div class="card"><div class="ch"><h3>Your assignments</h3></div>${mine.length ? mine.map(({ a, d }) => {
      const st = status(a);
      const pend = Object.values(S.swap).some(x => x.status === 'open' && x.sunId === a.sunId && x.svc === a.svc && x.pos === a.pos && x.from === mp);
      return `<div class="sw"><div class="row" style="justify-content:space-between"><div><b>${esc(fmt(d.date, { weekday: 'long', month: 'short', day: 'numeric' }))}</b> · ${esc(svcName(d, a.svc))} · <span class="pill info">${esc(posName(a.pos))}</span> <span class="sub" style="display:inline">${esc(timeRange(d, a.svc))}</span></div><span class="pill ${st === 'confirmed' ? 'ok' : st === 'declined' ? 'bad' : 'warn'}">${st === 'confirmed' ? 'Confirmed' : st === 'declined' ? 'Declined' : 'Awaiting your reply'}</span></div>
        <div class="row">${st !== 'confirmed' ? `<button class="btn cta" data-act="respond" data-a="${esc(a.id)}" data-v="confirmed">${ic('check')} Confirm</button>` : ''}${st !== 'declined' ? `<button class="btn" data-act="respond" data-a="${esc(a.id)}" data-v="declined">Decline</button>` : ''}${pend ? '<span class="pill info">Swap requested</span>' : `<button class="btn" data-act="reqSwap" data-a="${esc(a.id)}">${ic('swap')} Request swap</button>`}<button class="btn link" data-act="openLive" data-id="${esc(d.id)}" data-svc="${a.svc}">Live view</button></div></div>`;
    }).join('') : '<div class="empty">No published assignments yet.</div>'}</div>`;
  }
  return h;
}
