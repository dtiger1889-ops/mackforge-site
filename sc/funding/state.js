// State and the page address: chart, rural, cd, system, type, view, id, all.
// `cd` and `rural` mean the same as on the federal data map, so one address works for both.
// The filtering rules live here too, as plain functions the tests load without a browser.
(() => {
  "use strict";
  const FS = (window.FS = window.FS || {});

  // filter key -> the leaf node field it reads (the same table as check_catalog.py)
  FS.FILTER_FIELDS = { rural: "rural_general_cah", cd: "cd", system: "system_id", type: "facility_type", county: "county_fips" };
  FS.NO_SYSTEM = "none"; // the system filter's value for hospitals that belong to no system
  const VIEWS = ["chart", "table"];

  FS.readState = (search, charts) => {
    const p = new URLSearchParams(search || "");
    const chart = charts.find((c) => c.id === p.get("chart")) || charts[0];
    const keys = (chart.filters || []).map((f) => f.key);
    const st = { chart: chart.id, view: VIEWS.includes(p.get("view")) ? p.get("view") : "chart", id: null, all: p.get("all") === "1" ? 1 : 0 };
    const anyFilter = keys.some((k) => p.has(k));
    for (const k of keys) {
      if (k === "rural") {
        const d = chart.default_filter && chart.default_filter.rural ? 1 : 0;
        st.rural = p.has("rural") ? (p.get("rural") === "1" ? 1 : 0) : anyFilter ? 0 : d;
      } else {
        const v = p.get(k);
        st[k] = v && v.length < 80 ? v : anyFilter || !(chart.default_filter || {})[k] ? null : String(chart.default_filter[k]);
      }
    }
    const id = p.get("id");
    st.id = id && /^[a-z_]+:[A-Za-z0-9_.-]{1,60}$/.test(id) ? id : null;
    return st;
  };

  FS.addressFor = (st, chart) => {
    const p = new URLSearchParams();
    if (st.chart) p.set("chart", st.chart);
    for (const f of chart.filters || []) {
      const v = st[f.key];
      if (f.key === "rural") p.set("rural", v ? "1" : "0");
      else if (v != null && v !== "") p.set(f.key, v);
    }
    if (st.view && st.view !== "chart") p.set("view", st.view);
    if (st.id) p.set("id", st.id);
    if (st.all) p.set("all", "1");
    return "?" + p.toString();
  };

  FS.writeState = (st, chart) => {
    try {
      history.replaceState(null, "", FS.addressFor(st, chart) + location.hash);
    } catch (e) {
      /* a page opened from a file has no history to write */
    }
  };

  FS.leafLevel = (data) => data.levels[data.levels.length - 1];

  FS.nodeIndex = (data) => {
    const m = new Map();
    for (const n of data.nodes) m.set(n.id, n);
    return m;
  };

  // Does a leaf node pass every active filter?
  FS.leafPasses = (node, st, chart) => {
    for (const f of chart.filters || []) {
      const v = st[f.key];
      const field = FS.FILTER_FIELDS[f.key];
      if (!field) continue;
      if (f.key === "rural") {
        if (v && node[field] !== true) return false;
      } else if (v != null && v !== "") {
        if (f.key === "system" && v === FS.NO_SYSTEM) {
          if (node.system_id) return false;
        } else if (String(node[field]) !== String(v)) return false;
      }
    }
    return true;
  };

  FS.visibleLeaves = (data, st, chart) => {
    const leaf = FS.leafLevel(data);
    return new Set(data.nodes.filter((n) => n.level === leaf && FS.leafPasses(n, st, chart)).map((n) => n.id));
  };

  // ccn -> leaf id, read from the links themselves (a cost-report link names its leaf's ccn)
  FS.ccnLeaf = (data) => {
    const idx = FS.nodeIndex(data);
    const leaf = FS.leafLevel(data);
    const m = new Map();
    for (const l of data.links) {
      const t = idx.get(l.target);
      if (l.ccn != null && t && t.level === leaf) m.set(String(l.ccn), t.id);
    }
    return m;
  };

  // The links a view draws. Cost-report links follow their leaf. A grant link awarded to a system shows when the
  // view holds at least one of that system's leaves, and never under the district filter (the award has no
  // district); a grant awarded to one leaf follows that leaf.
  FS.selectLinks = (data, st, chart) => {
    const idx = FS.nodeIndex(data);
    const leaf = FS.leafLevel(data);
    const visible = FS.visibleLeaves(data, st, chart);
    const byCcn = FS.ccnLeaf(data);
    const systems = new Set();
    for (const id of visible) {
      const n = idx.get(id);
      if (n && n.system_id) systems.add(n.system_id);
    }
    const cdOn = st.cd != null && st.cd !== "";
    return data.links.filter((l) => {
      if (l.flow === "grant") {
        const t = idx.get(l.target);
        if (t && t.level === leaf) return visible.has(t.id);
        if (l.ccn != null && byCcn.has(String(l.ccn))) return visible.has(byCcn.get(String(l.ccn)));
        const sys = l.system_id || (t && t.level === "system" ? t.id : null);
        return !cdOn && !!sys && systems.has(sys);
      }
      const lf = l.ccn != null ? byCcn.get(String(l.ccn)) : null;
      return !!lf && visible.has(lf);
    });
  };

  // The fiscal year range under the chart comes from cost-report links only; grants are another year.
  FS.fyRange = (links) => {
    let min = null;
    let max = null;
    for (const l of links) {
      if (l.flow !== "cost_report" || !l.fiscal_year_end) continue;
      if (min === null || l.fiscal_year_end < min) min = l.fiscal_year_end;
      if (max === null || l.fiscal_year_end > max) max = l.fiscal_year_end;
    }
    return { min, max };
  };
})();
