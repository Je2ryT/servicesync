import { T } from '../state.js';
import { SVC } from '../config.js';
import { esc, fmt, clock } from '../util.js';
import { ic } from '../icons.js';
import { docs, visible, svcKeys, svcName, cov, asgOf, status, pname, posName, fairness, heavy, tplFor, startOf, total } from '../domain.js';

export const timeRange = (doc, svc) => { const s = startOf(doc, svc); return `${clock(s)} – ${clock(s, total(tplFor(doc, svc)))}`; };

export const stIcon = st => (st === 'confirmed' ? `<span class="s ok" title="Confirmed">${ic('checkc')}</span>`
  : st === 'declined' ? `<span class="s no" title="Declined">${ic('xc')}</span>`
  : `<span class="s wait" title="Awaiting">${ic('clock')}</span>`);

/** Names with a status icon, for the navy bands. */
export function teamLine(sunId, svc) {
  const list = asgOf(sunId, svc);
  if (!list.length) return '<span>Nobody assigned yet</span>';
  const by = new Map();   // one entry per person, even when they hold two positions
  for (const a of list) { const x = by.get(a.person) || { pos: [], st: [] }; x.pos.push(posName(a.pos)); x.st.push(status(a)); by.set(a.person, x); }
  return [...by].map(([person, x]) => {
    const st = x.st.includes('declined') ? 'declined' : x.st.every(s => s === 'confirmed') ? 'confirmed' : 'awaiting';
    return `<span class="${st === 'confirmed' ? 'ok' : ''}" title="${esc(x.pos.join(', '))}">${ic(st === 'confirmed' ? 'checkc' : st === 'declined' ? 'xc' : 'clock')}${esc(pname(person))}</span>`;
  }).join('');
}

export function heroBlock() {
  const list = docs().filter(d => d.date === T.thisSun && visible(d));
  const cards = (list.length ? list : [{ id: T.thisSun, date: T.thisSun, missing: true }]).flatMap(d => svcKeys(d.missing ? null : d).map(s => {
    const doc = d.missing ? null : d; const c = cov(doc, s);
    return `<button class="hcard" data-act="openLive" data-id="${esc(d.id)}" data-svc="${s}"><span class="t"><b>${esc(doc ? svcName(doc, s) : SVC[s].name)}</b><span class="pill ${c.cls}">${esc(c.label)}</span></span><span class="tm">${esc(timeRange(doc, s))}</span>
      <span class="hp">${doc ? teamLine(d.id, s) : '<span>Nobody assigned yet</span>'}</span></button>`;
  }));
  return `<section class="hero"><div class="eyebrow">${T.thisSun === T.todayIso ? 'Today' : 'This Sunday'} · ${esc(fmt(T.thisSun, { month: 'long', day: 'numeric' }))}</div><div class="hero-grid">${cards.join('')}</div></section>`;
}

export function fairCard(m) {
  const f = fairness(m);
  return `<div class="card"><div class="ch"><h3>Workload fairness</h3><span class="sub" style="margin:0;font-size:.82rem">avg ${f.avg.toFixed(1)} / person</span></div><div class="fair">${f.t.length ? f.t.map(x => `<div class="r"><div class="l"><span>${esc(x.name)}</span><span class="row">${heavy(x.n, f.avg) ? '<span class="pill bad">Heavy</span>' : ''}<span class="n">${x.n}</span></span></div><div class="track"><i class="${heavy(x.n, f.avg) ? 'heavy' : ''}" style="width:${Math.round(x.n / f.mx * 100)}%"></i></div></div>`).join('') : '<span class="sub">Add people on the People tab.</span>'}</div></div>`;
}
