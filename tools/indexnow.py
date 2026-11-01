"""Tell Bing (and the other IndexNow search engines) which pages to crawl.

Run from the repository root AFTER a publish has gone live, because Bing fetches the
key file and the pages from the live site:

    python tools/indexnow.py            # every URL in sitemap.xml
    python tools/indexnow.py URL ...    # only these URLs

IndexNow needs no account. The site proves it owns the key by serving the key file
named in KEY_FILE at its root, containing the key. The key is public by design; it
only shows that a submission came from whoever controls the site.

Exit 0 when the engine accepts the list (HTTP 200 or 202), 1 otherwise.
"""
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOST = "mackforge.dev"
KEY = "72110ec80118e5be97d1770b9f1a13c1"
KEY_FILE = f"{KEY}.txt"
ENDPOINT = "https://www.bing.com/indexnow"


def sitemap_urls():
    text = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    return re.findall(r"<loc>([^<]+)</loc>", text)


def main(argv):
    urls = argv or sitemap_urls()
    urls = [u for u in urls if u.startswith(f"https://{HOST}/")]
    if not urls:
        sys.exit("no mackforge.dev URLs to submit")
    if (ROOT / KEY_FILE).read_text(encoding="utf-8").strip() != KEY:
        sys.exit(f"{KEY_FILE} does not contain the key")
    body = json.dumps({"host": HOST, "key": KEY, "keyLocation": f"https://{HOST}/{KEY_FILE}", "urlList": urls}).encode("utf-8")
    request = urllib.request.Request(ENDPOINT, data=body, method="POST",
                                     headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status = response.status
    except urllib.error.HTTPError as error:
        status = error.code
    meaning = {200: "accepted", 202: "received, key check pending", 400: "bad request format",
               403: "key not valid (is the key file live?)", 422: "URLs or key do not match the host",
               429: "too many requests"}.get(status, "unexpected reply")
    print(f"IndexNow {ENDPOINT}: HTTP {status} ({meaning}) for {len(urls)} URLs")
    return 0 if status in (200, 202) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
