import { S, T, ui, me } from '../state.js';
import { PHASES } from '../config.js';
import { esc, fmt, clock } from '../util.js';
import { ic } from '../icons.js';
import { docs, visible, svcKeys, svcName, tplFor, checklist, startOf, cov, myPerson, pname } from '../domain.js';
import { timeRange, teamLine } from './shared.js';

export function vLive() {
  const list = docs().filter(visible);
  if (!list.length) return '<div><h1>Live Sunday</h1><p class="sub">Nothing is scheduled yet.</p></div>';
  if (ui.liveIdx == null || !list[ui.liveIdx]) { const i = list.findIndex(d => d.date >= T.todayIso); ui.liveIdx = i < 0 ? list.length - 1 : i; }
  const doc = list[ui.liveIdx]; const keys = svcKeys(doc); if (!keys.includes(ui.liveSvc)) ui.liveSvc = keys[0]; const s = ui.liveSvc;
  const t = tplFor(doc, s); const ord = t.order || []; const ck = checklist();
  const chk = S.chk[doc.id] || {}; const ticks = chk.ticks || {}; const done = chk.live?.[s] || {};
  const can = me.admin || !!myPerson();
  const nd = ord.filter(o => done[o.id]).length, td = ck.filter(k => ticks[s + ':' + k.id]).length;
  const pct = ord.length + ck.length ? Math.round((nd + td) / (ord.length + ck.length) * 100) : 0;
  const cur = ord.findIndex(o => !done[o.id]); const c = cov(doc, s);
  let h = `<div class="head"><div><h1>Live Sunday</h1><p class="sub">${esc(fmt(doc.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}${doc.special ? ' · ' + esc(doc.title || '') : ''}</p></div>
   <div class="row"><button class="btn sq" data-act="liveNav" data-k="-1" ${ui.liveIdx <= 0 ? 'disabled' : ''} aria-label="Previous">${ic('left')}</button><button class="btn sq" data-act="liveNav" data-k="1" ${ui.liveIdx >= list.length - 1 ? 'disabled' : ''} aria-label="Next">${ic('right')}</button></div></div>
   <div class="stabs">${keys.map(k => `<button data-act="liveSvc" data-svc="${k}" aria-pressed="${k === s}">${esc(svcName(doc, k))}<small>${esc(timeRange(doc, k))}</small></button>`).join('')}</div>
   <section class="hero prog"><div class="row" style="justify-content:space-between"><span class="eyebrow">Overall progress</span><span class="pill ${c.cls}">${esc(c.label)}</span></div><b>${pct}%</b><div class="ptrack"><i style="width:${pct}%"></i></div>
   <div class="hp">${teamLine(doc.id, s)}</div></section>`;
  let acc = 0;
  h += `<div class="livegrid"><div class="card"><div class="ch"><h3>Order of service <span class="sub" style="display:inline;font-weight:400">· ${esc(t.name || '')}</span></h3></div><div class="oos">` + ord.map((o, i) => {
    const tm = clock(startOf(doc, s), acc); acc += +o.min || 0; const d = !!done[o.id];
    return `<button class="it ${d ? 'done' : ''} ${i === cur ? 'cur' : ''}" data-act="item" data-k="${esc(o.id)}" ${can ? '' : 'disabled'} aria-pressed="${d}"><span class="dot">${d ? ic('check') : ''}</span><span class="tm">${tm}</span><span class="nm">${esc(o.item)}</span><span class="du">${i === cur ? '<span class="now">NOW</span>' : ''}${esc(o.min)}m</span></button>`;
  }).join('') + '</div></div><div class="phases">';
  for (const [ph, label] of PHASES) {
    const items = ck.filter(k => k.phase === ph); if (!items.length) continue; const dn = items.filter(k => ticks[s + ':' + k.id]).length;
    h += `<div class="card ph"><div class="ch"><h3>${label}</h3><span class="sub" style="margin:0;font-size:.82rem">${dn}/${items.length}</span></div><div class="list">${items.map(k => {
      const tk = ticks[s + ':' + k.id];
      return `<button class="tk ${tk ? 'done' : ''}" data-act="tick" data-k="${esc(s + ':' + k.id)}" ${can ? '' : 'disabled'} aria-pressed="${!!tk}"><span class="dot">${tk ? ic('check') : ''}</span><span><span class="tx">${esc(k.text)}</span>${tk ? `<span class="by">${esc(tk.by ? pname(tk.by) : 'Admin')} · ${new Date(tk.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>` : ''}</span></button>`;
    }).join('')}</div></div>`;
  }
  h += '</div></div>';
  if (!can) h += '<p class="sub">People on the roster can tick items here.</p>';
  return h;
}
