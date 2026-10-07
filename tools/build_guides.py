"""Build the game-guide page data from the Hintforge organisation's public repos.

Run from the repository root before publishing:

    python tools/build_guides.py

It needs the GitHub CLI (`gh`) on PATH, or its full path in the GH environment
variable, and only reads public data. It writes three things:

- guides.json: one entry per guide repo, plus the framework repos;
- assets/guides/: each guide's status-card image, copied from its README so the
  page loads nothing from other sites;
- guides.html: the cards between the guides:start / guides:end markers, so the
  page works as plain HTML. Everything outside the markers is left as it is.

A repo counts as a framework repo when its name is in FRAMEWORK; every other
public, non-archived, non-fork repo in the organisation is treated as a guide.
A guide's card text is the first sentence of its README, without the opening
every guide shares; the repo description is the fallback.
"""
import html
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

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
        return None, None, None, None
    title = None
    heading = re.search(r"^#\s+(.+)$", text, re.M)
    if heading:
        title = re.split(r"\s+[—–-]\s+", heading.group(1).strip())[0].strip()
    image = re.search(r"!\[([^\]]*)\]\(([^)\s]+)\)", text)
    alt, src = (image.group(1), image.group(2)) if image else (None, None)
    if alt:
        alt = re.sub(r"\s+[—–]\s+", ": ", alt)
    intro = None
    for block in re.split(r"\n\s*\n", text):
        block = block.strip()
        if block and not block.startswith(("#", "!", "*", ">", "<", "|", "-")):
            intro = short_description(first_sentence(strip_md(block)))
            break
    return title, alt, src, intro


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
        f'<h3><a href="{e(guide["url"])}" target="_blank" rel="noopener noreferrer">{e(guide["game"])}</a></h3><p>{e(guide["description"])}</p>'
        f'<div class="project-bottom"><div class="actions">'
        f'<a class="action" href="{e(guide["url"])}" target="_blank" rel="noopener noreferrer" aria-label="Guide repository: {e(guide["game"])}">Guide <span aria-hidden="true">↗</span></a>'
        f"</div></div></div></article>"
    )


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
        title, alt, src, intro = read_readme(name)
        game = title or name.replace("-", " ").title()
        guides.append({
            "repo": name,
            "game": game,
            "description": intro or (repo["description"] or "").strip(),
            "url": repo["html_url"],
            "image": copy_image(name, src),
            "imageAlt": alt,
            "updated": repo["pushed_at"],
            "updatedText": pretty_date(repo["pushed_at"]),
        })
    guides.sort(key=lambda g: re.sub(r"^the\s+", "", g["game"].lower()))
    framework.sort(key=lambda f: list(FRAMEWORK).index(f["repo"]))

    data = {"organisation": ORG, "reader": READER_URL, "guides": guides, "framework": framework}
    (ROOT / "guides.json").write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    page_path = ROOT / "guides.html"
    page = page_path.read_text(encoding="utf-8")
    for marker, body in (("guides", "\n".join(card(g) for g in guides)),
                         ("framework", "\n".join(framework_item(f) for f in framework)),
                         ("count", f"{len(guides)} guides")):
        pattern = re.compile(rf"(<!-- {marker}:start -->).*?(<!-- {marker}:end -->)", re.S)
        if not pattern.search(page):
            sys.exit(f"guides.html is missing the {marker}:start / {marker}:end markers")
        page = pattern.sub(lambda m: f"{m.group(1)}{body}{m.group(2)}" if marker == "count" else f"{m.group(1)}\n{body}\n{m.group(2)}", page)
    page_path.write_text(page, encoding="utf-8", newline="\n")
    print(f"{len(guides)} guides, {len(framework)} framework repos written")


if __name__ == "__main__":
    main()
