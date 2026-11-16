// The share menu: the networks' own share links, Copy link, and the device's share sheet where it has one.
(() => {
  const btn = document.querySelector("#share-btn"), menu = document.querySelector("#share-menu");
  if (!btn || !menu) return;
  const canonical = (document.querySelector('link[rel="canonical"]') || {}).href || location.href;
  const title = (document.querySelector('meta[property="og:title"]') || {}).content || document.title;
  const u = encodeURIComponent(canonical), t = encodeURIComponent(title);
  const links = { linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`, reddit: `https://www.reddit.com/submit?url=${u}&title=${t}`,
    x: `https://x.com/intent/post?url=${u}&text=${t}`, bluesky: `https://bsky.app/intent/compose?text=${t}%20${u}` };
  menu.querySelectorAll("[data-net]").forEach((a) => { a.href = links[a.dataset.net]; });
  const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    btn.setAttribute("aria-expanded", String(!menu.hidden));
    if (!menu.hidden) document.querySelector("#share-copy").textContent = "Copy link";
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".share")) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { close(); btn.focus(); } });
  document.querySelector("#share-copy").addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(canonical); e.target.textContent = "Link copied"; }
    catch { window.prompt("Copy this link:", canonical); }
  });
  if (navigator.share) {
    const native = document.querySelector("#share-native");
    native.hidden = false;
    native.addEventListener("click", () => { close(); navigator.share({ title, url: canonical }).catch(() => {}); });
  }
})();
