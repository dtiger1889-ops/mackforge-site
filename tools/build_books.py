"""Turn each player's-guide book in books/ into walkthrough pages, one per chapter.

Run from the repository root, before tools/build_guides.py:

    python tools/build_books.py [--variant a|b]

It needs Pandoc 2.19 or later (found through the PANDOC environment variable,
then PATH, then the Pandoc folders the Windows installer uses). For each
books/<repo>/book.md (copied in by tools/import_book.py) it writes:

- guides/<repo>/walkthrough/index.html: the contents page, every chapter grouped
  by Part, then the appendices;
- guides/<repo>/walkthrough/<slug>/index.html: one page per chapter and per
  appendix (each level-2 heading of the book), the slug made from its title.

A Part's own text and map (between the Part heading and its first chapter) go at
the top of that first chapter's page. Links between chapters are rewritten to
point at the page that holds their target; the book's own previous / next bars
(the chapter-nav blocks) are dropped, because each page gets its own. Pandoc
renders each page's Markdown with tools/book.lua, which removes the fact-check
comments and draws the Tip and Collectibles boxes.

The build stops with exit 1, before writing anything, when a book's check.json
is missing or lists a failing chapter, two headings make the same slug, a link
points at an id no page holds, or a rendered page still carries book-internal
markup (see LEFTOVERS). Exit 2: Pandoc missing or too old.

--variant picks one of two page layouts (both in walkthrough.css): a = one
reading column, b = a chapter rail beside the text.
"""
import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
from datetime import date
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
sys.dont_write_bytecode = True  # no __pycache__ folder inside the published tools/
import build_guides as shell  # noqa: E402

ROOT = TOOLS.parent
LUA = TOOLS / "book.lua"
SITE = shell.SITE
CSS_VERSION = "20261106a"  # walkthrough.css and the walkthrough preview image
DEFAULT_VARIANT = "b"  # layout B: chapter links in a sideways strip
MIN_PANDOC = (2, 19)

HEADING = re.compile(r"^(#{1,2})\s+(.+?)\s*\{#([A-Za-z0-9_-]+)[^}]*\}\s*$")
ANCHOR = re.compile(r"\{#([A-Za-z0-9_-]+)")
MD_LINK = re.compile(r"\]\(#([^)\s]+)\)")
RAW_HREF = re.compile(r'href="#([^"]*)"')
INLINE_CHAPTER_NAV = re.compile(r'<nav class="chapter-nav">.*?</nav>', re.S)
# Strings that must never reach a published page: fact-check comments, unrendered
# spoiler marks, guide-file front matter, file or folder names from the book's sources,
# and Pandoc attributes that did not render.
LEFTOVERS = ["<!-- f:", "[spoiler:", "_source:", "status:", ".md", "../Guides", "{#"]


class BookError(Exception):
    pass


def slugify(title):
    text = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def plain(md):
    """A heading's text without Markdown marks, for titles and link text."""
    md = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", md)
    return re.sub(r"[*_`]+", "", md).strip()


def find_pandoc():
    cands = [os.environ.get("PANDOC"), shutil.which("pandoc")]
    for base in (os.environ.get("LOCALAPPDATA"), os.environ.get("ProgramFiles")):
        if base:
            cands.append(str(Path(base) / "Pandoc" / "pandoc.exe"))
    for c in cands:
        if c and Path(c).is_file():
            return c
    return None


def pandoc_version(exe):
    first = subprocess.run([exe, "--version"], capture_output=True, text=True, timeout=60).stdout.splitlines()[0]
    m = re.search(r"(\d+)\.(\d+)", first)
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)


# ---------------------------------------------------------------- reading a book

def check_passed(folder):
    check = folder / "check.json"
    if not check.is_file():
        raise BookError(f"{folder.name}: check.json is missing, so the book's fact check cannot be confirmed")
    try:
        failing = json.loads(check.read_text(encoding="utf-8")).get("failing")
    except (ValueError, AttributeError):
        raise BookError(f"{folder.name}: check.json is not a readable fact-check result")
    if not isinstance(failing, list) or failing:
        raise BookError(f"{folder.name}: the fact check lists failing chapters: {failing}")


def parse(text):
    """Split a book into groups (Parts, Appendices) and pages (chapters, appendices)."""
    groups, pages = [], []
    group = page = None
    fence = False
    for n, line in enumerate(text.splitlines(), 1):
        if line.startswith("```"):
            fence = not fence
        m = None if fence or line.startswith("```") else HEADING.match(line)
        if m:
            level, title, ident = len(m.group(1)), plain(m.group(2)), m.group(3)
            if level == 1:
                group = {"title": title, "id": ident, "intro": [], "pages": []}
                groups.append(group)
                page = None
            else:
                if group is None:
                    raise BookError(f"line {n}: chapter '{title}' comes before any Part heading")
                page = {"title": title, "id": ident, "slug": slugify(title), "group": group,
                        "lines": [], "first": not group["pages"]}
                group["pages"].append(page)
                pages.append(page)
            continue
        if page is not None:
            page["lines"].append(line)
        elif group is not None:
            group["intro"].append(line)
        elif line.strip():
            raise BookError(f"line {n}: text before the first heading")
    if fence:
        raise BookError("a code fence is never closed")
    if not pages:
        raise BookError("the book has no level-2 headings, so no pages")
    seen = {}
    for p in pages:
        if not p["slug"]:
            raise BookError(f"heading '{p['title']}' makes an empty page address")
        if p["slug"] in seen:
            raise BookError(f"headings '{seen[p['slug']]}' and '{p['title']}' make the same page address '{p['slug']}'")
        seen[p["slug"]] = p["title"]
    return groups, pages


def drop_chapter_nav(lines):
    """Remove the book's own previous / contents / next bars."""
    out, block, fence = [], [], False
    for line in lines:
        if line.startswith("```"):
            if not fence:
                fence, block = True, [line]
                continue
            fence = False
            block.append(line)
            if not any('class="chapter-nav"' in b for b in block):
                out += block
            continue
        if fence:
            block.append(line)
        else:
            out.append(line)
    return INLINE_CHAPTER_NAV.sub("", "\n".join(out)).split("\n")


def part_lines(page):
    g = page["group"]
    return g["intro"] if page["first"] and any(l.strip() for l in g["intro"]) else []


def id_map(pages):
    where, dupes = {}, []
    for p in pages:
        ids = [p["id"]]
        if part_lines(p):
            ids.append(p["group"]["id"])
        fence = False
        for line in part_lines(p) + p["lines"]:
            if line.startswith("```"):
                fence = not fence
            elif not fence:
                ids += ANCHOR.findall(line)
        for i in ids:
            if i in where and where[i] is not p:
                dupes.append(i)
            where[i] = p
    if dupes:
        raise BookError(f"ids used on two pages: {', '.join(sorted(set(dupes)))}")
    # A Part with no text of its own lives on its first chapter's page.
    for p in pages:
        if p["first"]:
            where.setdefault(p["group"]["id"], p)
    return where


def rewrite_links(lines, page, where, missing):
    def target(ident):
        if ident == "contents":
            return "../"
        hit = where.get(ident)
        if hit is None:
            missing.add(ident)
            return f"#{ident}"
        return f"#{ident}" if hit is page else f"../{hit['slug']}/#{ident}"

    out = []
    for line in lines:
        line = MD_LINK.sub(lambda m: f"]({target(m.group(1))})", line)
        line = RAW_HREF.sub(lambda m: f'href="{target(m.group(1))}"', line)
        out.append(line)
    return out


# ---------------------------------------------------------------- rendering

def pandoc(exe, markdown):
    cmd = [exe, "--from", "markdown", "--to", "html5", "--wrap=none", "--shift-heading-level-by=-1",
           "--lua-filter", str(LUA)]
    run = subprocess.run(cmd, input=markdown.encode("utf-8"), capture_output=True, timeout=300)
    if run.returncode != 0:
        raise BookError(f"pandoc failed: {run.stderr.decode('utf-8', 'replace').strip()}")
    return run.stdout.decode("utf-8").replace("\r\n", "\n").strip()


def describe(fragment):
    """The first paragraph, tags removed, cut to 160 characters at a word boundary."""
    m = re.search(r"<p>(.*?)</p>", fragment, re.S)
    text = re.sub(r"<[^>]+>", "", m.group(1)) if m else ""
    text = re.sub(r"\s+", " ", html.unescape(text).replace("†", "")).strip()
    if len(text) <= 160:
        return text
    return text[:157].rsplit(" ", 1)[0].rstrip(",;:") + "..."


def game_name(root, repo):
    data = root / "guides.json"
    if data.is_file():
        for g in json.loads(data.read_text(encoding="utf-8")).get("guides", []):
            if g["repo"] == repo:
                return g["game"]
    return repo.replace("-", " ").title()


def head(root_rel, title, description, url, image, image_alt, ld):
    e = html.escape
    return f"""<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title><meta name="description" content="{e(description)}">
<meta name="color-scheme" content="dark light"><meta name="theme-color" content="#0d1117">
<meta property="og:type" content="article"><meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(description)}"><meta property="og:url" content="{e(url)}"><meta property="og:image" content="{e(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="{e(image_alt)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="{e(image)}">
<link rel="canonical" href="{e(url)}"><link rel="icon" href="{shell.FAVICON}">
{shell.THEME_SCRIPT}{shell.head_assets(root_rel)}<link rel="stylesheet" href="{root_rel}walkthrough.css?v={CSS_VERSION}">
{ld}
</head>
"""


def notice(text):
    return f'<p class="spoiler-notice"><strong>Spoilers.</strong> {html.escape(text)}</p>'


def rail(groups, current):
    e = html.escape
    parts = []
    for g in groups:
        here = any(p is current for p in g["pages"])
        items = "".join(
            f'<li><a href="../{e(p["slug"])}/"{" aria-current=\"page\"" if p is current else ""}>{e(p["title"])}</a></li>'
            for p in g["pages"])
        parts.append(f'<li class="wt-rail-group{" current" if here else ""}"><span>{e(g["title"])}</span><ol>{items}</ol></li>')
    # Scroll the rail (not the page) so the current chapter shows: down on a desktop, sideways on a phone.
    script = ("<script>(()=>{const a=document.querySelector('.wt-rail [aria-current]');if(!a)return;"
              "const r=document.querySelector('.wt-rail'),o=a.closest('ol');"
              "const b=x=>x.getBoundingClientRect();"
              "r.scrollTop+=b(a).top-b(r).top-r.clientHeight/3;o.scrollLeft+=b(a).left-b(o).left-16})()</script>")
    return f'<nav class="wt-rail" aria-label="All chapters"><a class="wt-rail-all" href="../">All chapters</a><ul>{"".join(parts)}</ul></nav>{script}'


def pager(prev, nxt):
    e = html.escape
    left = (f'<a class="wt-prev" href="../{e(prev["slug"])}/" rel="prev"><span>Previous</span>{e(prev["title"])}</a>'
            if prev else '<span class="wt-prev wt-empty"></span>')
    right = (f'<a class="wt-next" href="../{e(nxt["slug"])}/" rel="next"><span>Next</span>{e(nxt["title"])}</a>'
             if nxt else '<span class="wt-next wt-empty"></span>')
    return f'<nav class="wt-pager" aria-label="Previous and next chapter">{left}<a class="wt-all" href="../">All chapters</a>{right}</nav>'


def chapter_page(repo, game, groups, pages, i, body, variant):
    e = html.escape
    p = pages[i]
    root_rel = "../../../../"
    url = f"{SITE}/guides/{repo}/walkthrough/{p['slug']}/"
    title = f"{game} walkthrough: {p['title']} · Hintforge"
    description = p["description"] or f"{game} walkthrough: {p['title']}."
    image = f"{SITE}/assets/guides/previews/{repo}-walkthrough.png?v={CSS_VERSION}"
    image_alt = f"The contents page of the {game} walkthrough on mackforge.dev"
    ld = shell.json_ld({
        "@context": "https://schema.org", "@type": "WebPage", "name": title, "url": url, "description": description,
        "about": {"@type": "VideoGame", "name": game},
        "isPartOf": {"@type": "WebPage", "name": f"{game} spoiler-free hint guide", "url": f"{SITE}/guides/{repo}/"},
    })
    is_app = p["id"].startswith("app-")
    text = SPOILER_PAGE if is_app else shell.SPOILER_NOTICE
    side = rail(groups, p) if variant == "b" else ""
    return head(root_rel, title, description, url, image, image_alt, ld) + f"""<body class="workbench guides-page walkthrough-page wt-{variant}" data-share-title="{e(game)} walkthrough: {e(p['title'])}">
<a class="skip" href="#chapter">Skip to the chapter</a>
{shell.nav(root_rel)}
<main id="chapter">
<nav class="wt-crumbs" aria-label="Breadcrumb"><a href="../../">{e(game)} guide</a><span aria-hidden="true">/</span><a href="../">Walkthrough</a><span aria-hidden="true">/</span><span aria-current="page">{e(p['title'])}</span></nav>
<div class="wt-layout">
{side}<article class="wt-sheet">
<header class="wt-head"><p class="eyebrow">{e(game)} walkthrough · {e(p['group']['title'])}</p><h1 id="{e(p['id'])}">{e(p['title'])}</h1>{notice(text)}</header>
<div class="wt-body">
{body}
</div>
{pager(pages[i - 1] if i > 0 else None, pages[i + 1] if i + 1 < len(pages) else None)}
</article>
</div>
</main>
{shell.footer(root_rel)}
</body></html>
"""


SPOILER_PAGE = "This page shows everything in it, puzzle solutions included, and sometimes points ahead to later chambers."


def contents_page(repo, game, groups, pages, variant):
    e = html.escape
    root_rel = "../../../"
    url = f"{SITE}/guides/{repo}/walkthrough/"
    title = f"{game} walkthrough: all chapters · Hintforge"
    chapters, appendices = split_counts(pages)
    description = f"A {game} walkthrough in {count_text(chapters, appendices)}, one page each, in play order."
    image = f"{SITE}/assets/guides/previews/{repo}-walkthrough.png?v={CSS_VERSION}"
    image_alt = f"The contents page of the {game} walkthrough on mackforge.dev"
    ld = shell.json_ld({
        "@context": "https://schema.org", "@type": "CollectionPage", "name": title, "url": url, "description": description,
        "about": {"@type": "VideoGame", "name": game},
        "isPartOf": {"@type": "WebPage", "name": f"{game} spoiler-free hint guide", "url": f"{SITE}/guides/{repo}/"},
        "mainEntity": {"@type": "ItemList", "itemListElement": [
            {"@type": "ListItem", "position": n, "name": p["title"], "url": f"{url}{p['slug']}/"} for n, p in enumerate(pages, 1)]},
    })
    blocks = []
    for g in groups:
        if not g["pages"]:
            continue
        items = "".join(f'<li><a href="{e(p["slug"])}/">{e(p["title"])}</a></li>' for p in g["pages"])
        tag = "ul" if all(p["id"].startswith("app-") for p in g["pages"]) else "ol"
        blocks.append(f'<section class="wt-group" aria-labelledby="g-{e(g["id"])}"><h2 id="g-{e(g["id"])}">{e(g["title"])}</h2><{tag}>{items}</{tag}></section>')
    return head(root_rel, title, description, url, image, image_alt, ld) + f"""<body class="workbench guides-page walkthrough-page walkthrough-contents wt-{variant}" data-share-title="{e(game)} walkthrough">
<a class="skip" href="#contents">Skip to the contents</a>
{shell.nav(root_rel)}
<main id="contents">
<nav class="wt-crumbs" aria-label="Breadcrumb"><a href="../">{e(game)} guide</a><span aria-hidden="true">/</span><span aria-current="page">Walkthrough</span></nav>
<header class="wt-head"><p class="eyebrow">Hintforge guide</p><h1>{e(game)} walkthrough</h1><p class="wt-lede">{e(count_text(chapters, appendices).capitalize())}, one page each, in play order.</p>{notice(shell.SPOILER_NOTICE_ALL)}</header>
<div class="wt-groups">
{chr(10).join(blocks)}
</div>
</main>
{shell.footer(root_rel)}
</body></html>
"""


def split_counts(pages):
    appendices = sum(1 for p in pages if p["id"].startswith("app-"))
    return len(pages) - appendices, appendices


def count_text(chapters, appendices):
    words = []
    if chapters:
        words.append(f"{chapters} chapter{'s' if chapters != 1 else ''}")
    if appendices:
        words.append(f"{appendices} appendi{'ces' if appendices != 1 else 'x'}")
    return " and ".join(words)


def leftovers(page_html):
    return [s for s in LEFTOVERS if s in page_html]


def render_book(root, repo, exe, variant):
    """Every page of one book as {relative output path: html}. Raises BookError."""
    folder = root / "books" / repo
    check_passed(folder)
    groups, pages = parse((folder / "book.md").read_text(encoding="utf-8"))
    where = id_map(pages)
    missing, out = set(), {}
    for p in pages:
        intro = rewrite_links(drop_chapter_nav(part_lines(p)), p, where, missing)
        lines = rewrite_links(drop_chapter_nav(p["lines"]), p, where, missing)
        p["md_intro"], p["md"] = "\n".join(intro).strip(), "\n".join(lines).strip()
    if missing:
        raise BookError(f"{repo}: links point at ids that no page holds: {', '.join(sorted(missing))}")
    game = game_name(root, repo)
    for p in pages:
        body = pandoc(exe, p["md"] + "\n")
        p["description"] = describe(body)
        if p["md_intro"]:
            g = p["group"]
            intro = pandoc(exe, p["md_intro"] + "\n")
            body = (f'<section class="wt-part" id="{html.escape(g["id"])}" aria-label="{html.escape(g["title"])}">'
                    f'<h2>{html.escape(g["title"])}</h2>\n{intro}\n</section>\n{body}')
        p["body"] = body
    base = Path("guides") / repo / "walkthrough"
    for i, p in enumerate(pages):
        out[base / p["slug"] / "index.html"] = chapter_page(repo, game, groups, pages, i, p["body"], variant)
    out[base / "index.html"] = contents_page(repo, game, groups, pages, variant)
    bad = {str(path): leftovers(page) for path, page in out.items() if leftovers(page)}
    if bad:
        raise BookError(f"{repo}: book markup left on rendered pages: "
                        + "; ".join(f"{k}: {', '.join(v)}" for k, v in sorted(bad.items())))
    return out


# ---------------------------------------------------------------- used by build_guides.py

def book_pages(repo, root=ROOT):
    groups, pages = parse((root / "books" / repo / "book.md").read_text(encoding="utf-8"))
    return pages


def page_counts(repo, root=ROOT):
    return count_text(*split_counts(book_pages(repo, root)))


def page_paths(repo, root=ROOT):
    base = f"/guides/{repo}/walkthrough/"
    return [base] + [f"{base}{p['slug']}/" for p in book_pages(repo, root)]


def book_date(repo, root=ROOT):
    """The day books/<repo>/book.md was last committed; today when it is not committed yet."""
    try:
        run = subprocess.run(["git", "log", "-1", "--format=%cs", "--", f"books/{repo}/book.md"],
                             cwd=root, capture_output=True, text=True, timeout=60)
        day = run.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        day = ""
    return day or date.today().isoformat()


# ---------------------------------------------------------------- main

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--variant", choices=["a", "b"], default=DEFAULT_VARIANT)
    ap.add_argument("--root", default=str(ROOT), help="site folder holding books/ (default: this repository)")
    args = ap.parse_args(argv)
    root = Path(args.root).resolve()
    books = sorted(d.name for d in (root / "books").iterdir() if (d / "book.md").is_file()) if (root / "books").is_dir() else []
    if not books:
        print("no books in books/; nothing to build")
        return 0
    exe = find_pandoc()
    if exe is None:
        print("pandoc not found (checked $PANDOC, PATH and the Pandoc install folders)", file=sys.stderr)
        return 2
    ver = pandoc_version(exe)
    if ver < MIN_PANDOC:
        print(f"pandoc {ver[0]}.{ver[1]} at {exe} is too old; this needs {MIN_PANDOC[0]}.{MIN_PANDOC[1]} or newer", file=sys.stderr)
        return 2
    rendered = {}
    try:
        for repo in books:
            rendered[repo] = render_book(root, repo, exe, args.variant)
    except BookError as err:
        print(f"build stopped, nothing written: {err}", file=sys.stderr)
        return 1
    for repo, out in rendered.items():
        for rel, page in out.items():
            path = root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(page, encoding="utf-8", newline="\n")
        print(f"{repo}: {len(out) - 1} pages and a contents page written (layout {args.variant})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
