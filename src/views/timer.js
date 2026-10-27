/* The live timer: controls on the Live tab, and the full-screen stage screen. */
import { ui, me } from '../state.js';
import { can } from '../access.js';
import { t, locale } from '../i18n.js';
import qrcode from 'qrcode-generator';
import { SVC } from '../config.js';
import { esc, parse, clock as clockText } from '../util.js';
import { ic } from '../icons.js';
import { docOf, visible, svcName, tplFor, startOf, myPerson } from '../domain.js';
import { timerOf, timerView, serverNow, scheduledStart, countdown, elapsedText, minutes, driftText, labels } from '../timer.js';

/** Run the timer: administrators with the Live area (any service), or the serving team once the Sunday is published. */
export const canRun = doc => !!doc && (can('live') || (!!myPerson() && !!doc.published));
/** Write service reports and the layout: any administrator, or the serving team once published. */
export const canWrite = doc => !!doc && (me.admin || (!!myPerson() && !!doc.published));
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
  const stage = `<span class="row"><button class="btn" data-act="remoteShow" data-sun="${esc(doc.id)}" data-svc="${svc}">${ic('phone')} ${esc(t('remote'))}</button><button class="btn" data-act="stageOpen" data-sun="${esc(doc.id)}" data-svc="${svc}">${ic('screen')} Stage screen</button></span>`;
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

/* ---------- Phone remote (#remote/<sunday>/<service>) ----------
   The same buttons as the Live tab, sized for a phone. Every press goes to the database and every
   screen (stage, Live tab, other remotes) follows within a second through Supabase Realtime. */
export const remoteUrl = (sun, svc) => `${location.origin}${location.pathname}#remote/${sun}/${svc}`;
export function remoteQr(url) { const q = qrcode(0, 'M'); q.addData(url); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }

export function remoteForm(sun, svc) {
  const doc = docOf(sun); const url = remoteUrl(sun, svc);
  return `<h2>${esc(t('remoteTitle'))}</h2><p class="sub" style="margin:0">${esc(svcName(doc, svc))} · ${esc(parse(doc.date).toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' }))}</p>
    <div class="rm-qr" aria-label="${esc(t('remoteScan'))}">${remoteQr(url)}</div>
    <p class="sub" style="margin:0;text-align:center">${esc(t('remoteScan'))}</p>
    <div class="rm-link"><input type="text" readonly value="${esc(url)}" aria-label="${esc(t('remoteLink'))}" onclick="this.select()"><button class="btn" data-act="remoteCopy" data-url="${esc(url)}">${esc(t('copy'))}</button></div>
    <p class="sub" style="margin:0">${esc(t('remoteHelp'))}</p>
    <div class="row"><button class="btn cta" data-act="remoteHere" data-sun="${esc(sun)}" data-svc="${esc(svc)}">${ic('phone')} ${esc(t('remoteHere'))}</button><button class="btn ghost" data-act="closeModal">${esc(t('close'))}</button></div>`;
}

export function vRemote() {
  const { sun, svc } = ui.stage; const doc = docOf(sun);
  if (!doc || !visible(doc) || !(svc === 'ev' ? doc.special : !doc.special)) {
    return `<div class="remote"><div class="stage-empty"><p>${esc(t('remoteMissing'))}</p><button class="btn" data-act="stageExit">${esc(t('backToApp'))}</button></div></div>`;
  }
  const L = labels(locale() === 'fr-FR' ? 'fr' : 'en'); const v = viewFor(doc, svc); const run = canRun(doc);
  const b = (op, label, cls = '', extra = '') => btn(doc, svc, op, label, cls, extra);
  let ctl;
  if (!run) ctl = `<p class="rm-note">${esc(t(me.admin ? 'remoteNoLive' : 'remoteNotYet'))}</p>`;
  else if (v.phase === 'idle') ctl = `<div class="rm-main">${b('start', `${ic('play')} ${esc(t('startService'))}`, 'cta rm-big', v.items.length ? '' : 'disabled')}</div>`;
  else if (v.phase === 'ended') ctl = `<div class="rm-row">${b('back', `${ic('left')} ${esc(t('reopenLast'))}`, 'rm-mid')}</div>`;
  else ctl = `<div class="rm-main">${b('next', v.next ? `${esc(t('rmNext'))} ${ic('right')}` : `${esc(t('rmFinish'))} ${ic('check')}`, 'cta rm-big')}</div>
    <div class="rm-row">${b('back', `${ic('left')} ${esc(t('rmBack'))}`, 'rm-mid')}${v.phase === 'paused' ? b('resume', `${ic('play')} ${esc(t('rmResume'))}`, 'rm-mid') : b('pause', `${ic('pause')} ${esc(t('rmPause'))}`, 'rm-mid')}</div>
    <div class="rm-row rm-adds">${b('add', '−1 min', '', 'data-sec="-60"')}${b('add', '+1 min', '', 'data-sec="60"')}${b('add', '+5 min', '', 'data-sec="300"')}</div>
    <div class="tmsg rm-msg"><input type="text" class="draft" id="tmsg-${esc(doc.id)}-${svc}" maxlength="140" placeholder="${esc(t('stageMsgPh'))}" value="${esc(v.message)}" aria-label="${esc(t('stageMsgPh'))}">
      ${b('message', esc(t('rmShow')))}${v.message ? b('message', esc(t('rmClear')), 'ghost', 'data-clear="1"') : ''}</div>
    <div class="rm-row">${b('end', esc(t('endService')), 'ghost', `data-confirm="${esc(t('tapAgainEnd'))}"`)}</div>`;
  return `<div class="remote lv-${v.level} ph-${v.phase}" data-remote>
    <div class="rm-top"><button class="ib" data-act="stageExit" aria-label="${esc(t('backToApp'))}">${ic('left')}</button><div><b>${esc(svcName(doc, svc))}</b><span>${esc(parse(doc.date).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' }))} · ${esc(t('remote'))}</span></div><span class="rm-live" title="${esc(t('remoteSynced'))}"><i></i>${esc(t('live'))}</span></div>
    ${face(doc, svc, v, L)}
    ${ctl}
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
    const svc = el.dataset.svc; const v = viewFor(doc, svc, now); const L = labels(el.closest('[data-stage]') ? langOf(svc) : el.closest('[data-remote]') && locale() === 'fr-FR' ? 'fr' : 'en');
    const set = (f, txt) => { const n = el.querySelector(`[data-f="${f}"]`); if (n && n.textContent !== txt) n.textContent = txt; };
    if (v.phase === 'idle') {
      const s = v.untilStart != null && v.untilStart > 0;
      set('seg', s ? L.startsIn : L.notStarted); set('big', countdown(s ? v.untilStart : v.planned));
    } else if (v.phase !== 'ended') set('big', countdown(v.remaining));
    if (v.phase === 'running' || v.phase === 'paused') set('drift', statusText(v, L, svc, doc));
    const bar = el.querySelector('[data-f="bar"]'); if (bar) bar.style.width = Math.round(v.progress * 100) + '%';
    const cls = `tface lv-${v.level} ph-${v.phase}`; if (el.className !== cls) el.className = cls;
    const st = el.closest('[data-stage]'); if (st) { const c = `stage lv-${v.level} ph-${v.phase}`; if (st.className !== c) st.className = c; }
    const rm = el.closest('[data-remote]'); if (rm) { const c = `remote lv-${v.level} ph-${v.phase}`; if (rm.className !== c) rm.className = c; }
  }
  const n = document.querySelector('[data-f="now"]'); if (n) { const t = nowText(); if (n.textContent !== t) n.textContent = t; }
}

