/* The live timer: controls on the Live tab, and the full-screen stage screen. */
import { ui, me } from '../state.js';
import { SVC } from '../config.js';
import { esc, parse, clock as clockText } from '../util.js';
import { ic } from '../icons.js';
import { docOf, visible, svcName, tplFor, startOf, myPerson } from '../domain.js';
import { timerOf, timerView, serverNow, scheduledStart, countdown, elapsedText, minutes, driftText, labels } from '../timer.js';

export const canRun = doc => !!doc && (me.admin || (!!myPerson() && !!doc.published));
const langOf = svc => SVC[svc]?.lang || 'en';
const plan = (doc, svc) => (tplFor(doc, svc).order || []).map(o => ({ id: o.id, item: o.item, min: +o.min || 0 }));

/** The view for one service right now. */
export function viewFor(doc, svc, now = serverNow()) {
  return timerView(timerOf(doc.id, svc), plan(doc, svc), now, scheduledStart(doc.date, startOf(doc, svc)));
}

const btn = (doc, svc, op, label, cls = '', extra = '') => `<button class="btn ${cls}" data-act="tmr" data-op="${op}" data-sun="${esc(doc.id)}" data-svc="${svc}" ${extra}>${label}</button>`;

/** The countdown block, shared by both screens; the ticker keeps the [data-f] fields current. */
function face(doc, svc, v, L) {
  const head = v.phase === 'idle'
    ? (v.untilStart != null && v.untilStart > 0 ? L.startsIn : L.notStarted)
    : v.phase === 'ended' ? L.ended : esc(v.cur?.item || '');
  const big = v.phase === 'idle' ? (v.untilStart != null && v.untilStart > 0 ? countdown(v.untilStart) : countdown(v.planned))
    : v.phase === 'ended' ? elapsedText(v.serviceElapsed) : countdown(v.remaining);
  return `<div class="tface lv-${v.level} ph-${v.phase}" data-tmr="${esc(doc.id)}" data-svc="${svc}">
    <div class="tseg" data-f="seg">${head}</div>
    <div class="tbig" data-f="big" role="timer" aria-live="off">${big}</div>
    <div class="tbar"><i data-f="bar" style="width:${Math.round(v.progress * 100)}%"></i></div>
    <div class="tmeta"><span data-f="next">${nextText(v, L)}</span><span data-f="drift">${statusText(v, L, svc, doc)}</span></div>
  </div>`;
}
function nextText(v, L) {
  if (v.phase === 'ended') return `${L.planned} ${minutes(v.total)}`;
  if (v.phase === 'idle') return v.cur ? `${esc(v.cur.item)} · ${esc(v.cur.min)} min` : '';
  return v.next ? `${L.next}${esc(v.next.item)} · ${esc(v.next.min)} min` : L.last;
}
function statusText(v, L, svc, doc) {
  if (v.phase === 'idle') return `${L.startsAt} ${clockText(startOf(doc, svc))} · ${minutes(v.total)}`;
  const d = driftText(v, langOf(svc));
  if (v.phase === 'paused') return `${L.paused} · ${d}`;
  if (v.phase === 'ended') return d;
  return `${L.elapsed} ${elapsedText(v.serviceElapsed)} · ${d}`;
}

/* ---------- Live tab: controls ---------- */
export function vTimerCard(doc, svc) {
  if (ui.timerMissing) return `<div class="card"><div class="ch"><h3>Service timer</h3></div><p class="sub" style="margin:0">The timer needs a database update. Run <code>migrations/002-live-timer.sql</code> in Supabase.</p></div>`;
  const v = viewFor(doc, svc); const L = labels('en'); const can = canRun(doc);
  const stage = `<button class="btn" data-act="stageOpen" data-sun="${esc(doc.id)}" data-svc="${svc}">${ic('screen')} Stage screen</button>`;
  let ctl = '';
  if (!can) ctl = '<p class="sub" style="margin:0">People on the roster can run the timer once this Sunday is published.</p>';
  else if (v.phase === 'idle') ctl = `<div class="tctl">${btn(doc, svc, 'start', `${ic('play')} Start service`, 'cta big', v.items.length ? '' : 'disabled')}</div>`;
  else if (v.phase === 'ended') ctl = `<div class="tctl">${btn(doc, svc, 'back', `${ic('left')} Reopen last segment`)}${btn(doc, svc, 'start', 'Restart', 'ghost', 'data-confirm="Tap again to restart"')}${btn(doc, svc, 'reset', 'Clear timer', 'ghost', 'data-confirm="Tap again to clear"')}</div>`;
  else {
    ctl = `<div class="tctl">
      ${btn(doc, svc, 'back', ic('left'), 'sq', 'aria-label="Previous segment" title="Previous segment"')}
      ${v.phase === 'paused' ? btn(doc, svc, 'resume', `${ic('play')} Resume`) : btn(doc, svc, 'pause', `${ic('pause')} Pause`)}
      ${btn(doc, svc, 'next', v.next ? `Next ${ic('right')}` : `Finish ${ic('check')}`, 'cta big')}
    </div>
    <div class="tctl">
      <span class="sub" style="margin:0">This segment</span>
      ${btn(doc, svc, 'add', '−1 min', '', 'data-sec="-60"')}${btn(doc, svc, 'add', '+1 min', '', 'data-sec="60"')}${btn(doc, svc, 'add', '+5 min', '', 'data-sec="300"')}
      ${btn(doc, svc, 'end', 'End service', 'ghost', 'data-confirm="Tap again to end"')}
    </div>
    <div class="tmsg"><input type="text" class="draft" id="tmsg-${esc(doc.id)}-${svc}" maxlength="140" placeholder="Message for the stage screen, e.g. Wrap up" value="${esc(v.message)}" aria-label="Stage message">
      ${btn(doc, svc, 'message', 'Show')}${v.message ? btn(doc, svc, 'message', 'Clear', 'ghost', 'data-clear="1"') : ''}</div>`;
  }
  const log = v.phase === 'ended' && v.log.length ? `<table class="tlog"><thead><tr><th>Segment</th><th>Planned</th><th>Actual</th></tr></thead><tbody>${v.log.map(e => {
    const diff = Math.round((e.actual - e.planned) / 60);
    return `<tr><td>${esc(e.item)}</td><td>${minutes(e.planned)}</td><td class="${diff > 0 ? 'over' : ''}">${minutes(e.actual)}${diff ? ` <small>(${diff > 0 ? '+' : ''}${diff})</small>` : ''}</td></tr>`;
  }).join('')}</tbody></table>` : '';
  return `<section class="card tcard"><div class="ch"><h3>Service timer</h3>${stage}</div>${face(doc, svc, v, L)}${ctl}${log}</section>`;
}

/* ---------- Stage screen ---------- */
export function vStage() {
  const { sun, svc } = ui.stage; const doc = docOf(sun);
  if (!doc || !visible(doc) || !(svc === 'ev' ? doc.special : !doc.special)) {
    return `<div class="stage"><div class="stage-empty"><p>This service isn't available. It may not be published yet.</p><button class="btn" data-act="stageExit">Back to ServiceSync</button></div></div>`;
  }
  const lang = langOf(svc); const L = labels(lang); const v = viewFor(doc, svc);
  const msg = v.message ? `<div class="smsg" role="status">${esc(v.message)}</div>` : '';
  return `<div class="stage lv-${v.level} ph-${v.phase}" data-stage>
    <div class="stop"><div><b>${esc(L.title && svc !== 'ev' ? L.title : svcName(doc, svc))}</b><span>${esc(parse(doc.date).toLocaleDateString(L.locale, { weekday: 'long', month: 'long', day: 'numeric' }))}</span></div><div class="snow" data-f="now"></div></div>
    ${msg}
    ${face(doc, svc, v, L)}
    <div class="sctl" aria-label="Screen controls">
      <button class="btn" data-act="stageFull">${ic('screen')} Full screen</button>
      <button class="btn ghost" data-act="stageExit">Exit</button>
      ${canRun(doc) ? '<span class="keys">Space or → next · ← back · P pause · + add a minute</span>' : ''}
    </div>
  </div>`;
}

/* ---------- ticking ---------- */
const nowText = () => new Date(serverNow()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** Update every visible countdown in place (several times a second) without re-rendering the page. */
export function tickTimers() {
  const faces = document.querySelectorAll('[data-tmr]'); if (!faces.length) return;
  const now = serverNow();
  for (const el of faces) {
    const doc = docOf(el.dataset.tmr); if (!doc) continue;
    const svc = el.dataset.svc; const v = viewFor(doc, svc, now); const L = labels(el.closest('[data-stage]') ? langOf(svc) : 'en');
    const set = (f, txt) => { const n = el.querySelector(`[data-f="${f}"]`); if (n && n.textContent !== txt) n.textContent = txt; };
    if (v.phase === 'idle') {
      const s = v.untilStart != null && v.untilStart > 0;
      set('seg', s ? L.startsIn : L.notStarted); set('big', countdown(s ? v.untilStart : v.planned));
    } else if (v.phase !== 'ended') set('big', countdown(v.remaining));
    if (v.phase === 'running' || v.phase === 'paused') set('drift', statusText(v, L, svc, doc));
    const bar = el.querySelector('[data-f="bar"]'); if (bar) bar.style.width = Math.round(v.progress * 100) + '%';
    const cls = `tface lv-${v.level} ph-${v.phase}`; if (el.className !== cls) el.className = cls;
    const st = el.closest('[data-stage]'); if (st) { const c = `stage lv-${v.level} ph-${v.phase}`; if (st.className !== c) st.className = c; }
  }
  const n = document.querySelector('[data-f="now"]'); if (n) { const t = nowText(); if (n.textContent !== t) n.textContent = t; }
}

