/* The Mont Carmel logo intro shown right after signing in (once per browser tab).
   Tap, click or press any key to skip. Short and still for people who prefer reduced motion. */
const KEY = 'ss-intro';

export function introSeen() { try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; } }

export function showIntro() {
  if (document.getElementById('intro') || introSeen()) return;
  try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* storage unavailable */ }
  const el = document.createElement('div');
  el.id = 'intro'; el.setAttribute('role', 'presentation');
  el.innerHTML = `<div class="intro-pan"><div class="intro-glow"></div><div class="intro-ring r1"></div><div class="intro-ring r2"></div>
      <img class="intro-logo" src="/mc-logo.png" alt=""><div class="intro-sweep"></div></div>
    <div class="intro-text"><b>MONT CARMEL</b><span id="introHello">Bienvenue · Welcome</span></div>`;
  document.body.appendChild(el);
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let done = false;
  const close = () => {
    if (done) return; done = true; el.classList.add('out');
    setTimeout(() => el.remove(), 600);
    ['click', 'keydown', 'touchstart'].forEach(e => document.removeEventListener(e, close, true));
  };
  setTimeout(() => ['click', 'keydown', 'touchstart'].forEach(e => document.addEventListener(e, close, true)), 300);
  setTimeout(close, reduce ? 1200 : 3400);
}

/** Put the person's first name in the intro once we know who signed in. */
export function introName(name) {
  const n = document.getElementById('introHello'); const first = String(name || '').trim().split(/\s+/)[0];
  if (n && first) n.textContent = `Bienvenue, ${first} · Welcome`;
}
