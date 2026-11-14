(function (root) {
"use strict";
const SWEARING_IN = "2027-01-03";
const PARTIES = ["Democrat", "Independent", "Republican"]; // alphabetical, as the page lists them
const YEARS_CAP = 36;
function ymd(iso) {
const [y, m, d] = iso.split("-").map(Number);
return { y, m, d };
}
function dayNumber(iso) {
const { y, m, d } = ymd(iso);
return Date.UTC(y, m - 1, d) / 86400000;
}
function wholeYearsBetween(fromIso, toIso) {
const a = ymd(fromIso), b = ymd(toIso);
let n = b.y - a.y;
if (b.m < a.m || (b.m === a.m && b.d < a.d)) n--;
return n;
}
function dateFor(list, today) {
return list === "next" && today < SWEARING_IN ? SWEARING_IN : today;
}
function ageOn(birthday, on) {
return birthday ? wholeYearsBetween(birthday, on) : null;
}
function yearsInSenate(rec, on) {
if (!rec.service_start || rec.service_start > on) return 0;
return Math.round(((dayNumber(on) - dayNumber(rec.service_start)) / 365.2425) * 10) / 10;
}
function wholeYearsInSenate(rec, on) {
if (!rec.service_start || rec.service_start > on) return 0;
return wholeYearsBetween(rec.service_start, on);
}
function earlierYears(rec) {
return rec.prior_senate_days ? Math.round(rec.prior_senate_days / 365.25) : 0;
}
function yearsT(years) {
return Math.max(0, Math.min(years, YEARS_CAP)) / YEARS_CAP;
}
function sameHolder(a, b) {
if (!a || !b) return false;
if (a.bioguide && b.bioguide) return a.bioguide === b.bioguide;
return a.name === b.name;
}
function nextElectionShown(rec, nextBySeat) {
const n = nextBySeat[rec.seat_id];
return sameHolder(rec, n) && !n.leaving && !n.count_pending ? n.next_election : null;
}
function nextElectionWords(rec, list, nextBySeat) {
const y = nextElectionShown(rec, nextBySeat);
if (y !== null) return String(y);
const n = nextBySeat[rec.seat_id];
if (list === "next") return rec.count_pending ? "Not yet called" : "Leaving";
if (rec.ballot_2026 === "not-called" || (sameHolder(rec, n) && n.count_pending)) return "Not yet called";
if (rec.ballot_2026 === "lost" || rec.ballot_2026 === "did-not-run") {
if (!rec.term_end || rec.term_end <= "2026-11-03") return "Until the winner is sworn in";
const [yy, mm, dd] = rec.term_end.split("-").map(Number);
return `Term ends ${dd} ${MONTHS[mm - 1]} ${yy}`;
}
return "Leaving";
}
function partyCounts(records) {
const c = { Democrat: 0, Independent: 0, Republican: 0 };
records.forEach(r => { if (r.party in c) c[r.party]++; });
return c;
}
function serviceDays(rec, on) {
if (!rec.service_start || rec.service_start > on) return 0;
return dayNumber(on) - dayNumber(rec.service_start);
}
function ageDays(rec, on) { return rec.birthday ? dayNumber(on) - dayNumber(rec.birthday) : null; }
const sortKeys = {
party: rec => PARTIES.indexOf(rec.party),
years: (rec, on) => serviceDays(rec, on),
age: (rec, on) => ageDays(rec, on),
next: (rec, on, nextBySeat) => nextElectionShown(rec, nextBySeat),
};
const plain = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // code point order, the same in node, browsers and Python
function tieBreak(a, b) { return plain(a.last_name || "", b.last_name || "") || plain(a.seat_id || "", b.seat_id || ""); }
function compareBy(key, on, nextBySeat) {
if (key === "state") return compareState;
const k = sortKeys[key], dir = key === "next" || key === "party" ? 1 : -1;
return (a, b) => {
const x = k(a, on, nextBySeat), y = k(b, on, nextBySeat);
if (x === null && y === null) return tieBreak(a, b);
if (x === null) return 1;
if (y === null) return -1;
if (x !== y) return dir * (x - y);
if (key === "party") {
const d = serviceDays(b, on) - serviceDays(a, on);
if (d) return d;
}
return tieBreak(a, b);
};
}
const RANK_ORDER = { senior: 0, junior: 1 };
function compareState(a, b) {
return plain(STATE_NAMES[a.state] || "", STATE_NAMES[b.state] || "") ||
(RANK_ORDER[a.rank] ?? 2) - (RANK_ORDER[b.rank] ?? 2) || tieBreak(a, b);
}
const SORTS = ["state", "party", "years", "age", "next"];
function cleanSort(v) { return SORTS.includes(v) ? v : null; }
function summary(records, on) {
const aged = records.filter(r => r.birthday);
if (!records.length) return null;
const byAge = aged.slice().sort(compareBy("age", on));
const ages = aged.map(r => ageOn(r.birthday, on)).sort((x, y) => x - y);
const mid = ages.length >> 1;
const median = !ages.length ? null : ages.length % 2 ? ages[mid] : (ages[mid - 1] + ages[mid]) / 2;
const longest = records.slice().sort(compareBy("years", on))[0];
return {
oldest: byAge[0] || null, youngest: byAge[byAge.length - 1] || null, medianAge: median,
longest, longestYears: wholeYearsInSenate(longest, on),
};
}
const STATES = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
"ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
"RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"];
const REGION_SLUGS = ["new-england", "middle-atlantic", "east-north-central", "west-north-central", "south-atlantic",
"east-south-central", "west-south-central", "mountain", "pacific"];
function cleanState(v) {
const s = String(v || "").toUpperCase();
return STATES.includes(s) ? s : null;
}
function cleanRegion(v) { return REGION_SLUGS.includes(v) ? v : null; }
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STATE_NAMES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana",
IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };
const Calc = {
STATES, STATE_NAMES, REGION_SLUGS, SORTS, cleanState, cleanRegion, cleanSort, SWEARING_IN, PARTIES, YEARS_CAP, dateFor, ageOn,
yearsInSenate, wholeYearsInSenate, earlierYears, yearsT, sameHolder, nextElectionShown, nextElectionWords, partyCounts, sortKeys,
compareBy, compareState, summary, serviceDays, ageDays, wholeYearsBetween,
};
if (typeof module !== "undefined" && module.exports) module.exports = Calc;
else root.Calc = Calc;
})(this);
;
(function () {
"use strict";
const SM = window.SM = window.SM || {};
const NS = "http://www.w3.org/2000/svg";
const LETTER = { Democrat: "D", Republican: "R", Independent: "I" };
const TOKEN = { Democrat: "dem", Republican: "rep", Independent: "ind" };
const SIZES = {
phone: { rP: 50, rB: 62, fs: 15, badge: 12 },
desk: { rP: 60, rB: 74, fs: 16, badge: 13 },
meet: { rP: 74, rB: 86, fs: 17, badge: 13 },
quiz: { rP: 80, rB: 93, fs: 17, badge: 13 },
place: { rP: 40, rB: 48, fs: 13, badge: 11 },
detailPhone: { rP: 88, rB: 106, fs: 17, badge: 15 },
detailDesk: { rP: 104, rB: 124, fs: 19, badge: 16 },
};
let uid = 0;
const rampCache = {};
function ramp(party) {
if (!rampCache[party]) {
const css = getComputedStyle(document.documentElement), t = TOKEN[party];
rampCache[party] = window.d3.interpolateLab(css.getPropertyValue(`--${t}-0`).trim(), css.getPropertyValue(`--${t}-1`).trim());
}
return rampCache[party];
}
function shade(party, t) {
return window.d3.color(ramp(party)(Math.max(0, Math.min(1, t)))).formatHex();
}
function darkEnd(party) { return ramp(party)(1); }
function band(rec, on) { return shade(rec.party, window.Calc.yearsT(window.Calc.yearsInSenate(rec, on))); }
function el(tag, attrs, parent) {
const e = document.createElementNS(NS, tag);
for (const k in attrs) e.setAttribute(k, attrs[k]);
if (parent) parent.appendChild(e);
return e;
}
function pt(r, deg) {
const a = (deg * Math.PI) / 180;
return [+(r * Math.sin(a)).toFixed(2), +(-r * Math.cos(a)).toFixed(2)];
}
function photoUrl(rec, px) { return rec.photo ? `photos/${rec.photo[px]}` : ""; }
function nameForms(rec) {
const full = rec.name;
const words = full.replace(/,?\s+(Jr\.|Sr\.|III|II|IV)$/, "").split(/\s+/).filter(w => !/^[A-Z]\.$/.test(w));
const last = rec.last_name || words[words.length - 1];
return { full, firstLast: `${words[0]} ${last}`, last };
}
function rankText(rec, list, on) {
const today = (window.SM && SM.today) || on;
if (list === "next" && rec.status === "elect" && today < window.Calc.SWEARING_IN) return "SENATOR-ELECT";
return rec.rank ? `${rec.rank.toUpperCase()} SENATOR` : "";
}
function label(rec, list, stateName) {
const role = list === "next" && rec.status === "elect" ? "senator-elect" : `${rec.rank} senator`;
return `${rec.name}, ${role} from ${stateName}, ${rec.party}`;
}
function ring(rec, size, opts) {
const Z = SIZES[size], R = Z.rB + 26, id = "rg" + uid++;
const rank = opts.neutral ? "" : rankText(rec, opts.list, opts.on);
const hidden = opts.hideName || opts.neutral;
const svg = el("svg", { class: "ring", width: 2 * R, height: 2 * R, viewBox: `${-R} ${-R} ${2 * R} ${2 * R}`, role: "img",
"aria-label": hidden ? (opts.neutral ? "A senator's face" : `A senator's face, ${rank.toLowerCase()}, ${rec.party}`) : label(rec, opts.list, opts.stateName) });
const defs = el("defs", {}, svg);
el("circle", { r: Z.rP }, el("clipPath", { id: id + "p" }, defs));
el("circle", { class: opts.neutral ? "edge neutral" : `edge ${TOKEN[rec.party]}`, r: Z.rB, fill: opts.neutral ? "var(--vacant)" : band(rec, opts.on), "stroke-width": 1 }, svg);
el("circle", { class: opts.neutral ? "edge neutral" : `edge ${TOKEN[rec.party]}`, r: Z.rP, fill: "var(--soft)", "stroke-width": 1 }, svg);
el("image", { href: photoUrl(rec, Z.rP > 80 ? "320" : "160"), x: -Z.rP, y: -Z.rP, width: 2 * Z.rP, height: 2 * Z.rP,
preserveAspectRatio: "xMidYMin slice", "clip-path": `url(#${id}p)` }, svg);
if (!opts.neutral) {
const [bx, by] = pt(Z.rB, 90);
el("circle", { cx: bx, cy: by, r: Z.badge, fill: "var(--surface)", stroke: "var(--ink)", "stroke-width": 1 }, svg);
el("text", { x: bx, y: by, "text-anchor": "middle", "dominant-baseline": "central", "font-size": Math.max(12, Math.round(Z.badge * 1.1)),
"font-weight": 600, fill: "var(--ink)", "aria-hidden": "true" }, svg).textContent = LETTER[rec.party];
}
const rTop = Z.rB + 6, rBot = Z.rB + 16;
el("path", { id: id + "t", d: `M${pt(rTop, -72)} A${rTop} ${rTop} 0 0 1 ${pt(rTop, 72)}`, fill: "none" }, defs);
el("path", { id: id + "u", d: `M${pt(rBot, 250)} A${rBot} ${rBot} 0 0 0 ${pt(rBot, 110)}`, fill: "none" }, defs);
if (!hidden) {
const t1 = el("text", { class: "ring-name", "font-size": Z.fs, "font-weight": 600, fill: "var(--ink)", "aria-hidden": "true" }, svg);
el("textPath", { href: `#${id}t`, startOffset: "50%", "text-anchor": "middle" }, t1).textContent = rec.name;
svg._fit = { text: t1, forms: nameForms(rec), arc: (rTop * 144 * Math.PI) / 180, fs: Z.fs };
}
if (rank) {
const t2 = el("text", { "font-size": 12, "font-weight": 600, "letter-spacing": "0.08em", fill: "var(--ink)", "aria-hidden": "true" }, svg);
el("textPath", { href: `#${id}u`, startOffset: "50%", "text-anchor": "middle" }, t2).textContent = rank;
}
return svg;
}
function fit(svg) {
const f = svg._fit;
if (!f) return;
const tp = f.text.firstChild, small = Math.max(12, f.fs - 1);
const tries = [[f.forms.full, f.fs], [f.forms.full, small], [f.forms.firstLast, small], [f.forms.last, small], [f.forms.last, 12]];
const probe = el("text", { "font-weight": 600, visibility: "hidden" }, svg);
let chosen = tries[tries.length - 1], fits = false;
for (const [text, px] of tries) {
probe.setAttribute("font-size", px);
probe.textContent = text;
if (probe.getComputedTextLength() <= f.arc * 0.96) { chosen = [text, px]; fits = true; break; }
}
probe.remove();
f.text.setAttribute("font-size", chosen[1]);
tp.textContent = chosen[0];
svg.dataset.namePx = chosen[1];
svg.dataset.overflow = fits ? "0" : "1";
}
function fitAll(root) { (root || document).querySelectorAll("svg.ring").forEach(fit); }
function compact(rec, on, r = 28, lazy = false) {
const R = r + 3, id = "cr" + uid++;
const svg = el("svg", { class: "ring-compact", width: 2 * R + 6, height: 2 * R, viewBox: `${-R} ${-R} ${2 * R + 6} ${2 * R}`, "aria-hidden": "true" });
el("circle", { r }, el("clipPath", { id }, el("defs", {}, svg)));
el("circle", { r: R - 0.5, fill: band(rec, on) }, svg);
el("circle", { r, fill: "var(--soft)" }, svg);
el("image", { [lazy ? "data-href" : "href"]: photoUrl(rec, "160"), x: -r, y: -r, width: 2 * r, height: 2 * r, preserveAspectRatio: "xMidYMin slice", "clip-path": `url(#${id})` }, svg);
el("circle", { cx: R - 4, cy: R - 8, r: 9, fill: "var(--surface)", stroke: "var(--ink)", "stroke-width": 1 }, svg);
el("text", { x: R - 4, y: R - 8, "text-anchor": "middle", "dominant-baseline": "central", "font-size": 12, "font-weight": 600, fill: "var(--ink)" }, svg).textContent = LETTER[rec.party];
return svg;
}
SM.Ring = { ring, fit, fitAll, compact, shade, band, darkEnd, LETTER, SIZES, el };
})();
;
(function () {
"use strict";
const SM = window.SM = window.SM || {};
SM.views = SM.views || {};
const W = 975, H = 610;
const NAMES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };
const REGIONS = [
["Northeast", "New England", "new-england", ["CT", "ME", "MA", "NH", "RI", "VT"]],
["Northeast", "Middle Atlantic", "middle-atlantic", ["NJ", "NY", "PA"]],
["Midwest", "East North Central", "east-north-central", ["IL", "IN", "MI", "OH", "WI"]],
["Midwest", "West North Central", "west-north-central", ["IA", "KS", "MN", "MO", "NE", "ND", "SD"]],
["South", "South Atlantic", "south-atlantic", ["DE", "FL", "GA", "MD", "NC", "SC", "VA", "WV"]],
["South", "East South Central", "east-south-central", ["AL", "KY", "MS", "TN"]],
["South", "West South Central", "west-south-central", ["AR", "LA", "OK", "TX"]],
["West", "Mountain", "mountain", ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY"]],
["West", "Pacific", "pacific", ["AK", "CA", "HI", "OR", "WA"]],
].map(([census, name, slug, states]) => ({ census, name, slug, states }));
const CALLOUT = ["VT", "NH", "MA", "RI", "CT", "NJ", "DE", "MD"];
const STRIP = ["CT", "DE", "HI", "MD", "MA", "NH", "NJ", "RI", "VT"];
const VIEWS = [["party", "Party", "Party"], ["years", "Years in the Senate", "Years"], ["age", "Age", "Age"], ["next", "Next election", "Next"]];
const CAPTION = {
party: "Colored by party.",
years: "Colored by years in the Senate. Lighter is newer. Darkest is 36 years or more.",
age: "Colored by age. Lighter is younger. Darkest is 90 or older.",
next: "Colored by next election. Darker is sooner: 2028, 2030, 2032. Hatched means this senator has no next election.",
};
const NEXT_T = { 2028: 0.85, 2030: 0.5, 2032: 0.15 };
const desk = () => innerWidth >= 1024;
const R = () => SM.Ring;
SM.NAMES = NAMES;
SM.REGIONS = REGIONS;
SM.regionOf = st => REGIONS.find(r => r.states.includes(st));
SM.regionBySlug = slug => REGIONS.find(r => r.slug === slug);
SM.colorView = "years";
SM.prepare = (senate, topo) => {
const d3 = window.d3, path = d3.geoPath();
const postal = Object.fromEntries(Object.entries(NAMES).map(([k, v]) => [v, k]));
const states = {};
window.topojson.feature(topo, topo.objects.states).features.forEach(f => {
const p = postal[f.properties.name];
if (!p) return;
let main = f.geometry;
if (f.geometry.type === "MultiPolygon") {
const polys = f.geometry.coordinates.map(c => ({ type: "Polygon", coordinates: c }));
main = polys.reduce((a, b) => (path.area(b) > path.area(a) ? b : a));
}
const c = path.centroid(main);
states[p] = { postal: p, name: NAMES[p], d: path(f), b: path.bounds(f).flat(), c: [c[0], c[1]] };
});
const out = { senate, states, primaries: senate.primaries_2028 || {}, bySeat: {}, byState: {} };
const order = { senior: 0, junior: 1 };
["now", "next"].forEach(list => {
out.bySeat[list] = Object.fromEntries(senate[list].map(r => [r.seat_id, r]));
const bs = {};
senate[list].forEach(r => (bs[r.state] = bs[r.state] || []).push(r));
Object.values(bs).forEach(pair => pair.sort((a, b) => (order[a.rank] ?? 2) - (order[b.rank] ?? 2)));
out.byState[list] = bs;
});
return out;
};
SM.onDate = list => window.Calc.dateFor(list, SM.today);
SM.nextYear = rec => window.Calc.nextElectionShown(rec, SM.data.bySeat.next);
function tFor(rec, view, list) {
const on = SM.onDate(list);
if (view === "party") return 0.45;
if (view === "years") return window.Calc.yearsT(window.Calc.yearsInSenate(rec, on));
if (view === "age") {
const a = window.Calc.ageOn(rec.birthday, on);
return a === null ? null : Math.max(0, Math.min(1, (a - 40) / 50));
}
const y = SM.nextYear(rec, list);
return y === null ? null : NEXT_T[y] ?? null;
}
function seatFill(rec, view, list) {
const t = tFor(rec, view, list);
if (t === null) return view === "next" ? "url(#sm-hatch)" : "var(--plate)";
return R().shade(rec.party, t);
}
SM.seatFill = seatFill;
SM.seatT = tFor;
function el(tag, attrs, parent) { return R().el(tag, attrs, parent); }
function h(tag, attrs = {}, html = "") {
const e = document.createElement(tag);
for (const k in attrs) e.setAttribute(k, attrs[k]);
if (html) e.innerHTML = html;
return e;
}
SM.h = h;
SM.esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function shape(parent, party, x, y, sz, fill, stroke, sw) {
const st = { fill, stroke, "stroke-width": sw };
if (party === "Democrat") return el("circle", { cx: x, cy: y, r: sz / 2, ...st }, parent);
if (party === "Republican") return el("rect", { x: x - sz * 0.42, y: y - sz * 0.42, width: sz * 0.84, height: sz * 0.84, ...st }, parent);
return el("path", { d: `M${x} ${y - sz * 0.58}L${x + sz * 0.58} ${y}L${x} ${y + sz * 0.58}L${x - sz * 0.58} ${y}Z`, ...st }, parent);
}
SM.shape = shape;
SM.shapeIcon = (party, size = 12, fill = "var(--surface)", stroke = "var(--ink)") => {
const sv = el("svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}`, "aria-hidden": "true", class: "pshape" });
shape(sv, party, size / 2, size / 2, size - 2, fill, stroke, 1.25);
return sv;
};
function stateLabel(st, list) {
const pair = SM.data.byState[list][st];
return `${NAMES[st]}: ` + pair.map(r => `${r.rank} senator ${r.name}, ${r.party}`).join("; ");
}
SM.stateLabel = stateLabel;
let M = null; // the mounted map: its elements, kept across renders so colors can change in place
function mount(viewEl) {
const root = h("div", { class: "mp", "data-view": "map" });
const left = h("div", { class: "mp-left" });
const bar = h("div", { class: "seatbar", "aria-hidden": "true" });
const count = h("p", { class: "sm-count mp-count", "aria-live": "polite" });
const plate = h("div", { class: "plate" });
const svg = el("svg", { class: "map", viewBox: `0 0 ${W} ${H}`, role: "group", "aria-label": "Map of the 50 states. Each state opens its two senators." }, plate);
const defs = el("defs", {}, svg);
const pat = el("pattern", { id: "sm-hatch", width: 5, height: 5, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
el("rect", { width: 5, height: 5, fill: "var(--plate)" }, pat);
el("line", { x1: 0, y1: 0, x2: 0, y2: 5, stroke: "var(--vacant)", "stroke-width": 1 }, pat);
const zoomG = el("g", { class: "zoomed" }, svg);
const statesG = el("g", { class: "states" }, zoomG);
const marksG = el("g", { class: "marks", "aria-hidden": "true" }, zoomG);
const overG = el("g", { class: "over", "aria-hidden": "true" }, zoomG);
const callG = el("g", { class: "callouts" }, svg);
const zoomBox = h("div", { class: "zoom" },
`<button type="button" data-z="in" aria-label="Zoom in"><span class="ico ico-plus" aria-hidden="true"></span></button>` +
`<button type="button" data-z="out" aria-label="Zoom out"><span class="ico ico-minus" aria-hidden="true"></span></button>` +
`<button type="button" data-z="reset" class="ztext">Whole map</button>`);
plate.appendChild(zoomBox);
const colorRow = h("div", { class: "colorby", role: "radiogroup", "aria-label": "Color the map by" });
colorRow.appendChild(h("span", { class: "lbl", "aria-hidden": "true" }, "Color by"));
VIEWS.forEach(([k, l, short]) => {
const b = h("button", { type: "button", role: "radio", "data-color": k, "aria-label": l },
`<span class="long">${SM.esc(l)}</span><span class="short" aria-hidden="true">${SM.esc(short)}</span>`);
b.addEventListener("click", () => { SM.colorView = k; SM.render({ animate: true }); });
colorRow.appendChild(b);
});
const caption = h("p", { class: "caption" });
colorRow.appendChild(caption);
const strip = h("div", { class: "strip", role: "group", "aria-label": "Small states" });
left.append(bar, count, plate, colorRow, strip);
const panel = h("aside", { class: "mp-panel", "aria-label": "Senators" });
root.append(left, panel);
viewEl.replaceChildren(root);
const st = SM.data.states;
const order = Object.keys(st).sort((a, b) => NAMES[a].localeCompare(NAMES[b]));
const parts = {};
order.forEach(p => {
const s = st[p];
const g = el("g", { class: "st", tabindex: 0, role: "button", "data-st": p }, statesG);
el("title", {}, g);
const cp = el("clipPath", { id: "clip-" + p }, defs);
el("path", { d: s.d }, cp);
const left = el("rect", { class: "half", x: -10, y: -10, width: s.c[0] + 10, height: H + 20, "clip-path": `url(#clip-${p})` }, g);
const right = el("rect", { class: "half", x: s.c[0], y: -10, width: W + 20, height: H + 20, "clip-path": `url(#clip-${p})` }, g);
const seam = el("line", { class: "seam", x1: s.c[0], y1: -10, x2: s.c[0], y2: H + 20, "clip-path": `url(#clip-${p})` }, g);
const border = el("path", { class: "border", d: s.d }, g);
const mk = el("g", { class: "mk", transform: `translate(${s.c[0]} ${s.c[1]})` }, marksG);
g.addEventListener("click", () => SM.go({ state: p, region: null }, { push: true }));
g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); SM.go({ state: p, region: null }, { push: true }); } });
hoverable(g, p);
parts[p] = { g, halves: [left, right], seam, border, mk };
});
const boxes = CALLOUT.map((p, i) => [p, 915, 230 + i * 30]).concat([["HI", st.HI.b[2] + 14, st.HI.b[1] + 4]]);
const callouts = {};
boxes.forEach(([p, bx, by]) => {
const g = el("g", { class: "call", tabindex: 0, role: "button", "data-st": p }, callG);
el("title", {}, g);
const [cx, cy] = st[p].c;
el("line", { x1: p === "HI" ? bx : bx, y1: by + 12, x2: cx, y2: cy, class: "leader" }, g);
const a = el("rect", { class: "half", x: bx, y: by, width: 26, height: 24 }, g);
const b = el("rect", { class: "half", x: bx + 26, y: by, width: 26, height: 24 }, g);
el("rect", { x: bx, y: by, width: 52, height: 24, rx: 4, class: "callframe" }, g);
el("text", { x: bx + 26, y: by + 12.5, class: "code", "text-anchor": "middle", "dominant-baseline": "central" }, g).textContent = p;
g.addEventListener("click", () => SM.go({ state: p, region: null }, { push: true }));
g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); SM.go({ state: p, region: null }, { push: true }); } });
hoverable(g, p);
callouts[p] = { g, halves: [a, b] };
});
const stripBtns = {};
STRIP.forEach(p => {
const b = h("button", { type: "button", "data-st": p });
b.addEventListener("click", () => SM.go({ state: p, region: null }, { push: true }));
strip.appendChild(b);
stripBtns[p] = b;
});
const zoom = window.d3.zoom().scaleExtent([1, 8]).translateExtent([[-W / 3, -H / 3], [W * 4 / 3, H * 4 / 3]])
.on("zoom", e => { zoomG.setAttribute("transform", e.transform.toString()); M.k = e.transform.k; sizeMarks(); });
const sel = window.d3.select(svg).call(zoom);
zoomBox.addEventListener("click", e => {
const b = e.target.closest("button");
if (!b) return;
const z = b.dataset.z, tr = SM.reduced() ? sel : sel.transition().duration(300);
if (z === "in") zoom.scaleBy(tr, 1.6);
else if (z === "out") zoom.scaleBy(tr, 1 / 1.6);
else {
M.key = null;
SM.go({ state: null, region: null }, { push: true });
}
});
const card = h("div", { class: "hovercard", "aria-hidden": "true" });
card.hidden = true;
plate.appendChild(card);
M = { root, bar, count, svg, plate, colorRow, caption, strip, panel, parts, callouts, callG, stripBtns, zoom, sel, marksG, overG, card, k: 1, key: "" };
new ResizeObserver(() => sizeMarks()).observe(svg);
}
SM.reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let hoverTimer = null;
function hoverable(g, p) {
g.addEventListener("pointerenter", e => {
if (e.pointerType !== "mouse" || !desk()) return;
M.hover = { p, g };
markCells(p);
clearTimeout(hoverTimer);
hoverTimer = setTimeout(() => showCard(p, g), 300);
});
g.addEventListener("pointerleave", () => { clearTimeout(hoverTimer); M.hover = null; markCells(null); M.card.hidden = true; });
}
function refreshHover() {
if (!M.hover || !desk() || !document.contains(M.hover.g)) {
clearTimeout(hoverTimer); M.hover = null; M.card.hidden = true; markCells(null);
return;
}
markCells(M.hover.p);
if (!M.card.hidden) showCard(M.hover.p, M.hover.g);
}
function markCells(p) {
M.bar.querySelectorAll("i.hl").forEach(c => c.classList.remove("hl"));
if (p) M.bar.querySelectorAll(`i[data-st="${p}"]`).forEach(c => c.classList.add("hl"));
}
function showCard(p, g) {
const list = SM.senate(), on = SM.onDate(list), card = M.card;
card.replaceChildren(h("div", { class: "hc-st" }, SM.esc(NAMES[p])));
SM.data.byState[list][p].forEach(r => {
const row = h("div", { class: "hc-row" });
row.appendChild(R().compact(r, on, 24));
row.appendChild(h("span", {}, `${SM.esc(r.name)}<span class="hc-sub">${r.rank ? r.rank.charAt(0).toUpperCase() + r.rank.slice(1) : ""} · ${SM.esc(r.party)}</span>`));
card.appendChild(row);
});
const pr = M.plate.getBoundingClientRect(), gr = (g.querySelector(".border, .callframe") || g).getBoundingClientRect();
card.hidden = false;
const cw = card.offsetWidth, ch = card.offsetHeight;
let x = gr.right - pr.left + 8, y = gr.top - pr.top;
if (x + cw > pr.width) x = Math.max(0, gr.left - pr.left - cw - 8);
y = Math.max(0, Math.min(y, pr.height - ch));
card.style.left = `${Math.round(x)}px`;
card.style.top = `${Math.round(y)}px`;
}
function outlineFromCell(p) {
M.overG.querySelectorAll(".hov").forEach(o => o.remove());
if (!p) return;
const w = M.svg.getBoundingClientRect().width || W;
el("path", { d: SM.data.states[p].d, class: "hov", "data-st": p, "data-w": 2, "stroke-width": 2 * W / w / M.k }, M.overG);
}
function sizeMarks() {
if (!M) return;
const w = M.svg.getBoundingClientRect().width || W;
const u = W / w / M.k, big = desk();
const sz = (big ? 10 : 7) * u, gap = (big ? 7 : 5) * u;
const list = SM.senate(), zoomed = M.k > 1.01 || !!M.zoomedTo;
Object.entries(M.parts).forEach(([p, part]) => {
const pair = SM.data.byState[list][p];
const small = big && !zoomed ? CALLOUT.includes(p) || p === "HI" : !big && STRIP.includes(p) && !zoomed;
part.mk.replaceChildren();
if (!small) {
pair.forEach((r, i) => shape(part.mk, r.party, i ? gap : -gap, 0, sz, "var(--plate)", "var(--plate-ink)", 1.25 * u));
if (big || zoomed) {
const t = el("text", { y: sz / 2 + 13 * u, "font-size": 12 * u, "stroke-width": 3 * u, class: "code", "text-anchor": "middle" }, part.mk);
t.textContent = p;
}
}
part.seam.setAttribute("stroke-width", (big ? 1 : 0.75) * W / w / M.k);
part.border.setAttribute("stroke-width", W / w / M.k);
});
M.overG.querySelectorAll("[data-w]").forEach(o => o.setAttribute("stroke-width", +o.dataset.w * W / w / M.k));
}
function zoomTo(states, instant) {
let tr = window.d3.zoomIdentity;
if (states) {
const bs = states.map(p => SM.data.states[p].b);
const x0 = Math.min(...bs.map(b => b[0])) - 24, y0 = Math.min(...bs.map(b => b[1])) - 24;
const x1 = Math.max(...bs.map(b => b[2])) + 24, y1 = Math.max(...bs.map(b => b[3])) + 24;
const k = Math.min(8, W / (x1 - x0), H / (y1 - y0));
tr = window.d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
}
M.zoomedTo = states ? states.join() : null;
const target = instant || SM.reduced() ? M.sel : M.sel.transition().duration(750);
M.zoom.transform(target, tr);
}
function update(st, opts) {
const list = SM.senate(), view = SM.colorView, data = SM.data, big = desk();
const reg = st.region ? SM.regionBySlug(st.region) : st.state ? SM.regionOf(st.state) : null;
Object.entries(M.parts).forEach(([p, part]) => {
const pair = data.byState[list][p];
part.halves.forEach((half, i) => { half.style.fill = seatFill(pair[i], view, list); });
part.g.classList.toggle("dim", !!reg && !reg.states.includes(p));
part.g.setAttribute("aria-label", stateLabel(p, list));
part.g.firstChild.textContent = stateLabel(p, list);
});
Object.entries(M.callouts).forEach(([p, c]) => {
const pair = data.byState[list][p];
c.halves.forEach((half, i) => { half.style.fill = seatFill(pair[i], view, list); });
c.g.setAttribute("aria-label", stateLabel(p, list));
c.g.firstChild.textContent = stateLabel(p, list);
});
M.callG.style.display = big && !reg ? "" : "none";
M.root.classList.toggle("open", !!reg);
Object.entries(M.stripBtns).forEach(([p, b]) => {
const pair = data.byState[list][p];
b.setAttribute("aria-label", stateLabel(p, list));
b.replaceChildren();
const chip = el("svg", { width: 44, height: 24, viewBox: "0 0 44 24", "aria-hidden": "true" });
el("rect", { x: 0, y: 0, width: 22, height: 24, style: `fill:${seatFill(pair[0], view, list)}` }, chip);
el("rect", { x: 22, y: 0, width: 22, height: 24, style: `fill:${seatFill(pair[1], view, list)}` }, chip);
el("text", { x: 22, y: 12.5, class: "code", "text-anchor": "middle", "dominant-baseline": "central" }, chip).textContent = p;
b.appendChild(chip);
const sv = el("svg", { width: 30, height: 14, viewBox: "0 0 30 14", "aria-hidden": "true" });
pair.forEach((r, i) => shape(sv, r.party, 8 + i * 14, 7, 10, "var(--surface)", "var(--ink)", 1.25));
b.appendChild(sv);
b.setAttribute("aria-pressed", String(st.state === p));
});
seatBar(list, view);
countLine(list, opts);
M.colorRow.querySelectorAll("[data-color]").forEach(b => {
const on = b.dataset.color === view;
b.classList.toggle("on", on);
b.setAttribute("aria-checked", String(on));
});
M.caption.textContent = CAPTION[view];
M.overG.replaceChildren();
if (opts.changed) opts.changed.forEach(p => el("path", { d: data.states[p].d, class: "changed", "data-w": 2 }, M.overG));
if (st.state && data.states[st.state]) el("path", { d: data.states[st.state].d, class: "sel", "data-w": 2.5 }, M.overG);
refreshHover();
const key = reg ? reg.slug : "";
if (key !== M.key) {
zoomTo(reg ? reg.states : null, !opts.push && !opts.animate);
M.key = key;
}
sizeMarks();
if (SM.Panel) SM.Panel.render(M.panel, st, opts);
}
function seatBar(list, view) {
M.bar.replaceChildren();
window.Calc.PARTIES.forEach(p => {
const seats = SM.data.senate[list].filter(r => r.party === p)
.sort((a, b) => (tFor(b, view, list) ?? -1) - (tFor(a, view, list) ?? -1));
const g = h("div", { class: "grp", style: `flex:${seats.length}` });
seats.forEach(r => {
const c = h("i", { title: `${r.name}, ${SM.NAMES[r.state]}`, "data-st": r.state, "data-seat": r.seat_id });
c.addEventListener("pointerenter", e => { if (e.pointerType === "mouse" && desk()) outlineFromCell(r.state); });
c.addEventListener("pointerleave", () => outlineFromCell(null));
c.style.background = seatFill(r, view, list) === "url(#sm-hatch)" ? "var(--plate)" : seatFill(r, view, list);
if (seatFill(r, view, list) === "url(#sm-hatch)") c.className = "hatch";
if (desk()) c.addEventListener("click", () => SM.go({ state: r.state, region: null }, { push: true }));
g.appendChild(c);
});
M.bar.appendChild(g);
});
}
function countLine(list, opts) {
const c = window.Calc.partyCounts(SM.data.senate[list]);
M.count.replaceChildren();
window.Calc.PARTIES.forEach((p, i) => {
const s = h("span", { class: "cnt" });
s.appendChild(SM.shapeIcon(p));
s.appendChild(document.createTextNode(` ${c[p]} ${p}`));
M.count.appendChild(s);
if (i < 2) M.count.appendChild(document.createTextNode(" · "));
});
if (opts.changed && list === "next") {
M.count.appendChild(h("span", { class: "chg" }, `From 3 Jan 2027, ${opts.changedSeats} seats have a new senator. Their states are outlined.`));
}
}
function changedSeats() {
const now = SM.data.bySeat.now;
return SM.data.senate.next.filter(r => !window.Calc.sameHolder(r, now[r.seat_id]));
}
SM.views.map = {
render(viewEl, st, opts = {}) {
if (!M || !viewEl.contains(M.root)) { M = null; mount(viewEl); }
const o = Object.assign({}, opts);
if (opts.animate && opts.senateSwitch) {
const seats = changedSeats();
o.changedSeats = seats.length;
o.changed = [...new Set(seats.map(r => r.state))];
M.changed = { changedSeats: o.changedSeats, changed: o.changed };
} else if (M.changed) {
Object.assign(o, M.changed);
}
update(st, o);
},
};
})();
;
(function () {
"use strict";
const SM = window.SM = window.SM || {};
const C = () => window.Calc;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ORD = n => n + (["th", "st", "nd", "rd"][n] || "th");
const desk = () => innerWidth >= 1024;
const esc = s => SM.esc(s);
const h = (...a) => SM.h(...a);
function fmtDate(iso) {
const [y, m, d] = iso.split("-").map(Number);
return `${d} ${MON[m - 1]} ${y}`;
}
SM.fmtDate = fmtDate;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function primaries(st) {
const x = SM.data.primaries[st];
if (!x) return "";
const day = iso => `${+iso.slice(8)} ${MON[+iso.slice(5, 7) - 1]}`;
const parts = [];
if (x.dem) parts.push(`Democratic ${ORD(x.dem.order)}${x.dem.date ? ` (${day(x.dem.date)})` : " (date not set)"}`);
if (x.rep) parts.push(`Republican ${ORD(x.rep.order)}${x.rep.date ? ` (${day(x.rep.date)})` : " (date not set)"}`);
return parts.length ? `2028 presidential primaries: ${parts.join(" · ")}` : "";
}
SM.primaries = primaries;
function termLines(rec, list) {
const next = SM.data.bySeat.next[rec.seat_id], now = SM.data.bySeat.now[rec.seat_id];
const leaving = r => `Leaves ${fmtDate(r.leaving.date)} to serve as ${r.leaving.to}`;
if (list === "next") {
if (rec.leaving) return [leaving(rec), "Holds this seat until a successor is named"];
if (rec.count_pending) return ["Count under way. The 2026 race is not yet called.", "Holds this seat until the result is decided"];
if (rec.status === "elect") return [`Elected 3 Nov 2026 · next election ${rec.next_election}`];
if (rec.result_2026 === "re-elected") return [`${now && now.how === "appointment" ? "Elected" : "Re-elected"} 3 Nov 2026 · next election ${rec.next_election}`];
return [`Next election ${rec.next_election}`];
}
const ends = rec.term_end > "2026-11-03" ? `term ends ${fmtDate(rec.term_end)}` : "serves until the winner is sworn in";
const same = C().sameHolder(rec, next);
switch (rec.ballot_2026) {
case "re-elected": return [`${rec.how === "appointment" ? "Elected" : "Re-elected"} 3 Nov 2026 · next election ${next.next_election}`];
case "did-not-run": return [`Did not run in 2026 · ${ends}`];
case "lost": return [`Lost in 2026 · ${ends}`];
case "not-called": return ["2026 race not yet called"];
default:
if (same && next.leaving) return [leaving(next)];
return same ? [`Next election ${next.next_election}`] : ["Leaving the Senate"];
}
}
SM.termLines = termLines;
function serviceLine(rec, list, on) {
const earlier = C().earlierYears(rec);
if (list === "next" && rec.status === "elect") return earlier ? `New term · plus ${earlier} earlier years` : "New to the Senate";
const y = C().wholeYearsInSenate(rec, on);
return `In the Senate since ${rec.service_start.slice(0, 4)}${y > 0 ? ` · ${y} year${y > 1 ? "s" : ""}` : ""}${earlier ? ` · plus ${earlier} earlier years` : ""}`;
}
function leadLine(rec, list) {
if (list !== "now") return "";
const lead = (rec.leadership || [])[0];
if (lead) return lead;
const chair = (rec.committees || []).find(c => c.title === "Chair");
return chair ? `Chair, ${chair.name}` : "";
}
function senatorRow(rec, list, st) {
const on = SM.onDate(list), view = SM.colorView;
const row = h("div", { class: "srow" });
const btn = h("button", { type: "button", class: "srow-ring", "aria-label": `${rec.name}: details` });
btn.appendChild(SM.Ring.ring(rec, desk() ? "desk" : "phone", { list, on, stateName: SM.NAMES[st] }));
btn.addEventListener("click", () => openDetail(rec, list, btn));
row.appendChild(btn);
const age = C().ageOn(rec.birthday, on);
const strong = k => (view === k ? ' class="hl"' : "");
const L = [];
L.push(`<div><span${strong("party")}>${esc(rec.party)}</span> · <span${strong("age")}>Age ${age !== null ? age : "–"}</span></div>`);
if (rec.caucus) L.push(`<div class="m">Caucuses with the ${esc(rec.caucus)}s</div>`);
L.push(`<div${strong("years")}>${esc(serviceLine(rec, list, on))}</div>`);
termLines(rec, list).forEach((t, i) => L.push(`<div class="m${i === 0 && view === "next" ? " hl" : ""}">${esc(t)}</div>`));
if (rec.preceded_by) L.push(`<div class="m">Preceded by ${esc(rec.preceded_by.name)}</div>`);
if (rec.path) L.push(`<div class="m">Before: ${esc(rec.path)}</div>`);
const lead = leadLine(rec, list);
if (lead) L.push(`<div>${esc(lead)}</div>`);
const more = `<button type="button" class="more" aria-label="Details: ${esc(rec.name)}">Details</button>`;
row.appendChild(h("div", { class: "lines" }, L.join("") + more));
row.querySelector(".more").addEventListener("click", e => openDetail(rec, list, e.currentTarget));
return row;
}
function chip(st, list, w = 30, hgt = 20) {
const pair = SM.data.byState[list][st], view = SM.colorView, el = SM.Ring.el;
const svg = el("svg", { width: w, height: hgt, viewBox: `0 0 ${w} ${hgt}`, class: "chip", "aria-hidden": "true" });
el("rect", { x: 0, y: 0, width: w / 2, height: hgt, style: `fill:${SM.seatFill(pair[0], view, list)}` }, svg);
el("rect", { x: w / 2, y: 0, width: w / 2, height: hgt, style: `fill:${SM.seatFill(pair[1], view, list)}` }, svg);
el("rect", { x: 0.5, y: 0.5, width: w - 1, height: hgt - 1, rx: 3, class: "chipframe" }, svg);
el("text", { x: w / 2, y: hgt / 2 + 0.5, class: "code", "text-anchor": "middle", "dominant-baseline": "central" }, svg).textContent = st;
return svg;
}
SM.chip = chip;
function stateShape(st, list, hgt) {
const s = SM.data.states[st], el = SM.Ring.el, [x0, y0, x1, y1] = s.b, pair = SM.data.byState[list][st], view = SM.colorView;
const k = Math.min(hgt / (y1 - y0), (hgt * 2.2) / (x1 - x0));
const svg = el("svg", { width: Math.round((x1 - x0) * k), height: Math.round((y1 - y0) * k), viewBox: `${x0} ${y0} ${x1 - x0} ${y1 - y0}`, "aria-hidden": "true", class: "sshape" });
const id = "ss-" + st + Math.random().toString(36).slice(2, 7);
el("path", { d: s.d }, el("clipPath", { id }, el("defs", {}, svg)));
el("rect", { x: x0, y: y0, width: s.c[0] - x0, height: y1 - y0, "clip-path": `url(#${id})`, style: `fill:${SM.seatFill(pair[0], view, list)}` }, svg);
el("rect", { x: s.c[0], y: y0, width: x1 - s.c[0], height: y1 - y0, "clip-path": `url(#${id})`, style: `fill:${SM.seatFill(pair[1], view, list)}` }, svg);
el("path", { d: s.d, fill: "none", stroke: "var(--plate-line)", "stroke-width": 1 / k }, svg);
return svg;
}
SM.stateShape = stateShape;
function quizButton(label, patch) {
const b = h("button", { type: "button", class: "fill" }, esc(label));
b.addEventListener("click", () => SM.go(Object.assign({ view: "learn" }, patch), { push: true }));
return b;
}
function country(pn, list) {
pn.appendChild(h("h2", { class: "ph", tabindex: "-1" }, "Nine regions"));
let last = "";
SM.REGIONS.forEach(r => {
if (r.census !== last) { pn.appendChild(h("div", { class: "rgroup" }, esc(r.census))); last = r.census; }
const n = r.states.length * 2;
const b = h("button", { type: "button", class: "region", "aria-label": `${r.name}: ${r.states.map(s => SM.NAMES[s]).join(", ")}; ${n} senators` },
`<span class="nm">${esc(r.name)}</span>`);
const chips = h("span", { class: "chips" });
r.states.forEach(s => chips.appendChild(chip(s, list)));
b.appendChild(chips);
b.appendChild(h("span", { class: "n" }, `${n} senators`));
b.addEventListener("click", () => SM.go({ region: r.slug, state: null }, { push: true }));
pn.appendChild(b);
});
pn.appendChild(quizButton("Quiz me on all 100", {}));
}
function back(label, patch) {
const a = h("button", { type: "button", class: "back" }, `<span class="ico ico-back" aria-hidden="true"></span>${esc(label)}`);
a.addEventListener("click", () => SM.go(patch, { push: true }));
return a;
}
function compactRow(rec, list) {
const on = SM.onDate(list);
const b = h("button", { type: "button", class: "crow", "aria-label": `${rec.name}, ${rec.rank} senator, ${rec.party}. Open ${SM.NAMES[rec.state]}` });
b.appendChild(SM.Ring.compact(rec, on));
const since = list === "next" && rec.status === "elect" ? "new" : `since ${rec.service_start.slice(0, 4)}`;
b.appendChild(h("span", { class: "t" }, `<b>${esc(rec.name)}</b><span>${cap(rec.rank)} · ${esc(rec.party)} · ${since}</span>`));
b.addEventListener("click", () => SM.go({ state: rec.state, region: null }, { push: true }));
return b;
}
function region(pn, list, r) {
pn.appendChild(back("All regions", { region: null, state: null }));
pn.appendChild(h("h2", { class: "ph rhead", tabindex: "-1" }, esc(r.name)));
const ro = h("div", { class: "roster" });
r.states.slice().sort((a, b) => SM.NAMES[a].localeCompare(SM.NAMES[b])).forEach(st => {
const blk = h("div", { class: "rblock" });
blk.appendChild(h("div", { class: "rstate" }, `${st} · ${esc(SM.NAMES[st])}`));
SM.data.byState[list][st].forEach(rec => blk.appendChild(compactRow(rec, list)));
ro.appendChild(blk);
});
pn.appendChild(ro);
pn.appendChild(quizButton(`Quiz me on ${r.name}`, { region: r.slug }));
}
function state(pn, list, st) {
const r = SM.regionOf(st);
pn.appendChild(back(r.name, { region: r.slug, state: null }));
const hd = h("div", { class: "shead" });
hd.appendChild(stateShape(st, list, desk() ? 56 : 48));
hd.appendChild(h("span", { class: "postal", "aria-hidden": "true" }, st));
const prim = primaries(st);
hd.appendChild(h("div", {}, `<h2 class="ph nm" tabindex="-1">${esc(SM.NAMES[st])}</h2><div class="rg">${esc(r.name)}</div>${prim ? `<div class="prim">${esc(prim)}</div>` : ""}`));
pn.appendChild(hd);
SM.data.byState[list][st].forEach(rec => pn.appendChild(senatorRow(rec, list, st)));
pn.appendChild(quizButton(`Quiz me on ${r.name}`, { region: r.slug }));
}
const detail = document.getElementById("detail");
let returnTo = null;
function linkList(items) {
return items.map(([href, text]) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>`).join(" · ");
}
function openDetail(rec, list, from) {
const on = SM.onDate(list), st = rec.state;
returnTo = from;
detail.replaceChildren();
const close = h("button", { type: "button", class: "dclose", "aria-label": "Close" }, `<span class="ico ico-x" aria-hidden="true"></span>`);
close.addEventListener("click", () => detail.close());
detail.appendChild(close);
const top = h("div", { class: "dtop" });
top.appendChild(SM.Ring.ring(rec, desk() ? "detailDesk" : "detailPhone", { list, on, stateName: SM.NAMES[st] }));
const who = h("div", { class: "dwho" }, `<h2 id="detail-name">${esc(rec.name)}</h2>`);
const sl = h("div", { class: "dstate" });
sl.appendChild(chip(st, list, 40, 26));
sl.appendChild(h("span", {}, `${esc(SM.NAMES[st])} · ${cap(rec.rank)} senator`));
who.appendChild(sl);
top.appendChild(who);
detail.appendChild(top);
const rows = [];
const add = (k, v) => rows.push(`<dt>${esc(k)}</dt><dd>${v}</dd>`);
const age = C().ageOn(rec.birthday, on);
add("Party", esc(rec.party) + (rec.caucus ? `, caucuses with the ${esc(rec.caucus)}s` : ""));
add("Age", age === null ? "–" : String(age));
add("Class", String(rec.class));
if (list === "next" && rec.status === "elect") add("In the Senate", esc(serviceLine(rec, list, on)) + (rec.service_start ? ` from ${fmtDate(rec.service_start)}` : ""));
else add("In the Senate since", `${fmtDate(rec.service_start)} · ${C().wholeYearsInSenate(rec, on)} years` + (C().earlierYears(rec) ? ` · plus ${C().earlierYears(rec)} earlier years` : ""));
add("Term", termLines(rec, list).map(esc).join("<br>"));
if (rec.count_pending) {
const cands = rec.count_pending.candidates.slice().sort((a, b) => a.name.localeCompare(b.name));
add("On the ballot", cands.map(c => `${esc(c.name)} (${esc(c.party)})`).join("<br>") +
`<br>${linkList([[rec.count_pending.official_count_url, "Official count"]])}`);
}
add("Preceded by", rec.preceded_by ? esc(rec.preceded_by.name) : "–");
add("Before the Senate", rec.path ? esc(rec.path) : "–");
if (list === "next" && !rec.committees) add("Committees", esc(SM.data.senate.meta.next_placeholder));
else add("Committees", (rec.committees || []).length
? rec.committees.map(c => `${c.title ? esc(c.title) + ", " : ""}<span aria-label="${esc(c.full_name)}">${esc(c.name)}</span>`).join("<br>") : "–");
if (list === "now") add("Leadership", (rec.leadership || []).length ? rec.leadership.map(esc).join("<br>") : "–");
const results = (rec.sources || []).filter(s => s.field === "result" && list === "next" && (rec.status === "elect" || rec.result_2026 === "re-elected"));
if (results.length) add("2026 result", linkList(results.map(s => [s.url, new URL(s.url).hostname.replace(/^www\./, "")])));
const links = [];
if (rec.links && rec.links.senate) links.push([rec.links.senate, "Official site"]);
if (rec.links && rec.links.bioguide) links.push([rec.links.bioguide, "Biographical Directory"]);
if (links.length) add("Links", linkList(links));
if (rec.photo_credit) {
const pc = rec.photo_credit;
add("Photo", `${esc(pc.credit)}, ${esc(pc.license)}, ${linkList([[pc.source_url, "source"]])}`);
}
detail.appendChild(h("dl", { class: "dlist" }, rows.join("")));
const map = h("button", { type: "button", class: "plainbtn" }, "Show on map");
map.addEventListener("click", () => { detail.close(); SM.go({ view: "map", state: st, region: null }, { push: true }); });
detail.appendChild(map);
detail.showModal();
SM.setSeat(rec.seat_id);
SM.Ring.fitAll(detail);
document.fonts.ready.then(() => SM.Ring.fitAll(detail));
close.focus();
}
detail.addEventListener("close", () => {
SM.setSeat(null);
if (returnTo && document.contains(returnTo)) returnTo.focus();
});
detail.addEventListener("click", e => { if (e.target === detail) detail.close(); });
SM.openDetail = openDetail;
const find = document.getElementById("find");
function openFind() {
const list = SM.senate();
find.replaceChildren();
find.appendChild(h("div", { class: "fhead" }, `<h2 id="find-title">Find a state or senator</h2>`));
const close = h("button", { type: "button", class: "dclose", "aria-label": "Close" }, `<span class="ico ico-x" aria-hidden="true"></span>`);
close.addEventListener("click", () => find.close());
find.appendChild(close);
const lab = h("label", { for: "find-q", class: "vh" }, "State or senator name");
const input = h("input", { id: "find-q", type: "search", autocomplete: "off", placeholder: "State or senator name" });
const out = h("ul", { class: "flist", "aria-live": "polite" });
find.append(lab, input, out);
const items = Object.keys(SM.data.states).sort((a, b) => SM.NAMES[a].localeCompare(SM.NAMES[b]))
.flatMap(st => [[SM.NAMES[st], st, `${SM.NAMES[st]} (${st})`]]
.concat(SM.data.byState[list][st].map(r => [r.name, st, `${r.name}, ${SM.NAMES[st]}`])));
const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function show() {
const q = norm(input.value.trim());
out.replaceChildren();
items.filter(([n, st]) => !q || norm(n).includes(q) || st.toLowerCase() === q).slice(0, 12).forEach(([, st, text]) => {
const li = h("li");
const b = h("button", { type: "button" }, esc(text));
b.addEventListener("click", () => { find.close(); SM.go({ view: "map", senate: list, state: st, region: null }, { push: true }); });
li.appendChild(b);
out.appendChild(li);
});
}
input.addEventListener("input", show);
show();
find.showModal();
input.focus();
}
find.addEventListener("click", e => { if (e.target === find) find.close(); });
document.getElementById("find-btn").addEventListener("click", () => { if (SM.data) openFind(); });
document.addEventListener("keydown", e => {
if (!SM.data || document.querySelector("dialog[open]")) return;
const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
if (e.key === "/" && !typing) { e.preventDefault(); openFind(); return; }
if (e.key === "Escape" && SM.state.view === "map" && !typing) {
const r = SM.state.state && SM.regionOf(SM.state.state);
if (SM.state.state) SM.go({ state: null, region: r ? r.slug : null }, { push: true });
else if (SM.state.region) SM.go({ region: null }, { push: true });
}
});
SM.Panel = {
render(pn, st, opts) {
const list = SM.senate();
pn.replaceChildren();
const reg = st.region ? SM.regionBySlug(st.region) : null;
if (st.state && SM.data.states[st.state]) state(pn, list, st.state);
else if (reg) region(pn, list, reg);
else country(pn, list);
SM.Ring.fitAll(pn);
document.fonts.ready.then(() => SM.Ring.fitAll(pn));
if (opts.push) {
const hd = pn.querySelector(".ph");
if (hd) {
hd.focus({ preventScroll: true });
if (SM.kbd) {
const plate = document.querySelector(".mp.open .plate");
const cover = plate && getComputedStyle(plate).position === "sticky" ? plate.getBoundingClientRect().bottom : 0;
const r = hd.getBoundingClientRect();
if (r.top < cover || r.bottom > innerHeight) window.scrollTo(0, window.scrollY + r.top - cover - 8);
}
}
}
const rec = st.seat && SM.data.bySeat[list][st.seat];
if (rec && !detail.open) {
const ringBtn = [...pn.querySelectorAll(".srow-ring")].find(b => b.getAttribute("aria-label").startsWith(rec.name + ":"));
openDetail(rec, list, ringBtn || null);
}
},
};
})();
;
(function (root) {
"use strict";
const REGIONS = [
["New England", "new-england", ["CT", "ME", "MA", "NH", "RI", "VT"]],
["Middle Atlantic", "middle-atlantic", ["NJ", "NY", "PA"]],
["East North Central", "east-north-central", ["IL", "IN", "MI", "OH", "WI"]],
["West North Central", "west-north-central", ["IA", "KS", "MN", "MO", "NE", "ND", "SD"]],
["South Atlantic", "south-atlantic", ["DE", "FL", "GA", "MD", "NC", "SC", "VA", "WV"]],
["East South Central", "east-south-central", ["AL", "KY", "MS", "TN"]],
["West South Central", "west-south-central", ["AR", "LA", "OK", "TX"]],
["Mountain", "mountain", ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY"]],
["Pacific", "pacific", ["AK", "CA", "HI", "OR", "WA"]],
].map(([name, slug, states]) => ({ name, slug, states }));
const KINDS = ["pick", "type", "place"];
const GAP = 3;        // questions between a miss and its return, and between one question and the next for a senator
const MAX_SHOWS = 6;
const RANK = { senior: 0, junior: 1 };
const region = slug => REGIONS.find(r => r.slug === slug) || null;
const regionOfState = st => REGIONS.find(r => r.states.includes(st)) || null;
function neverElected(rec) {
return rec.how === "appointment" && rec.result_2026 !== "re-elected";
}
function regionSeats(next, slug, names) {
const r = region(slug);
if (!r) return [];
const nm = st => (names && names[st]) || st;
return next.filter(rec => r.states.includes(rec.state))
.sort((a, b) => nm(a.state).localeCompare(nm(b.state)) || (RANK[a.rank] ?? 2) - (RANK[b.rank] ?? 2))
.map(rec => ({ rec, asked: !neverElected(rec) }));
}
function lessonSenators(next, slug, names) {
return regionSeats(next, slug, names).filter(s => s.asked).map(s => s.rec);
}
function missedSet(next, ids) {
const asked = new Map(next.filter(r => !neverElected(r)).map(r => [r.seat_id, r]));
const seen = [];
(ids || []).forEach(id => { if (typeof id === "string" && asked.has(id) && !seen.includes(id)) seen.push(id); });
if (!seen.length) return null;
const slugs = [...new Set(seen.map(id => regionOfState(asked.get(id).state).slug))];
return { slug: slugs.length === 1 ? slugs[0] : "missed", seats: seen };
}
function roundRegion(slug, seats) {
const r = region(slug);
if (r) return Object.assign({ country: false }, r);
const regs = [...new Set(seats.map(rec => regionOfState(rec.state)))];
return { name: "Senators you missed", slug, country: true,
states: regs.flatMap(x => x.states), seatStates: [...new Set(seats.map(rec => rec.state))] };
}
function seeded(seed) {
let a = seed >>> 0;
return () => {
a = (a + 0x6d2b79f5) >>> 0;
let t = a;
t = Math.imul(t ^ (t >>> 15), t | 1);
t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
}
function shuffle(list, rng) {
const a = list.slice();
for (let i = a.length - 1; i > 0; i--) {
const j = Math.floor(rng() * (i + 1));
[a[i], a[j]] = [a[j], a[i]];
}
return a;
}
function pickChoices(rec, pool, rng) {
const reg = regionOfState(rec.state);
const all = pool.filter(r => r.seat_id !== rec.seat_id && r.name !== rec.name);
const others = rec.gender ? all.filter(r => r.gender === rec.gender) : all;
const inReg = r => reg && reg.states.includes(r.state);
const tiers = [others.filter(r => inReg(r) && r.party === rec.party), others.filter(r => inReg(r) && r.party !== rec.party),
others.filter(r => !inReg(r))];
const wrong = [];
tiers.forEach(t => shuffle(t, rng).forEach(r => { if (wrong.length < 3) wrong.push(r.seat_id); }));
return shuffle([rec.seat_id, ...wrong], rng);
}
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
function distance(a, b) {
const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
for (let j = 1; j <= b.length; j++) d[0][j] = j;
for (let i = 1; i <= a.length; i++) {
for (let j = 1; j <= b.length; j++) {
d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
}
}
return d[a.length][b.length];
}
function checkTyped(input, rec) {
const got = norm(input), last = norm(rec.last_name), full = norm(rec.name);
if (!got) return { ok: false, exact: false };
if (got === last || got === full) return { ok: true, exact: true };
if (last.length >= 5 && distance(got, last) <= 1) return { ok: true, exact: false };
return { ok: false, exact: false };
}
function newRound(next, slug, opts = {}) {
let seats;
if (region(slug)) seats = lessonSenators(next, slug, opts.names).filter(r => !opts.only || opts.only.includes(r.seat_id));
else {
const ri = st => REGIONS.findIndex(r => r.states.includes(st)), nm = st => (opts.names && opts.names[st]) || st;
seats = (opts.only || []).map(id => next.find(r => r.seat_id === id)).filter(r => r && !neverElected(r))
.sort((a, b) => ri(a.state) - ri(b.state) || nm(a.state).localeCompare(nm(b.state)) || (RANK[a.rank] ?? 2) - (RANK[b.rank] ?? 2));
}
const states = [];
seats.forEach(r => { if (!states.includes(r.state)) states.push(r.state); });
return {
slug, reg: roundRegion(slug, seats), rng: opts.rng || Math.random,
pool: opts.pool || next.filter(r => !neverElected(r)),
recs: Object.fromEntries(seats.map(r => [r.seat_id, r])),
order: seats.map(r => r.seat_id),
unmet: states.slice(), met: [], items: [], q: 0, firstTry: 0, cur: null, log: [],
};
}
function makeItem(round, seat, kind, readyQ) {
const it = { seat, kind, status: "ready", dueQ: readyQ, shows: 0, missed: false, order: round.items.length };
round.items.push(it);
return it;
}
const byDue = (a, b) => a.dueQ - b.dueQ || a.order - b.order;
function current(round) {
if (round.cur) return round.cur;
const open = round.items.filter(it => it.status === "ready" || it.status === "retry");
const due = open.filter(it => it.dueQ <= round.q);
let it = due.filter(x => x.status === "retry").sort(byDue)[0] || due.sort(byDue)[0];
if (!it && round.unmet.length) {
const st = round.unmet[0];
round.cur = { kind: "meet", state: st, seats: round.order.filter(s => round.recs[s].state === st) };
return round.cur;
}
if (!it) {
const last = round.last, finals = round.items.filter(x => x.status === "final");
it = open.filter(x => x !== last).sort(byDue)[0] || finals.filter(x => x !== last).sort(byDue)[0];
if (!it && last && (open.includes(last) || finals.includes(last))) {
const k = KINDS[KINDS.indexOf(last.kind) + 1];
if (k && !round.items.some(x => x.seat === last.seat && x.kind === k)) it = makeItem(round, last.seat, k, round.q);
else it = makeItem(round, last.seat, "look", round.q);
}
}
if (!it) {
round.cur = { kind: "end" };
return round.cur;
}
round.cur = { kind: it.kind, seat: it.seat, item: it };
if (it.kind === "pick") round.cur.choices = pickChoices(round.recs[it.seat], round.pool, round.rng);
return round.cur;
}
function meetDone(round) {
const c = current(round);
if (c.kind !== "meet") return;
round.unmet.shift();
round.met.push(c.state);
c.seats.forEach(s => makeItem(round, s, "pick", round.q));
round.log.push({ kind: "meet", state: c.state });
round.cur = null;
}
function meetLater(round) {
const c = current(round);
if (c.kind !== "meet" || round.unmet.length < 2) return;
round.unmet.shift();
round.unmet.splice(1, 0, c.state);
round.cur = null;
}
function answer(round, correct) {
const c = current(round);
if (!c.item) return;
const it = c.item;
it.shows++;
round.q++;
if (it.shows === 1 && correct && it.kind !== "look") round.firstTry++;
round.log.push({ kind: it.kind, seat: it.seat, correct, show: it.shows, q: round.q });
if (it.kind === "look") it.status = "done"; // "Got it": nothing to get wrong, and no next kind
else if (correct) {
if (it.status === "retry") { it.status = "final"; it.dueQ = round.q; }
else it.status = "done";
const k = KINDS[KINDS.indexOf(it.kind) + 1];
if (k && !round.items.some(x => x.seat === it.seat && x.kind === k)) makeItem(round, it.seat, k, round.q + GAP);
} else {
it.missed = true;
it.status = "retry";
it.dueQ = round.q + GAP;
}
if (seatShows(round, it.seat) >= MAX_SHOWS) {
round.items.forEach(x => {
if (x.seat === it.seat && (x.status === "ready" || x.status === "retry" || x.status === "final")) x.status = "capped";
});
}
round.last = it;
round.cur = null;
}
const seatShows = (round, seat) => round.items.reduce((n, x) => n + (x.seat === seat ? x.shows : 0), 0);
function seatStatus(round, seat, nowSeats) {
const its = round.items.filter(it => it.seat === seat);
const c = round.cur;
const now = nowSeats || (c ? (c.kind === "meet" ? c.seats : c.seat ? [c.seat] : []) : []);
if (now.includes(seat)) return "now";
if (its.some(it => it.status === "retry" || it.status === "final" || it.status === "capped")) return "miss";
if (its.some(it => it.status === "done")) return "ok";
return "todo";
}
function tallies(round) {
const t = { recalled: 0, comingBack: 0, toMeet: 0, total: round.order.length };
round.order.forEach(s => {
const its = round.items.filter(it => it.seat === s);
if (!round.met.includes(round.recs[s].state)) t.toMeet++;
else if (its.some(it => it.status === "retry" || it.status === "final")) t.comingBack++;
else if (its.some(it => it.status === "done") && !its.some(it => it.status === "capped")) t.recalled++;
});
return t;
}
function summary(round) {
const asked = round.items.filter(it => it.shows > 0 && it.kind !== "look").length;
const misses = round.order.filter(s => round.items.some(it => it.seat === s && it.missed));
return { firstTry: round.firstTry, asked, misses, done: current(round).kind === "end" };
}
function showings(round) {
return round.items.map(it => ({ seat: it.seat, kind: it.kind, shows: it.shows, status: it.status }));
}
function fastForward(round, kind, limit = 1000) {
for (let i = 0; i < limit; i++) {
const c = current(round);
if (c.kind === kind || c.kind === "end") return round;
if (c.kind === "meet") meetDone(round);
else answer(round, true);
}
return round;
}
const Learn = {
REGIONS, KINDS, GAP, MAX_SHOWS, seatShows, missedSet, roundRegion, region, regionOfState, neverElected, regionSeats, lessonSenators, seeded, shuffle,
pickChoices, checkTyped, newRound, current, meetDone, meetLater, answer, seatStatus, tallies, summary, showings, fastForward,
};
if (typeof module !== "undefined" && module.exports) module.exports = Learn;
else root.LearnLogic = Learn;
})(this);
;
(function () {
"use strict";
const SM = window.SM = window.SM || {};
SM.views = SM.views || {};
const LL = () => window.LearnLogic;
const C = () => window.Calc;
const R = () => SM.Ring;
const h = (...a) => SM.h(...a);
const esc = s => SM.esc(s);
const desk = () => innerWidth >= 1024;
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const PHASES = [["meet", "Meet"], ["recall", "Recall"], ["place", "Place on map"]];
const PHASE_OF = { meet: "meet", look: "meet", pick: "recall", type: "recall", place: "place", end: "" };
const S = { rounds: {}, slug: null, fb: null, pathOpen: false, hint: null, focus: false, root: null };
const next = () => SM.data.senate.next;
const rec = seat => SM.data.bySeat.next[seat];
const on = () => SM.onDate("next");
function round(slug) {
if (!S.rounds[slug]) S.rounds[slug] = LL().newRound(next(), slug, { names: SM.NAMES });
return S.rounds[slug];
}
const screen = rd => (S.fb ? S.fb : LL().current(rd));
function factRows(r) {
const o = on(), rows = [];
rows.push(["Party", r.party + (r.caucus ? `, caucuses with the ${r.caucus}s` : "")]);
const earlier = C().earlierYears(r);
if (r.status === "elect" || !r.service_start) rows.push(["In Senate", earlier ? `New term · plus ${earlier} earlier years` : "New to the Senate"]);
else {
const y = C().wholeYearsInSenate(r, o);
rows.push(["In Senate", `since ${r.service_start.slice(0, 4)} · ${y} year${y === 1 ? "" : "s"}${earlier ? ` · plus ${earlier} earlier years` : ""}`]);
}
const age = C().ageOn(r.birthday, o);
rows.push(["Age", age === null ? "not listed" : String(age)]);
if (r.path) rows.push(["Before", r.path]);
rows.push(["Preceded by", r.preceded_by ? r.preceded_by.name : "not listed"]);
if (r.leaving || r.count_pending) rows.push(["This seat", SM.termLines(r, "next")[0]]);
else rows.push(["Next election", String(r.next_election)]);
return rows;
}
const factList = r => h("ul", { class: "ln-facts" }, factRows(r).map(([k, v]) => `<li><b>${esc(k)}</b><span>${esc(v)}</span></li>`).join(""));
function plainShape(st, hgt) {
const s = SM.data.states[st], [x0, y0, x1, y1] = s.b, k = Math.min(hgt / (y1 - y0), (hgt * 1.8) / (x1 - x0)), el = R().el;
const svg = el("svg", { width: Math.round((x1 - x0) * k), height: Math.round((y1 - y0) * k), viewBox: `${x0} ${y0} ${x1 - x0} ${y1 - y0}`, "aria-hidden": "true", class: "sshape" });
el("path", { d: s.d, fill: "var(--bg)", stroke: "var(--ink)", "stroke-width": 1.5 / k, "stroke-linejoin": "round" }, svg);
return svg;
}
function head(card, rd, kind, seats, st) {
const reg = rd.reg;
let where = "";
if (kind === "meet") where = `State ${rd.met.length + 1} of ${rd.met.length + rd.unmet.length}`;
else if (seats.length) where = `Senator ${rd.order.indexOf(seats[0]) + 1} of ${rd.order.length}`;
card.appendChild(h("div", { class: "ln-crumb" }, `<span><b>${esc(reg.name)}</b>${st ? ` · ${esc(SM.NAMES[st])}` : ""}</span><span>${where}</span>`));
const strip = h("div", { class: "ln-steps", "aria-hidden": "true" });
rd.order.forEach(s => strip.appendChild(h("span", { class: LL().seatStatus(rd, s, seats) })));
card.appendChild(strip);
const phase = PHASE_OF[kind];
card.appendChild(h("div", { class: "ln-phase" }, PHASES.map(([k, l]) => `<span${k === phase ? ' class="on" aria-current="step"' : ""}>${l}</span>`).join("")));
}
function prompt(card, text, sub) {
card.appendChild(h("h2", { class: "ln-prompt", tabindex: "-1" }, esc(text)));
if (sub) card.appendChild(h("p", { class: "ln-sub" }, esc(sub)));
}
function primary(label, fn) {
const b = h("button", { type: "button", class: "fill" }, esc(label));
b.addEventListener("click", fn);
return b;
}
function quiet(label, fn) {
const b = h("button", { type: "button", class: "ln-lnk" }, esc(label));
b.addEventListener("click", fn);
return b;
}
function feedback(card, fb, said) {
const r = rec(fb.seat);
const box = h("div", { class: "ln-fb" });
const left = h("div", {});
const word = fb.ok ? (fb.first ? "Correct, first try" : "Correct") : "Not quite";
left.appendChild(h("div", { class: `ln-verdict ${fb.ok ? "ok" : "no"}` }, `<span class="ico ${fb.ok ? "ico-check" : "ico-x"}" aria-hidden="true"></span>${esc(word)}`));
left.appendChild(h("p", { class: "ln-said" }, esc(said)));
if (!fb.ok) left.appendChild(h("p", { class: "ln-said m" }, "This one comes back in a few questions."));
if (fb.kind !== "place") left.appendChild(factList(r));
box.appendChild(left);
const go = primary(fb.kind === "place" ? "Next senator" : "Next", () => { S.fb = null; S.focus = true; draw(); });
go.classList.add("ln-next");
box.appendChild(h("div", {})).appendChild(go);
card.appendChild(box);
}
function announce(text) { if (S.live) S.live.textContent = text; }
function meet(card, rd, c) {
const st = c.state, name = SM.NAMES[st], reg = LL().regionOfState(st); // the state's own region, also in a missed-set round
head(card, rd, "meet", c.seats, st);
const holders = LL().regionSeats(next(), LL().regionOfState(st).slug, SM.NAMES).filter(s => s.rec.state === st);
prompt(card, holders.length === 2 ? `Meet ${name}'s two senators` : `Meet ${name}'s senator`, "Take a look, then you'll be asked to recall them.");
const line = h("div", { class: "ln-state" });
line.appendChild(plainShape(st, desk() ? 58 : 48));
line.appendChild(h("span", { class: "postal", "aria-hidden": "true" }, st));
const prim = SM.primaries(st);
line.appendChild(h("div", {}, `<div class="nm">${esc(name)}</div><div class="rg">${esc(reg.name)}</div>${prim ? `<div class="prim">${esc(prim)}</div>` : ""}`));
card.appendChild(line);
const pair = h("div", { class: "ln-pair" });
holders.forEach(({ rec: r, asked }) => {
const who = h("div", { class: "ln-who" });
who.appendChild(R().ring(r, "meet", { list: "next", on: on(), stateName: name }));
who.appendChild(factList(r));
if (!asked) who.appendChild(h("p", { class: "ln-said m" }, "Appointed and not yet elected, so Learn does not ask about this senator."));
pair.appendChild(who);
});
card.appendChild(pair);
const act = h("div", { class: "ln-actions" });
act.appendChild(rd.unmet.length > 1 ? quiet("Show me again later", () => { LL().meetLater(rd); S.focus = true; draw(); }) : h("span"));
act.appendChild(primary("Quiz me", () => { LL().meetDone(rd); S.focus = true; draw(); }));
card.appendChild(act);
}
function look(card, rd, c) {
const r = rec(c.seat), name = SM.NAMES[r.state];
head(card, rd, "look", [c.seat], r.state);
prompt(card, `Look again: ${r.name}`, `${cap(r.rank)} senator for ${name}. Then place this senator on the map again.`);
const who = h("div", { class: "ln-who" });
who.appendChild(R().ring(r, "meet", { list: "next", on: on(), stateName: name }));
who.appendChild(factList(r));
card.appendChild(who);
const act = h("div", { class: "ln-actions" });
act.appendChild(h("span"));
act.appendChild(primary("Got it", () => { LL().answer(rd, true); S.focus = true; draw(); }));
card.appendChild(act);
}
function pick(card, rd, c) {
const fb = S.fb, seat = c.seat, r = rec(seat), name = SM.NAMES[r.state], reg = rd.reg;
const choices = fb ? fb.choices : c.choices;
head(card, rd, "pick", [seat], r.state);
const allHere = choices.every(id => reg.states.includes(rec(id).state));
prompt(card, `Who is ${name}'s ${r.rank} senator?`, `Pick a name.${allHere && !reg.country ? ` The answers are all ${reg.name} senators.` : ""}`);
const q = h("div", { class: "ln-q" });
const face = h("div", { class: "ln-face" });
face.appendChild(R().ring(r, "quiz", { list: "next", on: on(), hideName: true }));
q.appendChild(face);
const list = h("div", { class: "ln-choices", role: "group", "aria-label": "Choices" });
choices.forEach((id, i) => {
let cls = "ln-choice", key = String(i + 1);
if (fb) {
if (id === seat) { cls += " right"; key = '<span class="ico ico-check" aria-hidden="true"></span><span class="vh">right answer</span>'; }
else if (id === fb.chosen) { cls += " wrong"; key = '<span class="ico ico-x" aria-hidden="true"></span><span class="vh">your answer</span>'; }
else cls += " dim";
}
const b = h("button", { type: "button", class: cls, "data-choice": id }, `<span class="k">${key}</span><span>${esc(rec(id).name)}</span>`);
if (fb) b.setAttribute("aria-disabled", "true");
else b.addEventListener("click", () => answerPick(rd, c, id));
list.appendChild(b);
});
q.appendChild(list);
card.appendChild(q);
if (fb) {
const said = fb.ok ? `${r.name} is ${name}'s ${r.rank} senator.`
: `You picked ${rec(fb.chosen).name}. ${name}'s ${r.rank} senator is ${r.name}.`;
feedback(card, fb, said);
}
}
function answerPick(rd, c, id) {
const ok = id === c.seat;
S.fb = { kind: "pick", seat: c.seat, choices: c.choices, chosen: id, ok, first: c.item.shows === 0 };
LL().answer(rd, ok);
announce(ok ? `Correct. ${rec(c.seat).name}.` : `Not quite. The answer is ${rec(c.seat).name}.`);
S.focus = "next";
draw();
}
function type(card, rd, c) {
const fb = S.fb, seat = c.seat, r = rec(seat), name = SM.NAMES[r.state];
head(card, rd, "type", [seat], r.state);
const picked = rd.log.some(e => e.kind === "pick" && e.seat === seat && e.correct);
prompt(card, "Name this senator", picked ? "You picked this name right before. Now type the last name." : "Type the last name.");
const q = h("div", { class: "ln-q" });
const face = h("div", { class: "ln-face" });
face.appendChild(R().ring(r, "quiz", { list: "next", on: on(), neutral: true }));
q.appendChild(face);
const box = h("div", { class: "ln-typed" });
box.appendChild(h("div", { class: "ln-cue" }, `<span>${esc(name)}</span><span>${esc(cap(r.rank))} senator</span>${r.preceded_by ? `<span>Preceded by ${esc(r.preceded_by.name)}</span>` : ""}`));
box.appendChild(h("label", { for: "ln-name" }, "Last name"));
const input = h("input", { id: "ln-name", type: "text", autocomplete: "off", autocapitalize: "words", spellcheck: "false" });
box.appendChild(input);
const hintKey = `${seat}:${c.item ? c.item.shows : ""}`;
if (fb) {
input.value = fb.typed || "";
input.disabled = true;
} else {
if (S.hint === hintKey) box.appendChild(h("p", { class: "ln-hint" }, `Starts with <b>${esc(r.last_name.charAt(0))}</b>`));
const row = h("div", { class: "row" });
const check = () => answerType(rd, c, input.value);
row.appendChild(primary("Check", check));
if (S.hint !== hintKey) row.appendChild(quiet("Show the first letter", () => { S.hint = hintKey; S.focus = "input"; draw(); }));
row.appendChild(quiet("I don't know", () => answerType(rd, c, null)));
box.appendChild(row);
input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); check(); } });
}
q.appendChild(box);
card.appendChild(q);
if (fb) {
let said;
if (fb.ok) said = fb.exact ? `${r.name}, ${name}'s ${r.rank} senator.` : `${r.name}, ${name}'s ${r.rank} senator. It's spelled ${r.last_name}.`;
else said = `${fb.typed ? `You typed ${fb.typed}. ` : ""}This is ${r.name}, ${name}'s ${r.rank} senator.`;
feedback(card, fb, said);
}
}
function answerType(rd, c, value) {
const typed = (value || "").trim();
if (value !== null && !typed) return; // an empty box is not an answer
const res = value === null ? { ok: false, exact: false } : LL().checkTyped(typed, rec(c.seat));
S.fb = { kind: "type", seat: c.seat, typed, ok: res.ok, exact: res.exact, first: c.item.shows === 0 };
LL().answer(rd, res.ok);
announce(res.ok ? `Correct. ${rec(c.seat).name}.` : `Not quite. This is ${rec(c.seat).name}.`);
S.focus = "next";
draw();
}
const TARGET = 44, BOX_W = 56, BOX_H = 44, COL = 72;
function fitsSquare(st, s) {
const S0 = SM.data.states[st], [x0, y0, x1, y1] = S0.b, w = Math.ceil((x1 - x0) * s) + 2, hh = Math.ceil((y1 - y0) * s) + 2;
if (w < TARGET || hh < TARGET) return false;
const cv = document.createElement("canvas");
cv.width = w; cv.height = hh;
const cx = cv.getContext("2d");
cx.setTransform(s, 0, 0, s, -x0 * s + 1, -y0 * s + 1);
cx.fill(new Path2D(S0.d));
const a = cx.getImageData(0, 0, w, hh).data, I = new Int32Array((w + 1) * (hh + 1));
for (let y = 0; y < hh; y++) {
let row = 0;
for (let x = 0; x < w; x++) {
row += a[(y * w + x) * 4 + 3] > 127 ? 1 : 0;
I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
}
}
const T = TARGET, full = T * T;
for (let y = T; y <= hh; y++) {
for (let x = T; x <= w; x++) {
if (I[y * (w + 1) + x] - I[(y - T) * (w + 1) + x] - I[y * (w + 1) + x - T] + I[(y - T) * (w + 1) + x - T] === full) return true;
}
}
return false;
}
function placeMap(holder, rd, r, fb) {
const el = R().el, reg = rd.reg, sts = SM.data.states;
const [x0, y0, x1, y1] = regionBox(reg.states, 12), rw = x1 - x0, rh = y1 - y0;
const width = Math.max(240, holder.clientWidth || 320);
let col = 0, s = 0, tiny = [];
for (let i = 0; i < 3; i++) {
s = (width - col) / rw;
tiny = reg.states.filter(p => !fitsSquare(p, s));
const want = tiny.length ? COL : 0;
if (want === col) break;
col = want;
}
const colU = col / s, gapU = 8 / s;
const boxes = tiny.map(p => ({ p, y: sts[p].c[1] - BOX_H / s / 2 })).sort((a, b) => a.y - b.y);
let yMin = y0 + gapU;
boxes.forEach(b => { b.y = Math.max(b.y, yMin); yMin = b.y + BOX_H / s + gapU; });
const vbH = Math.max(rh, yMin - y0), vbW = rw + colU;
const svg = el("svg", { class: "pmap", viewBox: `${x0} ${y0} ${vbW} ${vbH}`, width: Math.round(vbW * s), height: Math.round(vbH * s),
"aria-hidden": "true" });
holder.replaceChildren(svg);
const px = v => v / s; // screen pixels to map units
Object.keys(sts).forEach(p => { if (!reg.states.includes(p)) el("path", { d: sts[p].d, class: "os", "stroke-width": px(0.75) }, svg); });
const targets = {};
reg.states.forEach(p => {
const g = el("g", { class: "pt", "data-st": p }, svg);
el("path", { d: sts[p].d, class: "ps", "stroke-width": px(1.25) }, g);
targets[p] = g;
});
const bx = x1 + px(10);
const boxAt = {};
boxes.forEach(b => {
const g = el("g", { class: "pt call", "data-st": b.p }, svg);
const [cx, cy] = sts[b.p].c;
el("line", { x1: bx, y1: b.y + px(BOX_H / 2), x2: cx, y2: cy, class: "lead", "stroke-width": px(1) }, g);
el("rect", { x: bx, y: b.y, width: px(BOX_W), height: px(BOX_H), rx: px(4), class: "pbox", "stroke-width": px(1.25) }, g);
boxAt[b.p] = [bx + px(BOX_W / 2), b.y + px(BOX_H / 2)];
targets[b.p + ":box"] = g;
});
if (!fb) {
Object.entries(targets).forEach(([k, g]) => g.addEventListener("click", () => answerPlace(rd, LL().current(rd), k.slice(0, 2))));
return { tiny };
}
svg.classList.add("done");
const label = (p, text, cls) => {
const box = boxAt[p], [lx, ly] = box || sts[p].c;
el("text", { x: box ? lx - px(BOX_W / 2 + 6) : lx, y: box ? ly + px(4.5) : ly + px(30), class: `plabel ${cls || ""}`,
"font-size": px(13), "stroke-width": px(3), "text-anchor": box ? "end" : "middle" }, svg).textContent = text;
};
if (!fb.ok) {
[targets[fb.chosen], targets[fb.chosen + ":box"]].forEach(g => g && g.classList.add("wrong"));
label(fb.chosen, `That's ${SM.NAMES[fb.chosen]}`, "no");
}
[targets[r.state], targets[r.state + ":box"]].forEach(g => {
if (!g) return;
g.classList.add("right");
g.querySelectorAll(".ps, .pbox").forEach(n => n.setAttribute("style", `fill:${R().shade(r.party, 0.6)}`));
});
const [fx, fy] = boxAt[r.state] || sts[r.state].c, fr = px(boxAt[r.state] ? 17 : 20);
const id = "pm" + lmUid++;
el("circle", { cx: fx, cy: fy, r: fr }, el("clipPath", { id }, svg));
el("circle", { cx: fx, cy: fy, r: fr + px(2.5), fill: "var(--plate)" }, svg);
el("image", { href: `photos/${r.photo["160"]}`, x: fx - fr, y: fy - fr, width: 2 * fr, height: 2 * fr, preserveAspectRatio: "xMidYMin slice", "clip-path": `url(#${id})` }, svg);
label(r.state, `${SM.NAMES[r.state]} (${r.state})`, "ok");
return { tiny };
}
function place(card, rd, c) {
const fb = S.fb, seat = c.seat, r = rec(seat), reg = rd.reg;
head(card, rd, "place", [seat], fb ? r.state : null);
const top = h("div", { class: "ln-placehead" });
const face = h("div", {});
face.appendChild(R().ring(r, "place", { list: "next", on: on(), hideName: true }));
top.appendChild(face);
const words = h("div", {});
words.appendChild(h("h2", { class: "ln-prompt", tabindex: "-1" }, esc(`Where does ${r.name} serve?`)));
words.appendChild(h("p", { class: "ln-sub" }, esc(`Tap the state, or pick it from the list under the map. ${cap(r.rank)} senator · ${r.party}`)));
top.appendChild(words);
card.appendChild(top);
const holder = h("div", { class: "ln-pmap" });
card.appendChild(holder);
S.after = () => {
const res = placeMap(holder, rd, r, fb);
holder.dataset.tiny = res.tiny.join(" ");
};
const btns = h("div", { class: "ln-statebtns", role: "group", "aria-label": `${reg.name} states` });
reg.states.slice().sort((a, b) => SM.NAMES[a].localeCompare(SM.NAMES[b])).forEach(st => {
let cls = "";
let note = "";
if (fb && st === r.state) { cls = "right"; note = '<span class="vh"> (right answer)</span>'; }
else if (fb && st === fb.chosen) { cls = "wrong"; note = '<span class="vh"> (your pick)</span>'; }
const b = h("button", { type: "button", class: cls, "data-st": st }, esc(SM.NAMES[st]) + note);
if (fb) b.setAttribute("aria-disabled", "true");
else b.addEventListener("click", () => answerPlace(rd, c, st));
btns.appendChild(b);
});
card.appendChild(btns);
if (fb) {
const said = fb.ok ? `${SM.NAMES[r.state]}. ${r.name} joins your map.` : `That's ${SM.NAMES[fb.chosen]}. ${r.name} serves ${SM.NAMES[r.state]}.`;
feedback(card, fb, said);
}
}
function answerPlace(rd, c, st) {
const ok = st === rec(c.seat).state;
S.fb = { kind: "place", seat: c.seat, chosen: st, ok, first: c.item.shows === 0 };
LL().answer(rd, ok);
announce(ok ? `Correct: ${SM.NAMES[st]}.` : `Not quite. That's ${SM.NAMES[st]}. ${rec(c.seat).name} serves ${SM.NAMES[rec(c.seat).state]}.`);
S.focus = "next";
draw();
}
function end(card, rd) {
const sm = LL().summary(rd), reg = rd.reg, n = sm.misses.length;
head(card, rd, "end", [], null);
prompt(card, `${reg.name} round done`, `${sm.firstTry} of ${sm.asked} questions right on the first try.`);
if (n) {
card.appendChild(h("h3", { class: "ln-h3" }, n === 1 ? "The one you missed" : `The ${n} you missed`));
const list = h("div", { class: "ln-misses" });
sm.misses.forEach(seat => {
const r = rec(seat);
const b = h("button", { type: "button", class: "crow", "aria-label": `${r.name}, ${r.rank} senator from ${SM.NAMES[r.state]}. Open ${SM.NAMES[r.state]} on the map` });
b.appendChild(R().compact(r, on()));
b.appendChild(h("span", { class: "t" }, `<b>${esc(r.name)}</b><span>${esc(SM.NAMES[r.state])} · ${cap(r.rank)} senator · ${esc(r.party)}</span>`));
b.appendChild(SM.chip(r.state, "next"));
b.addEventListener("click", () => SM.go({ view: "map", senate: "next", state: r.state, region: null, step: null }, { push: true }));
list.appendChild(b);
});
card.appendChild(list);
const link = SM.linkFor({ view: "learn", missed: sm.misses.join(",") });
const copy = quiet(n === 1 ? "Copy a link to the one I missed" : `Copy a link to the ${n} I missed`, async () => {
try { await navigator.clipboard.writeText(link); copy.textContent = "Link copied"; }
catch { window.prompt("Copy this link:", link); }
});
copy.dataset.link = link;
copy.classList.add("ln-copy");
card.appendChild(copy);
}
const act = h("div", { class: "ln-actions end" });
act.appendChild(h("p", { class: "ln-said m" }, "Names stick better when you come back to them another day."));
act.appendChild(primary(n ? `Go again with the ${n} I missed` : "Play again", () => {
const only = n ? sm.misses : rd.onlyKey ? rd.order : null;
const again = LL().newRound(next(), rd.slug, { names: SM.NAMES, only });
again.onlyKey = only ? only.join(",") : null;
S.rounds[rd.slug] = again;
S.fb = null; S.focus = true; draw();
}));
card.appendChild(act);
}
function relax(items, box) {
for (let it = 0; it < 300; it++) {
let moved = false;
for (let i = 0; i < items.length; i++) {
for (let j = i + 1; j < items.length; j++) {
const a = items[i], b = items[j];
const dx = b.x - a.x, dy = b.y - a.y;
const ox = a.hw + b.hw - Math.abs(dx), oy = a.hh + b.hh - Math.abs(dy);
if (ox <= 0 || oy <= 0) continue;
moved = true;
if (ox < oy) { const s = (ox / 2 + 0.1) * (dx >= 0 ? 1 : -1); a.x -= s; b.x += s; }
else { const s = (oy / 2 + 0.1) * (dy >= 0 ? 1 : -1); a.y -= s; b.y += s; }
}
}
items.forEach(t => {
t.x = Math.max(box[0] + t.hw, Math.min(box[2] - t.hw, t.x));
t.y = Math.max(box[1] + t.hh, Math.min(box[3] - t.hh, t.y));
});
if (!moved) break;
}
return items;
}
function regionBox(states, pad) {
const bs = states.map(p => SM.data.states[p].b);
return [Math.min(...bs.map(b => b[0])) - pad, Math.min(...bs.map(b => b[1])) - pad, Math.max(...bs.map(b => b[2])) + pad, Math.max(...bs.map(b => b[3])) + pad];
}
SM.learnRegionBox = regionBox;
let lmUid = 0;
function placedSeats(rd, meetState, askedSeat) {
const out = new Set(rd.log.filter(e => e.kind === "place" && e.correct).map(e => e.seat));
if (meetState) rd.order.filter(s => rec(s).state === meetState).forEach(s => out.add(s));
if (askedSeat) out.delete(askedSeat);
return out;
}
function sideMap(rd, curState, shown) {
const el = R().el, reg = rd.reg, sts = SM.data.states;
const own = reg.country ? reg.seatStates : reg.states;
const [x0, y0, x1, y1] = regionBox(reg.country ? Object.keys(sts) : reg.states, 24), vw = x1 - x0, vh = y1 - y0;
const svg = el("svg", { class: "lmap", viewBox: `${x0} ${y0} ${vw} ${vh}`, role: "img",
"aria-label": `Map of ${reg.country ? "the states of the senators you missed" : `the ${reg.name} states`} with the senators you have placed so far` });
const u = vw / 390; // one screen pixel at the usual width of this map
const seats = reg.country ? rd.order.map(s => ({ rec: rec(s), asked: true })) : LL().regionSeats(next(), rd.slug, SM.NAMES);
Object.keys(sts).forEach(p => {
const inR = own.includes(p);
const full = inR && seats.filter(s => s.rec.state === p).every(s => !s.asked || shown.has(s.rec.seat_id));
el("path", { d: sts[p].d, class: inR ? (full ? "rs met" : "rs") : "os", "stroke-width": (inR ? 0.9 : 0.5) * u }, svg);
});
if (curState) el("path", { d: sts[curState].d, class: "cur", "stroke-width": 2 * u }, svg);
const r = 16 * u;
const groups = own.map(p =>({ p, x: sts[p].c[0], y: sts[p].c[1], ox: sts[p].c[0], oy: sts[p].c[1], hw: 2 * r + 3 * u, hh: r + 9 * u }));
relax(groups, [x0, y0, x1, y1]);
groups.forEach(g => {
if (Math.hypot(g.x - g.ox, g.y - g.oy) > r) el("line", { x1: g.ox, y1: g.oy, x2: g.x, y2: g.y - 4 * u, class: "lead", "stroke-width": 0.8 * u }, svg);
seats.filter(s => s.rec.state === g.p).forEach((s, i) => {
const fx = g.x + (i ? r + 1.5 * u : -r - 1.5 * u), fy = g.y - 6 * u;
if (!s.asked || shown.has(s.rec.seat_id)) {
const id = "lm" + lmUid++;
el("circle", { cx: fx, cy: fy, r }, el("clipPath", { id }, svg));
el("circle", { cx: fx, cy: fy, r: r + 1.8 * u, fill: R().shade(s.rec.party, 0.6) }, svg);
el("circle", { cx: fx, cy: fy, r, fill: "var(--soft)" }, svg);
el("image", { href: `photos/${s.rec.photo["160"]}`, x: fx - r, y: fy - r, width: 2 * r, height: 2 * r, preserveAspectRatio: "xMidYMin slice", "clip-path": `url(#${id})` }, svg);
} else {
el("circle", { cx: fx, cy: fy, r, class: "unmet", "stroke-width": 0.9 * u, "stroke-dasharray": `${2 * u} ${1.5 * u}` }, svg);
el("text", { x: fx, y: fy + 0.5 * u, class: "q", "font-size": 13 * u, "text-anchor": "middle", "dominant-baseline": "central" }, svg).textContent = "?";
}
});
el("text", { x: g.x, y: g.y + r + 7 * u, class: "code", "font-size": 12 * u, "stroke-width": 3 * u, "text-anchor": "middle" }, svg).textContent = g.p;
});
return svg;
}
function side(sd, rd, curState, meetState, askedSeat) {
const reg = rd.reg, t = LL().tallies(rd);
sd.replaceChildren(h("h2", {}, reg.country ? "Your map of the senators you missed" : `Your map of the ${esc(reg.name)} states`));
const mc = h("div", { class: "ln-mapcard" });
mc.appendChild(sideMap(rd, curState, placedSeats(rd, meetState, askedSeat)));
const sw = p => `<i style="background:${R().shade(p, 0.6)}"></i>`;
mc.appendChild(h("div", { class: "ln-legend" }, `<span>${sw("Democrat")}Democrat</span><span>${sw("Independent")}Independent</span><span>${sw("Republican")}Republican</span><span>? not placed yet</span>`));
sd.appendChild(mc);
sd.appendChild(h("div", { class: "ln-tally" },
`<div><b>${t.recalled}</b><span>of ${t.total} recalled</span></div><div><b>${t.comingBack}</b><span>coming back</span></div><div><b>${t.toMeet}</b><span>still to meet</span></div>`));
}
function pathNav(nav, rd) {
nav.replaceChildren(h("h2", { id: "ln-path-h" }, "Learn by region"));
LL().REGIONS.forEach(r => {
const tot = LL().lessonSenators(next(), r.slug).length;
const x = S.rounds[r.slug], got = x ? LL().tallies(x).recalled : 0;
const b = h("button", { type: "button", class: "ln-unit", "aria-current": String(r.slug === rd.slug),
"aria-label": `${r.name}: ${got} of ${tot} recalled` },
`<span class="nm">${esc(r.name)}<span>${got ? `${got} / ` : ""}${tot}</span></span><span class="bar"><i style="width:${(100 * got) / tot}%"></i></span>`);
b.addEventListener("click", () => {
S.pathOpen = false;
if (S.rounds[r.slug] && S.rounds[r.slug].onlyKey) delete S.rounds[r.slug]; // the path opens the whole region
SM.go({ view: "learn", region: r.slug, state: null, step: null, missed: null }, { push: true }); });
nav.appendChild(b);
});
nav.appendChild(h("p", { class: "ln-note" }, "The Senate seated 3 Jan 2027. A seat still being counted or filled shows its current senator until a successor is decided."));
nav.appendChild(h("p", { class: "ln-note" }, "Nothing is saved. Names stick best when you come back another day and try again before looking."));
nav.classList.toggle("open", S.pathOpen);
}
function regionBar(bar, rd) {
const reg = rd.reg, t = LL().tallies(rd);
bar.innerHTML = `<span><b>${esc(reg.name)}</b> · ${t.recalled} of ${t.total} recalled</span><span class="u">All regions</span>`;
bar.setAttribute("aria-expanded", String(S.pathOpen));
}
function draw() {
const rd = round(S.slug), c = screen(rd), kind = c.kind;
const card = S.card;
const y0 = window.scrollY; // where the reader was, before the card is rebuilt
card.replaceChildren();
S.after = null;
if (kind === "meet") meet(card, rd, c);
else if (kind === "pick") pick(card, rd, c);
else if (kind === "type") type(card, rd, c);
else if (kind === "place") place(card, rd, c);
else if (kind === "look") look(card, rd, c);
else end(card, rd);
const curState = kind === "meet" ? c.state : c.seat && (S.fb || kind !== "place") ? rec(c.seat).state : null;
side(S.side, rd, curState, kind === "meet" ? c.state : null, kind === "place" && !S.fb ? c.seat : null);
pathNav(S.path, rd);
regionBar(S.bar, rd);
SM.setAddress({ region: rd.reg.country ? null : rd.slug, step: kind === "look" ? null : kind, state: null, missed: rd.onlyKey || null });
if (S.after) S.after(); // the Place map is sized to the card, so it is drawn once the card is on the page
R().fitAll(card);
document.fonts.ready.then(() => R().fitAll(card));
if (S.focus) {
const touch = !SM.kbd;
const typing = S.focus === "input" || (S.focus === true && kind === "type" && !S.fb && !touch);
const prompt = card.querySelector(".ln-prompt");
const f = S.focus === "next" ? card.querySelector(".ln-next") : typing ? card.querySelector("#ln-name") : prompt;
const still = S.focus === "next" && touch;
if (f) {
S.quiet = true; // draw places the page itself; the focusin handler must not scroll as well
f.focus({ preventScroll: true });
S.quiet = false;
if (still) window.scrollTo(0, y0);
else if (S.focus === true) {
const top = card.getBoundingClientRect().top;
if (top < 0) window.scrollTo(0, window.scrollY + top - 8);
if (f !== prompt) f.scrollIntoView({ block: "nearest" });
} else f.scrollIntoView({ block: S.focus === "next" ? "center" : "nearest" });
}
S.focus = false;
}
}
function mount(viewEl) {
const root = h("div", { class: "ln", "data-view": "learn" });
const bar = h("button", { type: "button", class: "ln-bar", "aria-controls": "ln-path" });
bar.addEventListener("click", () => { S.pathOpen = !S.pathOpen; draw(); });
const path = h("nav", { class: "ln-path", id: "ln-path", "aria-labelledby": "ln-path-h" });
const card = h("section", { class: "ln-card", "aria-label": "Lesson" });
const sd = h("aside", { class: "ln-side", "aria-label": "Your map" });
const live = h("p", { class: "vh", "aria-live": "polite" });
root.append(bar, path, card, sd, live);
viewEl.replaceChildren(root);
Object.assign(S, { root, bar, path, card, side: sd, live });
card.addEventListener("focusin", e => { if (e.target !== card && !S.quiet) e.target.scrollIntoView({ block: "nearest" }); });
let lastW = 0;
new ResizeObserver(() => {
const w = card.clientWidth;
if (Math.abs(w - lastW) > 4) {
lastW = w;
if (S.after) S.after();
const a = document.activeElement;
if (a && card.contains(a)) a.scrollIntoView({ block: "nearest" });
}
}).observe(card);
}
document.addEventListener("keydown", e => {
if (!SM.data || SM.state.view !== "learn" || !S.slug || S.fb || document.querySelector("dialog[open]")) return;
if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
const c = LL().current(round(S.slug));
if (c.kind !== "pick" || !/^[1-4]$/.test(e.key) || !c.choices[+e.key - 1]) return;
e.preventDefault();
answerPick(round(S.slug), c, c.choices[+e.key - 1]);
});
SM.views.learn = {
render(viewEl, st, opts = {}) {
const fromState = st.state && LL().regionOfState(st.state);
const miss = st.missed ? LL().missedSet(next(), st.missed.split(",")) : null;
const lastReal = S.slug && LL().region(S.slug) ? S.slug : null;
const slug = (miss && miss.slug) || st.region || (fromState && fromState.slug) || lastReal || LL().REGIONS[0].slug;
if (slug !== S.slug) { S.fb = null; S.hint = null; }
S.slug = slug;
const key = miss ? miss.seats.join(",") : null;
const fresh = () => {
const rd = LL().newRound(next(), slug, { names: SM.NAMES, only: miss ? miss.seats : null });
rd.onlyKey = key;
S.fb = null;
return (S.rounds[slug] = rd);
};
if (miss && round(slug).onlyKey !== key) fresh();
if (!miss && round(slug).onlyKey) fresh();
if (st.step && st.step !== screen(round(slug)).kind) LL().fastForward(fresh(), st.step);
if (!S.root || !viewEl.contains(S.root)) mount(viewEl);
S.focus = opts.push ? true : S.focus;
draw();
},
};
})();
;
(function () {
"use strict";
const SM = window.SM = window.SM || {};
SM.views = SM.views || {};
const C = () => window.Calc;
const h = (...a) => SM.h(...a);
const esc = s => SM.esc(s);
const desk = () => innerWidth >= 1024;
const PRESETS = [["state", "State", "State"], ["party", "Party", "Party"], ["years", "Years in the Senate", "Years"],
["age", "Age", "Age"], ["next", "Next election", "Next"]];
const RANKS = { senior: "Senior", junior: "Junior" };
const F = { q: "", party: "", cls: "", rank: "", group: true };
let T = null; // the mounted tab: its elements and the table
let loading = null;
function loadTable() {
if (window.Tabulator) return Promise.resolve();
if (loading) return loading;
loading = new Promise((ok, no) => {
const css = h("link", { rel: "stylesheet", href: "vendor/tabulator.min.css" });
const mine = document.querySelector('link[href="senators.css"]');
if (mine) mine.before(css); else document.head.appendChild(css);
const js = h("script", { src: "vendor/tabulator.min.js" });
js.onload = () => ok();
js.onerror = () => { loading = null; no(new Error("vendor/tabulator.min.js did not load")); };
document.head.appendChild(js);
});
return loading;
}
function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function matches(rec, st) {
const reg = st.region && SM.regionBySlug(st.region);
if (reg && !reg.states.includes(rec.state)) return false;
if (F.party && rec.party !== F.party) return false;
if (F.cls && String(rec.class) !== F.cls) return false;
if (F.rank && rec.rank !== F.rank) return false;
const q = norm(F.q.trim());
if (q && !norm(rec.name).includes(q) && !norm(SM.NAMES[rec.state]).includes(q) && rec.state.toLowerCase() !== q) return false;
return true;
}
function seatBar(list, view, shown) {
T.bar.replaceChildren();
C().PARTIES.forEach(p => {
const seats = SM.data.senate[list].filter(r => r.party === p)
.sort((a, b) => (SM.seatT(b, view, list) ?? -1) - (SM.seatT(a, view, list) ?? -1));
const g = h("div", { class: "grp", style: `flex:${seats.length}` });
seats.forEach(r => {
const fill = SM.seatFill(r, view, list), hatch = fill === "url(#sm-hatch)";
const c = h("i", { "data-seat": r.seat_id, class: (hatch ? "hatch" : "") + (shown.has(r.seat_id) ? "" : " off") });
c.style.background = hatch ? "var(--plate)" : fill;
g.appendChild(c);
});
T.bar.appendChild(g);
});
}
function countLine(list, n) {
const c = C().partyCounts(SM.data.senate[list]);
T.count.replaceChildren();
C().PARTIES.forEach((p, i) => {
const s = h("span", { class: "cnt" });
s.appendChild(SM.shapeIcon(p));
s.appendChild(document.createTextNode(` ${c[p]} ${p}`));
T.count.appendChild(s);
if (i < 2) T.count.appendChild(document.createTextNode(" · "));
});
T.count.appendChild(h("span", { class: "chg" }, `Showing ${n} of ${SM.data.senate[list].length}`));
}
function summaryLine(rows, on) {
const s = C().summary(rows, on);
if (!s) { T.sum.hidden = true; return; }
const parts = [];
if (s.oldest) parts.push(`Oldest: ${esc(s.oldest.name)}, ${C().ageOn(s.oldest.birthday, on)}`);
if (s.youngest) parts.push(`Youngest: ${esc(s.youngest.name)}, ${C().ageOn(s.youngest.birthday, on)}`);
if (s.medianAge !== null) parts.push(`Median age: ${s.medianAge}`);
if (s.longest && s.longestYears > 0) parts.push(`Longest serving: ${esc(s.longest.name)}, ${s.longestYears} year${s.longestYears === 1 ? "" : "s"}`);
T.sum.hidden = !parts.length;
T.sum.innerHTML = parts.map(p => `<span>${p}</span>`).join(" · ");
}
function activeBar(st) {
const chips = [];
const reg = st.region && SM.regionBySlug(st.region);
if (reg) chips.push([`Region: ${reg.name}`, () => setRegion("")]);
if (F.party) chips.push([`Party: ${F.party}`, () => { F.party = ""; }]);
if (F.cls) chips.push([`Class ${F.cls}`, () => { F.cls = ""; }]);
if (F.rank) chips.push([`Rank: ${RANKS[F.rank]}`, () => { F.rank = ""; }]);
if (F.q.trim()) chips.push([`Name or state: ${F.q.trim()}`, () => { F.q = ""; }]);
T.active.replaceChildren();
T.active.hidden = !chips.length;
const refocus = () => { if (SM.kbd) T.search.focus(); else T.count.focus({ preventScroll: true }); };
chips.forEach(([label, clear]) => {
const b = h("button", { type: "button", class: "cp-chip", "aria-label": `Remove filter: ${label}` },
`${esc(label)}<span class="ico ico-x" aria-hidden="true"></span>`);
b.addEventListener("click", () => { clear(); syncControls(); update(); refocus(); });
T.active.appendChild(b);
});
if (chips.length > 1) {
const all = h("button", { type: "button", class: "cp-clear" }, "Clear all");
all.addEventListener("click", () => {
F.q = ""; F.party = ""; F.cls = ""; F.rank = ""; setRegion("");
syncControls(); update(); refocus();
});
T.active.appendChild(all);
}
}
function setRegion(slug) { SM.setAddress({ region: slug || null }); }
function syncControls() {
T.search.value = F.q;
T.sel.region.value = SM.state.region || "";
T.sel.party.value = F.party; T.sel.cls.value = F.cls; T.sel.rank.value = F.rank;
T.group.checked = F.group;
}
function numCell(value, max, extra) {
const pct = value === null || !max ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
return `<div class="cp-num"><span class="bar" style="width:${pct.toFixed(1)}%"></span><span class="v">${value === null ? "–" : value}</span></div>` +
(extra ? `<div class="cp-extra">${esc(extra)}</div>` : "");
}
function columns(list, on) {
const big = desk(), recs = SM.data.senate[list], next = SM.data.bySeat.next;
const maxAge = Math.max(...recs.map(r => C().ageOn(r.birthday, on) ?? 0));
const maxYears = Math.max(...recs.map(r => C().wholeYearsInSenate(r, on)));
const keyed = key => (a, b, aRow, bRow, col, dir) => {
const x = key(aRow.getData()._rec), y = key(bRow.getData()._rec), asc = dir === "asc";
if (x === null && y === null) return 0;
if (x === null) return asc ? 1 : -1;
if (y === null) return asc ? -1 : 1;
return x < y ? -1 : x > y ? 1 : 0;
};
const w = (d, p) => (big ? { widthGrow: d } : { width: p });
const nameW = Math.min(164, Math.round(innerWidth * 0.45));
return [
{ title: "Senator", field: "name", frozen: true, minWidth: big ? 240 : nameW, ...(big ? { widthGrow: 3 } : { width: nameW }),
sorter: keyed(r => r.last_name || ""), headerSortStartingDir: "asc",
formatter: cell => {
const rec = cell.getRow().getData()._rec;
const b = h("button", { type: "button", class: "cp-who", "aria-label": `${rec.name}, ${SM.NAMES[rec.state]}: details` });
b.appendChild(SM.Ring.compact(rec, on, big ? 24 : 18, true));
const elect = list === "next" && rec.status === "elect";
b.appendChild(h("span", { class: "t" }, `<b>${esc(rec.name)}</b>${elect ? `<span class="m">Senator-elect</span>` : ""}`));
b.addEventListener("click", e => { e.stopPropagation(); SM.openDetail(rec, list, b); });
return b;
} },
{ title: "State", field: "state", ...w(2, 150), minWidth: 150, sorter: (a, b, aRow, bRow) => C().compareState(aRow.getData()._rec, bRow.getData()._rec),
formatter: cell => {
const rec = cell.getRow().getData()._rec;
const d = h("div", { class: "cp-state" });
d.appendChild(SM.chip(rec.state, list, 28, 20));
d.appendChild(h("span", {}, esc(SM.NAMES[rec.state])));
return d;
} },
{ title: "Rank", field: "rank", ...w(1, 92), minWidth: 84, sorter: keyed(r => ({ senior: 0, junior: 1 }[r.rank] ?? null)),
formatter: cell => esc(RANKS[cell.getValue()] || "–") },
{ title: "Party", field: "party", ...w(1.5, 140), minWidth: 128, sorter: keyed(r => C().sortKeys.party(r)),
formatter: cell => {
const rec = cell.getRow().getData()._rec;
const d = h("div", { class: "cp-party" });
d.appendChild(SM.shapeIcon(rec.party, 12));
d.appendChild(h("span", {}, esc(rec.party)));
return d;
} },
{ title: "Age", field: "age", hozAlign: "right", headerHozAlign: "right", ...w(1.2, 104), minWidth: 96, headerSortStartingDir: "desc",
sorter: keyed(r => C().ageDays(r, on)), formatter: cell => numCell(cell.getValue(), maxAge) },
{ title: "Years in the Senate", field: "years", hozAlign: "right", headerHozAlign: "right", ...w(1.4, 132), minWidth: 120, headerSortStartingDir: "desc",
sorter: keyed(r => C().serviceDays(r, on)),
formatter: cell => {
const rec = cell.getRow().getData()._rec, e = C().earlierYears(rec);
return numCell(cell.getValue(), maxYears, e ? `plus ${e} earlier` : "");
} },
{ title: "Next election", field: "nextWords", ...w(2, 176), minWidth: 150, sorter: keyed(r => C().nextElectionShown(r, next)),
formatter: cell => {
const rec = cell.getRow().getData()._rec, y = C().nextElectionShown(rec, next);
return y === null ? `<span class="m">${esc(cell.getValue())}</span>` : esc(cell.getValue());
} },
{ title: "Class", field: "class", hozAlign: "right", headerHozAlign: "right", ...w(0.8, 76), minWidth: 72, sorter: "number" },
];
}
function rowsFor(list, on, st) {
const next = SM.data.bySeat.next, sort = st.sort || "state";
const recs = SM.data.senate[list].filter(r => matches(r, st)).sort(C().compareBy(sort, on, next));
return recs.map(r => ({
seat_id: r.seat_id, name: r.name, state: r.state, rank: r.rank, party: r.party, class: r.class,
age: C().ageOn(r.birthday, on), years: C().wholeYearsInSenate(r, on), nextWords: C().nextElectionWords(r, list, next),
region: SM.regionOf(r.state).name, _rec: r,
}));
}
function watchPhotos() {
if (T.io) T.io.disconnect();
const holder = T.tableEl.querySelector(".tabulator-tableholder");
const imgs = [...T.tableEl.querySelectorAll("image[data-href]")];
const show = img => { img.setAttribute("href", img.getAttribute("data-href")); img.removeAttribute("data-href"); };
if (!("IntersectionObserver" in window)) { imgs.forEach(show); return; }
T.io = new IntersectionObserver(es => es.forEach(e => {
if (e.isIntersecting) { show(e.target); T.io.unobserve(e.target); }
}), { root: holder || null, rootMargin: "200px 0px" });
imgs.forEach(i => T.io.observe(i));
}
function groupValues(rows) {
const present = new Set(rows.map(r => r.region));
return [SM.REGIONS.map(r => r.name).filter(n => present.has(n))];
}
function update() {
const st = SM.state, list = SM.senate(), on = SM.onDate(list);
const rows = rowsFor(list, on, st);
const view = st.sort && st.sort !== "state" ? st.sort : SM.colorView;
seatBar(list, view, new Set(rows.map(r => r.seat_id)));
countLine(list, rows.length);
summaryLine(rows.map(r => r._rec), on);
activeBar(st);
T.presets.forEach(b => {
const on_ = b.dataset.sort === (st.sort || "state") && !T.headerSorted;
b.classList.toggle("on", on_);
b.setAttribute("aria-checked", String(on_));
});
if (!T.table) return;
T.table.clearSort();
T.headerSorted = false;
T.table.setGroupBy(F.group && rows.length ? "region" : false);
if (F.group && rows.length) T.table.setGroupValues(groupValues(rows));
T.table.setData(rows).then(() => watchPhotos());
}
function select(label, key, options, onChange) {
const id = `cp-${key}`;
const wrap = h("label", { class: "cp-field", for: id }, `<span>${esc(label)}</span>`);
const s = h("select", { id });
options.forEach(([v, t]) => s.appendChild(h("option", { value: v }, esc(t))));
s.addEventListener("change", () => { onChange(s.value); update(); });
wrap.appendChild(s);
return [wrap, s];
}
function mount(viewEl, st) {
const root = h("div", { class: "cp", "data-view": "compare" });
const bar = h("div", { class: "seatbar cp-bar", "aria-hidden": "true" });
const count = h("p", { class: "sm-count mp-count cp-count", "aria-live": "polite", tabindex: "-1" });
const sortRow = h("div", { class: "colorby cp-sort", role: "radiogroup", "aria-label": "Sort the table by" });
sortRow.appendChild(h("span", { class: "lbl", "aria-hidden": "true" }, "Sort by"));
const presets = PRESETS.map(([k, l, short]) => {
const b = h("button", { type: "button", role: "radio", "data-sort": k, "aria-label": l },
`<span class="long">${esc(l)}</span><span class="short" aria-hidden="true">${esc(short)}</span>`);
b.addEventListener("click", () => { SM.setAddress({ sort: k === "state" ? null : k }); update(); });
sortRow.appendChild(b);
return b;
});
sortRow.addEventListener("keydown", e => {
const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
const i = presets.indexOf(document.activeElement);
if (!k || i < 0) return;
e.preventDefault();
const n = presets[(i + k + presets.length) % presets.length];
n.focus(); n.click();
});
const tools = h("div", { class: "cp-tools" });
const qLab = h("label", { for: "cp-q", class: "cp-field cp-q" }, "<span>Name or state</span>");
const search = h("input", { id: "cp-q", type: "search", autocomplete: "off" });
qLab.appendChild(search);
search.addEventListener("input", () => { F.q = search.value; update(); });
const more = h("button", { type: "button", class: "cp-more", "aria-expanded": "false", "aria-controls": "cp-fields" }, "Filters");
const box = h("div", { class: "cp-fields", id: "cp-fields" });
more.addEventListener("click", () => {
const open = more.getAttribute("aria-expanded") !== "true";
more.setAttribute("aria-expanded", String(open));
box.classList.toggle("open", open);
});
const sel = {};
let el;
[el, sel.region] = select("Region", "region", [["", "All regions"]].concat(SM.REGIONS.map(r => [r.slug, r.name])), v => setRegion(v));
box.appendChild(el);
[el, sel.party] = select("Party", "party", [["", "All parties"]].concat(C().PARTIES.map(p => [p, p])), v => { F.party = v; });
box.appendChild(el);
[el, sel.cls] = select("Class", "cls", [["", "All classes"], ["1", "Class 1"], ["2", "Class 2"], ["3", "Class 3"]], v => { F.cls = v; });
box.appendChild(el);
[el, sel.rank] = select("Rank", "rank", [["", "Senior and junior"], ["senior", "Senior"], ["junior", "Junior"]], v => { F.rank = v; });
box.appendChild(el);
const gl = h("label", { class: "cp-check", for: "cp-group" });
const group = h("input", { id: "cp-group", type: "checkbox" });
group.addEventListener("change", () => { F.group = group.checked; update(); });
gl.append(group, document.createTextNode("Group by region"));
box.appendChild(gl);
tools.append(qLab, more, box);
const active = h("div", { class: "cp-active", "aria-label": "Filters in use" });
const sum = h("p", { class: "cp-sum" });
const tableEl = h("div", { class: "cp-table" });
const status = h("p", { class: "cp-status", role: "status" });
root.append(bar, count, sortRow, tools, active, sum, status, tableEl);
viewEl.replaceChildren(root);
T = { root, bar, count, presets, search, sel, group, active, sum, tableEl, status, table: null, big: desk() };
syncControls();
}
function build(st) {
const mine = T, list = SM.senate(), on = SM.onDate(list);
const live = () => T === mine && document.contains(mine.tableEl);
mine.status.textContent = "Loading the table…";
loadTable().then(() => {
if (!live()) return;
mine.status.textContent = "";
mine.status.hidden = true;
const table = new window.Tabulator(mine.tableEl, {
data: [], columns: columns(list, on), index: "seat_id",
columnDefaults: { headerWordWrap: true, titleFormatter: cell => h("button", { type: "button", class: "cp-sorth",
"aria-label": `Sort by ${cell.getValue()}` }, esc(cell.getValue())) }, layout: desk() ? "fitColumns" : "fitData",
renderVertical: "basic", maxHeight: "calc(100dvh - 32px)", movableColumns: false, headerSortClickElement: "header",
groupToggleElement: "header", groupHeader: (value, count) => `${esc(value)}<span class="gn">${count} senator${count === 1 ? "" : "s"}</span>`,
placeholder: "No senators match these filters.",
rowFormatter: row => { row.getElement().dataset.seat = row.getData().seat_id; },
});
mine.pending = table;
table.on("tableBuilt", () => {
if (!live()) { table.destroy(); return; }
mine.table = table; // update() fills the table only once it is built
update();
const rec = st.seat && SM.data.bySeat[list][st.seat];
if (rec && !document.getElementById("detail").open) SM.openDetail(rec, list, null);
});
table.on("dataSorted", sorters => {
if (!live() || !sorters.length) return;
mine.headerSorted = true;
mine.presets.forEach(b => { b.classList.remove("on"); b.setAttribute("aria-checked", "false"); });
watchPhotos();
});
table.on("rowClick", (e, row) => {
if (!live() || e.target.closest("button")) return;
const btn = row.getElement().querySelector(".cp-who");
SM.openDetail(row.getData()._rec, list, btn);
});
table.on("renderComplete", () => { if (live()) watchPhotos(); });
}).catch(err => {
console.error(err);
if (live()) mine.status.textContent = "The table could not load. Reload the page to try again.";
});
}
matchMedia("(min-width: 1024px)").addEventListener("change", () => {
if (SM.data && SM.state.view === "compare") SM.render();
});
SM.views.compare = {
render(viewEl, st) {
if (T && (T.table || T.pending)) { (T.table || T.pending).destroy(); }
if (T && T.io) T.io.disconnect();
T = null;
SM.setAddress({}); // a sort or region the page does not know is dropped from the address too
mount(viewEl, st);
update();
build(st);
},
};
})();
;
(() => {
"use strict";
const SM = window.SM = window.SM || {};
SM.views = SM.views || {};
const VIEWS = ["learn", "map", "compare"];
const STEPS = ["meet", "pick", "type", "place", "end"];
const SWEARING_IN = "2027-01-03";
const SITE_URL = "https://mackforge.dev/senators/";
SM.kbd = false;
document.addEventListener("keydown", e => {
if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
const text = e.target && e.target.matches && e.target.matches("input, textarea");
const vv = window.visualViewport;
const onScreen = text && e.key !== "Tab" && matchMedia("(pointer: coarse)").matches && !!vv && vv.height < innerHeight - 120;
SM.kbd = !onScreen;
}, true);
document.addEventListener("pointerdown", () => { SM.kbd = false; }, true);
function todayISO() {
const d = new Date();
return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
SM.today = todayISO();
SM.defaultSenate = () => (SM.today < SWEARING_IN ? "now" : "next");
const ordinal = n => n + ({ 1: "st", 2: "nd", 3: "rd" }[(n % 100 >= 11 && n % 100 <= 13) ? 0 : n % 10] || "th");
function nameSenates(swearingIn) {
const next = Math.floor((+swearingIn.slice(0, 4) - 1789) / 2) + 1;
const label = v => document.querySelector(`#senate-switch input[value="${v}"] + span`);
if (label("now")) label("now").textContent = `${ordinal(next - 1)} Senate`;
if (label("next")) label("next").textContent = `${ordinal(next)} Senate`;
}
nameSenates(SWEARING_IN);
function readAddress() {
const p = new URLSearchParams(location.search);
const view = VIEWS.includes(p.get("view")) ? p.get("view") : "learn";
const senate = ["now", "next"].includes(p.get("senate")) ? p.get("senate") : null;
const state = window.Calc.cleanState(p.get("state"));
const region = window.Calc.cleanRegion(p.get("region"));
const step = STEPS.includes(p.get("step")) ? p.get("step") : null;
const seat = /^[A-Z]{2}-[123]$/.test(p.get("seat") || "") ? p.get("seat") : null;
const ids = (p.get("missed") || "").split(",").filter(s => /^[A-Z]{2}-[123]$/.test(s)).slice(0, 100);
const missed = view === "learn" && ids.length ? ids.join(",") : null;
const sort = view === "compare" ? window.Calc.cleanSort(p.get("sort")) : null;
return { view, senate, state, region, step, seat, missed, sort };
}
SM.state = readAddress();
SM.senate = () => (SM.state.view === "learn" ? "next" : SM.state.senate || SM.defaultSenate());
function addressFor(st) {
const p = new URLSearchParams();
p.set("view", st.view);
if (st.senate && st.view !== "learn") p.set("senate", st.senate);
if (st.region) p.set("region", st.region);
if (st.state) p.set("state", st.state);
if (st.step) p.set("step", st.step);
if (st.seat) p.set("seat", st.seat);
if (st.missed && st.view === "learn") p.set("missed", st.missed);
if (st.sort && st.view === "compare") p.set("sort", st.sort);
return "?" + p.toString().replace(/%2C/g, ",");
}
SM.shareUrl = () => SITE_URL;
SM.linkFor = st => SITE_URL + addressFor(st);
SM.setSeat = seat => SM.setAddress({ seat });
SM.setAddress = patch => {
SM.state = Object.assign({}, SM.state, patch);
history.replaceState(null, "", addressFor(SM.state));
};
SM.go = (patch, opts = {}) => {
const next = Object.assign({ seat: null }, SM.state, { seat: null }, patch);
if (patch.view && patch.view !== SM.state.view && !("state" in patch) && !("region" in patch)) {
next.state = null; next.region = null; next.step = null; next.missed = null;
}
if (next.view !== "learn") { next.missed = null; next.step = null; }
if (next.view === "compare" && SM.state.view === "map" && !("sort" in patch)) next.sort = SM.colorView;
if (next.view !== "compare") next.sort = null;
SM.state = next;
history[opts.push ? "pushState" : "replaceState"](null, "", addressFor(next));
render(opts);
};
const viewEl = document.getElementById("view");
const plain = document.getElementById("plain");
const tabs = [...document.querySelectorAll(".sm-tabs [role=tab]")];
const radios = [...document.querySelectorAll("#senate-switch input")];
function render(opts = {}) {
const st = SM.state;
tabs.forEach(t => {
const on = t.dataset.view === st.view;
t.setAttribute("aria-selected", String(on));
t.tabIndex = on ? 0 : -1;
});
radios.forEach(r => { r.checked = r.value === SM.senate(); r.disabled = st.view === "learn"; });
viewEl.setAttribute("aria-labelledby", "tab-" + st.view);
const view = SM.views[st.view];
if (view && SM.data) {
plain.hidden = true;
view.render(viewEl, st, opts);
} else {
viewEl.replaceChildren();
plain.hidden = false;
}
}
SM.render = render;
tabs.forEach((t, i) => {
t.addEventListener("click", () => SM.go({ view: t.dataset.view }, { push: true }));
t.addEventListener("keydown", e => {
const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
if (!k) return;
e.preventDefault();
const n = tabs[(i + k + tabs.length) % tabs.length];
n.focus();
SM.go({ view: n.dataset.view }, { push: true });
});
});
radios.forEach(r => r.addEventListener("change", () => {
if (r.checked) SM.go({ senate: r.value }, { animate: true, senateSwitch: true });
}));
window.addEventListener("popstate", () => { SM.state = readAddress(); render(); });
const themeButton = document.getElementById("theme-toggle");
function labelTheme() {
const light = document.documentElement.dataset.theme === "light";
const label = `Switch to ${light ? "dark" : "light"} theme`;
themeButton.setAttribute("aria-label", label);
themeButton.title = label;
document.querySelector('meta[name="theme-color"]').content = light ? "#eef1f5" : "#0d1117";
}
themeButton.hidden = false;
labelTheme();
themeButton.addEventListener("click", () => {
document.documentElement.dataset.theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
labelTheme();
});
const shareBtn = document.getElementById("share-btn"), menu = document.getElementById("share-menu");
const title = encodeURIComponent("U.S. Senators map");
function shareLinks() {
const u = encodeURIComponent(SM.shareUrl());
const links = {
linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
reddit: `https://www.reddit.com/submit?url=${u}&title=${title}`,
x: `https://x.com/intent/post?url=${u}&text=${title}`,
bluesky: `https://bsky.app/intent/compose?text=${title}%20${u}`,
};
menu.querySelectorAll("[data-net]").forEach(a => { a.href = links[a.dataset.net]; });
}
function closeShare() { menu.hidden = true; shareBtn.setAttribute("aria-expanded", "false"); }
shareBtn.addEventListener("click", () => {
menu.hidden = !menu.hidden;
shareBtn.setAttribute("aria-expanded", String(!menu.hidden));
if (!menu.hidden) { shareLinks(); document.getElementById("share-copy").textContent = "Copy link"; }
});
document.addEventListener("click", e => { if (!e.target.closest(".share")) closeShare(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) { closeShare(); shareBtn.focus(); } });
document.getElementById("share-copy").addEventListener("click", async e => {
try { await navigator.clipboard.writeText(SM.shareUrl()); e.target.textContent = "Link copied"; }
catch { window.prompt("Copy this link:", SM.shareUrl()); }
});
if (navigator.share) {
const native = document.getElementById("share-native");
native.hidden = false;
native.addEventListener("click", () => {
closeShare();
navigator.share({ title: "U.S. Senators map", url: SM.shareUrl() }).catch(() => {});
});
}
document.querySelector(".sm-tabs").hidden = false;
document.getElementById("senate-switch").hidden = false;
Promise.all(["data/senate.json", "data/states.json"].map(u => fetch(u).then(r => {
if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`);
return r.json();
}))).then(([senate, topo]) => {
SM.data = SM.prepare ? SM.prepare(senate, topo) : { senate, topo };
if (senate.meta && /^\d{4}-/.test(senate.meta.swearing_in || "")) nameSenates(senate.meta.swearing_in);
render();
}).catch(err => {
console.error(err);
render();
});
})();
