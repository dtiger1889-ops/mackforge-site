// The Committees tab: one Senate committee at a time, seated on a curved dais (spec D3): the chair in the middle, the
// majority on the left and the minority on the right, each side by committee rank from the middle out. Loaded the first
// time the tab opens, so it is not part of the first-screen script (senators.js). The seating logic is plain functions
// that node can test (tests/js/committees.test.js); the page part below runs only in a browser.
(function (root) {
  "use strict";
  const Calc = typeof module !== "undefined" && module.exports ? require("./calc.js") : root.Calc;
  const isMaj = e => /^maj/.test(e.side || "");

  // The 21 Senate committees in the records (codes starting with S; joint committees are left out), by name.
  function committeeList(records) {
    const seen = new Map();
    records.forEach(rec => (Calc.seatsOf(rec).committees || []).forEach(c => {
      if (/^S/.test(c.code) && !seen.has(c.code)) seen.set(c.code, { code: c.code, name: c.name, full_name: c.full_name });
    }));
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  // The picker's committees for either Senate: read from both lists, so a committee none of whose members returns to the
  // incoming Senate is still there to open (its seats empty, the newcomers below).
  function committeeListFor(senate) {
    return committeeList(((senate && senate.now) || []).concat((senate && senate.next) || []));
  }

  // A code that is not one of the committees opens the first one.
  function cleanCommittee(code, list) {
    return list.some(c => c.code === code) ? code : (list[0] ? list[0].code : null);
  }

  function seatsPerRow(width, pitch) {
    return Math.max(3, Math.floor(width / pitch));
  }

  // Seats for members already in seating order (Calc.committeeMembers): row 0 holds the chair (the majority's rank 1) in
  // the middle column with the next majority and minority seats beside it; later rows hold only the two sides, their
  // columns half a seat off the middle. Majority seats go left, minority right, outward in rank order, row by row.
  // `col` is the seat's distance from the middle in seat widths (negative is left).
  function dais(members, perRow) {
    const m0 = Math.max(1, Math.floor((perRow - 1) / 2)), m1 = Math.max(1, Math.floor(perRow / 2));
    const chair = members.find(m => isMaj(m.entry) && m.entry.rank === 1) || null;
    const maj = members.filter(m => m !== chair && isMaj(m.entry));
    const min = members.filter(m => m !== chair && !isMaj(m.entry));
    const rows = [];
    let a = 0, b = 0;
    for (let r = 0; r === 0 || a < maj.length || b < min.length; r++) {
      const per = r === 0 ? m0 : m1, seats = [];
      if (r === 0) seats.push({ m: chair, col: 0, side: "chair" });
      for (let k = 0; k < per; k++) {
        const col = r === 0 ? k + 1 : k + 0.5;
        if (a < maj.length) seats.push({ m: maj[a++], col: -col, side: "majority" });
        if (b < min.length) seats.push({ m: min[b++], col, side: "minority" });
      }
      rows.push(seats);
    }
    return { rows, chair, maj, min };
  }

  const Logic = { committeeList, committeeListFor, cleanCommittee, seatsPerRow, dais };
  if (typeof module !== "undefined" && module.exports) { module.exports = Logic; return; }
  root.CommitteesLogic = Logic;
  if (!root.SM) return;

  // ---- the page part ----
  const SM = root.SM;
  SM.views = SM.views || {};
  const h = (...a) => SM.h(...a), esc = s => SM.esc(s);
  const desk = () => innerWidth >= 1024;
  const SAG = 16, TOP = 20; // how far the outer seats drop below the middle, and the room above row 0 for "Chair"
  let T = null, emblems = null;

  function loadEmblems() {
    if (!emblems) emblems = fetch("assets/emblems/emblems.json").then(r => r.json()).catch(() => ({ seal: null, committees: {} }));
    return emblems;
  }

  const initial = rec => `${rec.party[0]}-${rec.state}`;
  function seatLabel(m) {
    const role = m.entry.title ? `${m.entry.title}, ` : "";
    return `${m.rec.name}, ${role}${m.rec.party}, ${SM.NAMES[m.rec.state]}`;
  }
  const sideParty = ms => {
    const n = {};
    ms.forEach(m => { const s = SM.Ring.side(m.rec); n[s] = (n[s] || 0) + 1; });
    const top = Object.keys(n).sort((x, y) => n[y] - n[x])[0];
    return top ? { Democrat: "Democrats", Republican: "Republicans", Independent: "Independents" }[top] : "";
  };

  function roleLines(members, label) {
    const out = [];
    const chair = members.find(m => isMaj(m.entry) && m.entry.rank === 1);
    const other = members.find(m => !isMaj(m.entry) && m.entry.rank === 1);
    out.push(chair ? `${chair.entry.title || "Chair"}: ${chair.rec.name} (${initial(chair.rec)})` : (label ? "Chair: not among the returning members" : ""));
    if (other) out.push(`${other.entry.title || "Ranking member"}: ${other.rec.name} (${initial(other.rec)})`);
    else if (label) out.push("Ranking member: not among the returning members");
    return out.filter(Boolean);
  }

  function drawDais(box, members, list, on) {
    const wide = desk(), r = wide ? 26 : 18, R = r + 3, seatW = 2 * R + 6, pitch = seatW, seatH = wide ? 60 : 46, rowH = seatH + (wide ? 14 : 10);
    const W = Math.min(box.clientWidth || 358, 760), P = seatsPerRow(W, pitch);
    const lay = dais(members, P), n = lay.rows.length;
    const H = TOP + (n - 1) * rowH + seatH + SAG + 4;
    box.replaceChildren();
    box.style.height = H + "px";
    const half = W / 2, yOf = (row, x) => TOP + row * rowH + SAG * Math.pow(x / half, 2);
    const svg = SM.Ring.el("svg", { class: "cm-arcs", width: W, height: H, viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true" });
    for (let row = 0; row < n; row++) {
      const xs = lay.rows[row].map(s => s.col * pitch), reach = Math.max(1, Math.max(...xs.map(Math.abs))) + pitch / 2 - 2;
      let d = "";
      for (let i = 0; i <= 16; i++) {
        const x = -reach + (2 * reach * i) / 16;
        d += `${i ? "L" : "M"}${(half + x).toFixed(1)} ${(yOf(row, x) + seatH - 2).toFixed(1)}`;
      }
      SM.Ring.el("path", { d, class: "cm-arc" }, svg);
    }
    box.appendChild(svg);
    lay.rows.forEach((seats, row) => seats.forEach(s => {
      const x = s.col * pitch, left = half + x - seatW / 2, top = yOf(row, x);
      if (!s.m) {
        box.appendChild(h("span", { class: "cm-empty", style: `left:${left}px;top:${top}px;width:${seatW}px;height:${seatH}px`, "aria-hidden": "true" }));
        return;
      }
      const b = h("button", { type: "button", class: `cm-seat ${s.side}`, title: s.m.rec.name, "aria-label": `${seatLabel(s.m)}: details`,
        style: `left:${left}px;top:${top}px;width:${seatW}px;height:${seatH}px` });
      b.appendChild(SM.Ring.compact(s.m.rec, on, r));
      b.addEventListener("click", () => SM.openDetail(s.m.rec, list, b));
      box.appendChild(b);
      if (s.side === "chair") box.appendChild(h("span", { class: "cm-chair", style: `left:${half - 40}px;top:${top - 18}px;width:80px` }, esc(s.m.entry.title || "Chair")));
    }));
    if (!lay.chair) box.appendChild(h("span", { class: "cm-chair", style: `left:${half - 60}px;top:${TOP - 18}px;width:120px` }, "No chair listed"));
    T.perRow = P; T.pitch = pitch;
  }

  function cards(members, list) {
    const ol = h("ol", { class: "cm-cards" });
    members.forEach(m => {
      const li = h("li", {});
      const role = m.entry.title || (isMaj(m.entry) ? "Majority" : "Minority");
      const b = h("button", { type: "button", class: "cm-card" }, `<b>${esc(m.rec.name)}</b> <span>${esc(initial(m.rec))} · ${esc(role)}</span>`);
      b.addEventListener("click", () => SM.openDetail(m.rec, list, b));
      li.appendChild(b);
      if (m.entry.reason) {
        li.appendChild(h("p", { class: "cm-why" }, `${esc(m.entry.reason)}${m.entry.reason_source ? ` <a href="${esc(m.entry.reason_source)}" target="_blank" rel="noopener">source</a>` : ""}`));
      }
      ol.appendChild(li);
    });
    return ol;
  }

  function newcomers(list, on) {
    const recs = SM.data.senate[list].filter(r => r.placement && r.placement.status === "not-placed")
      .sort((a, b) => (a.last_name || "").localeCompare(b.last_name || ""));
    if (!recs.length) return null;
    const sec = h("section", { class: "cm-new", "aria-labelledby": "cm-new-h" }, `<h3 id="cm-new-h">Not placed yet</h3>`);
    const row = h("div", { class: "cm-newrow" });
    recs.forEach(rec => {
      const b = h("button", { type: "button", class: "cm-nb", "aria-label": `${rec.name}, ${rec.party}, ${SM.NAMES[rec.state]}: details` });
      b.appendChild(SM.Ring.compact(rec, on, 18));
      b.appendChild(h("span", {}, esc(rec.name)));
      b.addEventListener("click", () => SM.openDetail(rec, list, b));
      row.appendChild(b);
    });
    sec.appendChild(row);
    return sec;
  }

  function emblemBox(code, full, data) {
    const own = data.committees && data.committees[code], e = own || data.seal;
    if (!e) return { box: h("span", {}), credit: "" };
    const alt = own ? `Emblem of the ${full}` : "Seal of the U.S. Senate";
    const box = h("span", { class: `cm-emblem ${e.plate}` }, `<img src="assets/emblems/${esc(e.file)}" alt="${esc(alt)}" width="64" height="64">`);
    const credit = own
      ? `Emblem: ${esc(e.credit)}, from <a href="${esc(e.source)}" target="_blank" rel="noopener">its official site</a>.`
      : `Emblem: the U.S. Senate seal (<a href="${esc(e.source)}" target="_blank" rel="noopener">source</a>). This committee's site shows no separable emblem of its own.`;
    return { box, credit };
  }

  function fill(code) {
    const list = SM.senate(), on = SM.onDate(list), recs = SM.data.senate[list];
    const com = T.committees.find(c => c.code === code);
    if (!com) { // no committees in the data: say so instead of failing
      T.body.replaceChildren(h("p", { class: "cm-none" }, "No committees are listed for this Senate."));
      return;
    }
    const members = Calc.committeeMembers(recs, code);
    const label = members.length ? Calc.seatsOf(members[0].rec).label : null;
    const mine = T;
    T.body.replaceChildren();
    loadEmblems().then(data => {
      if (T !== mine || mine.code !== code) return;
      const em = emblemBox(code, com.full_name, data);
      const head = h("div", { class: "cm-head" });
      head.appendChild(em.box);
      const lines = roleLines(members, label).map(t => `<div>${esc(t)}</div>`).join("");
      head.appendChild(h("div", { class: "cm-who" }, `<h2 class="cm-title" tabindex="-1">${esc(com.full_name)}</h2>${label ? `<p class="cm-label">${esc(label)}</p>` : ""}<div class="cm-roles">${lines}</div>`));
      const sides = h("div", { class: "cm-sides", "aria-hidden": "true" },
        `<span>Majority${sideParty(members.filter(m => isMaj(m.entry))) ? ": " + esc(sideParty(members.filter(m => isMaj(m.entry)))) : ""}</span><span>Minority${sideParty(members.filter(m => !isMaj(m.entry))) ? ": " + esc(sideParty(members.filter(m => !isMaj(m.entry)))) : ""}</span>`);
      const box = h("div", { class: "cm-dais", role: "group", "aria-label": `${com.full_name}, ${members.length} members, seated by committee rank` });
      T.box = box; T.members = members; T.list = list; T.on = on;
      T.body.append(head, sides, box, h("p", { class: "cm-note" }, "Seated by committee rank"));
      if (!members.length) box.replaceWith(h("p", { class: "cm-none" }, "No members listed for this committee yet."));
      else drawDais(box, members, list, on);
      const nw = newcomers(list, on);
      if (nw) T.body.appendChild(nw);
      if (members.length) T.body.append(h("h3", { class: "cm-lh" }, "Members in seat order"), cards(members, list));
      T.body.appendChild(h("p", { class: "cm-credit" }, em.credit));
      SM.Ring.fitAll(T.body);
      const st = SM.state, rec = st.seat && SM.data.bySeat[list][st.seat];
      if (rec && !document.getElementById("detail").open) SM.openDetail(rec, list, null);
    });
  }

  let timer = 0;
  root.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!T || !T.box || !document.contains(T.box)) return;
      const W = Math.min(T.box.clientWidth || 358, 760);
      if (SM.state.view === "committees" && seatsPerRow(W, T.pitch) !== T.perRow) drawDais(T.box, T.members, T.list, T.on);
    }, 150);
  });

  SM.views.committees = {
    render(viewEl, st) {
      const list = SM.senate(), committees = committeeListFor(SM.data.senate);
      const code = cleanCommittee(st.committee, committees);
      if (code !== st.committee) SM.setAddress({ committee: code });
      const sel = h("select", { id: "cm-select" });
      committees.forEach(c => sel.appendChild(h("option", { value: c.code }, esc(c.name))));
      sel.value = code;
      const pick = h("label", { class: "cp-field cm-pick", for: "cm-select" }, "<span>Committee</span>");
      pick.appendChild(sel);
      const body = h("div", { class: "cm-body" });
      const wrap = h("div", { class: "cm", "data-view": "committees" });
      wrap.append(pick, body);
      viewEl.replaceChildren(wrap);
      T = { committees, body, code };
      sel.addEventListener("change", () => {
        T.code = sel.value;
        SM.setAddress({ committee: sel.value, seat: null });
        fill(sel.value);
      });
      fill(code);
    },
  };
})(this);
