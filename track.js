// Sends GoatCounter events for clicks that leave the page: outbound links, share-menu choices
// and file downloads. Page views are counted by GoatCounter's own count.js, loaded beside this.
(() => {
  const send = (path, title) => {
    if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path, title, event: true });
  };
  const onClick = e => {
    if (e.type === 'auxclick' && e.button !== 1) return;
    const el = e.target.closest('a, button');
    if (!el) return;
    if (el.closest('.share')) {
      const choice = el.dataset.net || { 'share-copy': 'copy-link', 'share-embed': 'copy-embed', 'share-native': 'device' }[el.id];
      if (choice) send(`share-${choice}`, `Share: ${choice}`);
      return;
    }
    if (el.tagName !== 'A' || !el.href) return;
    const url = new URL(el.href, location.href), text = (el.textContent || '').trim().slice(0, 200);
    if (!/^https?:$/.test(url.protocol)) return;
    if (url.host !== location.host) send(`ext-${url.host}${url.pathname}`.replace(/\/$/, ''), text || url.href);
    else if (el.hasAttribute('download') || /\.(?!html?$)[a-z0-9]{2,5}$/i.test(url.pathname)) send(`download-${url.pathname.replace(/^\//, '')}`, text || url.pathname);
  };
  document.addEventListener('click', onClick);
  document.addEventListener('auxclick', onClick);
})();
