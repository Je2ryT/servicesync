/* Toast messages and the modal dialog. */
let tt;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false; clearTimeout(tt); tt = setTimeout(() => { el.hidden = true; }, 3400);
}
export function modal(html) {
  document.getElementById('overlay').innerHTML = `<div class="modal-bg" data-act="closeModal"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const f = document.querySelector('.modal input:not([type=checkbox]),.modal textarea'); f && f.focus();
}
export function closeModal() { document.getElementById('overlay').innerHTML = ''; }
