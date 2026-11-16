// Loads config/charts.json and config/tokens.json, then a chart's flows file and card field list on demand.
// Every look value the page uses is read through FS.tok, so a change to tokens.json needs only a reload.
(() => {
  "use strict";
  const FS = (window.FS = window.FS || {});

  async function getJSON(url) {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  }

  FS.loadCatalog = async () => {
    const [charts, tokens] = await Promise.all([getJSON("config/charts.json"), getJSON("config/tokens.json")]);
    FS.charts = charts;
    FS.tokens = tokens;
    return { charts, tokens };
  };

  const cache = new Map();
  FS.loadChart = async (chart) => {
    if (!cache.has(chart.id)) {
      cache.set(chart.id, Promise.all([getJSON(chart.flows), chart.card ? getJSON(chart.card) : Promise.resolve([])]));
    }
    const [data, card] = await cache.get(chart.id);
    return { data, card };
  };

  // FS.tok("node.padding") -> the token's value (undefined when absent)
  FS.tok = (path, tokens) => {
    let v = tokens || FS.tokens;
    for (const k of path.split(".")) {
      if (v == null) return undefined;
      v = v[k];
    }
    return v;
  };

  // The notice box at the top of a chart: read from the chart's catalog entry, or null (no box) when it has none
  FS.noticeModel = (chart) => {
    const n = chart && chart.notice;
    if (!n || !n.text) return null;
    return { title: n.title || "", text: n.text, links: (n.links || []).filter((l) => l && l.url && l.label) };
  };

  // Page colors for both themes, as CSS variables on the root element
  FS.applyTheme = (tokens) => {
    const dark = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
    const t = FS.tok(dark ? "theme.dark" : "theme.light", tokens) || {};
    const root = document.documentElement.style;
    for (const [k, v] of Object.entries(t)) root.setProperty(`--${k}`, v);
    const nt = FS.tok(dark ? "notice.dark" : "notice.light", tokens) || {};
    for (const [k, v] of Object.entries(nt)) root.setProperty(`--notice-${k}`, v);
    root.setProperty("--font-ui", FS.tok("fonts.ui", tokens));
    root.setProperty("--font-num", FS.tok("fonts.numbers", tokens));
    root.setProperty("--font-display", FS.tok("fonts.display", tokens));
    for (const group of ["type", "space"]) {
      for (const [k, v] of Object.entries(FS.tok(group, tokens) || {})) root.setProperty(`--${group}-${k.replace(/_/g, "-")}`, v + "px");
    }
    root.setProperty("--radius", FS.tok("shape.radius", tokens) + "px");
    root.setProperty("--control-h", FS.tok("shape.control_height", tokens) + "px");
    root.setProperty("--field-h", FS.tok("shape.field_height", tokens) + "px");
    root.setProperty("--measure", FS.tok("shape.measure_ch", tokens) + "ch");
    root.setProperty("--pct-w", FS.tok("card.percent_width_ch", tokens) + "ch");
    root.setProperty("--label-size", FS.tok("label.size", tokens) + "px");
    root.setProperty("--label-size-phone", FS.tok("label.size_phone", tokens) + "px");
    root.setProperty("--sheet-h", FS.tok("card.sheet_height_phone", tokens) + "px");
    root.setProperty("--row-h", FS.tok("table.row_height", tokens) + "px");
    root.setProperty("--phone-below", FS.tok("chart.phone_below", tokens) + "px");
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  };
})();
