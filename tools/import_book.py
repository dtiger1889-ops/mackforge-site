"""Copy a finished Hintforge player's-guide book into this repository.

    python tools/import_book.py <book-folder> <repo-name>

<book-folder> is the folder the book tool wrote: it holds <guide>_book.md (the
whole book as one Markdown file) and check.json (the book's fact-check result).
<repo-name> is the guide's repository name as it appears in guides.json, such as
portal.

The two files are copied to books/<repo-name>/book.md and
books/<repo-name>/check.json, which is all tools/build_books.py reads. Nothing is
copied when check.json is missing, unreadable, or lists any failing chapter:
a book only goes on the site after its fact check passes. Exit codes: 0 copied,
1 refused.
"""
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def refuse(message):
    print(f"not imported: {message}", file=sys.stderr)
    return 1


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 2:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        return 1
    folder, repo = Path(args[0]), args[1]
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", repo):
        return refuse(f"{repo!r} is not a repository name (lower-case letters, digits and dashes)")
    if not folder.is_dir():
        return refuse(f"{folder} is not a folder")
    check = folder / "check.json"
    if not check.is_file():
        return refuse(f"{check} is missing, so the book's fact check cannot be confirmed")
    try:
        failing = json.loads(check.read_text(encoding="utf-8")).get("failing")
    except (ValueError, AttributeError) as err:
        return refuse(f"{check} is not a readable fact-check result ({err})")
    if not isinstance(failing, list):
        return refuse(f"{check} has no 'failing' list")
    if failing:
        return refuse(f"the fact check lists failing chapters: {', '.join(map(str, failing))}")
    books = sorted(folder.glob("*_book.md"))
    if len(books) != 1:
        return refuse(f"expected exactly one *_book.md in {folder}, found {len(books)}")
    out = ROOT / "books" / repo
    out.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(books[0], out / "book.md")
    shutil.copyfile(check, out / "check.json")
    print(f"copied {books[0].name} and check.json to {out.relative_to(ROOT).as_posix()}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
