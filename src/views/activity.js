/* Activity log (admins): every change, who made it and when. Loaded on demand, newest first. */
import { ui } from '../state.js';
import { esc } from '../util.js';
import { ic } from '../icons.js';
import { feed, AREAS, actorName } from '../activity.js';

export const actState = () => ui.act || (ui.act = { rows: [], loaded: false, loading: false, done: false, error: '', area: '', actor: '', text: '' });

function dayLabel(ms, now = Date.now()) {
  const d = new Date(ms); const t = new Date(now); const key = x => x.getFullYear() * 400 + x.getMonth() * 32 + x.getDate();
  const y = new Date(t); y.setDate(t.getDate() - 1);
  if (key(d) === key(t)) return 'Today';
  if (key(d) === key(y)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
}

/** The entries list, also redrawn on its own while someone types in the search box. */
export function activityListHtml() {
  const a = actState();
  if (a.error) return `<div class="empty">${esc(a.error)}</div>`;
  if (!a.loaded) return '<div class="empty">Loading the activity log…</div>';
  const items = feed(a.rows, { area: a.area, actor: a.actor, text: a.text });
  if (!items.length) return `<div class="empty">${a.rows.length ? 'Nothing matches these filters.' : 'No changes recorded yet. Everything changed from now on will appear here.'}</div>`;
  let h = ''; let last = '';
  for (const it of items) {
    const d = dayLabel(it.at); if (d !== last) { h += `<h4 class="act-day">${esc(d)}</h4>`; last = d; }
    const time = new Date(it.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    h += `<div class="act-it"><span class="act-tm">${time}</span><span class="act-ic a-${it.area}">${ic(it.icon)}</span>
      <div class="act-tx"><b>${esc(it.who)}</b> ${esc(it.text)}${it.more ? `<details><summary>Show all ${it.more.length}</summary><ul>${it.more.slice(0, 200).map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}<small>${esc(AREAS[it.area] || '')}</small></div></div>`;
  }
  return h;
}

export function vActivity() {
  const a = actState(); const actors = [...new Set(a.rows.map(r => r.actor))];
  return `<div class="head"><div><h1>Activity log</h1><p class="sub">Every change to the schedule, people, members, check-ins, events and reports: who made it and when. Only administrators see this.</p></div>
      <button class="btn" data-act="actRefresh" ${a.loading ? 'disabled' : ''}>${a.loading ? 'Loading…' : 'Refresh'}</button></div>
    <div class="act-filters card">
      <div class="ci-search">${ic('search')}<input type="search" class="draft" id="actQ" data-act="actText" value="${esc(a.text)}" placeholder="Search: a name, a date, a position…" aria-label="Search the activity log" autocomplete="off"></div>
      <div class="row act-sel"><label class="f">Area<select data-act="actArea"><option value="">Everything</option>${Object.entries(AREAS).map(([k, l]) => `<option value="${k}" ${a.area === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <label class="f">Changed by<select data-act="actActor"><option value="">Anyone</option>${actors.map(x => `<option value="${esc(x)}" ${a.actor === x ? 'selected' : ''}>${esc(actorName(x))}</option>`).join('')}</select></label></div></div>
    <div class="card act-list" id="actList">${activityListHtml()}</div>
    ${a.loaded && !a.done ? `<div><button class="btn" data-act="actMore" ${a.loading ? 'disabled' : ''}>Load older changes</button></div>` : ''}`;
}
