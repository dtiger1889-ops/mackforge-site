"""Checks for tools/import_book.py and tools/build_books.py, on tiny books in a temporary folder.

    python tools/test_build_books.py

Needs Pandoc, like build_books.py. Exit 0 when every check passes.
"""
import contextlib
import io
import json
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_books  # noqa: E402
import import_book  # noqa: E402

GOOD = """# Part 1: First steps {#part-1}

## Room A {#ch-01}

Room A has a door. The next room is [Room B](#ch-02).

> **Tip:** Look up.

## Room B {#ch-02}

Room B is the last room. Back to [Room A](#ch-01) or the [contents](#contents).
"""

results = []


def check(name, ok, detail=""):
    ok = bool(ok)
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {name}{'' if ok else '  -- ' + detail}")


def make_book(root, text, check_json='{"failing": []}', repo="fixture"):
    folder = root / "books" / repo
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "book.md").write_text(text, encoding="utf-8")
    if check_json is not None:
        (folder / "check.json").write_text(check_json, encoding="utf-8")
    return folder


def build(root):
    err = io.StringIO()
    with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
        code = build_books.main(["--root", str(root)])
    return code, err.getvalue()


def imported(src, root):
    import_book.ROOT = root
    with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
        code = import_book.main([str(src), "fixture"])
    return code, (root / "books" / "fixture").exists()


def fresh():
    return Path(tempfile.mkdtemp(prefix="book-test-"))


# import_book.py
src = fresh() / "book"
src.mkdir()
(src / "fixture_book.md").write_text(GOOD, encoding="utf-8")
(src / "check.json").write_text(json.dumps({"failing": ["ch-02"]}), encoding="utf-8")
code, made = imported(src, fresh())
check("import: a check.json with a failing chapter is refused, nothing copied", code == 1 and not made, f"exit {code}, copied {made}")
(src / "check.json").unlink()
code, made = imported(src, fresh())
check("import: a missing check.json is refused, nothing copied", code == 1 and not made, f"exit {code}, copied {made}")
(src / "check.json").write_text('{"failing": []}', encoding="utf-8")
site = fresh()
code, made = imported(src, site)
check("import: a passing book is copied", code == 0 and (site / "books/fixture/book.md").read_text(encoding="utf-8") == GOOD, f"exit {code}")

# build_books.py: the good book builds, with links pointed at the right pages
site = fresh()
make_book(site, GOOD)
code, err = build(site)
out = site / "guides/fixture/walkthrough"
page_a = (out / "room-a/index.html").read_text(encoding="utf-8") if (out / "room-a/index.html").is_file() else ""
page_b = (out / "room-b/index.html").read_text(encoding="utf-8") if (out / "room-b/index.html").is_file() else ""
check("build: a good book writes two pages and a contents page",
      code == 0 and (out / "index.html").is_file() and page_a and page_b, f"exit {code}: {err}")
check("build: a link to another chapter goes to that chapter's page", 'href="../room-b/#ch-02"' in page_a)
check("build: #contents goes to the contents page", 'href="../">contents</a>' in page_b)
check("build: the Tip becomes a box", '<div class="box tip">' in page_a)

# build_books.py: failures
site = fresh()
make_book(site, GOOD, check_json='{"failing": ["ch-01"]}')
code, err = build(site)
check("build: a failing check.json is refused", code == 1 and not (site / "guides").exists(), f"exit {code}")

site = fresh()
make_book(site, GOOD, check_json=None)
code, err = build(site)
check("build: a missing check.json is refused", code == 1 and not (site / "guides").exists(), f"exit {code}")

site = fresh()
make_book(site, GOOD.replace("(#ch-02)", "(#ch-77)"))
code, err = build(site)
check("build: a dangling link id exits 1 and names the id", code == 1 and "ch-77" in err and not (site / "guides").exists(), f"exit {code}: {err}")

site = fresh()
make_book(site, GOOD.replace("## Room B {#ch-02}", "## Room A {#ch-02}"))
code, err = build(site)
check("build: two headings with the same slug exit 1", code == 1 and "room-a" in err, f"exit {code}: {err}")

site = fresh()
make_book(site, GOOD.replace("Room B is the last room.", "Room B is the last room. [spoiler: x]"))
code, err = build(site)
check("build: a leftover [spoiler: x] exits 1", code == 1 and "[spoiler:" in err, f"exit {code}: {err}")

site = fresh()
make_book(site, GOOD.replace("Room A has a door.", 'Room A has a <a href="#ch-99">door</a>.'))
code, err = build(site)
check('build: a raw <a href="#ch-99"> exits 1 and names the id', code == 1 and "ch-99" in err, f"exit {code}: {err}")

site = fresh()
nav = '```{=html}\n<nav class="chapter-nav"><a href="#ch-02">Room B</a><a class="up" href="#contents">Contents</a></nav>\n```\n'
make_book(site, GOOD.replace("> **Tip:** Look up.\n", "> **Tip:** Look up.\n\n" + nav))
code, err = build(site)
page = (site / "guides/fixture/walkthrough/room-a/index.html")
check("build: chapter-nav blocks are dropped", code == 0 and "chapter-nav" not in page.read_text(encoding="utf-8"), f"exit {code}: {err}")

print(f"{sum(results)} of {len(results)} checks passed")
sys.exit(0 if all(results) else 1)
