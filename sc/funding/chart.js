// Adds up the filtered links by source and target, lays them out with d3-sankey with each node's column fixed by
// its level, and draws nodes, links and labels from tokens. Nothing here names a payer, program or hospital.
(() => {
  "use strict";
  const FS = (window.FS = window.FS || {});
  const OTHERS = "__others__";
  FS.partLabels = {}; // the flows file's meta.part_labels: the words for a link's `part`, set when a chart loads
  FS.OTHERS = OTHERS;

  // ---- pure functions (tests load these without a browser) ----

  // Sum links that share source, target, flow, kind, program and part (Medicaid supplemental payments are their own
  // part, so they never merge into net-revenue Medicaid). Each sum keeps what its tooltip needs.
  FS.sumLinks = (links) => {
    const m = new Map();
    for (const l of links) {
      const key = [l.source, l.target, l.flow, l.kind, l.program || "", l.part || ""].join("\u0000");
      let s = m.get(key);
      if (!s) {
        s = { source: l.source, target: l.target, flow: l.flow, kind: l.kind, program: l.program || null, part: l.part || null,
              part_label: (l.part && FS.partLabels && FS.partLabels[l.part]) || null, value: 0,
              ccns: new Set(), methods: new Set(), fy_min: null, fy_max: null, refs: [], system_id: l.system_id || null, parts: 0,
              amount_text: l.amount_text || null, approximate: false };
        m.set(key, s);
      }
      s.value += l.value;
      s.parts += 1;
      if (l.approximate) s.approximate = true;
      if (s.parts > 1) s.amount_text = null; // one source's own words belong to one award only
      if (l.ccn != null) s.ccns.add(String(l.ccn));
      if (l.method) s.methods.add(l.method);
      if (l.fiscal_year_end) {
        if (s.fy_min === null || l.fiscal_year_end < s.fy_min) s.fy_min = l.fiscal_year_end;
        if (s.fy_max === null || l.fiscal_year_end > s.fy_max) s.fy_max = l.fiscal_year_end;
      }
      if (s.refs.length < 2 && l.source_ref) s.refs.push(l.source_ref);
    }
    return [...m.values()].map((s) => ({ ...s, ccns: [...s.ccns], methods: [...s.methods] }));
  };

  // The links that size the chart: cost-report money only
  FS.layoutLinks = (summed) => summed.filter((l) => l.flow !== "grant");

  // A grant's last step (the one into its recipient, not into a program node) becomes a tag on that recipient
  FS.grantTags = (summed, idx, data) => {
    const progLevel = data.levels[1];
    return summed.filter((l) => l.flow === "grant" && (idx.get(l.target) || {}).level !== progLevel);
  };

  // Each node's size as the layout sees it: the larger of money in and money out
  FS.nodeValues = (links) => {
    const inn = new Map();
    const out = new Map();
    for (const l of links) {
      out.set(l.source, (out.get(l.source) || 0) + l.value);
      inn.set(l.target, (inn.get(l.target) || 0) + l.value);
    }
    const v = {};
    for (const id of new Set([...inn.keys(), ...out.keys()])) v[id] = Math.max(inn.get(id) || 0, out.get(id) || 0);
    return v;
  };

  // Money into each leaf, for ranking and grouping
  FS.leafTotals = (links, leafIds) => {
    const t = new Map();
    for (const l of links) if (l.flow !== "grant" && leafIds.has(l.target)) t.set(l.target, (t.get(l.target) || 0) + l.value);
    return t;
  };

  // More leaves than the token allows: keep the largest, fold the rest into one "N others" node.
  FS.groupLeaves = (links, leafIds, max, smallBelow) => {
    if (leafIds.size <= max) return { links, grouped: [] };
    const totals = FS.leafTotals(links, leafIds);
    const ranked = [...leafIds].sort((a, b) => (totals.get(b) || 0) - (totals.get(a) || 0));
    // past the limit, the smallest go into the group, and so does any leaf under the token's dollar line
    const top = ranked.slice(0, Math.max(1, max - 1));
    const keep = new Set(top.filter((id, i) => i === 0 || (totals.get(id) || 0) >= smallBelow));
    const grouped = ranked.filter((id) => !keep.has(id));
    const g = new Set(grouped);
    return { links: links.map((l) => (g.has(l.target) ? { ...l, target: OTHERS } : l)), grouped };
  };

  FS.fmtMoney = (v, tokens, exact) => {
    if (exact) return "$" + Math.round(v).toLocaleString("en-US");
    const unit = FS.tok("value.unit", tokens);
    const dec = FS.tok("value.decimals", tokens);
    const a = Math.abs(v);
    const B = unit === "B" || (unit === "auto" && a >= 1e9);
    const M = !B && (unit === "M" || (unit === "auto" && a >= 1e6));
    if (B) return "$" + (v / 1e9).toFixed(dec) + "B";
    if (M) return "$" + (v / 1e6).toFixed(dec) + "M";
    if (a >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K";
    return "$" + Math.round(v).toLocaleString("en-US");
  };

  // An award is shown in its source's own words: where the source says "nearly $31 million" the page says
  // "nearly $31 million" (or "nearly $31.0M" in short form), never an exact dollar figure.
  FS.grantAmount = (l, tokens, exact) => {
    if (!l || !l.approximate) return FS.fmtMoney(l ? l.value : 0, tokens, exact);
    const m = /^((?:nearly|about|almost|around|roughly|approximately)\s+\$[\d.,]+(?:\s*(?:million|billion|thousand))?)/i.exec(l.amount_text || "");
    if (exact && m) return m[1];
    const word = (/^(nearly|about|almost|around|roughly|approximately)/i.exec(l.amount_text || "") || [])[1] || "about";
    return `${word.toLowerCase()} ${FS.fmtMoney(l.value, tokens, false)}`;
  };

  const MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
  FS.fmtDate = (iso) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
  };
  FS.fmtMonth = (iso) => {
    if (!iso) return "";
    const [y, m] = iso.split("-").map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  };

  // Shorten a label: the token's abbreviations first, then cut at a word boundary. A closing parenthetical
  // qualifier, as in "Medicare (traditional)", is never cut off: the name before it gives way instead (spec rule 8).
  FS.shorten = (s, max, tokens) => {
    let out = String(s || "");
    if (out.length <= max) return out;
    for (const [from, to] of FS.tok("label.abbreviations", tokens) || []) {
      out = out.split(from).join(to);
      if (out.length <= max) return out;
    }
    if (out.length <= max) return out;
    const q = /^(.+?)\s+(\([^()]+\))$/.exec(out);
    if (q) {
      const head = FS.shorten(q[1], Math.max(4, max - q[2].length - 1), tokens);
      return head + " " + q[2];
    }
    const cut = out.slice(0, max - 1);
    const sp = cut.lastIndexOf(" ");
    return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[ ,.(]+$/, "") + "…";
  };

  // Split a label over at most `lines` lines of `max` characters
  FS.wrap = (s, max, lines, tokens) => {
    const words = String(s || "").split(/\s+/);
    const out = [];
    let cur = "";
    for (const w of words) {
      if (!cur) cur = w;
      else if ((cur + " " + w).length <= max) cur += " " + w;
      else {
        out.push(cur);
        cur = w;
      }
    }
    if (cur) out.push(cur);
    if (out.length <= lines) return out.map((x) => FS.shorten(x, max, tokens));
    const head = out.slice(0, lines - 1);
    head.push(FS.shorten(out.slice(lines - 1).join(" "), max, tokens));
    return head.map((x) => FS.shorten(x, max, tokens));
  };

  // A node's color: payers and programs by their id, then the level's own color
  FS.nodeColor = (node, tokens) => {
    if (!node) return FS.tok("node.colors.system", tokens);
    if (node.id === OTHERS) return FS.tok("node.colors.hospital", tokens);
    const suffix = node.id.split(":").slice(1).join(":");
    const lv = node.level;
    const set = FS.tok(`node.colors.${lv}`, tokens);
    if (set && typeof set === "object" && set[suffix]) return set[suffix];
    if (typeof set === "string") return node.rural_general_cah && FS.tok("node.colors.hospital_rural", tokens) && lv === "hospital" ? FS.tok("node.colors.hospital_rural", tokens) : set;
    // a leaf level the tokens do not name (a later chart's colleges): the hospital colors
    if (node.rural_general_cah) return FS.tok("node.colors.hospital_rural", tokens);
    return lv === "payer" || lv === "program" ? FS.tok("node.colors.system", tokens) : FS.tok("node.colors.hospital", tokens);
  };

  // A link's color, by the token's rule
  FS.linkColor = (l, idx, tokens) => {
    if (l.flow === "grant") return FS.tok("link.grant.color", tokens);
    const by = FS.tok("link.color_by", tokens);
    // after layout a link's ends are node objects; before, ids
    const s = idx.get(l.source && l.source.id !== undefined ? l.source.id : l.source);
    const t = idx.get(l.target && l.target.id !== undefined ? l.target.id : l.target);
    if (by === "source") return FS.nodeColor(s, tokens);
    if (by === "target") return FS.nodeColor(t, tokens);
    if (l.program && idx.get(l.program)) return FS.nodeColor(idx.get(l.program), tokens);
    if (t && t.level === "program") return FS.nodeColor(t, tokens);
    if (s && s.level === "program") return FS.nodeColor(s, tokens);
    return FS.nodeColor(s, tokens);
  };

  FS.sortRule = (level, tokens) => FS.tok(`node.sort.${level}`, tokens);

  // ---- drawing ----

  const SVGNS = "http://www.w3.org/2000/svg";
  const el = (name, attrs, parent) => {
    const e = document.createElementNS(SVGNS, name);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  };

  // Lay out and draw. Returns what the page needs to wire hover and taps.
  FS.drawChart = (host, view, tokens) => {
    const { data, chart, links: rawLinks, grouped, isPhone } = view;
    const idx = FS.nodeIndex(data);
    if (grouped.length) {
      idx.set(OTHERS, { id: OTHERS, label: `${grouped.length} others`, level: FS.leafLevel(data), grouped });
    }
    const all = FS.sumLinks(rawLinks).filter((l) => l.value > 0);
    // node sizes and amounts come from cost-report money only; grants (another year) are tags beside their recipient
    const summed = FS.layoutLinks(all);
    const grants = FS.grantTags(all, idx, data).map((g, gi) => ({ ...g, gi }));
    const levels = data.levels;
    const col = (id) => Math.max(0, levels.indexOf((idx.get(id) || {}).level));
    const ids = new Set();
    for (const l of summed) {
      ids.add(l.source);
      ids.add(l.target);
    }
    const leaf = FS.leafLevel(data);
    const nLeaves = [...ids].filter((id) => (idx.get(id) || {}).level === leaf).length;
    const width = Math.max(280, host.clientWidth);
    const margin = isPhone ? FS.tok("chart.margin_phone", tokens) : FS.tok("chart.margin", tokens);
    const rowH = isPhone ? FS.tok("chart.row_height_phone", tokens) : FS.tok("chart.row_height_desk", tokens);
    const inner = Math.max(isPhone ? 0 : FS.tok("chart.height_desk", tokens) - margin.top - margin.bottom, nLeaves * rowH);
    const height = inner + margin.top + margin.bottom;
    const nodeW = FS.tok("node.width", tokens);
    const pad = FS.tok("node.padding", tokens);

    // money into each node, so "by_parent" can keep a system's leaves together in the system's own order
    const inflow = new Map();
    for (const l of summed) inflow.set(l.target, (inflow.get(l.target) || 0) + l.value);
    const parentRank = (id) => {
      const p = (idx.get(id) || {}).system_id;
      return p && inflow.has(p) ? -inflow.get(p) : 0; // leaves with no parent come last
    };
    const cmp = (a, b) => {
      const la = (idx.get(a.id) || {}).level;
      if (la !== (idx.get(b.id) || {}).level) return 0;
      if (a.id === OTHERS) return 1;
      if (b.id === OTHERS) return -1;
      const rule = FS.sortRule(la, tokens) || "value_desc";
      if (rule === "by_parent") return parentRank(a.id) - parentRank(b.id) || b.value - a.value;
      if (Array.isArray(rule)) {
        const ia = rule.indexOf(a.id);
        const ib = rule.indexOf(b.id);
        return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib) || b.value - a.value;
      }
      if (rule === "name") return String(idx.get(a.id).label).localeCompare(String(idx.get(b.id).label));
      return b.value - a.value;
    };
    const progOrder = FS.sortRule("program", tokens);
    const lsort = FS.tok("link.sort", tokens);
    const linkSort =
      lsort === "value_desc" ? (a, b) => b.value - a.value
      : lsort === "by_program" ? (a, b) => (Array.isArray(progOrder) ? progOrder.indexOf(a.program) - progOrder.indexOf(b.program) : 0)
      : lsort === "input" ? null
      : undefined; // breadth: d3-sankey's own order, fewest crossings

    const gen = window.d3
      .sankey()
      .nodeId((d) => d.id)
      .nodeAlign((n) => col(n.id))
      .nodeWidth(nodeW)
      .nodePadding(pad)
      .nodeSort(cmp)
      .extent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]]);
    if (linkSort !== undefined) gen.linkSort(linkSort);
    const graph = gen({
      nodes: [...ids].map((id) => ({ id })),
      links: summed.map((l, i) => ({ ...l, i, source: l.source, target: l.target, value: l.value })),
    });
    // each node's column is fixed by its level, whatever columns the filtered view happens to fill
    const span = width - margin.left - margin.right - nodeW;
    for (const n of graph.nodes) {
      n.x0 = margin.left + (span * col(n.id)) / Math.max(1, levels.length - 1);
      n.x1 = n.x0 + nodeW;
    }

    host.textContent = "";
    const svg = el("svg", { class: "sk", width, height, viewBox: `0 0 ${width} ${height}`, role: "img",
      "aria-label": `${chart.title}. The table view lists every amount.` }, host);
    const defs = el("defs", {}, svg);
    const hatch = new Map();
    const hatchFor = (color) => {
      if (!hatch.has(color)) {
        const id = "h" + hatch.size;
        const sp = FS.tok("link.estimated.hatch_spacing", tokens);
        const p = el("pattern", { id, patternUnits: "userSpaceOnUse", width: sp, height: sp, patternTransform: "rotate(45)" }, defs);
        el("rect", { width: sp, height: sp, fill: color, "fill-opacity": FS.tok("link.estimated.opacity", tokens) }, p);
        el("line", { x1: 0, y1: 0, x2: 0, y2: sp, stroke: color, "stroke-width": Math.max(1, sp / 3), "stroke-opacity": FS.tok("link.opacity", tokens) }, p);
        hatch.set(color, id);
      }
      return `url(#${hatch.get(color)})`;
    };

    const gLinks = el("g", { class: "links", fill: "none" }, svg);
    const pathGen = window.d3.sankeyLinkHorizontal();
    const linkEls = [];
    for (const l of graph.links) {
      const color = FS.linkColor(l, idx, tokens);
      let stroke = color;
      let op = FS.tok("link.opacity", tokens);
      let dash = null;
      if (l.flow === "grant") {
        op = FS.tok("link.grant.opacity", tokens);
        dash = FS.tok("link.grant.dash", tokens);
      } else if (l.kind === "estimated") {
        if (FS.tok("link.estimated.pattern", tokens) === "hatch") {
          stroke = hatchFor(color);
          op = 1;
        } else op = FS.tok("link.estimated.opacity", tokens);
      } else if (l.kind === "calculated") {
        op = FS.tok("link.calculated.opacity", tokens);
        dash = FS.tok("link.calculated.dash", tokens);
      }
      const p = el("path", { d: pathGen(l), stroke, "stroke-width": Math.max(1, l.width), "stroke-dasharray": dash,
        class: "lk", "data-i": l.i, "data-kind": l.kind, "data-part": l.part, "data-flow": l.flow, "data-color": color }, gLinks);
      p.style.opacity = op;
      p.dataset.base = op;
      linkEls.push(p);
    }

    const gNodes = el("g", { class: "nodes" }, svg);
    const nodeEls = [];
    const r = FS.tok("node.corner_radius", tokens);
    const minH = FS.tok("node.min_height", tokens);
    const sideKey = isPhone ? "label.side_phone" : "label.side";
    const maxChars = FS.tok(isPhone ? "label.max_chars_phone" : "label.max_chars", tokens);
    const lines = isPhone ? FS.tok("label.lines_phone", tokens) : 1;
    const minLabel = FS.tok("label.min_node_height", tokens);
    const lsize = FS.tok(isPhone ? "label.size_phone" : "label.size", tokens);
    const shortNames = isPhone ? new Map(FS.tok("label.short_phone", tokens) || []) : null;
    for (const n of graph.nodes) {
      const meta = idx.get(n.id) || { id: n.id, label: n.id, level: "" };
      const h = Math.max(minH, n.y1 - n.y0);
      const g = el("g", { class: "nd", "data-id": n.id, "data-level": meta.level, tabindex: 0, role: "button",
        "aria-label": `${meta.label}, ${FS.fmtMoney(n.value, tokens)}` }, gNodes);
      el("rect", { class: "hit", x: n.x0 - 6, y: n.y0 - 3, width: nodeW + 12, height: h + 6, fill: "transparent" }, g);
      el("rect", { class: "box", x: n.x0, y: n.y0, width: nodeW, height: h, rx: r, fill: FS.nodeColor(meta, tokens) }, g);
      const pitch = h + pad;
      if (pitch >= minLabel) {
        const side = FS.tok(`${sideKey}.${meta.level}`, tokens) || "right";
        const left = side === "left";
        const x = left ? n.x0 - 6 : n.x1 + 6;
        // a label in the page margin is as wide as the margin allows; inside the chart, the token's limit
        const c = col(n.id);
        const inMargin = (left && c === 0) || (!left && c === levels.length - 1);
        const gap = span / Math.max(1, levels.length - 1) - nodeW; // the space to the next column
        const room = inMargin ? (left ? margin.left : margin.right) - 10 : gap - 10;
        let chars = Math.max(6, Math.floor(room / (lsize * 0.52)));
        if (!inMargin) chars = Math.min(chars, maxChars);
        const fit = Math.max(1, Math.floor(pitch / (lsize * 1.15)));
        const valueLine = meta.level !== leaf && fit >= 2; // the amount on a line of its own
        const showValue = valueLine || !isPhone; // on a phone the amount shows only where it has its own line
        if (showValue && !valueLine) chars = Math.max(6, chars - 8); // leave room for the amount
        const nameLines = Math.max(1, Math.min(isPhone ? lines : 2, fit - (valueLine ? 1 : 0)));
        const name = (shortNames && shortNames.get(n.id)) || meta.label;
        const parts = nameLines > 1 ? FS.wrap(name, chars, nameLines, tokens) : [FS.shorten(name, chars, tokens)];
        const count = parts.length + (valueLine ? 1 : 0);
        const y0 = (n.y0 + n.y1) / 2 - ((count - 1) * lsize * 1.1) / 2;
        const t = el("text", { class: "lbl", x, y: y0, "font-size": lsize, "text-anchor": left ? "end" : "start", "dominant-baseline": "middle" }, g);
        parts.forEach((s, i) => {
          const sp = el("tspan", { x, dy: i === 0 ? 0 : lsize * 1.1 }, t);
          sp.textContent = s;
          if (i === parts.length - 1 && showValue && !valueLine) {
            const v = el("tspan", { class: "val" }, t);
            v.textContent = " " + FS.fmtMoney(n.value, tokens);
          }
        });
        if (valueLine) {
          const v = el("tspan", { class: "val", x, dy: lsize * 1.1 }, t);
          v.textContent = FS.fmtMoney(n.value, tokens);
        }
      }
      nodeEls.push(g);
    }
    // grants: a dashed tag at the recipient's top-left edge, with the amount and the year on it
    const gTags = el("g", { class: "grants" }, svg);
    const grantEls = [];
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const stack = new Map();
    const labelBoxes = [...svg.querySelectorAll(".lbl")].map((t) => t.getBBox());
    const placed = [];
    for (const g of grants) {
      const n = byId.get(g.target);
      if (!n) continue;
      const k = stack.get(n.id) || 0;
      stack.set(n.id, k + 1);
      const year = (g.fy_max || "").slice(0, 4);
      const amt = FS.grantAmount(g, tokens);
      const lines = isPhone ? [`+${amt} grant`, `fiscal ${year}`] : [`+${amt} grant, fiscal ${year}`];
      const fs = lsize - 1;
      const t = el("g", { class: "gt", "data-gi": g.gi, tabindex: 0, role: "button",
        "aria-label": `${lines.join(", ")}, ${(idx.get(g.target) || {}).label}` }, gTags);
      // the text is drawn first so the box is as wide as the text really is
      const tx = el("text", { class: "gt-txt", "font-size": fs }, t);
      const spans = lines.map((s, i) => {
        const sp = el("tspan", { dy: i === 0 ? 0 : fs * 1.2 }, tx);
        sp.textContent = s;
        return sp;
      });
      const textW = Math.max(...spans.map((sp) => sp.getComputedTextLength()), 0)
        || Math.max(...lines.map((s) => s.length)) * fs * 0.56;
      const w = textW + 12;
      const h = lines.length * fs * 1.2 + 6;
      const x = Math.max(1, n.x0 - 4 - w);
      // the nearest spot to the node's top edge that covers no label and no other tag: first along the node,
      // then above and below it (a short node, or a phone's narrow columns, may leave no room beside it)
      // (labels get a 3 px margin: a text's drawn box can sit a pixel or two outside its measured one)
      const m = 3;
      const hits = (yy) => labelBoxes.some((b) => b.x - m < x + w && b.x + b.width + m > x && b.y - m < yy + h && b.y + b.height + m > yy)
        || placed.some((p) => p.x < x + w && p.x + p.w > x && p.y < yy + h && p.y + p.h > yy);
      const want = n.y0 + k * (h + 3);
      const top = 1, bottom = Math.max(top, height - h - 1);
      let y = Math.min(Math.max(want, top), bottom);
      for (let d = 0; d <= height; d += 2) {
        const below = want + d, above = want - d;
        if (below <= bottom && !hits(below)) {
          y = below;
          break;
        }
        if (d && above >= top && !hits(above)) {
          y = above;
          break;
        }
      }
      placed.push({ x, y, w, h });
      const box = el("rect", { x, y, width: w, height: h, rx: 3, class: "gt-box", stroke: FS.tok("link.grant.color", tokens),
        "stroke-dasharray": FS.tok("link.grant.dash", tokens), "stroke-width": 1.5 }, t);
      box.style.strokeOpacity = Math.max(FS.tok("link.grant.opacity", tokens), 0.8);
      t.insertBefore(box, tx);
      // the dashed line runs from the tag to the nearest point of the node's edge
      const ly = Math.min(Math.max(y + h / 2, n.y0), n.y1);
      const ln = el("line", { x1: x + w, y1: y + h / 2, x2: n.x0, y2: ly, stroke: FS.tok("link.grant.color", tokens),
        "stroke-dasharray": FS.tok("link.grant.dash", tokens), "stroke-width": 1.5 }, t);
      t.insertBefore(ln, tx);
      tx.setAttribute("x", x + 6);
      tx.setAttribute("y", y + 3 + fs * 0.95);
      for (const sp of spans) sp.setAttribute("x", x + 6);
      g.source = { id: g.source };
      g.target = { id: g.target };
      grantEls.push(t);
    }
    const leafCcn = new Map([...FS.ccnLeaf(data)].map(([c, id]) => [id, c]));
    return { svg, graph, idx, linkEls, nodeEls, summed, width, height, leafCcn, grants, grantEls };
  };

  // Highlight the links that touch a node (or one link); everything else dims. null clears.
  FS.highlight = (drawn, tokens, nodeId, linkI) => {
    const dim = FS.tok("link.dimmed_opacity", tokens);
    const hov = FS.tok("link.hover_opacity", tokens);
    let touch = null;
    const leafNode = nodeId && drawn.leafCcn && drawn.leafCcn.get(nodeId);
    if (leafNode) {
      // a leaf: only the bands that carry its own money
      touch = new Set(drawn.graph.links.filter((l) => l.target.id === nodeId || l.ccns.includes(leafNode)).map((l) => l.i));
    } else if (nodeId) {
      // follow the money through the node in both directions, one column at a time
      touch = new Set();
      const { links } = drawn.graph;
      const walk = (id, dir) => {
        for (const l of links) {
          const a = dir > 0 ? l.source.id : l.target.id;
          if (a === id && !touch.has(l.i)) {
            touch.add(l.i);
            walk(dir > 0 ? l.target.id : l.source.id, dir);
          }
        }
      };
      walk(nodeId, 1);
      walk(nodeId, -1);
    } else if (linkI != null) touch = new Set([linkI]);
    for (const p of drawn.linkEls) {
      const i = +p.dataset.i;
      const base = +p.dataset.base;
      p.style.opacity = !touch ? base : touch.has(i) ? Math.max(base, p.dataset.kind === "estimated" ? 1 : hov) : dim;
    }
    for (const g of drawn.nodeEls) g.classList.toggle("on", !!nodeId && g.dataset.id === nodeId);
  };
})();
