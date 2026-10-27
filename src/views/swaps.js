import { S, me } from '../state.js';
import { esc, fmt } from '../util.js';
import { myPerson, pname, posName, svcName, docOf, candidates } from '../domain.js';
import { can, isFull } from '../access.js';

export function vSwaps() {
  const mp = myPerson();
  const list = Object.entries(S.swap).map(([id, s]) => ({ id, ...s })).filter(s => me.admin || s.from === mp || s.to === mp)
    .sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || (b.at || 0) - (a.at || 0));
  let h = `<div><h1>Swap requests</h1><p class="sub">${can('schedule') ? 'Approve to hand the assignment to the replacement. The best fit is suggested first.' : 'Ask to hand off an assignment. The administrator approves the change.'}</p></div>`;
  if (!list.length) return h + '<div class="card empty">No swap requests.</div>';
  h += '<div class="card">' + list.map(s => {
    const d = docOf(s.sunId); if (!d) return '';
    let picker = '';
    if (can('schedule') && s.status === 'open') {
      const cand = candidates(s.sunId, d.date, s.svc, s.pos, [s.from]);
      const pre = s.to || cand.find(c => !c.why)?.id || '';
      picker = `<div class="row"><select id="rep-${esc(s.id)}" style="max-width:300px" aria-label="Replacement"><option value="">Choose replacement…</option>${cand.map((t, i) => `<option value="${esc(t.id)}" ${t.id === pre ? 'selected' : ''}>${esc(t.name)}${t.why ? ` (${esc(t.why)})` : i === 0 ? ' · suggested' : ''}</option>`).join('')}</select><button class="btn cta" data-act="approveSwap" data-id="${esc(s.id)}">Approve</button><button class="btn" data-act="declineSwap" data-id="${esc(s.id)}">Decline</button></div>`;
    }
    return `<div class="sw"><div class="row" style="justify-content:space-between"><div><b>${esc(pname(s.from))}</b> · ${esc(fmt(d.date))} · ${esc(svcName(d, s.svc))}${s.pos ? ` · <span class="pill info">${esc(posName(s.pos))}</span>` : ''}</div><span class="pill ${s.status === 'open' ? 'warn' : s.status === 'approved' ? 'ok' : 'bad'}">${s.status === 'open' ? 'Open' : s.status === 'approved' ? 'Approved' : 'Declined'}</span></div>
     ${s.note ? `<div class="sub" style="margin:0">“${esc(s.note)}”</div>` : ''}
     <div class="sub" style="margin:0">Replacement: ${s.to ? esc(pname(s.to)) : 'not chosen yet'}</div>
     ${picker}
     ${!can('schedule') && s.status === 'open' && s.from === mp ? `<div><button class="btn link" data-act="cancelSwap" data-id="${esc(s.id)}">Cancel request</button></div>` : ''}</div>`;
  }).join('') + '</div>';
  return h;
}
