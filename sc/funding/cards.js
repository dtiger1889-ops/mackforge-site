// The hospital card: its money by program, the fields from the shared field list, and its cost report source.
// A fixed sheet (bottom of the screen on a phone, right side on a desk), so opening it never moves the page.
(() => {
  "use strict";
  const FS = (window.FS = window.FS || {});

  const fmtField = (v, format, tokens) => {
    if (v == null || v === "" || v === "None") return "–";
    if (format === "integer") return Number(v).toLocaleString("en-US");
    if (format === "percent") return (Number(v) * 100).toFixed(1) + "%";
    if (format === "date") return FS.fmtDate(String(v).slice(0, 10));
    if (format === "yesno") return v === true || v === "yes" || v === "Yes" || v === 1 ? "Yes" : "No";
    if (format === "money") return FS.fmtMoney(Number(v), tokens, true);
    return String(v);
  };

  const add = (parent, tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    parent.appendChild(e);
    return e;
  };

  // The card's "Money in" rows: the hospital's own cost-report links, summed by the column just before it (program or
  // system), each with its share of the total. Grants are a different year and never enter these sums.
  // Returns {rows: [{id, value, kinds, share}], total, links}; share is a fraction of total.
  FS.cardMoney = (data, ccn, idx, tokens) => {
    const mine = data.links.filter((l) => l.flow === "cost_report" && String(l.ccn) === String(ccn));
    const progLevel = data.levels[1];
    const byProg = new Map();
    for (const l of mine) {
      const s = idx.get(l.source);
      if (!s || s.level !== progLevel) continue;
      const cur = byProg.get(l.source) || { value: 0, kinds: new Set() };
      cur.value += l.value;
      cur.kinds.add(l.kind);
      byProg.set(l.source, cur);
    }
    const order = FS.sortRule(progLevel, tokens);
    const keys = [...byProg.keys()].sort((a, b) => (Array.isArray(order) ? order.indexOf(a) - order.indexOf(b) : byProg.get(b).value - byProg.get(a).value));
    const total = keys.reduce((s, k) => s + byProg.get(k).value, 0);
    const rows = keys.map((k) => ({ id: k, value: byProg.get(k).value, kinds: byProg.get(k).kinds, share: total > 0 ? byProg.get(k).value / total : 0 }));
    return { rows, total, links: mine };
  };
  // "15.0%", with the decimals the token card.percent_decimals sets
  FS.fmtShare = (share, tokens) => (100 * share).toFixed(FS.tok("card.percent_decimals", tokens)) + "%";

  // node: the leaf; links: every link of the data file; fields: the card field list
  FS.fillCard = (sheet, node, ctx) => {
    const { data, chart, fields, tokens, idx, ccn } = ctx;
    const body = sheet.querySelector(".sheet-body");
    body.textContent = "";
    sheet.querySelector(".sheet-title").textContent = node.label;
    const sub = [node.county, node.facility_type].filter(Boolean).join(" · ");
    add(body, "p", "sub", sub);

    // money into this leaf, by the column just before it (program or system), with each row's share
    const progLevel = data.levels[1];
    const money = FS.cardMoney(data, ccn, idx, tokens);
    const mine = money.links;
    const grants = data.links.filter((l) => l.flow === "grant" && (l.target === node.id || (node.system_id && l.system_id === node.system_id && idx.get(l.target) && idx.get(l.target).level !== progLevel)));
    if (money.rows.length) {
      add(body, "h3", null, "Money in");
      const dl = add(body, "dl", "money");
      for (const r of money.rows) {
        const row = add(dl, "div", "mrow");
        const dt = add(row, "dt");
        const sw = add(dt, "i", "sw");
        sw.style.background = FS.nodeColor(idx.get(r.id), tokens);
        add(dt, "span", null, idx.get(r.id).label);
        const dd = add(row, "dd");
        add(dd, "span", "num", FS.fmtMoney(r.value, tokens, true));
        add(dd, "span", "num pct", FS.fmtShare(r.share, tokens));
        for (const kd of r.kinds) if (kd !== "reported") add(dd, "span", "kind k-" + kd, kd);
      }
      const row = add(dl, "div", "mrow total");
      add(row, "dt", null, "Total");
      const tdd = add(row, "dd");
      add(tdd, "span", "num", FS.fmtMoney(money.total, tokens, true));
      add(tdd, "span", "num pct", money.total > 0 ? "100%" : "");
      const fy = FS.fyRange(mine);
      if (fy.max) add(body, "p", "muted", `Fiscal year ending ${FS.fmtDate(fy.max)}.`);
    }
    for (const g of grants) {
      const sys = g.system_id && idx.get(g.system_id);
      const p = add(body, "p", "grant");
      const gs = idx.get(g.source) || { label: "" };
      const name = gs.level === progLevel ? gs.label : `Grant from ${gs.label}`;
      p.textContent = `${name}: ${FS.grantAmount(g, tokens, true)}, fiscal year ending ${FS.fmtDate(g.fiscal_year_end)}` +
        (sys && g.target !== node.id ? `, awarded to ${sys.label} as a whole system.` : ".");
      if (g.source_ref && g.source_ref.url) {
        p.appendChild(document.createTextNode(" "));
        const a = add(p, "a", null, "Source");
        a.href = g.source_ref.url;
        a.rel = "noopener";
        a.target = "_blank";
      }
    }

    // the shared field list, in the token's order
    const order = FS.tok("card.field_order", tokens) || [];
    const sorted = [...fields].sort((a, b) => {
      const ia = order.indexOf(a.key);
      const ib = order.indexOf(b.key);
      return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib);
    });
    const shown = sorted.filter((f) => !(f.key === "name" && (node.name || node.label) === node.label));
    if (shown.length) {
      add(body, "h3", null, "About this hospital");
      const dl = add(body, "dl", "facts");
      for (const f of shown) {
        const row = add(dl, "div", "frow");
        add(row, "dt", null, f.label);
        const v = node[f.key] !== undefined ? node[f.key] : node.card ? node.card[f.key] : undefined;
        add(row, "dd", null, fmtField(v, f.format, tokens));
      }
    }

    // where the numbers come from
    const ref = (mine.find((l) => l.source_ref && l.source_ref.rpt_rec_num != null) || {}).source_ref;
    const src = (chart.sources || [])[0];
    if (ref || src) {
      add(body, "h3", null, "Source");
      const p = add(body, "p", "src");
      if (ref) p.appendChild(document.createTextNode(`Medicare cost report ${ref.rpt_rec_num}${ccn ? ", provider " + ccn : ""}. `));
      if (src) {
        const a = add(p, "a", null, src.name);
        a.href = src.url;
        a.rel = "noopener";
        a.target = "_blank";
      }
    }
  };

  FS.openSheet = (sheet, focus) => {
    sheet.hidden = false;
    sheet.querySelector(".sheet-body").scrollTop = 0;
    if (focus) sheet.querySelector(".sheet-close").focus({ preventScroll: true });
  };
  FS.closeSheet = (sheet) => {
    sheet.hidden = true;
  };
})();
