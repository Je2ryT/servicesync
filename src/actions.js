/* Everything a click, change or keystroke can do. Keys match data-act attributes in the views. */
import { S, ui, me, T, forgetStage } from './state.js';
import { TABS } from './config.js';
import { esc, fmt, ym, shiftMonth, monthName, sundaysOf, uid } from './util.js';
import { ic } from './icons.js';
import { sb, q, reload, saveSun, ensureSun, timerAction, saveReport, loadActivity, loadProfile, loadMessages, loadRecipients, sendMessage } from './data.js';
import { toast, modal, closeModal } from './ui.js';
import { render } from './render.js';
import {
  docs, docOf, visible, monthRows, monthState, svcKeys, svcName, newSun, templates, cfg, isOff, myPerson, pname, posName,
  asgOf, planAutofill, candidates, allPositions, teamsList, qualified, positionsList, tplFor, people,
} from './domain.js';
import { timerOf } from './timer.js';
import { canRun } from './views/timer.js';
import { memberForm, ciListHtml, ciService } from './views/checkin.js';
import { eventForm } from './views/events.js';
import { attKey } from './members.js';
import { importView, importPlan } from './views/import.js';
import { activityListHtml } from './views/activity.js';
import { peopleRowsHtml, bulkBarHtml, personForm, categoryForm, saveFilterForm, manageFiltersForm } from './views/directory.js';
import { filterPeople, toCsv, cats, catOf } from './people.js';
import { t } from './i18n.js';
import { composeView, counterHtml } from './views/compose.js';
import { sourceIds, audience, newKey } from './compose.js';
import { msgState } from './views/messages.js';
import { doneForm, addForm, flowForm } from './views/followups.js';
import { stepsOf } from './flows.js';
import { parseCsv, detectColumns, memberRows, newFamilies } from './importer.js';
import { fold } from './members.js';
import { timeRange } from './views/shared.js';

/* ---------- helpers ---------- */
function shareText() {
  const m = ui.month; const lines = [`Mont Carmel · ServiceSync — ${monthName(m)}`];
  for (const r of monthRows(m)) {
    if (!r.doc || !visible(r.doc)) continue;
    lines.push('', `${fmt(r.date, { weekday: 'short', month: 'short', day: 'numeric' })}${r.doc.special ? ' · ' + (r.doc.title || '') : ''}`);
    for (const s of svcKeys(r.doc)) {
      lines.push(`  ${svcName(r.doc, s)} (${timeRange(r.doc, s)})`);
      const filled = positionsList().map(p => [p.name, asgOf(r.id, s, p.id).map(a => pname(a.person))]).filter(([, n]) => n.length);
      if (!filled.length) lines.push('    open');
      for (const [p, n] of filled) lines.push(`    ${p}: ${n.join(', ')}`);
    }
  }
  lines.push('', location.origin); return lines.join('\n');
}
function draftOf(tid) { if (!ui.drafts[tid]) ui.drafts[tid] = structuredClone(templates()[tid]); return ui.drafts[tid]; }
async function seedTemplates(except) {
  if (Object.keys(S.tpl).length) return;
  const rows = Object.entries(templates()).filter(([id]) => id !== except).map(([id, t]) => ({ id, name: t.name, lang: t.lang, items: t.order }));
  if (rows.length) await q(sb.from('templates').upsert(rows));
}
async function saveCfg(patch) { const data = { ...(S.cfg.main || {}), ...patch }; S.cfg.main = data; const r = await q(sb.from('config').upsert({ id: 'main', data })); if (r) reload(); return r; }
async function toggleTick(key, on) {
  const id = docs().filter(visible)[ui.liveIdx].id; const by = myPerson();
  const c = S.chk[id] || (S.chk[id] = { ticks: {}, live: {} });
  if (key.startsWith('live:')) { const [, s, i] = key.split(':'); (c.live[s] || (c.live[s] = {}))[i] = on || undefined; } else c.ticks[key] = on ? { by, at: Date.now() } : undefined;
  render();
  if (on) await q(sb.from('ticks').upsert({ sunday_id: id, key, by_coord: by })); else await q(sb.from('ticks').delete().eq('sunday_id', id).eq('key', key));
  reload();
}
async function autofill(m) {
  if (!positionsList().length) { toast('Set up teams and positions on the People tab first.'); return; }
  const { newSundays, adds } = planAutofill(m);
  ui.month = m;
  if (!adds.length) { render(); toast('No open spots could be filled. Check positions, languages and days off.'); return; }
  if (newSundays.length && !await q(sb.from('sundays').upsert(newSundays.map(({ id, date, published, special, services }) => ({ id, date, published, special, services }))))) return;
  if (await q(sb.from('assignments').upsert(adds, { onConflict: 'sunday_id,svc,position_id,person_id', ignoreDuplicates: true }))) {
    reload(); toast(`Filled ${adds.length} spot${adds.length === 1 ? '' : 's'} in ${monthName(m)}. Review the calendar, then publish.`);
  }
}
const val = id => document.getElementById(id)?.value ?? '';
const tapTwice = (el, label) => { if (el.dataset.sure === '1') return true; el.dataset.sure = '1'; el.textContent = label; return false; };

/** Redraw the check-in list and counts without disturbing the search box. */
function refreshCheckin() {
  const l = document.getElementById('ciList');
  if (l && document.activeElement?.id === 'ciQ') l.innerHTML = ciListHtml(); else render();
}

/* ---------- people ---------- */
function refreshPeople() {
  const l = document.getElementById('pList'), b = document.getElementById('pBulk');
  if (l) l.innerHTML = peopleRowsHtml(); if (b) b.innerHTML = bulkBarHtml();
}
function download(name, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function syncCatDraft() {
  document.querySelectorAll('.cat-ed [data-ci]').forEach(el => { const c = ui.catDraft[+el.dataset.ci]; if (!c) return; if (el.dataset.f === 'hidden') c.hidden = el.checked; else c[el.dataset.f] = el.value; });
}
function syncFlowDraft() {
  const d = ui.flowDraft; if (!d) return; d.name = val('flName') || d.name; d.nameFr = document.getElementById('flNameFr')?.value ?? d.nameFr;
  document.querySelectorAll('.fl-steps [data-si]').forEach(el => { const s = d.steps[+el.dataset.si]; if (s) s[el.dataset.f] = el.dataset.f === 'days' ? Math.max(0, Math.min(365, +el.value || 0)) : el.value; });
}
const chunks = (a, n = 200) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/* ---------- live timer ---------- */
const lastTap = { k: '', t: 0 };
/** Run one timer button; a quick double tap on the same button counts once. */
async function runTimer(sun, svc, op, arg = {}) {
  const k = op + '|' + sun + '|' + svc + '|' + JSON.stringify(arg); const t = Date.now();
  if (lastTap.k === k && t - lastTap.t < 700) return; lastTap.k = k; lastTap.t = t;
  if (op === 'start') {
    const items = (tplFor(docOf(sun), svc).order || []).filter(o => String(o.item || '').trim()).map(o => ({ id: o.id, item: o.item, min: +o.min || 0 }));
    if (!items.length) { toast('Add an order of service on the Templates tab first.'); return; }
    arg = { items };
  }
  await timerAction(sun, svc, op, arg);
}
export function stageKey(e) {
  if (!ui.stage || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input,textarea,select')) return;
  if (e.key === 'f' || e.key === 'F') { H.stageFull(); return; }
  const { sun, svc } = ui.stage; const doc = docOf(sun); if (!canRun(doc)) return;
  const t = timerOf(sun, svc); if (!t || t.endedAt) return;
  const op = e.key === ' ' || e.key === 'ArrowRight' ? 'next' : e.key === 'ArrowLeft' ? 'back'
    : e.key === 'p' || e.key === 'P' ? (t.pausedAt ? 'resume' : 'pause') : e.key === '+' || e.key === '=' ? 'add' : null;
  if (!op) return;
  e.preventDefault(); runTimer(sun, svc, op, op === 'add' ? { sec: 60 } : {});
}

/* ---------- handlers ---------- */
export const H = {
  tab(el) { if (el.dataset.tab === 'reports') ui.rep = null; ui.tab = el.dataset.tab; try { localStorage.setItem('ss-tab', ui.tab); } catch (e) { /* ignore */ } render(); window.scrollTo(0, 0); },
  openLive(el) { const list = docs().filter(visible); const i = list.findIndex(d => d.id === el.dataset.id); if (i < 0) { toast('This Sunday is not planned yet.'); return; } ui.liveIdx = i; ui.liveSvc = el.dataset.svc; ui.tab = 'live'; render(); window.scrollTo(0, 0); },
  liveNav(el) { ui.liveIdx += +el.dataset.k; render(); },
  liveSvc(el) { ui.liveSvc = el.dataset.svc; render(); },
  month(el) { ui.month = shiftMonth(ui.month, +el.dataset.k); render(); },
  item(el) { toggleTick('live:' + ui.liveSvc + ':' + el.dataset.k, el.getAttribute('aria-pressed') !== 'true'); },
  tick(el) { toggleTick(el.dataset.k, el.getAttribute('aria-pressed') !== 'true'); },
  async tmr(el) {
    const { op, sun, svc } = el.dataset;
    if (el.dataset.confirm && !tapTwice(el, el.dataset.confirm)) return;
    let arg = {};
    if (op === 'add') arg = { sec: +el.dataset.sec || 0 };
    if (op === 'message') { const inp = document.getElementById(`tmsg-${sun}-${svc}`); arg = { text: el.dataset.clear ? '' : (inp?.value || '') }; inp?.blur(); if (el.dataset.clear && inp) inp.value = ''; }
    await runTimer(sun, svc, op, arg);
  },
  stageOpen(el) {
    const url = location.pathname + '#stage/' + el.dataset.sun + '/' + el.dataset.svc;
    if (!window.open(url, '_blank')) location.href = url;   // pop-up blocked: open it here
  },
  stageFull() {
    if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
    const r = document.documentElement.requestFullscreen?.();
    if (!r) toast('Use your browser menu to go full screen, or add the page to your home screen.'); else r.catch(() => toast('Full screen was blocked. Tap the button again.'));
  },
  stageExit() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    forgetStage();
    history.replaceState(null, '', location.pathname); ui.stage = null; ui.tab = 'live'; render();
  },

  /* calendar */
  async assign(el) {
    const person = el.value; if (!person) return; const { id, date, svc, pos } = el.dataset;
    if (!await ensureSun(id, newSun(date))) return;
    if (await q(sb.from('assignments').upsert({ sunday_id: id, svc, position_id: pos, person_id: person }, { onConflict: 'sunday_id,svc,position_id,person_id', ignoreDuplicates: true }))) reload();
  },
  async unassign(el) { delete S.asg[el.dataset.a]; render(); await q(sb.from('assignments').delete().eq('id', el.dataset.a)); reload(); },
  autofill(el) { autofill(el.dataset.m || ui.month); },
  async publishMonth() {
    const m = ui.month; const ids = monthRows(m).filter(x => x.doc).map(x => x.id); const to = monthState(m) !== 'published';
    if (await q(sb.from('sundays').update({ published: to }).in('id', ids))) { reload(); toast(to ? `${monthName(m)} is published. The team can see it now.` : `${monthName(m)} is back to draft.`); }
  },
  share() {
    const txt = shareText(); const done = () => toast('Schedule copied. Paste it into your group text.');
    const fallback = () => { modal(`<h2>Share ${esc(monthName(ui.month))}</h2><p class="sub">Copy this into a text or WhatsApp message.</p><textarea id="shareTxt" rows="14" readonly>${esc(txt)}</textarea><div class="row"><button class="btn ghost" data-act="closeModal">Close</button></div>`); const t = document.getElementById('shareTxt'); t.focus(); t.select(); };
    if (navigator.share && /Mobi/.test(navigator.userAgent)) { navigator.share({ text: txt }).catch(() => {}); return; }
    try { navigator.clipboard.writeText(txt).then(done, fallback); } catch (e) { fallback(); }
  },
  newEvent() {
    const t = templates();
    modal(`<h2>Add special event</h2><label class="f">Event name<input type="text" id="evTitle" placeholder="Christmas Eve service"></label><label class="f">Date<input type="date" id="evDate" value="${esc(sundaysOf(ui.month)[0])}"></label><label class="f">Start time<input type="time" id="evTime" value="18:00"></label><label class="f">Order of service<select id="evTpl">${Object.entries(t).map(([id, x]) => `<option value="${esc(id)}">${esc(x.name)}</option>`).join('')}</select></label><div class="row"><button class="btn cta" data-act="saveEvent">Add event</button><button class="btn ghost" data-act="closeModal">Cancel</button></div>`);
  },
  async saveEvent() {
    const title = val('evTitle').trim(), date = val('evDate'), start = val('evTime') || '18:00', tpl = val('evTpl');
    if (!title || !date) { toast('Give the event a name and a date.'); return; }
    closeModal();
    if (await saveSun(date + '-ev-' + uid(), { date, title, special: true, published: false, services: { ev: { start, tpl } } })) { ui.month = date.slice(0, 7); toast(`Added ${title}.`); }
  },
  delEvent(el) { modal(`<h2>Remove this event?</h2><p class="sub">Its assignments and checklist progress go with it.</p><div class="row"><button class="btn cta" data-act="delEventYes" data-id="${esc(el.dataset.id)}">Remove</button><button class="btn ghost" data-act="closeModal">Cancel</button></div>`); },
  async delEventYes(el) { closeModal(); if (await q(sb.from('sundays').delete().eq('id', el.dataset.id))) reload(); },

  /* answering and swapping */
  async respond(el) {
    if (await q(sb.rpc('respond_assignment', { assignment_id: el.dataset.a, new_status: el.dataset.v }))) {
      reload(); toast(el.dataset.v === 'confirmed' ? 'Confirmed. Thank you!' : 'Marked as declined. The administrator will see it.');
    }
  },
  reqSwap(el) {
    const a = S.asg[el.dataset.a]; const d = docOf(a.sunId);
    const opts = candidates(a.sunId, d.date, a.svc, a.pos, [a.person]).filter(c => !c.why);
    modal(`<h2>Request a swap</h2><p class="sub">${esc(fmt(d.date, { weekday: 'long', month: 'long', day: 'numeric' }))} · ${esc(svcName(d, a.svc))} · ${esc(posName(a.pos))}</p><label class="f">Who could take it? (optional)<select id="swTo"><option value="">Let the administrator choose</option>${opts.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></label><label class="f">Note<textarea id="swNote" rows="3" placeholder="Traveling that weekend"></textarea></label><div class="row"><button class="btn cta" data-act="sendSwap" data-a="${esc(el.dataset.a)}">Send request</button><button class="btn ghost" data-act="closeModal">Cancel</button></div>`);
  },
  async sendSwap(el) {
    const a = S.asg[el.dataset.a]; const to = val('swTo') || null, note = val('swNote').trim(); closeModal();
    if (await q(sb.from('swaps').insert({ sunday_id: a.sunId, svc: a.svc, position_id: a.pos, from_id: a.person, to_id: to, note }))) { reload(); toast('Swap request sent.'); }
  },
  async approveSwap(el) {
    const to = val('rep-' + el.dataset.id); if (!to) { toast('Choose a replacement first.'); return; }
    const s = S.swap[el.dataset.id]; const d = docOf(s.sunId);
    if (await q(sb.rpc('approve_swap', { swap_id: el.dataset.id, replacement: to }))) { reload(); toast(`${pname(to)} now covers ${fmt(d.date)}.`); }
  },
  async declineSwap(el) { if (await q(sb.from('swaps').update({ status: 'declined' }).eq('id', el.dataset.id))) reload(); },
  async cancelSwap(el) { if (await q(sb.from('swaps').delete().eq('id', el.dataset.id))) reload(); },

  /* people */
  psub(el) { ui.psub = el.dataset.v; ui.person = null; ui.prof = null; render(); },
  editPerson(el) {
    const id = el.dataset.id; const adm = me.admin;
    const t = id ? S.people[id] : { name: '', email: '', phone: '', langs: { en: true, fr: true }, active: true, max: 4 };
    const days = [...sundaysOf(ym(T.now)), ...sundaysOf(shiftMonth(ym(T.now), 1)), ...sundaysOf(shiftMonth(ym(T.now), 2))].filter(d => d >= T.todayIso);
    const groups = teamsList().map(tm => [tm, allPositions().filter(p => p.team === tm.id)]).filter(([, ps]) => ps.length);
    modal(`<h2>${id ? esc(t.name) : 'Add person'}</h2>${adm ? `<label class="f">Name<input type="text" id="cName" value="${esc(t.name)}"></label><label class="f">Sign-in email<input type="email" id="cEmail" value="${esc(t.email || '')}" placeholder="name@gmail.com"></label><label class="f">Phone<input type="tel" id="cPhone" value="${esc(t.phone || '')}" placeholder="+1 704 555 0100"></label>
      <div class="checks"><label><input type="checkbox" id="cEn" ${t.langs?.en !== false ? 'checked' : ''}> English service</label><label><input type="checkbox" id="cFr" ${t.langs?.fr !== false ? 'checked' : ''}> French service</label><label><input type="checkbox" id="cAct" ${t.active !== false ? 'checked' : ''}> Active</label></div>
      <div class="f" style="font-size:.85rem;font-weight:600;display:grid;gap:8px">Can serve as${groups.length ? groups.map(([tm, ps]) => `<div class="pgroup"><span>${esc(tm.name)}</span><div class="checks">${ps.map(p => `<label><input type="checkbox" class="cPos" value="${esc(p.id)}" ${id && qualified(id, p.id) ? 'checked' : ''}> ${esc(p.name)}</label>`).join('')}</div></div>`).join('') : '<span class="sub" style="margin:0;font-weight:400">Create teams and positions first.</span>'}</div>
      <label class="f">Max assignments per month<input type="number" id="cMax" min="1" max="20" value="${esc(t.max || 4)}" style="width:100px"></label>` : ''}
      ${id ? `<div class="f" style="font-size:.85rem;font-weight:600;display:grid;gap:8px">Sundays off<div class="offs">${days.map(d => `<button data-act="dayoff" data-id="${esc(id)}" data-date="${d}" aria-pressed="${isOff(id, d)}">${esc(fmt(d, { month: 'short', day: 'numeric' }))}</button>`).join('')}</div></div>` : ''}
      <div class="row" style="justify-content:space-between">${adm ? `<div class="row"><button class="btn cta" data-act="savePerson" data-id="${esc(id || '')}">Save</button><button class="btn ghost" data-act="closeModal">Cancel</button></div>${id ? `<button class="btn danger" data-act="delPerson" data-id="${esc(id)}">Remove</button>` : ''}` : '<button class="btn" data-act="closeModal">Done</button>'}</div>`);
  },
  async savePerson(el) {
    const name = val('cName').trim(); if (!name) { toast('Enter a name.'); return; }
    const email = val('cEmail').trim().toLowerCase() || null;
    const row = { name, email, phone: val('cPhone').trim(), lang_en: document.getElementById('cEn').checked, lang_fr: document.getElementById('cFr').checked, active: document.getElementById('cAct').checked, max_per_month: Math.max(1, Math.min(20, +val('cMax') || 4)) };
    if (el.dataset.id) row.id = el.dataset.id;
    const picked = [...document.querySelectorAll('.cPos:checked')].map(x => x.value);
    closeModal();
    const saved = await q(sb.from('coordinators').upsert(row).select('id').single()); if (!saved) return;
    const pid = saved.id;
    const drop = Object.keys(S.quals[pid] || {}).filter(p => !picked.includes(p));
    if (drop.length) await q(sb.from('person_positions').delete().eq('person_id', pid).in('position_id', drop));
    if (picked.length) await q(sb.from('person_positions').upsert(picked.map(p => ({ person_id: pid, position_id: p })), { onConflict: 'person_id,position_id', ignoreDuplicates: true }));
    reload(); if (!el.dataset.id) toast(`Added ${name}.${email ? ' They can sign in with ' + email + '.' : ''}`);
  },
  async delPerson(el) { if (!tapTwice(el, 'Tap again to remove')) return; closeModal(); if (await q(sb.from('coordinators').delete().eq('id', el.dataset.id))) reload(); },
  async dayoff(el) {
    const on = el.getAttribute('aria-pressed') !== 'true'; el.setAttribute('aria-pressed', on); const c = el.dataset.id, d = el.dataset.date;
    const r = on ? await q(sb.from('daysoff').upsert({ coordinator_id: c, date: d })) : await q(sb.from('daysoff').delete().eq('coordinator_id', c).eq('date', d));
    if (r) reload();
  },

  /* check-in */
  ciSvc(el) { ui.ciSvc = el.dataset.svc; render(); },
  ciSearch(el) { ui.ciQuery = el.value; const l = document.getElementById('ciList'); if (l) l.innerHTML = ciListHtml(); },
  async ciToggle(el) {
    const id = el.dataset.id; const svc = ciService(); const date = T.todayIso; const k = attKey(id, date, svc);
    if (S.att[k]) {
      if (el.dataset.sure !== '1') { el.dataset.sure = '1'; el.querySelector('small').textContent = 'Tap again to undo check-in'; return; }
      delete S.att[k]; refreshCheckin();
      if (await q(sb.from('attendance').delete().eq('member_id', id).eq('date', date).eq('svc', svc))) reload();
      return;
    }
    S.att[k] = { member: id, date, svc, at: Date.now(), by: myPerson() }; refreshCheckin();
    if (await q(sb.from('attendance').upsert({ member_id: id, date, svc, by_coord: myPerson() }, { onConflict: 'member_id,date,svc', ignoreDuplicates: true }))) reload();
    else { delete S.att[k]; refreshCheckin(); }
  },
  addMember(el) { modal(memberForm(null, el.dataset.name || '')); },
  editMember(el) { modal(memberForm(el.dataset.id)); },
  async saveMember(el) {
    const rich = !!document.getElementById('mFirst');   // migration 006: first/last name and a category
    const first = val('mFirst').trim().replace(/\s+/g, ' '), last = val('mLast').trim().replace(/\s+/g, ' ');
    const name = rich ? [first, last].filter(Boolean).join(' ') : val('mName').trim().replace(/\s+/g, ' ');
    if (!name) { toast('Enter a name.'); return; }
    const id = el.dataset.id; const checkIn = !id && !!document.getElementById('mIn')?.checked;
    const row = { name, phone: val('mPhone').trim() || null, email: val('mEmail').trim().toLowerCase() || null, lang: val('mLang') || 'fr', household: val('mHouse').trim() || null };
    if (rich) Object.assign(row, { first_name: first || null, last_name: last || null, category_id: val('mCat') || 'visitors' });
    else row.status = val('mStatus') || 'newcomer';
    if (me.admin && document.getElementById('mNotes')) row.notes = val('mNotes').trim() || null;
    closeModal();
    let saved;
    if (id) saved = await q(sb.from('members').update(row).eq('id', id).select('id').single());
    else saved = await q(sb.from('members').insert({ ...row, created_by: myPerson() }).select('id').single());
    if (!saved) return;
    if (checkIn) await q(sb.from('attendance').upsert({ member_id: saved.id, date: T.todayIso, svc: ciService(), by_coord: myPerson() }, { onConflict: 'member_id,date,svc', ignoreDuplicates: true }));
    if (!id && !ui.flowsMissing) await sb.rpc('flow_enroll', { p_member: saved.id, p_flow: 'newcomer' });   // new at the door → newcomer follow-up
    ui.ciQuery = ''; reload(); toast(id ? `Saved ${name}.` : `Welcome, ${name}!${checkIn ? ' Checked in.' : ''}`);
  },
  async delMember(el) { if (!tapTwice(el, 'Tap again: attendance goes too')) return; closeModal(); if (await q(sb.from('members').delete().eq('id', el.dataset.id))) reload(); },

  /* import from Elvanto */
  impOpen() { if (!me.admin) return; ui.imp = null; modal(importView()); },
  impReset() { ui.imp = null; modal(importView()); },
  async impFile(el) {
    const f = el.files?.[0]; if (!f) return;
    if (/\.(xlsx?|numbers)$/i.test(f.name)) { ui.imp = { error: 'That is an Excel file. In Elvanto, export again and choose CSV.' }; modal(importView()); return; }
    if (f.size > 10 * 1024 * 1024) { ui.imp = { error: 'That file is larger than 10 MB. Export fewer people at a time.' }; modal(importView()); return; }
    const rows = parseCsv(await f.text());
    if (rows.length < 2) { ui.imp = { error: 'No people found in that file. Check it is the CSV from People → Export.' }; modal(importView()); return; }
    const headers = rows[0];
    ui.imp = { fileName: f.name, headers, rows: rows.slice(1), map: detectColumns(headers), lang: 'fr', status: 'member', cat: 'congregation', flows: false };
    modal(importView());
  },
  impMap(el) { if (el.value === '') delete ui.imp.map[el.dataset.k]; else ui.imp.map[el.dataset.k] = +el.value; modal(importView()); },
  impOpt(el) { ui.imp[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; modal(importView()); },
  async impRun(el) {
    const { add } = importPlan(); if (!add.length) return;
    el.disabled = true; const by = myPerson(); let done = 0; const rich = !ui.peopleMissing;
    let rows = memberRows(add, rich);
    if (rich) {   // families first, so people can be linked to them
      const have = new Map(Object.entries(S.families).map(([id, f]) => [fold(f.name), id]));
      const names = newFamilies(add, Object.values(S.families));
      if (names.length) {
        el.textContent = `Creating ${names.length} families…`;
        const made = await q(sb.from('families').insert(names.map(name => ({ name }))).select('id,name'));
        if (!made) { el.disabled = false; el.textContent = 'Try again'; return; }
        (Array.isArray(made) ? made : []).forEach(f => have.set(fold(f.name), f.id));
      }
      rows = rows.map(r => ({ ...r, family_id: r.household ? have.get(fold(r.household)) || null : null }));
    }
    for (let i = 0; i < rows.length; i += 200) {
      el.textContent = `Importing… ${done} of ${rows.length}`;
      const ok = await q(sb.from('members').insert(rows.slice(i, i + 200).map(m => ({ ...m, created_by: rich && !ui.imp.flows ? 'import' : by }))));
      if (!ok) { el.disabled = false; el.textContent = 'Try again'; toast(done ? `Imported ${done} before an error. Try again to add the rest.` : 'Nothing was imported.'); reload(); return; }
      done += Math.min(200, rows.length - i);
    }
    ui.imp = null; closeModal(); reload(); toast(`Imported ${done} ${done === 1 ? 'person' : 'people'} from Elvanto.`);
  },

  /* service reports */
  openReport(el) { ui.rep = el.dataset.id + '|' + el.dataset.svc; ui.tab = 'reports'; render(); window.scrollTo(0, 0); },
  repBack() { ui.rep = null; render(); window.scrollTo(0, 0); },
  repPrint() { window.print(); },
  async repNote(el) {
    const { sun, svc, key, item } = el.dataset; const k = sun + '|' + svc + '|' + key;
    const st = el.parentElement.querySelector('.rep-st'); const show = (v, t) => { ui.repSave[k] = v; if (st) { st.className = 'rep-st ' + v; st.textContent = t; } };
    show('saving', 'Saving…');
    const ok = await saveReport(sun, svc, key, item, el.value);
    show(ok ? 'saved' : 'error', ok ? 'Saved' : 'Not saved');
    if (ok) reload();
  },

  /* activity log */
  rsub(el) { ui.rsub = el.dataset.v; ui.rep = null; render(); },
  actRefresh() { if (ui.act) { ui.act.loaded = false; ui.act.done = false; } render(); },
  actMore() { loadActivity(true); render(); },
  actText(el) { ui.act.text = el.value; const l = document.getElementById('actList'); if (l) l.innerHTML = activityListHtml(); },
  actArea(el) { ui.act.area = el.value; render(); },
  actActor(el) { ui.act.actor = el.value; render(); },

  /* language */
  setLang(el) { ui.lang = el.dataset.v === 'fr' ? 'fr' : 'en'; try { localStorage.setItem('ss-lang', ui.lang); } catch (e) { /* ignore */ } render(); },

  /* people directory */
  pf(el) { ui.pf = { ...ui.pf, [el.dataset.k]: el.value }; render(); },
  pfQ(el) { ui.pf = { ...ui.pf, q: el.value }; refreshPeople(); },
  pfClear() { ui.pf = {}; ui.psel = []; render(); },
  pfLoad(el) { const f = S.filters[el.value]; if (!f) return; ui.pf = { ...f.filters }; ui.psel = []; render(); },
  pfSave() { modal(saveFilterForm()); },
  async pfSaveGo() {
    const name = val('sfName').trim(); if (!name) { toast(t('filterName')); return; }
    const shared = !!document.getElementById('sfShared')?.checked; closeModal();
    if (await q(sb.from('saved_filters').insert({ name, filters: { ...ui.pf }, shared }))) { reload(); toast(t('saved')); }
  },
  pfManage() { modal(manageFiltersForm()); },
  async pfDel(el) { if (!tapTwice(el, t('tapAgain'))) return; if (await q(sb.from('saved_filters').delete().eq('id', el.dataset.id))) { delete S.filters[el.dataset.id]; modal(manageFiltersForm()); reload(); } },
  pSel(el) {
    const set = new Set(ui.psel); if (el.checked) set.add(el.value); else set.delete(el.value); ui.psel = [...set];
    el.closest('.pr')?.classList.toggle('sel', el.checked); const b = document.getElementById('pBulk'); if (b) b.innerHTML = bulkBarHtml();
  },
  pSelAll() { ui.psel = filterPeople({ ...ui.pf }).map(m => m.id); refreshPeople(); },
  pSelNone() { ui.psel = []; refreshPeople(); },
  async pBulkCat(el) {
    if (!me.admin || !el.value || !ui.psel.length) return;
    const cat = el.value; const ids = [...ui.psel]; el.disabled = true;
    for (const part of chunks(ids)) if (!await q(sb.from('members').update({ category_id: cat }).in('id', part))) { el.disabled = false; return; }
    ui.psel = []; reload(); toast(`${ids.length} → ${cats().find(c => c.id === cat)?.name || cat}`);
  },
  pExport() {
    const sel = new Set(ui.psel); const list = filterPeople({ ...ui.pf }).filter(m => !sel.size || sel.has(m.id));
    download(`servicesync-people-${T.todayIso}.csv`, toCsv(list));
  },
  openPerson(el) { ui.person = el.dataset.id; ui.prof = null; ui.tab = 'roster'; ui.psub = 'all'; render(); window.scrollTo(0, 0); loadProfile(ui.person); },
  personBack() { ui.person = null; ui.prof = null; render(); },
  personEdit(el) { if (!me.admin) return; modal(personForm(el.dataset.id || null)); },
  pFamPick(el) { const w = document.getElementById('pFamNewWrap'); if (w) { w.hidden = el.value !== '__new'; if (!w.hidden) document.getElementById('pFamNew')?.focus(); } },
  async personSave(el) {
    const first = val('pFirst').trim().replace(/\s+/g, ' '), last = val('pLast').trim().replace(/\s+/g, ' ');
    if (!first && !last) { toast(t('firstName')); return; }
    const id = el.dataset.id; let familyId = val('pFam') || null;
    const row = {
      first_name: first || null, last_name: last || null, name: [first, last].filter(Boolean).join(' '),
      phone: val('pPhone').trim() || null, email: val('pEmail').trim().toLowerCase() || null,
      gender: val('pGender') || null, birthday: val('pBirthday') || null, address: val('pAddress').trim() || null, lang: val('pLang') || 'fr',
      category_id: val('pCat') || 'congregation', family_role: val('pRole') || null,
      sms_opt_out: !!document.getElementById('pSmsOut')?.checked, email_opt_out: !!document.getElementById('pEmailOut')?.checked,
    };
    const famNew = val('pFamNew').trim();
    closeModal();
    if (familyId === '__new') {
      const f = await q(sb.from('families').insert({ name: famNew || (last ? last + (ui.lang === 'fr' ? '' : ' family') : row.name), address: row.address }).select('id').single());
      if (!f) return; familyId = f.id;
    }
    row.family_id = familyId;
    const saved = id ? await q(sb.from('members').update(row).eq('id', id).select('id').single()) : await q(sb.from('members').insert({ ...row, created_by: myPerson() }).select('id').single());
    if (!saved) return;
    reload(); toast(t('saved'));
    if (!id && saved.id) { ui.person = saved.id; ui.prof = null; ui.psub = 'all'; loadProfile(saved.id); }
    else if (ui.person) loadProfile(ui.person);
  },
  async personDel(el) { if (!tapTwice(el, t('tapAgain'))) return; closeModal(); if (await q(sb.from('members').delete().eq('id', el.dataset.id))) { ui.person = null; ui.prof = null; reload(); } },
  async noteAdd(el) {
    const box = document.getElementById('noteNew'); const body = (box?.value || '').trim(); if (!body) { box?.focus(); return; }
    el.disabled = true;
    if (await q(sb.from('person_notes').insert({ member_id: el.dataset.id, body }))) { if (box) box.value = ''; await loadProfile(el.dataset.id); }
    el.disabled = false;
  },
  async noteDel(el) { if (!tapTwice(el, t('tapAgain'))) return; if (await q(sb.from('person_notes').delete().eq('id', el.dataset.id))) loadProfile(ui.person); },

  /* categories (admins) */
  catEdit() { if (!me.admin) return; ui.catDraft = cats(true).map(c => ({ id: c.id, name: c.name, nameFr: c.nameFr || '', hidden: c.active === false })); modal(categoryForm()); },
  catMove(el) { syncCatDraft(); const i = +el.dataset.i; if (i > 0) { const d = ui.catDraft; [d[i - 1], d[i]] = [d[i], d[i - 1]]; } modal(categoryForm()); },
  catAdd() { syncCatDraft(); const n = val('catNew').trim(); if (!n) return; ui.catDraft.push({ id: null, name: n, nameFr: '', hidden: false }); modal(categoryForm()); },
  async catSave() {
    syncCatDraft(); const d = ui.catDraft.filter(c => c.name.trim());
    const old = d.map((c, i) => ({ c, i })).filter(x => x.c.id).map(({ c, i }) => ({ id: c.id, name: c.name.trim(), name_fr: c.nameFr.trim() || null, sort: i, active: !c.hidden }));
    const add = d.map((c, i) => ({ c, i })).filter(x => !x.c.id).map(({ c, i }) => ({ name: c.name.trim(), name_fr: c.nameFr.trim() || null, sort: i, active: !c.hidden }));
    closeModal();
    if (old.length && !await q(sb.from('categories').upsert(old))) return;
    if (add.length && !await q(sb.from('categories').insert(add))) return;
    ui.catDraft = null; reload(); toast(t('saved'));
  },

  /* messaging */
  contact(el) {
    const d = el.dataset; const src = { kind: d.src };
    if (d.src === 'selection') src.ids = [...ui.psel];
    if (d.src === 'filter') src.filters = { ...ui.pf };
    if (d.src === 'person') src.id = d.id;
    if (d.src === 'service') Object.assign(src, { sunId: d.sun, svc: d.svc });
    if (d.src === 'team') src.teamId = d.team;
    const ids = sourceIds(src);
    ui.compose = { key: newKey(), source: src, ids, label: d.label || '', channel: 'sms', subject: '', body: '', step: 'edit', error: '', result: null };
    modal(composeView());
  },
  cmpChannel(el) { ui.compose.channel = el.value; modal(composeView()); document.getElementById('cmpBody')?.focus(); },
  cmpSubject(el) { ui.compose.subject = el.value; },
  cmpBody(el) { ui.compose.body = el.value; const n = document.getElementById('cmpCount'); if (n) n.innerHTML = counterHtml(); },
  cmpMerge() {
    const b = document.getElementById('cmpBody'); if (!b) return;
    const at = b.selectionStart ?? b.value.length; b.value = b.value.slice(0, at) + '{first_name}' + b.value.slice(b.selectionEnd ?? at);
    ui.compose.body = b.value; b.focus(); b.selectionStart = b.selectionEnd = at + 12; const n = document.getElementById('cmpCount'); if (n) n.innerHTML = counterHtml();
  },
  cmpReview() {
    const c = ui.compose; c.body = val('cmpBody') || c.body; c.subject = document.getElementById('cmpSubject') ? val('cmpSubject') : c.subject;
    if (!c.body.trim()) { toast(t('message')); document.getElementById('cmpBody')?.focus(); return; }
    if (c.channel !== 'sms' && !c.subject.trim()) { toast(t('subject')); document.getElementById('cmpSubject')?.focus(); return; }
    c.step = 'confirm'; c.error = ''; modal(composeView());
  },
  cmpBack() { ui.compose.step = 'edit'; modal(composeView()); },
  async cmpSend() {
    const c = ui.compose; if (c.step === 'sending') return;
    const a = audience(c.ids, c.channel);
    c.step = 'sending'; modal(composeView());
    const r = await sendMessage({ key: c.key, channel: c.channel, subject: c.subject.trim(), body: c.body.trim(), recipients: a.people.map(m => m.id), source: { ...c.source, label: c.label } });
    if (ui.compose !== c) return;
    if (r.ok) { c.step = 'done'; c.result = r.body; if (ui.msgs) ui.msgs.loaded = false; } else { c.step = 'confirm'; c.error = r.error; }
    modal(composeView());
  },
  cmpViewSent() { closeModal(); ui.tab = 'reports'; ui.rsub = 'messages'; ui.rep = null; if (ui.msgs) ui.msgs.loaded = false; render(); },
  msgRefresh() { const m = msgState(); m.loaded = false; m.open = null; render(); },
  msgOpen(el) { const m = msgState(); m.open = el.dataset.id; m.recips = null; render(); window.scrollTo(0, 0); loadRecipients(m.open); },
  msgClose() { msgState().open = null; render(); },

  /* follow-ups */
  flowPick(el) { ui.flow = el.dataset.id; render(); },
  fuMine(el) { ui.fmine = el.checked; render(); },
  async fuAssign(el) { if (await q(sb.from('flow_entries').update({ assignee: el.value || null }).eq('id', el.dataset.id))) { S.fentries[el.dataset.id].assignee = el.value || null; reload(); toast(t('saved')); } },
  async fuDue(el) { if (!el.value) return; if (await q(sb.from('flow_entries').update({ due_date: el.value }).eq('id', el.dataset.id))) { S.fentries[el.dataset.id].due = el.value; reload(); render(); } },
  fuDone(el) { modal(doneForm(el.dataset.id)); document.getElementById('fuNote')?.focus(); },
  async fuDoneGo(el) {
    el.disabled = true; const note = val('fuNote').trim();
    const r = await q(sb.rpc('flow_advance', { p_entry: el.dataset.id, p_note: note || null }));
    closeModal(); if (!r) return;
    reload(); toast(t('saved')); if (ui.person) loadProfile(ui.person);
  },
  fuAdd(el) { modal(addForm(el.dataset.member || ui.person || '')); },
  async fuAddGo() {
    const member = val('fuMember'), flow = val('fuFlow'); if (!member || !flow) return; closeModal();
    if (await q(sb.rpc('flow_enroll', { p_member: member, p_flow: flow }))) { reload(); toast(t('saved')); if (ui.person) loadProfile(ui.person); }
  },
  flowEdit(el) {
    if (!me.admin) return; const id = el.dataset.id || '';
    ui.flowDraft = id ? { id, name: S.flows[id].name, nameFr: S.flows[id].nameFr || '', steps: stepsOf(id).map(s => ({ id: s.id, title: s.title, titleFr: s.titleFr || '', assignee: s.assignee || '', days: s.days })), removed: [] }
      : { id: '', name: '', nameFr: '', steps: [{ id: null, title: '', titleFr: '', assignee: '', days: 3 }], removed: [] };
    modal(flowForm());
  },
  flowStepAdd() { syncFlowDraft(); ui.flowDraft.steps.push({ id: null, title: '', titleFr: '', assignee: '', days: 3 }); modal(flowForm()); },
  flowStepMove(el) { syncFlowDraft(); const i = +el.dataset.i, st = ui.flowDraft.steps; if (i > 0) [st[i - 1], st[i]] = [st[i], st[i - 1]]; modal(flowForm()); },
  flowStepDel(el) { syncFlowDraft(); const [s] = ui.flowDraft.steps.splice(+el.dataset.i, 1); if (s?.id) ui.flowDraft.removed.push(s.id); modal(flowForm()); },
  async flowSave() {
    syncFlowDraft(); const d = ui.flowDraft; const steps = d.steps.filter(s => String(s.title).trim());
    if (!d.name.trim()) { toast(t('flowName')); return; } if (!steps.length) { toast(t('addStep')); return; }
    closeModal();
    let id = d.id;
    if (id) { if (!await q(sb.from('flows').update({ name: d.name.trim(), name_fr: d.nameFr.trim() || null }).eq('id', id))) return; }
    else { const f = await q(sb.from('flows').insert({ name: d.name.trim(), name_fr: d.nameFr.trim() || null }).select('id').single()); if (!f) return; id = f.id; }
    const row = (s, i) => ({ flow_id: id, sort: i, title: s.title.trim(), title_fr: String(s.titleFr || '').trim() || null, default_assignee: s.assignee || null, due_days: +s.days || 0 });
    const old = steps.map((s, i) => ({ s, i })).filter(x => x.s.id).map(({ s, i }) => ({ id: s.id, ...row(s, i) }));
    const add = steps.map((s, i) => ({ s, i })).filter(x => !x.s.id).map(({ s, i }) => row(s, i));
    if (old.length && !await q(sb.from('flow_steps').upsert(old))) return;
    if (add.length && !await q(sb.from('flow_steps').insert(add))) return;
    if (d.removed.length) await q(sb.from('flow_steps').delete().in('id', d.removed));
    ui.flowDraft = null; ui.flow = id; reload(); toast(t('saved'));
  },

  /* events */
  evMonth(el) { const k = +el.dataset.k; ui.evMonth = k ? shiftMonth(ui.evMonth || ym(T.now), k) : ym(T.now); ui.evDay = k ? null : T.todayIso; render(); },
  evDay(el) { ui.evDay = el.dataset.date || null; render(); },
  editEvent(el) { if (!me.admin) return; modal(eventForm(el.dataset.id, el.dataset.date)); },
  async saveCalEvent(el) {
    const title = val('eTitle').trim(); const date = val('eDate');
    if (!title) { toast('Give the event a title.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Pick a date.'); return; }
    const start = val('eStart'), end = val('eEnd');
    if (start && end && end <= start) { toast('The end time has to be after the start.'); return; }
    const row = { title, date, start_time: start || null, end_time: end || null, location: val('eLoc').trim() || null, description: val('eDesc').trim() || null };
    const id = el.dataset.id; closeModal();
    const r = id ? await q(sb.from('events').update(row).eq('id', id)) : await q(sb.from('events').insert({ ...row, created_by: myPerson() }));
    if (r) { ui.evMonth = date.slice(0, 7); ui.evDay = date; reload(); toast(id ? 'Event saved.' : `Added ${title}.`); }
  },
  async delCalEvent(el) { if (!tapTwice(el, 'Tap again to delete')) return; closeModal(); if (await q(sb.from('events').delete().eq('id', el.dataset.id))) reload(); },

  /* teams & positions */
  editTeam(el) {
    const id = el.dataset.id; const t = id ? S.teams[id] : { name: '' };
    modal(`<h2>${id ? 'Edit team' : 'New team'}</h2><label class="f">Team name<input type="text" id="tmName" value="${esc(t.name)}" placeholder="Worship, Sound, Ushers…"></label>
      <div class="row" style="justify-content:space-between"><div class="row"><button class="btn cta" data-act="saveTeam" data-id="${esc(id || '')}">Save</button><button class="btn ghost" data-act="closeModal">Cancel</button></div>${id ? `<button class="btn danger" data-act="delTeam" data-id="${esc(id)}">Delete team</button>` : ''}</div>`);
  },
  async saveTeam(el) {
    const name = val('tmName').trim(); if (!name) { toast('Give the team a name.'); return; }
    const id = el.dataset.id; closeModal();
    const row = id ? { id, name, sort: S.teams[id].sort || 0 } : { name, sort: Math.max(0, ...teamsList().map(t => t.sort || 0)) + 1 };
    if (await q(sb.from('teams').upsert(row))) { reload(); if (!id) { ui.psub = 'teams'; toast(`Created ${name}. Add its positions next.`); } }
  },
  async delTeam(el) {
    if (!tapTwice(el, 'Tap again: its positions and assignments go too')) return;
    closeModal(); if (await q(sb.from('teams').delete().eq('id', el.dataset.id))) reload();
  },
  editPosition(el) {
    const id = el.dataset.id; const p = id ? S.pos[id] : { team: el.dataset.team, name: '', min: 1, pref: 1, active: true };
    modal(`<h2>${id ? 'Edit position' : 'New position'}</h2><label class="f">Position name<input type="text" id="psName" value="${esc(p.name)}" placeholder="Sound desk, Worship leader, Usher…"></label>
      <label class="f">Team<select id="psTeam">${teamsList().map(t => `<option value="${esc(t.id)}" ${t.id === p.team ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <div class="row" style="flex-wrap:nowrap;align-items:end"><label class="f">Minimum per service<input type="number" id="psMin" min="0" max="20" value="${esc(p.min)}"></label><label class="f">Preferred per service<input type="number" id="psPref" min="1" max="20" value="${esc(p.pref)}"></label></div>
      <div class="checks"><label><input type="checkbox" id="psAct" ${p.active !== false ? 'checked' : ''}> Schedule this position (uncheck to pause it)</label></div>
      <div class="f" style="font-size:.85rem;font-weight:600;display:grid;gap:8px">Who can serve${people().length ? `<div class="checks">${people().map(x => `<label><input type="checkbox" class="psWho" value="${esc(x.id)}" ${id && qualified(x.id, id) ? 'checked' : ''}> ${esc(x.name)}</label>`).join('')}</div>` : '<span class="sub" style="margin:0;font-weight:400">Add people first, then tick them here.</span>'}</div>
      <div class="row" style="justify-content:space-between"><div class="row"><button class="btn cta" data-act="savePosition" data-id="${esc(id || '')}">Save</button><button class="btn ghost" data-act="closeModal">Cancel</button></div>${id ? `<button class="btn danger" data-act="delPosition" data-id="${esc(id)}">Delete</button>` : ''}</div>`);
  },
  async savePosition(el) {
    const name = val('psName').trim(); const min = Math.max(0, Math.round(+val('psMin') || 0)); const pref = Math.max(1, Math.round(+val('psPref') || 1));
    if (!name) { toast('Give the position a name.'); return; }
    if (pref < min) { toast('Preferred has to be at least the minimum.'); return; }
    // Read everything from the form before closing it.
    const id = el.dataset.id; const team = val('psTeam'); const active = !!document.getElementById('psAct')?.checked;
    const who = [...document.querySelectorAll('.psWho:checked')].map(x => x.value);
    closeModal();
    const row = { name, team_id: team, min_needed: min, preferred: pref, active };
    if (id) { row.id = id; row.sort = S.pos[id].sort || 0; } else row.sort = Math.max(0, ...allPositions().filter(p => p.team === team).map(p => p.sort || 0)) + 1;
    const saved = await q(sb.from('positions').upsert(row).select('id').single()); if (!saved) return;
    const pid = saved.id || id;
    const drop = people().filter(x => qualified(x.id, pid) && !who.includes(x.id)).map(x => x.id);
    if (drop.length) await q(sb.from('person_positions').delete().eq('position_id', pid).in('person_id', drop));
    const add = who.filter(x => !qualified(x, pid));
    if (add.length) await q(sb.from('person_positions').upsert(add.map(x => ({ person_id: x, position_id: pid })), { onConflict: 'person_id,position_id', ignoreDuplicates: true }));
    reload(); if (!id) toast(who.length ? `Added ${name}.` : `Added ${name}. Tick who can serve it, here or on each person.`);
  },
  async delPosition(el) {
    if (!tapTwice(el, 'Tap again: its assignments go too')) return;
    closeModal(); if (await q(sb.from('positions').delete().eq('id', el.dataset.id))) reload();
  },

  /* templates */
  tsub(el) { ui.tsub = el.dataset.v; render(); },
  useTpl(el) { saveCfg({ [el.dataset.svc + 'Tpl']: el.value }); },
  tName(el) { draftOf(el.dataset.tid).name = el.value; },
  tLang(el) { draftOf(el.dataset.tid).lang = el.value; render(); },
  oItem(el) { draftOf(el.dataset.tid).order.find(o => o.id === el.dataset.id).item = el.value; },
  oMin(el) { const d = draftOf(el.dataset.tid); d.order.find(o => o.id === el.dataset.id).min = Math.max(0, +el.value || 0); const t = document.getElementById('tot-' + el.dataset.tid); if (t) t.textContent = d.order.reduce((a, o) => a + (+o.min || 0), 0) + ' MIN TOTAL'; },
  oMove(el) { const d = draftOf(el.dataset.tid); const i = +el.dataset.i, j = i + +el.dataset.k; [d.order[i], d.order[j]] = [d.order[j], d.order[i]]; render(); },
  oDel(el) { const d = draftOf(el.dataset.tid); d.order = d.order.filter(o => o.id !== el.dataset.id); render(); },
  oAdd(el) { const d = draftOf(el.dataset.tid); const id = 'i' + uid(); d.order.push({ id, item: '', min: 5 }); render(); document.getElementById(`ti-${el.dataset.tid}-${id}`)?.focus(); },
  async tSave(el) {
    const tid = el.dataset.tid; const d = draftOf(tid); await seedTemplates(tid);
    const row = { id: tid, name: d.name.trim() || 'Untitled template', lang: d.lang, items: d.order.filter(o => o.item.trim()).map(o => ({ id: o.id, item: o.item.trim(), min: +o.min || 0 })) };
    if (await q(sb.from('templates').upsert(row))) { delete ui.drafts[tid]; toast(`${row.name} saved.`); reload(); }
  },
  async tDel(el) {
    const tid = el.dataset.tid; const c = cfg(); if (c.enTpl === tid || c.frTpl === tid) { toast('This template is in use. Pick another one for that service first.'); return; }
    await seedTemplates(tid); delete ui.drafts[tid]; if (await q(sb.from('templates').delete().eq('id', tid))) reload();
  },
  async tNew() { await seedTemplates(); if (await q(sb.from('templates').insert({ id: 'tpl-' + uid(), name: 'New template', lang: 'en', items: [{ id: 'i1', item: 'Welcome', min: 5 }] }))) reload(); },
  ckText(el) { const d = ui.chkDraft; d.list.find(k => k.id === el.dataset.id).text = el.value; if (!d.dirty) { d.dirty = true; const b = document.querySelector('[data-act=ckSave]'); if (b) b.disabled = false; } },
  ckDel(el) { const d = ui.chkDraft; d.list = d.list.filter(k => k.id !== el.dataset.id); d.dirty = true; render(); },
  ckAdd(el) { const id = 'k' + uid(); ui.chkDraft.list.push({ id, phase: el.dataset.ph, text: '' }); ui.chkDraft.dirty = true; render(); document.getElementById('ck-' + id)?.focus(); },
  async ckSave() { const list = ui.chkDraft.list.filter(k => k.text.trim()).map(k => ({ ...k, text: k.text.trim() })); ui.chkDraft.dirty = false; if (await saveCfg({ checklist: list })) { ui.chkDraft = null; toast('Checklists saved.'); } },

  closeModal(el, ev) { if (ev && el.classList.contains('modal-bg') && ev.target !== el) return; closeModal(); },
  reloadPage() { location.reload(); },

  /* sign-in */
  goSignin() { ui.authView = 'signin'; ui.authMsg = ''; render(); },
  goLanding() { ui.authView = 'landing'; render(); },
  authAgain() { ui.authSent = false; ui.authMsg = ''; render(); },
  async magic() {
    const email = val('aEmail').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { ui.authMsg = 'Enter a valid email address.'; render(); return; }
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    ui.authMsg = error ? 'Could not send the link: ' + error.message : `Check ${email} for a sign-in link. It works once and expires in an hour.`; ui.authSent = !error; render();
  },
  async google() { const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } }); if (error) { ui.authMsg = 'Google sign-in is not set up yet. Use the email link for now.'; render(); } },
  async signOut() { await sb.auth.signOut(); ui.authView = 'landing'; render(); },
};

/* Actions fired by `change` or `input` instead of `click`. */
export const CHANGE = new Set(['assign', 'useTpl', 'tLang', 'impFile', 'impMap', 'impOpt', 'repNote', 'actArea', 'actActor', 'pf', 'pfLoad', 'pSel', 'pBulkCat', 'pFamPick', 'cmpChannel', 'fuMine', 'fuAssign', 'fuDue']);
export const INPUT = new Set(['tName', 'oItem', 'oMin', 'ckText', 'ciSearch', 'actText', 'pfQ', 'cmpSubject', 'cmpBody']);
export { TABS, ic };
