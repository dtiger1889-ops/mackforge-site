// Start-up and wiring: filters, the chart and table switch, tooltips, the card, notes, and the test hook window.__fs.
(() => {
  "use strict";
  const FS = (window.FS = window.FS || {});
  const $ = (s) => document.querySelector(s);
  let st = null;
  let chart = null;
  let data = null;
  let fields = [];
  let drawn = null;
  let pinned = null; // {node} or {link} held by a tap or a key
  let kbd = false;
  let lastWidth = 0;

  document.addEventListener("keydown", (e) => {
    if (!["Shift", "Control", "Alt", "Meta"].includes(e.key)) kbd = true;
  }, true);
  document.addEventListener("pointerdown", () => {
    kbd = false;
  }, true);

  const add = (parent, tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    parent.appendChild(e);
    return e;
  };
  const isPhone = () => window.innerWidth < FS.tok("chart.phone_below");
  const T = () => FS.tokens;

  // ---- controls ----
  function buildControls() {
    const box = $("#controls");
    box.textContent = "";
    const idx = FS.nodeIndex(data);
    const leaf = FS.leafLevel(data);
    const leaves = data.nodes.filter((n) => n.level === leaf);
    if (FS.charts.length > 1) {
      const lab = add(box, "label", "ctl");
      add(lab, "span", "ctl-name", "Chart");
      const sel = add(lab, "select");
      sel.id = "f-chart";
      for (const c of FS.charts) {
        const o = add(sel, "option", null, c.title);
        o.value = c.id;
        o.selected = c.id === chart.id;
      }
      sel.addEventListener("change", () => {
        st = FS.readState("?chart=" + encodeURIComponent(sel.value), FS.charts);
        load();
      });
    }
    for (const f of chart.filters || []) {
      const field = FS.FILTER_FIELDS[f.key];
      if (f.type === "toggle") {
        const lab = add(box, "label", "ctl tg");
        const inp = add(lab, "input");
        inp.type = "checkbox";
        inp.id = "f-" + f.key;
        inp.checked = !!st[f.key];
        add(lab, "span", null, f.label);
        inp.addEventListener("change", () => {
          st[f.key] = inp.checked ? 1 : 0;
          st.all = 0;
          render();
        });
        continue;
      }
      let opts = [];
      if (f.key === "system") {
        opts = data.nodes.filter((n) => n.level === "system").map((n) => [n.id, n.label]).sort((a, b) => a[1].localeCompare(b[1]));
        if (leaves.some((n) => !n.system_id)) opts.push([FS.NO_SYSTEM, "Not in a health system"]);
      } else {
        const vals = [...new Set(leaves.map((n) => n[field]).filter((v) => v != null && v !== ""))];
        vals.sort((a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "en", { numeric: true })));
        opts = vals.map((v) => [String(v), f.key === "cd" ? `District ${v}` : String(v)]);
      }
      if (opts.length < 1 || (f.key === "cd" && !opts.length)) continue; // the district filter waits for the places file
      const lab = add(box, "label", "ctl");
      add(lab, "span", "ctl-name", f.label);
      const sel = add(lab, "select");
      sel.id = "f-" + f.key;
      const all = add(sel, "option", null, "All");
      all.value = "";
      for (const [v, t] of opts) {
        const o = add(sel, "option", null, t);
        o.value = v;
      }
      sel.value = st[f.key] || "";
      sel.addEventListener("change", () => {
        st[f.key] = sel.value || null;
        st.all = 0;
        render();
      });
      void idx;
    }
    const sw = add(box, "div", "ctl seg");
    sw.setAttribute("role", "radiogroup");
    sw.setAttribute("aria-label", "Show as");
    for (const [v, t] of [["chart", "Chart"], ["table", "Table"]]) {
      const lab = add(sw, "label");
      const inp = add(lab, "input");
      inp.type = "radio";
      inp.name = "view";
      inp.value = v;
      inp.id = "v-" + v;
      inp.checked = st.view === v;
      add(lab, "span", null, t);
      inp.addEventListener("change", () => {
        if (!inp.checked) return;
        st.view = v;
        render();
      });
    }
  }

  // ---- tooltip ----
  const kindChip = (parent, kind) => {
    if (!kind || kind === "reported") return;
    add(parent, "span", "kind k-" + kind, kind);
  };
  function refText(ref) {
    if (!ref) return null;
    if (ref.rpt_rec_num != null) {
      const line = ref.line ? String(+ref.line.slice(0, 3)) + (+ref.line.slice(3) ? "." + ref.line.slice(3) : "") : "";
      const colN = ref.column ? String(+ref.column.slice(0, 3)) + (+ref.column.slice(3) ? "." + ref.column.slice(3) : "") : "";
      return `Medicare cost report ${ref.rpt_rec_num}, worksheet ${ref.worksheet}, line ${line}, column ${colN}`;
    }
    return ref.quote ? `“${ref.quote}”` : null;
  }
  function tipLink(tip, l) {
    const idx = drawn.idx;
    const order = FS.tok("tooltip.field_order", T()) || [];
    const parts = {
      source: () => null,
      target: () => {
        const p = add(tip, "p", "tip-path");
        p.textContent = `${(idx.get(l.source.id) || {}).label} → ${(idx.get(l.target.id) || {}).label}`;
        if (l.part_label) add(tip, "p", "tip-part", l.part_label);
      },
      value: () => {
        const p = add(tip, "p", "tip-val");
        add(p, "span", "num", l.flow === "grant" ? FS.grantAmount(l, T()) : FS.fmtMoney(l.value, T()));
        kindChip(p, l.flow === "grant" ? "grant" : l.kind);
        if (l.flow === "grant" && l.kind && l.kind !== "reported") kindChip(p, l.kind);
        if (l.ccns.length > 1) add(p, "span", "muted", ` from ${l.ccns.length} ${chart.leaf_noun || "recipients"}`);
      },
      kind: () => null,
      method: () => {
        const m = l.methods[0];
        if (m) add(tip, "p", "tip-method", m + (l.methods.length > 1 ? " The rate differs by fiscal year, and the table shows each one." : ""));
        if (l.flow === "grant") {
          const sys = l.system_id && idx.get(l.system_id);
          const t = idx.get(l.target.id) || {};
          if (sys && t.level !== FS.leafLevel(data)) add(tip, "p", "tip-method", `Awarded to ${sys.label} as a whole system. This grant is for a different year, so it is left out of the totals.`);
          else add(tip, "p", "tip-method", "This grant is for a different year, so it is left out of the totals.");
        }
      },
      fiscal_year_end: () => {
        if (!l.fy_max) return;
        const txt = l.fy_min === l.fy_max ? `Fiscal year ending ${FS.fmtDate(l.fy_max)}` : `Fiscal years ending ${FS.fmtMonth(l.fy_min)} to ${FS.fmtMonth(l.fy_max)}`;
        add(tip, "p", "muted", txt);
      },
      source_ref: () => {
        const t = l.ccns.length > 1 && l.refs[0] && l.refs[0].rpt_rec_num != null ? `each hospital's Medicare cost report` : refText(l.refs[0]);
        if (t) add(tip, "p", "tip-src", "Source: " + t);
      },
    };
    for (const k of order) (parts[k] || (() => null))();
  }
  function tipNode(tip, n) {
    const meta = drawn.idx.get(n.id) || {};
    add(tip, "p", "tip-path", meta.label);
    const p = add(tip, "p", "tip-val");
    add(p, "span", "num", FS.fmtMoney(n.value, T()));
    if (n.id === FS.OTHERS) add(tip, "p", "muted", "Tap to show each hospital.");
    else if (meta.level === FS.leafLevel(data)) add(tip, "p", "muted", "Tap for this hospital's details.");
  }
  function showTip(target, x, y) {
    const tip = $("#tip");
    tip.textContent = "";
    if (target.link) tipLink(tip, target.link);
    else tipNode(tip, target.node);
    tip.hidden = false;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let left = x + 14;
    let top = y + 14;
    if (left + w > innerWidth - 8) left = Math.max(8, x - w - 14);
    if (top + h > innerHeight - 8) top = Math.max(8, y - h - 14);
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  const hideTip = () => {
    $("#tip").hidden = true;
  };

  function hitOf(e) {
    const t = e.target.closest ? e.target.closest(".lk, .nd, .gt") : null;
    if (!t || !drawn) return null;
    if (t.classList.contains("gt")) return { link: drawn.grants[+t.dataset.gi], el: t, grant: true };
    if (t.classList.contains("lk")) return { link: drawn.graph.links[+t.dataset.i], el: t };
    return { node: drawn.graph.nodes.find((n) => n.id === t.dataset.id), el: t };
  }

  function wireChart(svg) {
    const onMove = (e) => {
      if (pinned || (e.pointerType && e.pointerType !== "mouse")) return;
      const h = hitOf(e);
      if (!h) {
        hideTip();
        FS.highlight(drawn, T(), null, null);
        return;
      }
      showTip(h, e.clientX, e.clientY);
      hl(h);
    };
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerover", onMove);
    svg.addEventListener("pointerleave", () => {
      if (pinned) return;
      hideTip();
      FS.highlight(drawn, T(), null, null);
    });
    svg.addEventListener("click", (e) => {
      const h = hitOf(e);
      activate(h, e.clientX, e.clientY, false);
    });
    svg.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const h = hitOf(e);
      if (!h) return;
      e.preventDefault();
      const b = h.el.getBoundingClientRect();
      activate(h, b.right, b.top, true);
    });
    svg.addEventListener("focusin", (e) => {
      const h = hitOf(e);
      if (!h || !kbd) return;
      const b = h.el.getBoundingClientRect();
      showTip(h, b.right, b.top);
      hl(h);
    });
  }

  // a grant tag lights up the bands into its recipient; a band lights itself; a node follows its money
  const hl = (h) => FS.highlight(drawn, T(), h.node ? h.node.id : h.grant ? h.link.target.id : null, h.link && !h.grant ? h.link.i : null);

  function activate(h, x, y, viaKey) {
    if (!h) {
      pinned = null;
      hideTip();
      FS.highlight(drawn, T(), null, null);
      return;
    }
    if (h.node && h.node.id === FS.OTHERS) {
      st.all = 1;
      pinned = null;
      hideTip();
      render();
      return;
    }
    pinned = h;
    hl(h);
    const meta = h.node && drawn.idx.get(h.node.id);
    if (meta && meta.level === FS.leafLevel(data)) {
      hideTip();
      openCard(h.node.id, viaKey);
    } else showTip(h, x, y);
  }

  // ---- card ----
  function openCard(id, focus) {
    const idx = FS.nodeIndex(data);
    const node = idx.get(id);
    if (!node) return;
    const ccn = drawn && drawn.leafCcn ? drawn.leafCcn.get(id) : new Map([...FS.ccnLeaf(data)].map(([c, i]) => [i, c])).get(id);
    FS.fillCard($("#sheet"), node, { data, chart, fields, tokens: T(), idx, ccn });
    FS.openSheet($("#sheet"), focus);
    st.id = id;
    FS.writeState(st, chart);
  }
  function closeCard() {
    FS.closeSheet($("#sheet"));
    st.id = null;
    pinned = null;
    if (drawn) FS.highlight(drawn, T(), null, null);
    FS.writeState(st, chart);
  }

  // ---- notes, legend, headline ----
  function addNote(box, text, url, linkText) {
    const p = add(box, "p", null, text);
    if (url) {
      p.appendChild(document.createTextNode(" "));
      const a = add(p, "a", null, linkText || "Source");
      a.href = url;
      a.rel = "noopener";
      a.target = "_blank";
    }
    return p;
  }
  function renderNotes(links, visible) {
    const box = $("#notes");
    box.textContent = "";
    const fy = FS.fyRange(links);
    if (fy.min) {
      addNote(box, fy.min === fy.max ? `Each hospital is shown for its fiscal year ending ${FS.fmtDate(fy.max)}.` : `Each hospital is shown for its latest report, for fiscal years ending ${FS.fmtMonth(fy.min)} to ${FS.fmtMonth(fy.max)}.`);
    }
    const grants = links.filter((l) => l.flow === "grant");
    if (grants.length) {
      const g = FS.fyRange(grants.map((l) => ({ ...l, flow: "cost_report" })));
      addNote(box, `Grants are for the fiscal year ending ${FS.fmtDate(g.max)}. That is a different year from the reports, so each grant is tagged beside the hospital or system that got it and left out of its amount and the totals.`);
    }
    for (const n of chart.notes || []) {
      if (typeof n === "string") addNote(box, n);
      else addNote(box, n.text, n.url, n.source);
    }
    const byCcn = FS.ccnLeaf(data);
    const mnr = (data.medicaid_not_reported || []).filter((m) => {
      const ccn = typeof m === "string" ? m : m.ccn;
      const lf = byCcn.get(String(ccn));
      return !lf || visible.has(lf);
    });
    if (mnr.length && chart.medicaid_not_reported_note) {
      const idx = FS.nodeIndex(data);
      const names = mnr.map((m) => (typeof m === "string" ? (idx.get(byCcn.get(m)) || {}).label || m : m.name || m.ccn));
      addNote(box, `${chart.medicaid_not_reported_note} ${listWords(names)}.`);
    }
    const ncr = data.no_cost_report || [];
    if (ncr.length && chart.no_cost_report_note) {
      addNote(box, `${chart.no_cost_report_note} ${listWords(ncr.map((m) => m.name || m.ccn))}.`);
    }
    // sources go in the footer list, one per line, each with its data years and coverage
    const ul = $("#sources");
    if (ul) {
      ul.textContent = "";
      for (const s of chart.sources || []) {
        const li = add(ul, "li");
        const a = add(li, "a", null, s.name);
        a.href = s.url;
        a.rel = "noopener";
        a.target = "_blank";
        const tail = [s.data_year ? `, ${s.data_year}.` : "."];
        if (s.coverage) tail.push(" " + s.coverage);
        li.appendChild(document.createTextNode(tail.join("")));
      }
    }
  }
  // "A, B and C": a list in a sentence, without semicolons
  const listWords = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

  function renderLegend(view) {
    const box = $("#legend");
    box.textContent = "";
    const idx = FS.nodeIndex(data);
    const progLevel = data.levels[1];
    const used = new Set();
    const kinds = new Set();
    for (const l of view.links) {
      const p = l.program || ([l.source, l.target].find((id) => (idx.get(id) || {}).level === progLevel));
      if (p) used.add(p);
      kinds.add(l.flow === "grant" ? "grant" : l.kind);
    }
    const order = FS.sortRule(progLevel, T());
    const progs = [...used].sort((a, b) => (Array.isArray(order) ? order.indexOf(a) - order.indexOf(b) : 0));
    const ul = add(box, "ul", "lg-progs");
    for (const p of progs) {
      const li = add(ul, "li");
      const sw = add(li, "i", "sw");
      sw.style.background = FS.nodeColor(idx.get(p), T());
      add(li, "span", null, (idx.get(p) || {}).label || p);
    }
    const ul2 = add(box, "ul", "lg-kinds");
    const words = FS.KIND_WORDS;
    for (const k of ["reported", "calculated", "estimated", "grant"]) {
      if (!kinds.has(k)) continue;
      const li = add(ul2, "li");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "28");
      svg.setAttribute("height", "12");
      svg.setAttribute("aria-hidden", "true");
      const sp = FS.tok("link.estimated.hatch_spacing", T());
      const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim();
      const color = k === "grant" ? FS.tok("link.grant.color", T()) : muted;
      let inner = `<rect x="0" y="1" width="28" height="10" fill="${color}" fill-opacity="${FS.tok("link.opacity", T())}"/>`;
      if (k === "calculated") inner = `<line x1="0" y1="6" x2="28" y2="6" stroke="${color}" stroke-width="10" stroke-opacity="${FS.tok("link.calculated.opacity", T())}" stroke-dasharray="${FS.tok("link.calculated.dash", T())}"/>`;
      if (k === "grant") inner = `<line x1="0" y1="6" x2="28" y2="6" stroke="${color}" stroke-width="10" stroke-opacity="${FS.tok("link.grant.opacity", T())}" stroke-dasharray="${FS.tok("link.grant.dash", T())}"/>`;
      if (k === "estimated") inner = `<defs><pattern id="lgh" patternUnits="userSpaceOnUse" width="${sp}" height="${sp}" patternTransform="rotate(45)"><rect width="${sp}" height="${sp}" fill="${color}" fill-opacity="${FS.tok("link.estimated.opacity", T())}"/><line x1="0" y1="0" x2="0" y2="${sp}" stroke="${color}" stroke-width="${Math.max(1, sp / 3)}"/></pattern></defs><rect x="0" y="1" width="28" height="10" fill="url(#lgh)"/>`;
      svg.innerHTML = inner;
      li.appendChild(svg);
      add(li, "span", null, words[k]);
    }
  }

  function renderChartNotice() {
    const box = $("#notice");
    box.textContent = "";
    const n = FS.noticeModel(chart);
    box.hidden = !n;
    if (!n) return;
    if (n.title) add(box, "p", "notice-title", n.title);
    add(box, "p", null, n.text);
    if (n.links.length) {
      const ul = add(box, "ul");
      for (const l of n.links) {
        const a = add(add(ul, "li"), "a", null, l.label);
        a.href = l.url;
        a.rel = "noopener";
        a.target = "_blank";
      }
    }
  }

  function renderHeadline(links, visible) {
    const h = $("#headline");
    h.textContent = "";
    const idx = FS.nodeIndex(data);
    const payerLevel = data.levels[0];
    let total = 0;
    let from = 0;
    for (const l of links) {
      if (l.flow !== "cost_report" || (idx.get(l.source) || {}).level !== payerLevel) continue;
      total += l.value;
      if (chart.headline && l.source === chart.headline.from) from += l.value;
    }
    // one sentence, not a stat stack: "$2.6B went to 22 hospitals. 27% of it came from ..."
    add(h, "strong", "num", FS.fmtMoney(total, T()));
    add(h, "span", null, ` went to ${visible.size} ${chart.leaf_noun || "recipients"}.`);
    if (chart.headline && total > 0) {
      add(h, "span", null, " ");
      add(h, "strong", "num", Math.round((100 * from) / total) + "%");
      add(h, "span", null, " " + chart.headline.label);
    }
  }

  // ---- render ----
  function currentView() {
    const visible = FS.visibleLeaves(data, st, chart);
    const links = FS.selectLinks(data, st, chart);
    const max = isPhone() ? FS.tok("chart.max_leaf_nodes_phone") : FS.tok("chart.max_leaf_nodes");
    const shownLeaves = new Set([...visible].filter((id) => links.some((l) => l.target === id)));
    const g = st.all ? { links, grouped: [] } : FS.groupLeaves(links, shownLeaves, max, FS.tok("chart.group_small_below"));
    return { data, chart, visible, links, drawLinks: g.links, grouped: g.grouped, isPhone: isPhone() };
  }

  async function render() {
    document.documentElement.classList.toggle("phone", isPhone());
    const view = currentView();
    renderHeadline(view.links, view.visible);
    renderLegend(view);
    renderNotes(view.links, view.visible);
    const isTable = st.view === "table";
    $("#chart-view").hidden = isTable;
    $("#table-view").hidden = !isTable;
    $("#legend").hidden = isTable;
    pinned = null;
    hideTip();
    drawn = FS.drawChart($("#chart"), { ...view, links: view.drawLinks }, T());
    wireChart(drawn.svg);
    lastWidth = innerWidth;
    if (isTable) {
      const rows = FS.tableRows(view.links, FS.nodeIndex(data), FS.ccnLeaf(data));
      tableRows = rows.length;
      await FS.drawTable($("#table"), rows, T(), (leafId, viaKey) => openCard(leafId, viaKey));
    }
    if (st.id && !$("#sheet").hidden) openCard(st.id, false);
    FS.writeState(st, chart);
    window.__fs.ready = true;
  }
  let tableRows = 0;

  async function load() {
    chart = FS.charts.find((c) => c.id === st.chart) || FS.charts[0];
    window.__fs.ready = false;
    ({ data, card: fields } = await FS.loadChart(chart));
    FS.partLabels = (data.meta || {}).part_labels || {};
    $("#title").textContent = chart.title;
    document.title = chart.title;
    renderChartNotice();
    buildControls();
    await render();
    if (st.id) openCard(st.id, false);
  }

  // ---- test hook ----
  const fsHook = {
    ready: false,
    state: () => ({ ...st }),
    nodeCount: () => (drawn ? drawn.graph.nodes.length : 0),
    linkCount: () => (drawn ? drawn.graph.links.length : 0),
    leafIds: () => (drawn ? drawn.graph.nodes.filter((n) => (drawn.idx.get(n.id) || {}).level === FS.leafLevel(data)).map((n) => n.id) : []),
    // every drawn node's amount, as the layout sized it (a test compares these with and without a grant)
    nodeValues: () => (drawn ? Object.fromEntries(drawn.graph.nodes.map((n) => [n.id, n.value])) : {}),
    grantTagCount: () => (drawn ? drawn.grantEls.length : 0),
    tableRowCount: () => tableRows,
    fyText: () => ($("#notes p") || {}).textContent || "",
    styleValue: (name) => {
      if (!drawn) return null;
      const boxes = [...drawn.svg.querySelectorAll(".nd .box")];
      if (name === "node.width") return boxes.length ? +boxes[0].getAttribute("width") : null;
      if (name === "node.padding") {
        // the smallest gap between neighbours in a column, from the drawn layout
        const cols = new Map();
        for (const n of drawn.graph.nodes) {
          const k = Math.round(n.x0);
          if (!cols.has(k)) cols.set(k, []);
          cols.get(k).push(n);
        }
        let min = Infinity;
        for (const c of cols.values()) {
          c.sort((a, b) => a.y0 - b.y0);
          for (let i = 1; i < c.length; i++) min = Math.min(min, c[i].y0 - c[i - 1].y1);
        }
        return Number.isFinite(min) ? Math.round(min * 100) / 100 : null;
      }
      const m = /^node\.colors\.(payer|program)\.(.+)$/.exec(name);
      if (m) {
        const g = drawn.svg.querySelector(`.nd[data-id="${m[1]}:${m[2]}"] .box`);
        return g ? g.getAttribute("fill") : null;
      }
      if (name === "link.opacity") {
        const p = drawn.svg.querySelector('.lk[data-kind="reported"][data-flow="cost_report"]');
        return p ? +p.dataset.base : null;
      }
      return null;
    },
  };
  window.__fs = fsHook;

  // ---- start ----
  async function start() {
    try {
      await FS.loadCatalog();
    } catch (e) {
      $("#title").textContent = "The chart could not load.";
      return;
    }
    FS.applyTheme(FS.tokens);
    if (window.matchMedia) {
      matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        FS.applyTheme(FS.tokens);
        render();
      });
    }
    st = FS.readState(location.search, FS.charts);
    $("#sheet .sheet-close").addEventListener("click", closeCard);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!$("#sheet").hidden) closeCard();
        pinned = null;
        hideTip();
        if (drawn) FS.highlight(drawn, T(), null, null);
      }
    });
    // a tap outside the chart and the card lets go of a held tooltip
    document.addEventListener("click", (e) => {
      if (!pinned || e.target.closest("svg.sk") || e.target.closest("#sheet")) return;
      pinned = null;
      hideTip();
      if (drawn) FS.highlight(drawn, T(), null, null);
    });
    let t = null;
    addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (innerWidth !== lastWidth && data) render();
      }, 150);
    });
    // labels and grant tags are placed by their measured width, so the chart is drawn again once the web fonts arrive
    const face = (FS.tok("fonts.ui") || "").split(",")[0].trim();
    const fontsIn = !document.fonts || !face || document.fonts.check(`12px ${face}`);
    await load();
    if (!fontsIn) {
      Promise.all([document.fonts.load(`400 12px ${face}`), document.fonts.load(`600 12px ${face}`)])
        .then(() => { if (data && document.fonts.check(`12px ${face}`)) render(); })
        .catch(() => {});
    }
  }
  start();
})();
