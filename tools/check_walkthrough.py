"""Check the built walkthrough pages before publishing.

    python tools/check_walkthrough.py

For every page under guides/*/walkthrough/ it checks that each internal href and
src (book links, site navigation, stylesheets, scripts, images) points at a file
in this repository and, when it names an anchor, at an id on that page; that no
chapter-nav block or book-internal markup is left; and that the page carries its
own title, description, canonical, link-preview tags and spoiler notice.
Exit 0 when every page passes, 1 otherwise.
"""
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_books import LEFTOVERS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
HEAD_TAGS = ['<title>', '<meta name="description"', '<link rel="canonical"', 'property="og:title"', 'property="og:description"',
             'property="og:url"', 'property="og:image"', 'name="twitter:card" content="summary_large_image"', 'class="spoiler-notice"']


class Links(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs, self.ids = [], set()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids.add(a["id"])
        if tag == "a" and a.get("name"):
            self.ids.add(a["name"])
        for key in ("href", "src"):
            if a.get(key) is not None and not (tag == "link" and a.get("rel") in ("preconnect",)):
                self.refs.append(a[key])

    handle_startendtag = handle_starttag


_cache = {}


def ids_of(path):
    if path not in _cache:
        p = Links()
        p.feed(path.read_text(encoding="utf-8"))
        _cache[path] = p.ids
    return _cache[path]


def target_file(page, ref):
    """The local file an internal reference points at, or None for an outside one."""
    parts = urlsplit(ref)
    if parts.scheme or ref.startswith("//") or ref.startswith(("mailto:", "data:")):
        return None, None
    path = unquote(parts.path)
    file = page if path == "" else (page.parent / path).resolve()
    if path.endswith("/") or (file.is_dir()):
        file = file / "index.html"
    return file, parts.fragment


def main():
    pages = sorted(ROOT.glob("guides/*/walkthrough/**/index.html"))
    problems = []
    for page in pages:
        text = page.read_text(encoding="utf-8")
        rel = page.relative_to(ROOT).as_posix()
        p = Links()
        p.feed(text)
        _cache[page] = p.ids
        for ref in p.refs:
            file, frag = target_file(page, ref)
            if file is None:
                continue
            try:
                file.relative_to(ROOT)
            except ValueError:
                problems.append(f"{rel}: {ref} points outside the site")
                continue
            if not file.is_file():
                problems.append(f"{rel}: {ref} -> missing file")
            elif frag and file.suffix == ".html" and frag not in ids_of(file):
                problems.append(f"{rel}: {ref} -> no id '{frag}'")
        if "chapter-nav" in text:
            problems.append(f"{rel}: a chapter-nav block is left")
        for s in LEFTOVERS:
            if s in text:
                problems.append(f"{rel}: contains {s!r}")
        for tag in HEAD_TAGS:
            if tag not in text:
                problems.append(f"{rel}: missing {tag}")
    titles = [re.search(r"<title>(.*?)</title>", p.read_text(encoding="utf-8")).group(1) for p in pages]
    if len(set(titles)) != len(titles):
        problems.append("two pages share a title")
    for line in problems:
        print(line)
    print(f"{len(pages)} pages checked, {len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
