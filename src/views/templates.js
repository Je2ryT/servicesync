import { ui, me } from '../state.js';
import { SVC, PHASES } from '../config.js';
import { esc } from '../util.js';
import { ic } from '../icons.js';
import { templates, cfg, tplFor, total } from '../domain.js';
import { tagsLine } from './layout.js';

export function vTemplates() {
  const T = templates(); const c = cfg(); const ed = me.admin;
  let h = `<div><h1>Templates &amp; checklists</h1><p class="sub">Reusable order of service per language, and what every coordinator does before, during and after.</p></div>
   <div><div class="seg"><button data-act="tsub" data-v="order" aria-pressed="${ui.tsub === 'order'}">Order of service</button><button data-act="tsub" data-v="check" aria-pressed="${ui.tsub === 'check'}">Checklists</button></div></div>`;
  if (ui.tsub === 'check') {
    const d = ui.chkDraft || (ui.chkDraft = { list: structuredClone(c.checklist), dirty: false });
    h += '<div class="grid2">' + PHASES.map(([p, l]) => {
      const it = d.list.filter(k => k.phase === p);
      return `<div class="card tpl"><h3>${l}</h3>${ed ? it.map(k => `<div class="trow"><input type="text" class="draft" id="ck-${esc(k.id)}" data-act="ckText" data-id="${esc(k.id)}" value="${esc(k.text)}" aria-label="Task"><button class="ib" data-act="ckDel" data-id="${esc(k.id)}" aria-label="Delete">${ic('trash')}</button></div>`).join('') + `<div><button class="btn" data-act="ckAdd" data-ph="${p}">${ic('plus')} Add task</button></div>` : `<ul class="ro">${it.map(k => `<li>${esc(k.text)}</li>`).join('')}</ul>`}</div>`;
    }).join('') + '</div>';
    if (ed) h += `<div class="row"><button class="btn cta" data-act="ckSave" ${d.dirty ? '' : 'disabled'}>Save checklists</button>${d.dirty ? '<span class="sub" style="margin:0">Unsaved changes</span>' : ''}</div>`;
    return h;
  }
  h += `<div class="grid2">${['en', 'fr'].map(s => `<div class="card tpl"><b>${SVC[s].name} uses</b>${ed ? `<select data-act="useTpl" data-svc="${s}" aria-label="${SVC[s].name} template">${Object.entries(T).map(([id, t]) => `<option value="${esc(id)}" ${c[s + 'Tpl'] === id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>` : `<span>${esc(tplFor(null, s).name)}</span>`}</div>`).join('')}</div>`;
  h += '<div class="grid2">' + Object.entries(T).map(([id, t0]) => {
    const t = ui.drafts[id] || t0; const dirty = !!ui.drafts[id];
    if (!ed) return `<div class="card tpl"><h3>${esc(t.name)}</h3><div class="row"><span class="pill info">${t.lang === 'fr' ? 'French' : 'English'}</span><span class="pill mute">${total(t)} MIN TOTAL</span></div><ul class="ro">${t.order.map(o => `<li>${esc(o.item)} <span class="sub" style="display:inline">· ${esc(o.min)} min</span>${(o.roles || []).length ? tagsLine(id, o, false) : ''}</li>`).join('')}</ul></div>`;
    return `<div class="card tpl"><div class="nmrow"><input type="text" class="draft" id="tn-${esc(id)}" data-act="tName" data-tid="${esc(id)}" value="${esc(t.name)}" aria-label="Template name"><select data-act="tLang" data-tid="${esc(id)}" aria-label="Language"><option value="en" ${t.lang === 'en' ? 'selected' : ''}>English</option><option value="fr" ${t.lang === 'fr' ? 'selected' : ''}>French</option></select></div>
     <div class="row"><span class="pill info">${t.lang === 'fr' ? 'French' : 'English'}</span><span class="pill mute" id="tot-${esc(id)}">${total(t)} MIN TOTAL</span>${dirty ? '<span class="pill warn">Unsaved</span>' : ''}</div>
     ${t.order.map((o, i) => `<div class="irow"><span class="n">${i + 1}</span><input type="text" class="draft" id="ti-${esc(id)}-${esc(o.id)}" data-act="oItem" data-tid="${esc(id)}" data-id="${esc(o.id)}" value="${esc(o.item)}" aria-label="Item"><input type="number" class="draft" id="tm-${esc(id)}-${esc(o.id)}" min="0" max="240" data-act="oMin" data-tid="${esc(id)}" data-id="${esc(o.id)}" value="${esc(o.min)}" aria-label="Minutes"><button class="ib" data-act="oMove" data-tid="${esc(id)}" data-i="${i}" data-k="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${ic('up')}</button><button class="ib" data-act="oMove" data-tid="${esc(id)}" data-i="${i}" data-k="1" ${i === t.order.length - 1 ? 'disabled' : ''} aria-label="Move down">${ic('down')}</button><button class="ib" data-act="oDel" data-tid="${esc(id)}" data-id="${esc(o.id)}" aria-label="Delete">${ic('trash')}</button></div>${tagsLine(id, o, true)}`).join('')}
     <div class="row" style="justify-content:space-between"><div class="row"><button class="btn" data-act="oAdd" data-tid="${esc(id)}">${ic('plus')} Add item</button><button class="btn cta" data-act="tSave" data-tid="${esc(id)}">Save</button></div><button class="btn danger" data-act="tDel" data-tid="${esc(id)}">Delete</button></div></div>`;
  }).join('') + '</div>';
  if (ed) h += `<div><button class="btn" data-act="tNew">${ic('plus')} New template</button></div>`;
  return h;
}
