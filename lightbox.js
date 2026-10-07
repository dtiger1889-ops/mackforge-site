// Click-to-enlarge for the card pictures. Adds a transparent button over each .visual image
// and opens the picture in one native <dialog> (focus trap, Escape and background inerting
// come from showModal). Without JS the pictures stay plain images.
(() => {
  if (typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) return;
  // Cards load a 600px thumbnail; these have a larger original that is fetched only on open.
  const ORIGINALS = ['life-os', 'finance-receipts-pipeline', 'social-crm-template', 'obsidian-agent-integration', 'agent-ladder', 'telegram-notifier-mcp', 'read-pdf', 'yolo-alchemy', 'harness-benchmark-report', 'claude-harness-toolbox'];
  const fullSrc = img => {
    const m = (img.getAttribute('src') || '').match(/^assets\/thumbs\/([^/]+)\.webp$/);
    return m && ORIGINALS.includes(m[1]) ? `assets/previews/${m[1]}.png` : img.currentSrc || img.src;
  };

  const dialog = document.createElement('dialog');
  dialog.className = 'lightbox';
  const figure = document.createElement('figure');
  const big = document.createElement('img');
  const caption = document.createElement('figcaption');
  caption.setAttribute('aria-hidden', 'true');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lightbox-close';
  close.setAttribute('aria-label', 'Close image');
  close.textContent = '×';
  figure.append(big, caption);
  dialog.append(figure, close);
  document.body.append(dialog);

  let trigger = null, token = 0;

  function open(button, img) {
    const card = img.closest('.project');
    const title = card && card.querySelector('h3');
    const text = (img.alt || (title && title.textContent) || '').trim();
    trigger = button;
    token += 1;
    const mine = token;
    big.alt = text;
    big.classList.toggle('is-vector', /\.svg(\?|$)/i.test(img.currentSrc || img.src));
    big.src = img.currentSrc || img.src;
    caption.textContent = text;
    dialog.setAttribute('aria-label', text || 'Image preview');
    const full = fullSrc(img);
    if (full !== big.src && new URL(full, location.href).href !== big.src) {
      const loader = new Image();
      loader.onload = () => { if (mine === token && dialog.open) big.src = loader.src; };
      loader.src = full;
    }
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty('--lb-scrollbar', gap > 0 ? gap + 'px' : '0px');
    document.documentElement.classList.add('lightbox-open');
    dialog.showModal();
  }

  dialog.addEventListener('close', () => {
    token += 1;
    document.documentElement.classList.remove('lightbox-open');
    big.removeAttribute('src');
    if (trigger) trigger.focus({ preventScroll: true });
    trigger = null;
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog || e.target === figure) dialog.close(); });

  document.querySelectorAll('.visual').forEach(box => {
    const img = box.querySelector('img');
    if (!img) return;
    const card = box.closest('.project');
    const title = card && card.querySelector('h3');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lightbox-open-btn';
    button.setAttribute('aria-label', 'View larger: ' + ((title && title.textContent.trim()) || img.alt));
    button.addEventListener('click', () => open(button, img));
    box.classList.add('has-lightbox');
    box.append(button);
  });
})();
