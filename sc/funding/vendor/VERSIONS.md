# Library files served from this folder

Pinned copies, served from the page's own folder so it loads no script from another site (its fonts come from Google Fonts, see the end of this file). `d3-topo.min.js` is each package's own minified build joined in the order below and carries d3-array. Load order: `d3-topo.min.js`, `d3-path.min.js`, `d3-shape.min.js`, `d3-sankey.min.js`. d3-sankey 0.12.3 names d3-array 1 - 2 and d3-shape ^1.2.0; d3-shape and d3-path are the newest 1.x releases.

| File | Package | Version | Source address | License |
|---|---|---|---|---|
| `d3-topo.min.js` (part) | internmap | 2.0.3 | https://cdn.jsdelivr.net/npm/internmap@2.0.3/dist/internmap.min.js | ISC, `licenses/internmap-LICENSE` |
| `d3-topo.min.js` (part) | d3-array | 3.2.5 | https://cdn.jsdelivr.net/npm/d3-array@3.2.5/dist/d3-array.min.js | ISC, `licenses/d3-array-LICENSE` |
| `d3-topo.min.js` (part) | d3-geo | 3.1.2 | https://cdn.jsdelivr.net/npm/d3-geo@3.1.2/dist/d3-geo.min.js | ISC, `licenses/d3-geo-LICENSE` |
| `d3-topo.min.js` (part) | d3-color | 3.1.1 | https://cdn.jsdelivr.net/npm/d3-color@3.1.1/dist/d3-color.min.js | ISC, `licenses/d3-color-LICENSE` |
| `d3-topo.min.js` (part) | d3-interpolate | 3.0.2 | https://cdn.jsdelivr.net/npm/d3-interpolate@3.0.2/dist/d3-interpolate.min.js | ISC, `licenses/d3-interpolate-LICENSE` |
| `d3-topo.min.js` (part) | d3-dispatch | 3.0.2 | https://cdn.jsdelivr.net/npm/d3-dispatch@3.0.2/dist/d3-dispatch.min.js | ISC, `licenses/d3-dispatch-LICENSE` |
| `d3-topo.min.js` (part) | d3-timer | 3.0.2 | https://cdn.jsdelivr.net/npm/d3-timer@3.0.2/dist/d3-timer.min.js | ISC, `licenses/d3-timer-LICENSE` |
| `d3-topo.min.js` (part) | d3-ease | 3.0.2 | https://cdn.jsdelivr.net/npm/d3-ease@3.0.2/dist/d3-ease.min.js | BSD-3-Clause, `licenses/d3-ease-LICENSE` |
| `d3-topo.min.js` (part) | d3-selection | 3.0.1 | https://cdn.jsdelivr.net/npm/d3-selection@3.0.1/dist/d3-selection.min.js | ISC, `licenses/d3-selection-LICENSE` |
| `d3-topo.min.js` (part) | d3-transition | 3.0.2 | https://cdn.jsdelivr.net/npm/d3-transition@3.0.2/dist/d3-transition.min.js | ISC, `licenses/d3-transition-LICENSE` |
| `d3-topo.min.js` (part) | d3-drag | 3.0.1 | https://cdn.jsdelivr.net/npm/d3-drag@3.0.1/dist/d3-drag.min.js | ISC, `licenses/d3-drag-LICENSE` |
| `d3-topo.min.js` (part) | d3-zoom | 3.0.1 | https://cdn.jsdelivr.net/npm/d3-zoom@3.0.1/dist/d3-zoom.min.js | ISC, `licenses/d3-zoom-LICENSE` |
| `d3-topo.min.js` (part) | topojson-client | 3.1.0 | https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js | ISC, `licenses/topojson-client-LICENSE` |
| `tabulator.min.js` | tabulator-tables | 6.5.3 | https://cdn.jsdelivr.net/npm/tabulator-tables@6.5.3/dist/js/tabulator.min.js | MIT, `licenses/tabulator-tables-LICENSE` |
| `tabulator.min.css` | tabulator-tables | 6.5.3 | https://cdn.jsdelivr.net/npm/tabulator-tables@6.5.3/dist/css/tabulator.min.css | MIT, `licenses/tabulator-tables-LICENSE` |
| `d3-path.min.js` | d3-path | 1.0.9 | https://cdn.jsdelivr.net/npm/d3-path@1.0.9/dist/d3-path.min.js | BSD-3-Clause, `licenses/d3-path-LICENSE` |
| `d3-shape.min.js` | d3-shape | 1.3.7 | https://cdn.jsdelivr.net/npm/d3-shape@1.3.7/dist/d3-shape.min.js | BSD-3-Clause, `licenses/d3-shape-LICENSE` |
| `d3-sankey.min.js` | d3-sankey | 0.12.3 | https://cdn.jsdelivr.net/npm/d3-sankey@0.12.3/dist/d3-sankey.min.js | BSD-3-Clause, `licenses/d3-sankey-LICENSE` |

## Fonts (not in this folder)

The page loads mackforge.dev's two fonts from Google Fonts with the same request the senators map page makes (`mackforge-site/senators/index.html` line 22): `https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600&display=swap`. This is the one thing the page loads from another site. Google Fonts serves the current release of each family and cannot be pinned to a version; both are SIL Open Font License 1.1. Without them the page falls back to Impact and the system sans serif.

| Family | Weights | License |
|---|---|---|
| Anton | 400 | SIL OFL 1.1 |
| Inter | 400, 600 | SIL OFL 1.1 |
