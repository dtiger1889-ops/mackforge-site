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
  function labelTheme() { const light = document.documentElement.dataset.theme === 'light'; const label = `Switch to ${light ? 'dark' : 'light'} theme`; themeButton.setAttribute('aria-label', label); themeButton.title = label; document.querySelector('meta[name="theme-color"]').content = light ? '#f5f8f6' : '#111921'; }
  themeButton.hidden = false; labelTheme();
  themeButton.addEventListener('click', () => { const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = next; try { localStorage.setItem('mackforge-theme', next); } catch {} labelTheme(); });
})();
