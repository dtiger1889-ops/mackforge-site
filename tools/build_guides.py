"""Build the game-guide page data from the Hintforge organisation's public repos.

Run from the repository root before publishing:

    python tools/build_guides.py

It needs the GitHub CLI (`gh`) on PATH, or its full path in the GH environment
variable, and only reads public data. It writes:

- guides.json: one entry per guide repo, plus the framework repos;
- assets/guides/: each guide's status-card image, copied from its README so the
  page loads nothing from other sites;
- guides.html: the cards, count, page description and structured data between
  their start / end markers, so the page works as plain HTML. Everything outside
  the markers is left as it is;
- guides/<repo>/index.html: one page per guide, so each game has its own address
  and title in search results;
- sitemap.xml and robots.txt: the site's pages, for search engines.

A repo counts as a framework repo when its name is in FRAMEWORK; every other
public, non-archived, non-fork repo in the organisation is treated as a guide.
A guide's card text is the first sentence of its README, without the opening
every guide shares; the repo description is the fallback.

A guide page says only what is already public on the guide's own README and
status card: its intro paragraph and the card's coverage labels (kinds of
section, such as Mechanics or Items). It never lists the guide's section titles,
because those can name bosses or endings the guide's spoiler levels hide.
"""
import html
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

SITE = "https://mackforge.dev"
# Pages outside the guides that the sitemap lists. They carry no lastmod, because
# this script cannot know when they last changed.
OTHER_PAGES = ["/", "/charts/agent-managers/", "/charts/memory-tools/", "/sites.html"]
ASSET_VERSION = "20261104a"

ORG = "hintforge"
FRAMEWORK = {
    "builder": ("Builder", "Turns researched material about a game into a Hintforge guide."),
    "reader": ("Reader", "Runs a guide inside your coding agent and answers at the spoiler level you set."),
}
INTRO_PREFIX = re.compile(r"^A spoiler-controlled (?:hint )?companion (?:guide )?for .+?, (.+)$")
READER_URL = f"https://github.com/{ORG}/reader"
ROOT = Path(__file__).resolve().parent.parent
GH = os.environ.get("GH", "gh")


def gh(path, raw=False):
    cmd = [GH, "api", path]
    if raw:
        cmd += ["-H", "Accept: application/vnd.github.raw"]
    result = subprocess.run(cmd, capture_output=True, check=True)
    return result.stdout if raw else json.loads(result.stdout)


def strip_md(text):
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[*_`]+", "", text)
    return re.sub(r"\s+", " ", text).strip()


def first_sentence(paragraph):
    match = re.match(r"(.+?[.!?])(\s|$)", paragraph)
    return match.group(1) if match else paragraph


def short_description(sentence):
    """Keep what the game is: drop the shared 'A spoiler-controlled hint companion for X,'
    opening and anything after a dash, so each card reads as one line about the game."""
    match = INTRO_PREFIX.match(sentence)
    if not match:
        return sentence
    text = re.split(r"\s+[—–]\s+|\s+--\s+", match.group(1))[0].rstrip(" .")
    return text[0].upper() + text[1:] + "."


def read_readme(name):
    try:
        text = gh(f"repos/{ORG}/{name}/readme", raw=True).decode("utf-8")
    except subprocess.CalledProcessError:
        return None, None, None, None, None
    title = None
    heading = re.search(r"^#\s+(.+)$", text, re.M)
    if heading:
        title = re.split(r"\s+[—–-]\s+", heading.group(1).strip())[0].strip()
    image = re.search(r"!\[([^\]]*)\]\(([^)\s]+)\)", text)
    alt, src = (image.group(1), image.group(2)) if image else (None, None)
    if alt:
        alt = re.sub(r"\s+[—–]\s+", ": ", alt)
    intro = intro_full = None
    for block in re.split(r"\n\s*\n", text):
        block = block.strip()
        if block and not block.startswith(("#", "!", "*", ">", "<", "|", "-")):
            intro_full = strip_md(block)
            intro = short_description(first_sentence(intro_full))
            break
    return title, alt, src, intro, intro_full


def coverage_labels(image_path):
    """The section kinds printed on a status card (MECHANICS, ITEMS, ...), in card order."""
    if not image_path or not image_path.endswith(".svg"):
        return []
    svg = (ROOT / image_path).read_text(encoding="utf-8")
    labels = re.findall(r'<text class="mono b seg(?:-thin)?"[^>]*>([^<]+)</text>', svg)
    seen = []
    for label in labels:
        label = html.unescape(label).strip().capitalize()
        if label and label not in seen:
            seen.append(label)
    return seen


def meta_description(game, intro_full):
    lead = f"A spoiler-free hint guide for {game} that runs in your coding agent and answers only at the spoiler level you set."
    if len(lead) <= 160:
        return lead
    return lead[:157].rsplit(" ", 1)[0] + "..."


def copy_image(name, src):
    if not src or src.startswith(("http://", "https://")):
        return None
    src = src.lstrip("./")
    ext = Path(src).suffix.lower()
    if ext not in {".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        return None
    data = gh(f"repos/{ORG}/{name}/contents/{src}", raw=True)
    out = ROOT / "assets" / "guides" / f"{name}{ext}"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    return out.relative_to(ROOT).as_posix()


def pretty_date(stamp):
    day = datetime.strptime(stamp[:10], "%Y-%m-%d")
    return f"{day.day} {day:%B %Y}"


def card(guide):
    e = html.escape
    image = ""
    if guide["image"]:
        image = f'<div class="visual"><img src="{e(guide["image"])}" alt="{e(guide["imageAlt"] or "Status card for " + guide["game"])}" loading="lazy"></div>'
    search = e(f'{guide["game"]} {guide["repo"]} {guide["description"]}'.lower())
    return (
        f'<article class="project has-image guide" data-search="{search}">\n'
        f'{image}<div class="project-body"><div class="project-meta">Updated {e(guide["updatedText"])}</div>'
        f'<h3><a href="guides/{e(guide["repo"])}/">{e(guide["game"])}</a></h3><p>{e(guide["description"])}</p>'
        f'<div class="project-bottom"><div class="actions">'
        f'<a class="action" href="{e(guide["url"])}" target="_blank" rel="noopener noreferrer" aria-label="Guide repository: {e(guide["game"])}">Guide <span aria-hidden="true">↗</span></a>'
        f"</div></div></div></article>"
    )


NAV = (
    '<header class="nav"><a class="brand" href="../../">mackforge<span aria-hidden="true">.</span></a>'
    '<nav aria-label="Main navigation"><a href="../../#projects">Projects</a><a href="../../guides.html">Game guides</a><a href="../../sites.html">Sites I like</a>'
    '<a href="https://github.com/hintforge" target="_blank" rel="noopener noreferrer">GitHub ↗</a>'
    '<div class="share"><button type="button" id="share-btn" aria-expanded="false" aria-controls="share-menu">Share</button>'
    '<div id="share-menu" hidden><a data-net="linkedin" target="_blank" rel="noopener">LinkedIn</a><a data-net="reddit" target="_blank" rel="noopener">Reddit</a>'
    '<a data-net="x" target="_blank" rel="noopener">X</a><a data-net="bluesky" target="_blank" rel="noopener">Bluesky</a>'
    '<button type="button" id="share-copy">Copy link</button><button type="button" id="share-native" hidden>More…</button></div></div>'
    '<button type="button" class="theme-toggle" id="theme-toggle" aria-label="Switch to light theme" title="Switch to light theme" hidden>'
    '<svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>'
    '<svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/></svg></button></nav></header>'
)
FAVICON = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%23e8862e'/%3E"
           "%3Ctext x='16' y='23' text-anchor='middle' font-family='Arial,sans-serif' font-size='22' font-weight='700' fill='%23111921'%3Em%3C/text%3E%3C/svg%3E")


def json_ld(data):
    # "</" inside a script block would end it early; JSON allows the escaped form.
    return '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False).replace("</", "<\\/") + "</script>"


def guide_page(guide):
    e = html.escape
    page_url = f'{SITE}/guides/{guide["repo"]}/'
    title = f'{guide["game"]} spoiler-free hint guide · Hintforge'
    description = meta_description(guide["game"], guide["introFull"])
    image = ""
    if guide["image"]:
        image = (f'<figure class="guide-card"><img src="../../{e(guide["image"])}" '
                 f'alt="{e(guide["imageAlt"] or "Status card for " + guide["game"])}"></figure>')
    covers = ""
    if guide["coverage"]:
        covers = ('<section class="guide-covers" aria-labelledby="covers-title"><h2 id="covers-title">What it covers</h2><ul>'
                  + "".join(f"<li>{e(c)}</li>" for c in guide["coverage"]) + "</ul></section>")
    # Each guide's own preview image (made by tools/build_previews.py), else the shared one.
    if (ROOT / "assets" / "guides" / "previews" / f'{guide["repo"]}.png').is_file():
        preview = f'{SITE}/assets/guides/previews/{guide["repo"]}.png?v={ASSET_VERSION}'
        preview_alt = f'Status card for the {guide["game"]} Hintforge guide'
    else:
        preview = f"{SITE}/assets/guides-preview.png"
        preview_alt = "The mackforge game guides page: a grid of Hintforge guide cards, each with its status card image"
    ld = json_ld({
        "@context": "https://schema.org", "@type": "WebPage", "name": title, "url": page_url, "description": description,
        "about": {"@type": "VideoGame", "name": guide["game"]},
        "isPartOf": {"@type": "CollectionPage", "name": "Spoiler-free game guides", "url": f"{SITE}/guides.html"},
    })
    return f"""<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title><meta name="description" content="{e(description)}">
<meta name="color-scheme" content="dark light"><meta name="theme-color" content="#0d1117">
<meta property="og:type" content="website"><meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(description)}"><meta property="og:url" content="{e(page_url)}"><meta property="og:image" content="{e(preview)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="{e(preview_alt)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="{e(preview)}">
<link rel="canonical" href="{e(page_url)}"><link rel="icon" href="{FAVICON}">
<script>try{{document.documentElement.dataset.theme=localStorage.getItem('mackforge-theme')==='light'?'light':'dark'}}catch{{}}</script><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600;700;800&display=swap"><link rel="stylesheet" href="../../style.css?v={ASSET_VERSION}">
<script data-goatcounter="https://mackforge.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script><script src="../../track.js?v=20261012a" defer></script>
{ld}
</head>
<body class="workbench guides-page guide-single" data-share-title="{e(guide["game"])} spoiler-free hint guide">
<a class="skip" href="#guide">Skip to the guide</a>
{NAV}
<main id="guide">
<section class="guides-intro" aria-labelledby="page-title"><p class="eyebrow">Hintforge guide</p><h1 id="page-title">{e(guide["game"])}<span>.</span></h1><p class="intro">{e(guide["introFull"] or guide["description"])}</p><p class="back-link"><a href="../../guides.html">← All game guides</a></p></section>
<div class="guide-detail">
{image}
<div class="guide-text">
{covers}
<section class="guide-use" aria-labelledby="use-title"><h2 id="use-title">Use it</h2>
<p>You need the Hintforge reader in any AI agent that can read files on your computer: <a href="{READER_URL}" target="_blank" rel="noopener noreferrer">get the reader ↗</a>. Then point it at this guide:</p>
<p class="load-line">Load the {e(guide["game"])} guide from github.com/{ORG}/{e(guide["repo"])}</p>
<div class="actions"><a class="action" href="{e(guide["url"])}" target="_blank" rel="noopener noreferrer">Open the guide <span aria-hidden="true">↗</span></a></div>
</section>
<p class="guide-updated">Updated {e(guide["updatedText"])}</p>
</div>
</div>
</main>
<footer><a class="brand" href="../../">mackforge.</a><p>D.M. · <a href="mailto:hello@mackforge.dev">hello@mackforge.dev</a> · <a href="https://github.com/hintforge" target="_blank" rel="noopener noreferrer">Hintforge on GitHub</a></p></footer><script src="../../guides.js?v={ASSET_VERSION}"></script><script src="../../egg.js?v=20261010e" defer></script>
</body></html>
"""


def list_description_tags(guides):
    """The guides list's description, kept in step with the guide count."""
    newest = sorted(guides, key=lambda g: g["updated"], reverse=True)
    names = ", ".join(g["game"] for g in newest[:3])
    text = html.escape(f"Spoiler-free hint guides for {len(guides)} games, including {names}. "
                       "Each answers only at the spoiler level you set.")
    return f'<meta name="description" content="{text}"><meta property="og:description" content="{text}">'


def collection_ld(guides):
    return json_ld({
        "@context": "https://schema.org", "@type": "CollectionPage", "name": "Spoiler-free game guides", "url": f"{SITE}/guides.html",
        "mainEntity": {"@type": "ItemList", "itemListElement": [
            {"@type": "ListItem", "position": i, "name": g["game"], "url": f'{SITE}/guides/{g["repo"]}/'}
            for i, g in enumerate(guides, 1)]},
    })


def sitemap(guides):
    # Only guide pages carry lastmod: a repo's push date says when that page's content changed.
    # The other pages have no reliable date, so they get none.
    rows = [f"  <url><loc>{SITE}{p}</loc></url>" for p in OTHER_PAGES]
    rows.append(f"  <url><loc>{SITE}/guides.html</loc></url>")
    rows += [f"  <url><loc>{SITE}/guides/{g['repo']}/</loc><lastmod>{g['updated'][:10]}</lastmod></url>" for g in guides]
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(rows) + "\n</urlset>\n"


ROBOTS = f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n"


def remove_old_pages(previous, current):
    """Delete the page of a guide that was published last run and is gone now.
    Only names recorded in the previous guides.json are touched, never a folder scan."""
    for name in sorted(set(previous) - set(current)):
        page = ROOT / "guides" / name / "index.html"
        if page.is_file():
            page.unlink()
            try:
                page.parent.rmdir()
            except OSError:
                pass
            print(f"removed the page for {name}, which is no longer a public guide")


def framework_item(repo):
    e = html.escape
    return (
        f'<li><a href="{e(repo["url"])}" target="_blank" rel="noopener noreferrer">{e(repo["label"])} <span aria-hidden="true">↗</span></a>'
        f'<span>{e(repo["description"])}</span></li>'
    )


def main():
    repos = gh(f"orgs/{ORG}/repos?per_page=100&type=public")
    guides, framework = [], []
    for repo in repos:
        if repo["archived"] or repo["fork"] or repo["private"]:
            continue
        name = repo["name"]
        if name in FRAMEWORK:
            label, description = FRAMEWORK[name]
            framework.append({"repo": name, "label": label, "url": repo["html_url"], "description": description})
            continue
        title, alt, src, intro, intro_full = read_readme(name)
        game = title or name.replace("-", " ").title()
        image = copy_image(name, src)
        guides.append({
            "repo": name,
            "game": game,
            "description": intro or (repo["description"] or "").strip(),
            "introFull": intro_full,
            "url": repo["html_url"],
            "image": image,
            "imageAlt": alt,
            "coverage": coverage_labels(image),
            "updated": repo["pushed_at"],
            "updatedText": pretty_date(repo["pushed_at"]),
        })
    guides.sort(key=lambda g: re.sub(r"^the\s+", "", g["game"].lower()))
    framework.sort(key=lambda f: list(FRAMEWORK).index(f["repo"]))

    data_path = ROOT / "guides.json"
    previous = []
    if data_path.is_file():
        previous = [g["repo"] for g in json.loads(data_path.read_text(encoding="utf-8")).get("guides", [])]
    remove_old_pages(previous, [g["repo"] for g in guides])

    data = {"organisation": ORG, "reader": READER_URL, "guides": guides, "framework": framework}
    data_path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    for g in guides:
        out = ROOT / "guides" / g["repo"] / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(guide_page(g), encoding="utf-8", newline="\n")
    (ROOT / "sitemap.xml").write_text(sitemap(guides), encoding="utf-8", newline="\n")
    (ROOT / "robots.txt").write_text(ROBOTS, encoding="utf-8", newline="\n")

    page_path = ROOT / "guides.html"
    page = page_path.read_text(encoding="utf-8")
    inline = {"count", "meta"}
    for marker, body in (("guides", "\n".join(card(g) for g in guides)),
                         ("framework", "\n".join(framework_item(f) for f in framework)),
                         ("count", f"{len(guides)} guides"),
                         ("meta", list_description_tags(guides)),
                         ("ld", collection_ld(guides))):
        pattern = re.compile(rf"(<!-- {marker}:start -->).*?(<!-- {marker}:end -->)", re.S)
        if not pattern.search(page):
            sys.exit(f"guides.html is missing the {marker}:start / {marker}:end markers")
        page = pattern.sub(lambda m: f"{m.group(1)}{body}{m.group(2)}" if marker in inline else f"{m.group(1)}\n{body}\n{m.group(2)}", page)
    page_path.write_text(page, encoding="utf-8", newline="\n")
    print(f"{len(guides)} guides, {len(framework)} framework repos, {len(guides)} guide pages, sitemap and robots.txt written")


if __name__ == "__main__":
    main()
