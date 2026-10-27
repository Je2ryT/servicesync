/* Follow-ups: a board per flow (one column per step), "my follow-ups", and the forms around it. */
import { S, ui, me } from '../state.js';
import { esc } from '../util.js';
import { ic } from '../icons.js';
import { t, lang, dateText } from '../i18n.js';
import { flowList, stepsOf, flowName, stepTitle, board, isOverdue, isDueToday, daysLate, myFollowups, entriesOfMember } from '../flows.js';
import { people as servingTeam, myPerson, pname } from '../domain.js';
import { everyone } from '../people.js';
import { dbNeeded } from './directory.js';

const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
const dueText = e => (isOverdue(e) ? t('lateDays', { n: daysLate(e) }) : isDueToday(e) ? t('dueToday') : e.due ? t('due', { d: dateText(e.due, { month: 'short', day: 'numeric' }) }) : '');
const assignOpts = sel => `<option value="">${esc(t('unassigned'))}</option>` + servingTeam().filter(p => p.active !== false).map(p => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');

/** One follow-up card (used on the board, on Home and on profiles). */
export function fuCard(e, { showStep = false, compact = false } = {}) {
  const m = S.members[e.member] || { name: '?' }; const L = lang();
  return `<div class="fu ${isOverdue(e) ? 'late' : isDueToday(e) ? 'today' : ''}">
    <button class="fu-who" data-act="openPerson" data-id="${esc(e.member)}"><span class="pr-av" aria-hidden="true">${esc(initials(m.name))}</span><span><b>${esc(m.name)}</b>
      <small>${showStep ? esc(t('inFlow', { flow: flowName(e.flow, L), step: stepTitle(e.step, L) })) + ' · ' : ''}${m.phone ? esc(m.phone) : ''}</small></span></button>
    <div class="fu-meta"><span class="fu-due">${ic('clock')} ${esc(dueText(e))}</span>${compact ? `<span class="fu-as">${esc(e.assignee ? pname(e.assignee) : t('unassigned'))}</span>` : ''}</div>
    ${compact ? '' : `<div class="fu-ctl"><select data-act="fuAssign" data-id="${esc(e.id)}" aria-label="${esc(t('assignTo'))}">${assignOpts(e.assignee)}</select>
      <input type="date" data-act="fuDue" data-id="${esc(e.id)}" value="${esc(e.due || '')}" aria-label="${esc(t('dueDate'))}"></div>`}
    <button class="btn cta sm" data-act="fuDone" data-id="${esc(e.id)}">${ic('check')} ${esc(t('markDone'))}</button>
  </div>`;
}

export function vFollowups() {
  if (ui.flowsMissing) return `<div><h1>${esc(t('followups'))}</h1></div>${dbNeeded('migrations/008-followups.sql')}`;
  const flows = flowList(); const L = lang();
  if (!flows.length) return `<div><h1>${esc(t('followups'))}</h1></div><div class="card empty">${esc(t('noFlows'))} ${me.admin ? `<button class="btn link" data-act="flowEdit" data-id="">${esc(t('newFlow'))}</button>` : esc(t('noFlowsAsk'))}</div>`;
  if (!S.flows[ui.flow]) ui.flow = flows[0].id;
  const b = board(ui.flow, { mine: ui.fmine });
  return `<div class="head"><div><h1>${esc(t('followups'))}</h1><p class="sub">${esc(t('followupsSub'))}</p></div>
      <div class="row">${me.admin ? `<button class="btn" data-act="flowEdit" data-id="${esc(ui.flow)}">${ic('pencil')} ${esc(t('editFlow'))}</button>` : ''}<button class="btn cta" data-act="fuAdd">${ic('plus')} ${esc(t('addToFlow'))}</button></div></div>
    <div class="fu-bar">
      ${flows.length > 1 ? `<div class="seg">${flows.map(f => `<button data-act="flowPick" data-id="${esc(f.id)}" aria-pressed="${f.id === ui.flow}">${esc(flowName(f.id, L))}</button>`).join('')}</div>` : `<h2 class="fu-flow">${esc(flowName(ui.flow, L))}</h2>`}
      <div class="row"><span class="pill info">${esc(t('activeN', { n: b.active }))}</span>${b.overdue ? `<span class="pill bad">${esc(t('overdueN', { n: b.overdue }))}</span>` : ''}<span class="pill mute">${esc(t('doneN', { n: b.done }).toUpperCase())}</span>
        ${myPerson() ? `<label class="chip"><input type="checkbox" data-act="fuMine" ${ui.fmine ? 'checked' : ''}> ${esc(t('onlyMine'))}</label>` : ''}${me.admin ? `<button class="btn link" data-act="flowEdit" data-id="">${ic('plus')} ${esc(t('newFlow'))}</button>` : ''}</div></div>
    <div class="board" style="--cols:${b.cols.length}">${b.cols.map((c, i) => `<section class="col"><header><span class="n">${i + 1}</span><b>${esc(stepTitle(c.step.id, L))}</b><span class="cnt">${c.items.length}</span></header>
      ${c.items.length ? c.items.map(e => fuCard(e)).join('') : `<p class="empty">${esc(t('emptyStep'))}</p>`}</section>`).join('')}</div>`;
}

/** Home: what's assigned to me. */
export function myFollowupsCard() {
  if (ui.flowsMissing || !myPerson()) return '';
  const list = myFollowups(); const late = list.filter(e => isOverdue(e)).length;
  return `<section class="card fu-home"><div class="ch"><h3>${ic('users')} ${esc(t('myFollowups'))}</h3>${late ? `<span class="pill bad">${esc(t('overdueN', { n: late }))}</span>` : list.length ? `<span class="pill info">${list.length}</span>` : ''}</div>
    ${list.length ? `<div class="fu-list">${list.slice(0, 5).map(e => fuCard(e, { showStep: true, compact: true })).join('')}</div>${list.length > 5 ? `<p class="sub nfoot"><button class="btn link" data-act="tab" data-tab="followups">${esc(t('seeAll'))} (${list.length})</button></p>` : ''}`
      : `<div class="empty">${esc(t('noMine'))}</div>`}</section>`;
}

/** Profile: this person's follow-ups. */
export function profileFollowups(memberId) {
  if (ui.flowsMissing) return '';
  const list = entriesOfMember(memberId); const L = lang();
  return `<section class="card"><div class="ch"><h3>${esc(t('followups'))}</h3><button class="btn link" data-act="fuAdd" data-member="${esc(memberId)}">${ic('plus')} ${esc(t('addFollowup'))}</button></div>
    ${list.length ? `<div class="fu-list">${list.map(e => (e.status === 'active' ? fuCard(e, { showStep: true, compact: true })
      : `<div class="fu done"><span>${ic('checkc')} <b>${esc(flowName(e.flow, L))}</b> · ${esc(e.status === 'done' ? t('finished') : e.status)}${e.completed ? ' · ' + esc(dateText(new Date(e.completed).toISOString().slice(0, 10))) : ''}</span></div>`)).join('')}</div>` : '<div class="empty">—</div>'}</section>`;
}

/* ---------- forms ---------- */
export function doneForm(id) {
  const e = S.fentries[id]; const L = lang(); const steps = stepsOf(e.flow); const i = steps.findIndex(s => s.id === e.step); const next = steps[i + 1];
  return `<h2>${esc(t('doneTitle', { step: stepTitle(e.step, L) || t('followup') }))}</h2><p class="sub" style="margin:0">${esc(S.members[e.member]?.name || '')}</p>
    <label class="f">${esc(t('doneNote'))}<textarea id="fuNote" rows="3"></textarea></label>
    <p class="sub" style="margin:0">${esc(next ? t('doneNext', { step: stepTitle(next.id, L) }) : t('doneLast'))}</p>
    <div class="row"><button class="btn cta" data-act="fuDoneGo" data-id="${esc(id)}">${ic('check')} ${esc(t('markDone'))}</button><button class="btn ghost" data-act="closeModal">${esc(t('cancel'))}</button></div>`;
}

export function addForm(memberId) {
  const L = lang(); const list = everyone();
  return `<h2>${esc(t('addFollowup'))}</h2>
    <label class="f">${esc(t('choosePerson'))}<select id="fuMember">${list.map(m => `<option value="${esc(m.id)}" ${m.id === memberId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
    <label class="f">${esc(t('whichFlow'))}<select id="fuFlow">${flowList().map(f => `<option value="${esc(f.id)}" ${f.id === ui.flow ? 'selected' : ''}>${esc(flowName(f.id, L))}</option>`).join('')}</select></label>
    <div class="row"><button class="btn cta" data-act="fuAddGo">${esc(t('save'))}</button><button class="btn ghost" data-act="closeModal">${esc(t('cancel'))}</button></div>`;
}

/** Flow editor (admins): name and steps, kept in ui.flowDraft until Save. */
export function flowForm() {
  const d = ui.flowDraft;
  return `<h2>${esc(d.id ? t('editFlow') : t('newFlow'))}</h2>
    <div class="grid-2"><label class="f">${esc(t('flowName'))}<input type="text" id="flName" value="${esc(d.name)}"></label><label class="f">${esc(t('nameFr'))}<input type="text" id="flNameFr" value="${esc(d.nameFr)}"></label></div>
    <div class="fl-steps">${d.steps.map((s, i) => `<div class="fl-step"><span class="n">${i + 1}</span>
      <input type="text" data-si="${i}" data-f="title" value="${esc(s.title)}" placeholder="${esc(t('titleEn'))}" aria-label="${esc(t('titleEn'))}">
      <input type="text" data-si="${i}" data-f="titleFr" value="${esc(s.titleFr)}" placeholder="${esc(t('titleFr'))}" aria-label="${esc(t('titleFr'))}">
      <select data-si="${i}" data-f="assignee" aria-label="${esc(t('defaultPerson'))}">${assignOpts(s.assignee)}</select>
      <label class="fl-days"><input type="number" min="0" max="365" data-si="${i}" data-f="days" value="${esc(s.days)}" aria-label="${esc(t('dueInDays'))}"> ${esc(t('dueInDays'))}</label>
      <button class="ib" data-act="flowStepMove" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${ic('up')}</button><button class="ib" data-act="flowStepDel" data-i="${i}" aria-label="${esc(t('del'))}">${ic('trash')}</button></div>`).join('')}</div>
    <div><button class="btn" data-act="flowStepAdd">${ic('plus')} ${esc(t('addStep'))}</button></div>
    <div class="row"><button class="btn cta" data-act="flowSave">${esc(t('save'))}</button><button class="btn ghost" data-act="closeModal">${esc(t('cancel'))}</button></div>`;
}
