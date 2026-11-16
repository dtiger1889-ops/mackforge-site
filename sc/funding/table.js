// The same links as a Tabulator table, one row per link, with a kind column. Tabulator loads the first time the
// table opens (it is the page's largest file), from this page's own vendor folder.
(() => {
  "use strict";
  const FS = (window.FS = window.FS || {});
  let loading = null;
  let table = null;

  function loadTabulator() {
    if (window.Tabulator) return Promise.resolve();
    if (!loading) {
      loading = new Promise((ok, fail) => {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = "vendor/tabulator.min.css";
        document.head.appendChild(css);
        const s = document.createElement("script");
        s.src = "vendor/tabulator.min.js";
        s.onload = () => ok();
        s.onerror = () => fail(new Error("table library did not load"));
        document.head.appendChild(s);
      });
    }
    return loading;
  }

  // The words a row's kind shows. The tooltip uses the same words.
  // The legend uses the same words.
  // Lower case on purpose: the table shows them as written and the legend capitalizes the first letter in CSS.
  FS.KIND_WORDS = { reported: "reported by the hospital", calculated: "calculated from what it reported", estimated: "estimated federal or state share of Medicaid", grant: "grant for a different year" };
  FS.kindText = (l) => (l.flow === "grant" ? FS.KIND_WORDS.grant + (l.kind && l.kind !== "reported" ? ", " + l.kind : "") : FS.KIND_WORDS[l.kind] || l.kind || "");

  const HEAD = { source: "From", target: "To", value: "Amount", kind: "Type of figure", part: "Which Medicaid money", fiscal_year_end: "Fiscal year ends", ccn: "Hospital", method: "How it was worked out" };

  FS.tableRows = (links, idx, leafOf) =>
    links.map((l, i) => {
      const lf = l.ccn != null ? leafOf.get(String(l.ccn)) : null;
      const sys = l.system_id && idx.get(l.system_id);
      return {
        i,
        source: (idx.get(l.source) || {}).label || l.source,
        target: (idx.get(l.target) || {}).label || l.target,
        value: l.value,
        value_text: l.flow === "grant" ? FS.grantAmount(l, null, true) : null,
        part: (l.part && FS.partLabels && FS.partLabels[l.part]) || "",
        kind: FS.kindText(l),
        kind_raw: l.kind,
        fiscal_year_end: l.fiscal_year_end || "",
        ccn: lf ? (idx.get(lf) || {}).label || l.ccn : sys ? `${sys.label} (awarded to the system)` : "",
        leaf: lf || null,
        method: l.method || "",
      };
    });

  FS.drawTable = async (host, rows, tokens, onRow) => {
    await loadTabulator();
    const cols = (FS.tok("table.columns", tokens) || []).map((k) => {
      const c = { title: HEAD[k] || k, field: k, headerSort: true, minWidth: 90 };
      if (k === "value") {
        Object.assign(c, { hozAlign: "right", sorter: "number", formatter: (cell) => cell.getRow().getData().value_text || FS.fmtMoney(cell.getValue(), tokens, true), minWidth: 120 });
      }
      if (k === "source" || k === "target" || k === "ccn") c.minWidth = 150;
      if (k === "kind") c.minWidth = 320; // plain text, wide enough for the longest wording without cutting it off
      return c;
    });
    host.textContent = "";
    const div = document.createElement("div");
    host.appendChild(div);
    if (table) {
      try {
        table.destroy();
      } catch (e) {
        /* already gone */
      }
    }
    table = new window.Tabulator(div, {
      data: rows,
      columns: cols,
      layout: "fitDataStretch",
      height: "70vh",
      rowHeight: FS.tok("table.row_height", tokens),
      initialSort: [{ column: "value", dir: "desc" }],
      rowFormatter: (row) => {
        const e = row.getElement();
        const d = row.getData();
        e.dataset.kind = d.kind_raw || "";
        e.dataset.i = d.i;
        if (d.leaf) {
          e.tabIndex = 0;
          e.setAttribute("role", "button");
          e.setAttribute("aria-label", `${d.ccn}: ${d.source} to ${d.target}, ${d.value_text || FS.fmtMoney(d.value, tokens, true)}, ${d.kind}. Open the hospital card.`);
          if (!e.dataset.wired) {
            e.dataset.wired = "1";
            e.addEventListener("keydown", (ev) => {
              if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                const r = row.getData();
                if (r.leaf) onRow(r.leaf, true);
              }
            });
          }
        }
      },
    });
    table.on("rowClick", (e, row) => {
      const d = row.getData();
      if (d.leaf) onRow(d.leaf, false);
    });
    FS.table = table;
    return table;
  };
})();
