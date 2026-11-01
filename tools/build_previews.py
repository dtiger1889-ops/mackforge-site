"""Make each guide's link-preview image from its status card.

Run from the repository root after tools/build_guides.py, whenever a guide's
status card changed or a guide went public:

    python tools/build_previews.py
    python tools/build_guides.py

It reads guides.json and, for each guide with a status card in assets/guides/,
writes assets/guides/previews/<repo>.png: the card fitted onto a 1200x630 image,
the size link previews use. Run build_guides.py again afterwards so each guide
page points at its own image (a guide with no preview keeps the shared one).

It draws the card in a headless browser, so it needs either Playwright for
Python with its Firefox browser (`pip install playwright`, then
`playwright install firefox`) or Camoufox (`pip install camoufox`, then
`camoufox fetch`). Previews of guides no longer listed are removed.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "guides" / "previews"
WIDTH, HEIGHT = 1200, 630
BACKGROUND = "#0d1117"  # the site's dark background, behind the card's side margins


def frame(svg_path):
    """A page exactly one preview in size, showing the card as large as fits, centred."""
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>'
            f'html,body{{margin:0;width:{WIDTH}px;height:{HEIGHT}px;background:{BACKGROUND};overflow:hidden}}'
            f'body{{display:flex;align-items:center;justify-content:center}}'
            f'img{{max-width:{WIDTH}px;max-height:{HEIGHT}px;display:block}}'
            f'</style></head><body><img src="{svg_path.as_uri()}" alt=""></body></html>')


def open_browser():
    try:
        from camoufox.sync_api import Camoufox
        return Camoufox(headless=True)
    except ImportError:
        pass
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("needs Playwright (pip install playwright; playwright install firefox) or Camoufox (pip install camoufox)")

    class PlaywrightFirefox:
        def __enter__(self):
            self.pw = sync_playwright().start()
            self.browser = self.pw.firefox.launch(headless=True)
            return self.browser

        def __exit__(self, *exc):
            self.browser.close()
            self.pw.stop()

    return PlaywrightFirefox()


def main():
    data = json.loads((ROOT / "guides.json").read_text(encoding="utf-8"))
    guides = [g for g in data["guides"] if g.get("image")]
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = OUT / "_frame.html"
    made = []
    try:
        with open_browser() as browser:
            page = browser.new_page(viewport={"width": WIDTH, "height": HEIGHT})
            for g in guides:
                svg = ROOT / g["image"]
                if not svg.is_file():
                    print("skipped", g["repo"], "- no status card at", g["image"])
                    continue
                tmp.write_text(frame(svg), encoding="utf-8")
                page.goto(tmp.as_uri(), wait_until="load")
                page.wait_for_timeout(300)
                out = OUT / f'{g["repo"]}.png'
                page.screenshot(path=str(out), clip={"x": 0, "y": 0, "width": WIDTH, "height": HEIGHT})
                made.append(g["repo"])
            page.close()
    finally:
        if tmp.exists():
            tmp.unlink()
    listed = {g["repo"] for g in data["guides"]}
    for old in sorted(OUT.glob("*.png")):
        if old.stem not in listed:
            old.unlink()
            print("removed", old.name)
    print(f"{len(made)} previews written to assets/guides/previews/")


if __name__ == "__main__":
    main()
