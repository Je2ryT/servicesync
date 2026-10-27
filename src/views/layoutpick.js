/* Choosing the layout (order of service) for an event or a service:
   Sunday service layout · French service layout · Custom (an existing layout, or a new one).
   "Sunday" and "French" are stored as '@en' / '@fr', so they follow whatever Templates sets
   as the English and French Sunday layouts. */
import { S } from '../state.js';
import { esc } from '../util.js';
import { t } from '../i18n.js';
import { templates, cfg } from '../domain.js';

export const SUNDAY = '@en', FRENCH = '@fr';
/** The template a stored choice points to ('@en' → the English Sunday layout, etc.). */
export const resolveTpl = id => (id === SUNDAY ? cfg().enTpl : id === FRENCH ? cfg().frTpl : id);
/** Which radio a stored choice shows as. */
export function modeOf(id, { allowNone = false } = {}) {
  if (!id) return allowNone ? 'none' : 'en';
  if (id === SUNDAY) return 'en';
  if (id === FRENCH) return 'fr';
  return 'custom';
}
/** Layouts offered under "Custom": everything except the two Sunday layouts. */
export const customLayouts = () => Object.entries(templates()).filter(([id]) => id !== cfg().enTpl && id !== cfg().frTpl).map(([id, x]) => ({ id, ...x })).sort((a, b) => a.name.localeCompare(b.name));
const nameOf = id => templates()[resolveTpl(id)]?.name || '';

/**
 * The picker. `p` prefixes the field ids so two pickers never clash.
 * `current`: stored choice ('@en', '@fr', a template id, or '' for none). `newName`: suggested name for a new layout.
 */
export function layoutPicker(p, current = '', { allowNone = false, newName = '' } = {}) {
  const mode = modeOf(current, { allowNone }); const custom = customLayouts();
  const pickedCustom = mode === 'custom' ? current : (custom[0]?.id || '__new');
  const radio = (v, title, sub) => `<label class="lp-opt"><input type="radio" name="${p}Mode" value="${v}" data-act="lpMode" data-p="${p}" ${mode === v ? 'checked' : ''}><span><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></label>`;
  return `<div class="lp" id="${p}Lp" data-mode="${mode}" data-new="${pickedCustom === '__new' ? 1 : ''}">
    <span class="lp-h">${esc(t('layoutPick'))}</span>
    <div class="lp-opts">
      ${allowNone ? radio('none', t('lpNone'), t('lpNoneSub')) : ''}
      ${radio('en', t('lpSunday'), nameOf(SUNDAY))}
      ${radio('fr', t('lpFrench'), nameOf(FRENCH))}
      ${radio('custom', t('lpCustom'), t('lpCustomSub'))}
    </div>
    <div class="lp-custom">
      <label class="f">${esc(t('lpWhich'))}<select id="${p}Tpl" data-act="lpTpl" data-p="${p}">
        ${custom.map(x => `<option value="${esc(x.id)}" ${x.id === pickedCustom ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
        <option value="__new" ${pickedCustom === '__new' ? 'selected' : ''}>＋ ${esc(t('lpNew'))}</option></select></label>
      <div class="lp-new">
        <label class="f">${esc(t('lpNewName'))}<input type="text" id="${p}NewName" value="${esc(newName)}" placeholder="${esc(t('lpNewNamePh'))}"></label>
        <label class="f">${esc(t('lpStartFrom'))}<select id="${p}From"><option value="blank">${esc(t('lpBlank'))}</option><option value="${SUNDAY}">${esc(t('lpCopyOf', { name: nameOf(SUNDAY) }))}</option><option value="${FRENCH}">${esc(t('lpCopyOf', { name: nameOf(FRENCH) }))}</option></select></label>
      </div>
    </div>
  </div>`;
}

/** What the picker says, read from the form (call before the form closes). */
export function readPicker(p) {
  const mode = document.querySelector(`input[name="${p}Mode"]:checked`)?.value || 'en';
  const tpl = document.getElementById(`${p}Tpl`)?.value || '__new';
  return { mode, tpl, newName: (document.getElementById(`${p}NewName`)?.value || '').trim(), from: document.getElementById(`${p}From`)?.value || 'blank' };
}

/** A new layout's items: empty, or a copy of a Sunday layout (with fresh ids). */
export function newLayoutItems(from) {
  if (from === 'blank') return [];   // starts empty; the parts are added on Templates
  const src = templates()[resolveTpl(from)]?.order || [];
  return src.map(o => ({ ...o, roles: (o.roles || []).map(r => ({ ...r })) }));
}

/** Validate a reading: a new layout needs a name. Returns an error key or ''. */
export const pickerError = c => (c.mode === 'custom' && c.tpl === '__new' && !c.newName ? 'lpNeedName' : '');

/** Stored value for a reading, once any new layout exists: '' (none), '@en', '@fr' or a template id. */
export const storedValue = (c, newId) => (c.mode === 'none' ? '' : c.mode === 'en' ? SUNDAY : c.mode === 'fr' ? FRENCH : c.tpl === '__new' ? newId : c.tpl);
export const langOfNew = from => (from === FRENCH ? 'fr' : 'en');
export const templateExists = id => !!S.tpl[id] || !!templates()[id];
