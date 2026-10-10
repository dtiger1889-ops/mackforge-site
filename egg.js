// The wordmark's period is a button. On the home page each page load picks one of three
// surprises (spark burst, whack-a-cube, a short message).
// On the guides page it flips into the Hintforge logo. Without JavaScript it stays a period.
(() => {
  const dot = document.querySelector('.hero h1 span, .guides-intro h1 span');
  if (!dot) return;
  const host = dot.closest('.hero, .guides-intro');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const messages = [
    'I could have left this as a period, but you can see how that went.',
    'There was nothing wrong with the dot. I usually start with more of a reason.',
    'If you’re wondering whether all of these needed to be projects, so am I.',
    'I like finishing things, but I keep having ideas while I’m finishing them.',
    'This part doesn’t streamline anything. I just wanted a button.',
    'Feel free to look around. You don’t have to adopt all my problems.'
  ];

  // A fresh pick on every page load, never the same surprise twice in a row on this device.
  let last = -1;
  try { last = +(localStorage.getItem('mackforge-egg') ?? -1); } catch {}
  let seed = Math.floor(Math.random() * 3 * messages.length);
  if (seed % 3 === last) seed += 1 + Math.floor(Math.random() * 2);
  try { localStorage.setItem('mackforge-egg', seed % 3); } catch {}

  dot.classList.add('egg');
  dot.setAttribute('role', 'button');
  dot.tabIndex = 0;
  let open = null;
  const close = () => { if (open) { open.remove(); open = null; } };
  const fire = () => {
    if (open) { close(); return; }
    if (host.classList.contains('guides-intro')) logo();
    else [burst, game, note][seed % 3]();
  };
  dot.addEventListener('click', fire);
  dot.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  // Centre of the dot in the host's coordinates.
  const origin = () => {
    const a = dot.getBoundingClientRect(), b = host.getBoundingClientRect();
    return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 };
  };
  const layer = cls => { const el = document.createElement('div'); el.className = cls; host.appendChild(el); return el; };

  function sparks(x, y, count, reach) {
    if (calm) return;
    for (let i = 0; i < count; i++) {
      const s = layer('egg-spark');
      s.style.left = `${x}px`; s.style.top = `${y}px`;
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4, dist = reach * (0.6 + Math.random() * 0.6);
      const spin = Math.round((Math.random() - .5) * 720);
      s.animate([{ transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) scale(.4) rotate(${spin}deg)`, opacity: 0 }],
        { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => s.remove();
    }
  }

  function burst() {
    const { x, y } = origin();
    if (calm) { dot.classList.add('egg-glow'); setTimeout(() => dot.classList.remove('egg-glow'), 2500); return; }
    dot.animate([{ transform: 'scale(1)' }, { transform: 'scale(2.2)' }, { transform: 'scale(1)' }],
      { duration: 600, easing: 'cubic-bezier(.3,1.6,.5,1)' });
    sparks(x, y, 30, 170);
    const ring = layer('egg-ring');
    ring.style.left = `${x}px`; ring.style.top = `${y}px`;
    ring.animate([{ transform: 'translate(-50%,-50%) scale(.05)', opacity: .9 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }],
      { duration: 1400, easing: 'ease-out' }).onfinish = () => ring.remove();
  }

  function note() {
    const { x, y } = origin();
    const box = layer('egg-note');
    box.setAttribute('role', 'status');
    box.textContent = messages[Math.floor(seed / 3) % messages.length];
    box.style.top = `${y + dot.offsetHeight}px`;
    box.style.left = `${Math.max(16, Math.min(x - 140, host.clientWidth - 296))}px`;
    open = box;
    sparks(x, y, 8, 40);
    setTimeout(() => { if (open === box) close(); }, 9000);
  }

  function game() {
    const panel = layer('egg-game');
    open = panel;
    panel.innerHTML = '<div class="egg-game-head"><strong>Whack-a-cube</strong><span class="egg-score">0</span><span class="egg-time">15</span><button type="button" class="egg-close" aria-label="Close">×</button></div><div class="egg-grid"></div><p class="egg-end" hidden></p>';
    const grid = panel.querySelector('.egg-grid'), scoreEl = panel.querySelector('.egg-score'), timeEl = panel.querySelector('.egg-time');
    const cubes = Array.from({ length: 12 }, () => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'egg-cube'; b.setAttribute('aria-label', 'Cube');
      grid.appendChild(b); return b;
    });
    let score = 0, left = 15;
    const hit = e => {
      const b = e.currentTarget;
      if (!b.classList.contains('lit')) return;
      b.classList.remove('lit'); score++; scoreEl.textContent = score;
      const r = b.getBoundingClientRect(), h = host.getBoundingClientRect();
      sparks(r.left - h.left + r.width / 2, r.top - h.top + r.height / 2, 6, 26);
    };
    // pointerdown fires the moment a finger lands; click waits for the browser to rule out a double-tap zoom
    cubes.forEach(b => {
      b.addEventListener('pointerdown', e => { e.preventDefault(); hit(e); });
      b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hit(e); } });
    });
    const light = setInterval(() => {
      const idle = cubes.filter(b => !b.classList.contains('lit'));
      const b = idle[Math.floor(Math.random() * idle.length)];
      b.classList.add('lit');
      setTimeout(() => b.classList.remove('lit'), 1300);
    }, 520);
    const tick = setInterval(() => {
      timeEl.textContent = --left;
      if (left > 0) return;
      clearInterval(light); clearInterval(tick);
      cubes.forEach(b => { b.classList.remove('lit'); b.disabled = true; });
      const end = panel.querySelector('.egg-end');
      end.hidden = false;
      end.textContent = `${score} ${score === 1 ? 'cube' : 'cubes'}. Refresh for something else.`;
    }, 1000);
    const stop = () => { clearInterval(light); clearInterval(tick); };
    panel.querySelector('.egg-close').addEventListener('click', () => { stop(); close(); dot.focus(); });
    new MutationObserver((_, obs) => { if (!panel.isConnected) { stop(); obs.disconnect(); } }).observe(host, { childList: true });
  }

  function logo() {
    const { x, y } = origin();
    const img = new Image();
    img.src = 'assets/hintforge-logo.webp'; img.alt = 'Hintforge logo'; img.className = 'egg-logo';
    host.appendChild(img);
    img.style.left = `${x}px`; img.style.top = `${y}px`;
    open = img;
    if (!calm) img.animate([{ transform: 'translate(-50%,-50%) rotateY(90deg) scale(.2)' }, { transform: 'translate(-50%,-50%) rotateY(0) scale(1)' }],
      { duration: 550, easing: 'cubic-bezier(.2,.8,.3,1.2)' });
    sparks(x, y, 10, 70);
    img.addEventListener('click', close);
    setTimeout(() => { if (open === img) close(); }, 5000);
  }
})();
