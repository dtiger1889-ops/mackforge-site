# mackforge-site

The source for mackforge.dev: one page listing my public repos, each with a plain label saying how much I still use it.

It is plain HTML and one CSS file, with no framework and no build step, served by GitHub Pages.

## Files

- `index.html` is the whole site.
- `style.css` is the only stylesheet. It follows the reader's light or dark setting.
- `CNAME` tells GitHub Pages which domain to serve.
- `.nojekyll` tells GitHub Pages to serve the files as they are, without running Jekyll.

## Updating it

The project list is written by hand in `index.html`. When a repo goes public, add a line for it in the matching section. When a repo stops getting used, change its label rather than deleting it.

Open `index.html` in a browser to preview. There is nothing to install.
