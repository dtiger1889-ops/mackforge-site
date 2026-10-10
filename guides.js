(() => {
  const cards = [...document.querySelectorAll('.guide')];
  const search = document.querySelector('#search'), results = document.querySelector('#results'), empty = document.querySelector('.empty');
  document.querySelector('.guide-filter').hidden = false;
  function update() {
    const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    let visible = 0;
    cards.forEach(card => { card.hidden = !terms.every(t => card.dataset.search.includes(t)); if (!card.hidden) visible++; });
    empty.hidden = visible !== 0;
    results.textContent = terms.length ? `${visible} of ${cards.length} guides` : `${cards.length} guides`;
    const url = new URL(location.href); terms.length ? url.searchParams.set('q', search.value.trim()) : url.searchParams.delete('q'); history.replaceState(null, '', url);
  }
  search.value = new URLSearchParams(location.search).get('q') || '';
  search.addEventListener('input', update);
  document.querySelector('#empty-reset').addEventListener('click', () => { search.value = ''; update(); search.focus(); });
  update();

  const themeButton = document.querySelector('#theme-toggle');
  function labelTheme() { const light = document.documentElement.dataset.theme === 'light'; const label = `Switch to ${light ? 'dark' : 'light'} theme`; themeButton.setAttribute('aria-label', label); themeButton.title = label; document.querySelector('meta[name="theme-color"]').content = light ? '#eef1f5' : '#0d1117'; }
  themeButton.hidden = false; labelTheme();
  themeButton.addEventListener('click', () => { const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = next; try { localStorage.setItem('mackforge-theme', next); } catch {} labelTheme(); });

  const btn = document.querySelector('#share-btn'), menu = document.querySelector('#share-menu'), canonical = 'https://mackforge.dev/guides.html', u = encodeURIComponent(canonical), t = encodeURIComponent('Hintforge game guides');
  const links = { linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`, reddit: `https://www.reddit.com/submit?url=${u}&title=${t}`, x: `https://x.com/intent/post?url=${u}&text=${t}`, bluesky: `https://bsky.app/intent/compose?text=${t}%20${u}` };
  menu.querySelectorAll('[data-net]').forEach(a => a.href = links[a.dataset.net]);
  function close() { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
  btn.addEventListener('click', () => { menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); if (!menu.hidden) document.querySelector('#share-copy').textContent = 'Copy link'; });
  document.addEventListener('click', e => { if (!e.target.closest('.share')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { close(); btn.focus(); } });
  document.querySelector('#share-copy').addEventListener('click', async e => { try { await navigator.clipboard.writeText(canonical); e.target.textContent = 'Link copied'; } catch { window.prompt('Copy this link:', canonical); } });
  if (navigator.share) { const native = document.querySelector('#share-native'); native.hidden = false; native.addEventListener('click', () => { close(); navigator.share({ title: 'Hintforge game guides', url: canonical }).catch(() => {}); }); }
})();
