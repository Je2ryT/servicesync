/* Check-in: the serving team records who came to each service. */
import { S, T, ui, me } from '../state.js';
import { SVC } from '../config.js';
import { esc, fmt } from '../util.js';
import { ic } from '../icons.js';
import { searchMembers, isIn, attKey, attendanceSummary, defaultSvc, streak, STATUS, membersList } from '../members.js';
import { cats, catOf, catName, isVisitor } from '../people.js';
import { can, isFull } from '../access.js';

export const dbUpdateCard = file => `<div class="card empty">This needs a database update. Run <code>migrations/${file}</code> in Supabase, then reload.</div>`;
export const ciService = () => ui.ciSvc || defaultSvc();
const svcLabel = s => (s === 'ev' ? 'Special event' : SVC[s].name);

/** The member list, also redrawn on its own while someone types in the search box. */
export function ciListHtml() {
  const svc = ciService(); const date = T.todayIso; const list = searchMembers(ui.ciQuery);
  if (!membersList().length) return `<div class="empty">No members yet. ${can('people') ? '<button class="btn link" data-act="impOpen">Import everyone from Elvanto</button> or add' : 'Add'} the first person with <b>New person</b>.</div>`;
  if (!list.length) return `<div class="empty">Nobody matches “${esc(ui.ciQuery)}”. <button class="btn link" data-act="addMember" data-name="${esc(ui.ciQuery)}">${ic('plus')} Add ${esc(ui.ciQuery)} as a newcomer</button></div>`;
  return list.map(m => {
    const a = S.att[attKey(m.id, date, svc)]; const st = streak(m.id);
    return `<div class="ci ${a ? 'in' : ''}">
      <button class="ci-main" data-act="ciToggle" data-id="${esc(m.id)}" aria-pressed="${!!a}">
        <span class="dot">${a ? ic('check') : ''}</span>
        <span class="ci-name"><b>${esc(m.name)}</b><small>${isVisitor(m) ? `<span class="pill warn">${esc(ui.peopleMissing && m.status === 'visitor' ? 'Visitor' : ui.peopleMissing ? 'Newcomer' : catName('visitors'))}</span> ` : catOf(m) === 'new-believers' ? `<span class="pill info">${esc(catName('new-believers'))}</span> ` : ''}${a ? `Checked in ${new Date(a.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : `${st.came} of last ${st.of} Sundays`}</small></span>
      </button>
      ${can('people') ? `<button class="ib" data-act="editMember" data-id="${esc(m.id)}" aria-label="Edit ${esc(m.name)}">${ic('pencil')}</button>` : ''}
    </div>`;
  }).join('');
}

export function vCheckin() {
  if (ui.membersMissing) return `<div><h1>Check-in</h1></div>${dbUpdateCard('003-members-attendance-events.sql')}`;
  const svc = ciService(); const sum = attendanceSummary(T.todayIso);
  return `<div class="head"><div><h1>Check-in</h1><p class="sub">${esc(fmt(T.todayIso, { weekday: 'long', month: 'long', day: 'numeric' }))} · tap a name when someone arrives</p></div>
      <div class="row">${can('people') ? `<button class="btn" data-act="impOpen">${ic('users')} Import from Elvanto</button>` : ''}<button class="btn cta" data-act="addMember">${ic('plus')} New person</button></div></div>
    <div class="stabs">${['en', 'fr', 'ev'].map(k => `<button data-act="ciSvc" data-svc="${k}" aria-pressed="${k === svc}">${esc(svcLabel(k))}<small>${sum[k]} checked in</small></button>`).join('')}</div>
    <div class="ci-wrap">
      <div class="card"><div class="ci-search">${ic('search')}<input type="search" class="draft" id="ciQ" data-act="ciSearch" value="${esc(ui.ciQuery)}" placeholder="Search by name or phone" aria-label="Search members" autocomplete="off"></div>
        <div class="ci-list" id="ciList">${ciListHtml()}</div></div>
      <div class="card ci-sum"><div class="ch"><h3>Today</h3></div>
        <div class="ci-stats"><div><b>${sum.people}</b><span>People</span></div><div><b>${sum.en}</b><span>English</span></div><div><b>${sum.fr}</b><span>French</span></div><div><b>${sum.newcomers}</b><span>Newcomers</span></div></div>
        <p class="sub" style="padding:0 20px 18px;margin:0">${esc(svcLabel(svc))}: ${sum[svc]} checked in. Someone who comes to both services can be checked into each.</p></div>
    </div>`;
}

/** Add or edit a member (admins edit; anyone on the roster can add a newcomer at the door). */
export function memberForm(id, prefill = '') {
  const split = (prefill || '').trim().split(/\s+/);
  const m = id ? S.members[id] : { name: prefill, first: split[0] || '', last: split.slice(1).join(' '), phone: '', email: '', lang: ciService() === 'en' ? 'en' : 'fr', status: 'newcomer', categoryId: 'visitors', household: '', notes: '' };
  const rich = !ui.peopleMissing;   // migration 006: first/last name and categories
  const opt = (o, v) => Object.entries(o).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('');
  return `<h2>${id ? esc(m.name) : 'New person'}</h2>
    ${rich ? `<div class="row" style="flex-wrap:nowrap;align-items:end"><label class="f" style="flex:1">First name<input type="text" id="mFirst" value="${esc(m.first || '')}"></label><label class="f" style="flex:1">Last name<input type="text" id="mLast" value="${esc(m.last || '')}"></label></div>`
      : `<label class="f">Full name<input type="text" id="mName" value="${esc(m.name)}" placeholder="First and last name"></label>`}
    <div class="row" style="flex-wrap:nowrap;align-items:end"><label class="f" style="flex:1">Phone<input type="tel" id="mPhone" value="${esc(m.phone)}" placeholder="+1 704 555 0100"></label>
      <label class="f" style="flex:1">Language<select id="mLang">${opt({ fr: 'French', en: 'English', both: 'Both' }, m.lang)}</select></label></div>
    <label class="f">Email (optional)<input type="email" id="mEmail" value="${esc(m.email)}"></label>
    <div class="row" style="flex-wrap:nowrap;align-items:end">${rich ? `<label class="f" style="flex:1">Category<select id="mCat">${cats().map(c => `<option value="${esc(c.id)}" ${c.id === catOf(m) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : `<label class="f" style="flex:1">Status<select id="mStatus">${opt(STATUS, m.status)}</select></label>`}
      <label class="f" style="flex:1">Family / household<input type="text" id="mHouse" value="${esc(m.household)}" placeholder="e.g. Mukendi family"></label></div>
    ${can('people') && !rich ? `<label class="f">Notes<textarea id="mNotes" rows="2">${esc(m.notes)}</textarea></label>` : ''}
    ${id ? '' : `<div class="checks"><label><input type="checkbox" id="mIn" checked> Check in now (${esc(svcLabel(ciService()))})</label></div>`}
    <div class="row" style="justify-content:space-between"><div class="row"><button class="btn cta" data-act="saveMember" data-id="${esc(id || '')}">Save</button><button class="btn ghost" data-act="closeModal">Cancel</button></div>
      ${id && can('people') ? `<button class="btn danger" data-act="delMember" data-id="${esc(id)}">Remove</button>` : ''}</div>`;
}
