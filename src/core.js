/* G3 Dashboard core: state, formatting, routing, charts, upload/loaders, save with data. */
(function (w) {
  var G3 = w.G3, $ = function (id) { return document.getElementById(id); };
  G3.$ = $;
  G3.PAGES = ["home", "sof", "spend", "ulo", "idt", "at", "sch", "mob"];
  G3.TITLE = { home: "Home", sof: "Status of Funds", spend: "Spend Plans", ulo: "Unliquidated", idt: "IDT", at: "Annual Training", sch: "Schools", mob: "Mobilization" };
  G3.mods = {};
  G3.state = { fy: null, pg: "All", view: "tdp", msc: "", bn: "", uic: "" };
  G3.charts = {};
  G3.COLORS = { commit: "#f59e0b", oblig: "#3b82f6", disb: "#84cc16", remain: "#e2e8f0", tdp: "#b08968", afp: "#c9a227", allot: "#0ea5e9", plan: "#94a3b8", prior: "#cbd5e1" };
  G3.PGCOL = { "10010": "#2563eb", "10070": "#0d9488", "10080": "#7c3aed", "10090": "#ea580c" };
  G3.CICOL = { DTS: "#2563eb", Orders: "#0d9488", PR: "#7c3aed", PCS: "#db2777", GPC: "#ea580c", MIPR: "#64748b" };

  // ---------- formatting ----------
  G3.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  G3.money = function (v) {
    if (v == null || !isFinite(v)) return "\u2014";
    var a = Math.abs(v), s = v < 0 ? "\u2212$" : "$";
    if (a >= 1e9) return s + (a / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e8 ? 0 : 2) + "M";
    if (a >= 1e3) return s + (a / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "K";
    return s + Math.round(a);
  };
  G3.full = function (v) { return (v < 0 ? "\u2212$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  G3.whole = function (v) { return (v < 0 ? "\u2212$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US"); };
  G3.num = function (v) { return Math.round(v).toLocaleString("en-US"); };
  G3.pct = function (x, d) { return x == null || !isFinite(x) ? "\u2014" : (x * 100).toFixed(d == null ? 1 : d) + "%"; };
  var MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  G3.parseDate = function (s) { if (s instanceof Date) return s; var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  G3.dateText = function (d) { d = G3.parseDate(d); return d ? ("0" + d.getDate()).slice(-2) + " " + MONS[d.getMonth()] + " " + d.getFullYear() : ""; };
  G3.monthLabel = function (fy, fm) { var y = +fy - (fm <= 3 ? 1 : 0); return G3.MONTHS[fm - 1] + " " + String(y).slice(2); };

  // ---------- fiscal year ----------
  G3.asOf = function () { return G3.parseDate(G3.data.asOf) || new Date(); };
  G3.fyOf = function (d) { return String(d.getFullYear() + (d.getMonth() >= 9 ? 1 : 0)); };
  G3.fyBounds = function (fy) { return { start: new Date(+fy - 1, 9, 1), end: new Date(+fy, 8, 30) }; };
  G3.fyElapsed = function (fy, at) {
    var b = G3.fyBounds(fy), t = at || G3.asOf(), tot = Math.round((b.end - b.start) / 864e5) + 1;
    var day = Math.max(0, Math.min(tot, Math.floor((t - b.start) / 864e5) + 1));
    return { day: day, total: tot, frac: day / tot };
  };
  // through which fiscal month data runs (1..12)
  G3.curFm = function (fy) { var m = 0; G3.data.lines.forEach(function (l) { if (l.fy === fy && l.src === "export" && l.fm > m) m = l.fm; }); return m; };
  G3.priorFy = function (fy) { return String(+fy - 1); };

  // ---------- filtering & aggregation ----------
  // pay group on a row: "10010" etc. = that pay group; "" = no pay group (Functional Area not 5 digits, e.g. 131G..., another appropriation: shown under All only);
  // null = the dataset can't be split by pay group (spend plan; funding for an account whose FAs span several pay groups): shown under every pay group
  G3.pgOk = function (pg) { return G3.state.pg === "All" || pg == null || pg === G3.state.pg; };
  // ---------- per-load caches (perf): keyed on the current arrays, so a new upload / derive rebuilds them ----------
  function memo(name, src, build) { var c = G3._memo || (G3._memo = {}); if (!c[name] || c[name].src !== src) c[name] = { src: src, v: build() }; return c[name].v; }
  G3.memo = memo;
  G3.ciName = function (c) { var m = memo("ci", G3.data.ciMap, function () { return {}; }); if (!(c in m)) m[c] = (G3.data.ciMap || {})[G3.util.kn(c)] || ""; return m[c]; };
  G3.ciLabel = function (c) { return G3.ciName(c) || c || ""; };
  G3.ciCol = function (c) { var X = ["#2563eb", "#0d9488", "#7c3aed", "#db2777", "#ea580c", "#64748b", "#0891b2", "#65a30d", "#a16207", "#4338ca"], h = 0, s = String(c || ""); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return X[h % X.length]; };
  G3.ciPill = function (c) { var n = G3.ciName(c); return '<span class="cipill" style="--cc:' + G3.ciCol(c) + '" title="Commitment item ' + G3.esc(c) + '">' + G3.esc(n || c) + "</span>" + (n ? ' <span class="cicode">' + G3.esc(c) + "</span>" : ""); };
  G3.pgCol = function (p) { var X = ["#0891b2", "#db2777", "#65a30d", "#a16207", "#4338ca"]; return G3.PGCOL[p] || X[Math.abs(+p || 0) % X.length]; };
  G3.acct = function (id) { for (var i = 0; i < G3.data.accounts.length; i++) if (G3.data.accounts[i].id === id) return G3.data.accounts[i]; return { id: id, name: id }; };
  G3.dpcInfo = function (code) {
    var ix = memo("dpc", G3.data.dpcs, function () { var o = { byK: {}, byRaw: {} }; G3.data.dpcs.forEach(function (d) { var k = G3.util.kn(d.code); if (!(k in o.byK)) o.byK[k] = d; }); return o; });
    if (code in ix.byRaw) return ix.byRaw[code];
    return (ix.byRaw[code] = ix.byK[G3.util.kn(code)] || null);
  };
  G3.dpcName = function (code) { var d = G3.dpcInfo(code); return d ? d.name : ""; };
  G3.sum = function (rows, f) { var s = 0; for (var i = 0; i < rows.length; i++) s += (typeof f === "function" ? f(rows[i]) : rows[i][f]) || 0; return s; };
  G3.group = function (rows, key) { var o = {}; rows.forEach(function (r) { var k = typeof key === "function" ? key(r) : r[key]; (o[k] = o[k] || []).push(r); }); return o; };
  G3.linesFy = function (fy) { var ix = memo("fy", G3.data.lines, function () { var o = {}; G3.data.lines.forEach(function (l) { (o[l.fy] = o[l.fy] || []).push(l); }); return o; }); return ix[fy] || []; };
  G3.lines = function (fy, extra) { return G3.linesFy(fy).filter(function (l) { return G3.pgOk(l.pg) && (!extra || extra(l)); }); };
  // funding carries its account's pay group (Accounts tab), so it filters like everything else
  G3.funding = function (fy, extra) { return G3.data.funding.filter(function (f) { return f.fy === fy && G3.pgOk(f.pg) && (!extra || extra(f)); }); };
  G3.plans = function (fy, extra) { return G3.data.plan.filter(function (p) { return p.fy === fy && G3.pgOk(p.pg) && (!extra || extra(p)); }); };
  G3.planMonths = function (rows) { var m = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; rows.forEach(function (p) { for (var i = 0; i < 12; i++) m[i] += p.m[i] || 0; }); return m; };
  /* THE status-of-funds math, in one place:
       TDP view      : execution = commitments + obligations + disbursements ; balance = TDP       - execution
       AFP view      : execution =               obligations + disbursements ; balance = AFP       - execution
       Allotment view: execution =               obligations + disbursements ; balance = Allotment - execution */
  G3.VIEWS = {
    tdp: { key: "tdp", label: "TDP", long: "Full-year funding", withCommit: true },
    afp: { key: "afp", label: "AFP", long: "Funding through a date", withCommit: false },
    allot: { key: "allot", label: "Allotment", long: "Funding now", withCommit: false }
  };
  G3.exec = function (t, view) { return (G3.VIEWS[view || G3.state.view].withCommit ? t.commit : 0) + t.oblig + t.disb; };
  G3.totals = function (lines, fund, view) {
    view = view || G3.state.view;
    var t = { commit: G3.sum(lines, "commit"), oblig: G3.sum(lines, "oblig"), disb: G3.sum(lines, "disb"), tdp: G3.sum(fund, "tdp"), afp: G3.sum(fund, "afp"), allot: G3.sum(fund, "allot"), n: lines.length };
    t.level = t[G3.VIEWS[view].key]; t.exec = G3.exec(t, view); t.bal = t.level - t.exec; t.pctx = t.level ? t.exec / t.level : null; t.od = t.oblig + t.disb;
    return t;
  };
  // spend (actuals for spend plans and program pages) = obligations + disbursements, by fiscal month
  G3.spendByFm = function (lines) { var m = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; lines.forEach(function (l) { if (l.fm) m[l.fm - 1] += l.oblig + l.disb; }); return m; };
  G3.cum = function (a) { var s = 0; return a.map(function (v) { return v == null ? null : (s += v); }); };
  G3.varClass = function (v) { if (v == null || !isFinite(v)) return "na"; var a = Math.abs(v); return a <= .05 ? "g" : a <= .10 ? "y" : "r"; };
  G3.varText = function (v) { return v == null || !isFinite(v) ? "\u2014" : (v > 0 ? "+" : v < 0 ? "\u2212" : "") + Math.abs(v * 100).toFixed(1) + "%"; };
  G3.chip = function (v) { var k = G3.varClass(v); return '<span class="vchip ' + k + '">' + (k === "na" ? "no plan" : G3.varText(v)) + "</span>"; };
  // pace uses only current execution (obligations + disbursements): commitments can be months out
  G3.paceUsed = function (t) { return t.level ? t.od / t.level : null; };
  G3.pace = function (used, expected) {
    if (expected == null || used == null) return { k: "na", t: "n/a" };
    var d = used - expected;
    if (Math.abs(d) <= .05) return { k: "on", t: "On pace" };
    return d > 0 ? { k: "over", t: "Over pace" } : { k: "under", t: "Under pace" };
  };

  // ---------- shared UI bits ----------
  G3.seg = function (name, opts, cur) {
    return '<div class="seg" data-seg="' + name + '">' + opts.map(function (o) { return '<button type="button" data-v="' + G3.esc(o[0]) + '"' + (String(o[0]) === String(cur) ? ' class="on"' : "") + ">" + o[1] + "</button>"; }).join("") + "</div>";
  };
  G3.pgSeg = function () { return '<div class="segwrap"><span class="seglbl">Pay group</span>' + G3.seg("pg", [["All", "All"]].concat(G3.PAYGROUPS.map(function (p) { return [p, p]; })), G3.state.pg) + "</div>"; };
  G3.viewSeg = function () {
    var h = G3.seg("view", [["tdp", "TDP"], ["afp", "AFP"], ["allot", "Allotment"]], G3.state.view);
    return G3.data.hasAllot ? h : h.replace('data-v="allot"', 'data-v="allot" disabled title="Add an Allotment column to the Funding tab of the master key to use this view"');
  };
  // Pay group exists only on the commitments report (and the funds export if it carries one): say so when the filter is on
  G3.pgNote = function (what) {
    if (G3.state.pg === "All") return "";
    var parts = ["Pay group " + G3.esc(G3.state.pg) + " = Functional Areas starting " + G3.esc(G3.state.pg) + ". Lines with a non-pay-group Functional Area (e.g. 131G\u2026) show only under All."];
    if (what !== "ulo") {
      var cf = G3.data.pgConflicts || [];
      parts.push("Funding (TDP/AFP/Allotment) follows each account\u2019s pay group from the Accounts tab.");
      if (cf.length) parts.push(cf.length + " account" + (cf.length > 1 ? "s map" : " maps") + " to more than one pay group; see Data details.");
      parts.push("The spend plan has no pay group and is shown in full.");
    }
    return '<div class="pgnote">' + parts.join(" ") + "</div>";
  };
  // spending by DPC: commitments + obligations from the commitments report (current fiscal year only)
  G3.dpcRollup = function (fy, filter) {
    if (fy !== (G3.data.wfy || G3.fyOf(G3.asOf()))) return [];
    var by = {};
    (G3.data.dpcLines || []).forEach(function (x) {
      if (!G3.pgOk(x.pg) || (filter && !filter(x))) return;
      var inf = G3.dpcInfo(x.dpc), k = inf ? "#" + inf.code : (x.dpc ? "?" + x.dpc : "(none)");
      var o = by[k] || (by[k] = { code: x.dpc || "(none)", name: inf ? inf.name : (x.dpc ? x.dpc + " (not in DPC key)" : "No Internal Order"), tdc: inf ? inf.tdc : "Not in DPC key", account: x.account, commit: 0, oblig: 0, total: 0, n: 0 });
      o[x.type] += x.amt; o.total += x.amt; o.n++;
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.total - a.total; });
  };
  // UIC filters: empty = all. A line without a mapped UIC only passes when every unit filter is off.
  G3.unitOk = function (l) {
    var st = G3.state;
    if (!st.msc && !st.bn && !st.uic) return true;
    if (st.uic) return (l.uicKey || "") === st.uic || G3.util.uk(l.uic) === st.uic;
    if (st.bn) return (l.bn || "") === st.bn || (l.uicKey || "") === st.bn;
    return (l.msc || "") === st.msc || (l.uicKey || "") === st.msc;
  };
  G3.unitInfo = function (code) {
    var k = G3.util.uk(code); return (G3.data.unitBy && (G3.data.unitBy[k] || (k.length > 6 && G3.data.unitBy[k.slice(0, 6)]))) || null;
  };
  G3.unitName = function (code) { var u = G3.unitInfo(code); return u ? u.name : ""; };
  // Spending by unit from the funds export (obligations + disbursements). Commitments are included only when that report has a UIC column.
  G3.unitRollup = function (fy, filter) {
    var st = G3.state, incCommit = !!G3.data.commitHasUic;
    var lines = G3.linesFy(fy).filter(function (l) {
      if (l.src === "commit") { if (!incCommit || !l.uic) return false; }
      else if (l.src !== "export") return false;
      return G3.pgOk(l.pg) && G3.unitOk(l) && (!filter || filter(l));
    });
    var by = {}, UN = "__unmapped__";
    function node(id, meta) {
      return by[id] || (by[id] = { id: id, uic: meta.uic || "", name: meta.name, level: meta.level, parent: meta.parent || "", msc: meta.msc || "", bn: meta.bn || "", oblig: 0, disb: 0, commit: 0, total: 0, n: 0, kids: [] });
    }
    (G3.data.units || []).forEach(function (u) { node(u.uic, { uic: u.uic, name: u.name, level: u.level, parent: u.parent, msc: u.msc, bn: u.bn }); });
    var un = node(UN, { uic: "", name: "Unmapped UIC", level: "MSC", parent: "", msc: "", bn: "" });
    lines.forEach(function (l) {
      var o;
      if (l.uicKey && by[l.uicKey]) o = by[l.uicKey];
      else if (l.uic) {
        var kid = "U:" + G3.util.uk(l.uic);
        o = by[kid] || node(kid, { uic: G3.util.uk(l.uic), name: l.uic, level: "UIC", parent: UN, msc: "", bn: "" });
      } else o = un;
      o.oblig += l.oblig || 0; o.disb += l.disb || 0; o.commit += l.commit || 0; o.total += (l.oblig || 0) + (l.disb || 0) + (l.commit || 0); o.n++;
    });
    var list = Object.keys(by).map(function (k) { return by[k]; });
    list.forEach(function (o) { o._own = { oblig: o.oblig, disb: o.disb, commit: o.commit, total: o.total, n: o.n }; o.kids = []; });
    list.forEach(function (o) {
      if (o.id === UN) return;
      if (o.parent && by[o.parent]) by[o.parent].kids.push(o);
      else if (o.level !== "MSC" && o.msc && by[o.msc] && o.msc !== o.uic) by[o.msc].kids.push(o);
      else if (o.level !== "MSC") un.kids.push(o);
    });
    function roll(o, seen) {
      seen = seen || {}; if (seen[o.id]) return o; seen[o.id] = 1;
      var ch = { oblig: 0, disb: 0, commit: 0, total: 0, n: 0 };
      o.kids.forEach(function (k) { roll(k, seen); ch.oblig += k.oblig; ch.disb += k.disb; ch.commit += k.commit; ch.total += k.total; ch.n += k.n; });
      o.oblig = o._own.oblig + ch.oblig; o.disb = o._own.disb + ch.disb; o.commit = o._own.commit + ch.commit; o.total = o._own.total + ch.total; o.n = o._own.n + ch.n;
      return o;
    }
    var roots = list.filter(function (o) { return o.level === "MSC" || o.id === UN; });
    roots.forEach(function (r) { roll(r); });
    function keep(o) {
      o.kids = o.kids.filter(keep);
      if (st.uic) return o.uic === st.uic || o.kids.length;
      if (st.bn) return o.uic === st.bn || o.bn === st.bn || o.kids.length;
      if (st.msc) return o.uic === st.msc || o.msc === st.msc || o.kids.length;
      return o.total || o.kids.length;
    }
    roots = roots.filter(keep);
    roots.sort(function (a, b) { return a.id === UN ? 1 : b.id === UN ? -1 : b.total - a.total; });
    function sk(kids) { kids.sort(function (a, b) { return b.total - a.total; }); kids.forEach(function (k) { sk(k.kids); }); }
    roots.forEach(function (r) { sk(r.kids); });
    return roots;
  };
  G3.unitSelects = function () {
    var st = G3.state, units = G3.data.units || [];
    if (!units.length) return "";
    var mscs = [], bns = [], uics = [], seen = { m: {}, b: {}, u: {} };
    units.forEach(function (u) {
      if (u.level === "MSC" && !seen.m[u.uic]) { seen.m[u.uic] = 1; mscs.push(u); }
      if ((u.level === "Battalion / Unit" || (u.bn && u.uic === u.bn)) && !seen.b[u.uic]) {
        if (!st.msc || u.msc === st.msc || u.uic === st.msc) { seen.b[u.uic] = 1; bns.push(u); }
      }
      if (!seen.u[u.uic]) {
        if ((!st.msc || u.msc === st.msc || u.uic === st.msc) && (!st.bn || u.bn === st.bn || u.uic === st.bn)) { seen.u[u.uic] = 1; uics.push(u); }
      }
    });
    mscs.sort(function (a, b) { return a.name.localeCompare(b.name); });
    bns.sort(function (a, b) { return a.name.localeCompare(b.name); });
    uics.sort(function (a, b) { return a.name.localeCompare(b.name); });
    function opts(rows, cur, all) {
      return '<option value="">' + all + "</option>" + rows.map(function (u) { return '<option value="' + G3.esc(u.uic) + '"' + (u.uic === cur ? " selected" : "") + ">" + G3.esc(u.name) + " (" + G3.esc(u.uic) + ")</option>"; }).join("");
    }
    return '<label>MSC<select data-st="msc">' + opts(mscs, st.msc, "All MSCs") + "</select></label>" +
      '<label>Battalion / Unit<select data-st="bn">' + opts(bns, st.bn, "All battalions") + "</select></label>" +
      '<label>UIC<select data-st="uic">' + opts(uics, st.uic, "All UICs") + "</select></label>";
  };
  G3.fySel = function () { return '<label>Fiscal year<select data-st="fy">' + G3.data.fys.slice().reverse().map(function (f) { return '<option value="' + f + '"' + (f === G3.state.fy ? " selected" : "") + ">FY" + f + (f === G3.fyOf(G3.asOf()) ? " (current)" : "") + "</option>"; }).join("") + "</select></label>"; };
  G3.scope = function (extra) {
    var st = G3.state, u = [];
    if (st.msc) u.push(G3.unitName(st.msc) || st.msc);
    if (st.bn) u.push(G3.unitName(st.bn) || st.bn);
    if (st.uic) u.push(G3.unitName(st.uic) || st.uic);
    return "<strong>FY" + st.fy + "</strong> &middot; " + (st.pg === "All" ? "All pay groups" : "Pay group " + st.pg) + (u.length ? " &middot; " + G3.esc(u.join(" / ")) : "") + (extra ? " &middot; " + extra : "");
  };
  G3.testTag = function () { return G3.data.source === "test" ? '<span class="demotag">Test data</span>' : ""; };
  G3.head = function (id, icon, title, scope) {
    return '<div class="pagehead"><div><h1><span class="pic t-' + id + '"><svg class="ic"><use href="#' + icon + '"/></svg></span>' + title + G3.testTag() + '</h1><div class="asofp">' + (G3.data.asOf ? "Data as of " + G3.dateText(G3.data.asOf) : "") + '</div><div class="scope">' + scope + '</div></div><button class="btn ghost" type="button" data-go="home"><svg class="ic"><use href="#i-home"/></svg>Home</button></div>';
  };
  G3.kpi = function (cls, lbl, val, sub, attrs) { return '<div class="kpi ' + (cls || "") + '"' + (attrs || "") + '><div class="lbl">' + lbl + '</div><div class="val">' + val + '</div><div class="sub">' + (sub || "&nbsp;") + "</div></div>"; };
  G3.bindCommon = function (root, mod) {
    root.querySelectorAll("[data-seg]").forEach(function (sg) {
      sg.addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b) return; var name = sg.getAttribute("data-seg"), v = b.getAttribute("data-v");
        if (name in G3.state) { G3.state[name] = v; G3.refresh(); } else { mod.ui[name] = v; mod.render(); }
      });
    });
    root.querySelectorAll("select[data-st]").forEach(function (s) { s.addEventListener("change", function () {
      var k = s.getAttribute("data-st"); G3.state[k] = s.value;
      if (k === "msc") { G3.state.bn = ""; G3.state.uic = ""; }
      if (k === "bn") G3.state.uic = "";
      G3.refresh();
    }); });
    root.querySelectorAll("select[data-ui],input[data-ui]").forEach(function (s) {
      var tmr;
      s.addEventListener(s.tagName === "INPUT" ? "input" : "change", function () {
        var go = function () { mod.ui[s.getAttribute("data-ui")] = s.value; if (mod.ui.page != null) mod.ui.page = 0; mod.render(s.tagName === "INPUT" ? s.getAttribute("data-ui") : null); };
        if (s.tagName === "INPUT") { clearTimeout(tmr); tmr = setTimeout(go, 160); } else go();   // typing: redraw once the user pauses
      });
    });
  };
  G3.track = function (frac, color, marker, mlabel) {
    return '<div class="gtrack"><i style="width:' + Math.max(0, Math.min(100, frac * 100)).toFixed(1) + "%;background:" + (color || "#3b82f6") + '"></i>' + (marker != null ? '<b style="left:' + Math.max(0, Math.min(100, marker * 100)).toFixed(1) + '%"' + (mlabel ? ' data-l="' + mlabel + '"' : "") + "></b>" : "") + "</div>";
  };

  // ---------- charts ----------
  G3.chart = function (id, cfg) {
    if (G3.charts[id]) { G3.charts[id].destroy(); delete G3.charts[id]; }
    var el = $(id); if (!el || !w.Chart) return null;
    G3.charts[id] = new Chart(el, cfg); return G3.charts[id];
  };
  G3.axMoney = { ticks: { callback: function (v) { return G3.money(v); } }, grid: { color: "#eef2f7" } };
  G3.tipMoney = { callbacks: { label: function (c) { var v = c.parsed && (c.chart.config.type === "bar" && c.chart.options.indexAxis === "y" ? c.parsed.x : c.parsed.y != null ? c.parsed.y : c.parsed); return " " + c.dataset.label + ": " + G3.whole(typeof v === "number" ? v : c.raw); } } };
  function chartsInit() {
    if (!w.Chart) return;
    Chart.defaults.color = "#475569"; Chart.defaults.borderColor = "#e2e8f0";
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily; Chart.defaults.font.size = 11.5;
    Chart.defaults.animation = false; Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.plugins.legend.labels.boxWidth = 10; Chart.defaults.plugins.legend.labels.boxHeight = 10; Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.position = "bottom";
  }

  // ---------- routing ----------
  function page() { var p = location.hash.replace(/^#\/?/, "").split("/")[0]; return G3.PAGES.indexOf(p) >= 0 ? p : "home"; }
  G3.page = page;
  G3.go = function (p) { if ("#/" + p === location.hash) show(); else location.hash = "#/" + p; };
  function show() {
    var p = page();
    G3.PAGES.forEach(function (x) { $("page-" + x).hidden = x !== p; }); document.querySelectorAll(".wrap").forEach(function (w) { w.classList.toggle("wide", p === "sof"); });   // Status of Funds: wider page so the accounts table fits without a scroll bar
    document.querySelectorAll("#tabs button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-go") === p); });
    render(p); w.scrollTo(0, 0);
  }
  G3.dataVer = 0;
  function render(p, force) {
    var m = G3.mods[p]; if (!m) return;
    var key = JSON.stringify([G3.dataVer, G3.state, m.ui]);
    if (!force && m._key === key && $("page-" + p).firstChild) return;   // page already shows exactly this; keep its DOM and charts
    m._key = key;
    try { m.render(); } catch (e) { console.error(e); $("page-" + p).innerHTML = '<div class="nodata">Could not draw this page: ' + G3.esc(e.message) + "</div>"; }
  }
  G3.refresh = function () { render(page(), true); headerState(); };
  function headerState() {
    $("asOf").textContent = G3.data.asOf ? "Data as of " + G3.dateText(G3.data.asOf) : "";
    $("btnSave").disabled = false;
  }

  // ---------- uploads: every sheet is routed by its header row (loaders.js) ----------
  function ingest(fileName, sheets) {
    var got = G3.parseWorkbook(fileName, sheets);
    got.forEach(function (e) { G3.data.sets[e.kind] = { name: fileName, sheet: e.report.sheet, rows: e.rows, report: e.report, at: new Date().toISOString() }; });
    return got;
  }
  G3.ingest = ingest;
  function loadFiles(list) {
    if (!w.XLSX) { var lz = $("xlsxLazy"); if (lz) { var sc = document.createElement("script"); sc.textContent = lz.textContent; document.head.appendChild(sc); sc.remove(); } }
    if (!w.XLSX) { G3.toast("Excel reader not available.", true); return; }
    var files = Array.prototype.slice.call(list || []), done = [], miss = [], fatal = [];
    (function next() {
      var f = files.shift(); if (!f) return finish();
      var rd = new FileReader();
      rd.onload = function (e) {
        try {
          var wb = /\.csv$/i.test(f.name) ? XLSX.read(e.target.result, { type: "string", cellDates: true }) : XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: true });
          var sheets = wb.SheetNames.map(function (sn) { return { name: sn, aoa: XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null, blankrows: false }) }; });
          if (G3.data.source === "test") { G3.data = { v: 2, source: "file", asOf: null, sets: {} }; G3.toast("Test data cleared; loading your files."); }
          var got = ingest(f.name, sheets);
          if (!got.length) miss.push(f.name);
          got.forEach(function (g) { if (g.report.fatal) fatal.push(f.name + ": " + g.report.fatal); else done.push(f.name + " \u2192 " + G3.KIND_LABEL[g.kind]); });
        } catch (err) { miss.push(f.name + " (" + err.message + ")"); }
        next();
      };
      if (/\.csv$/i.test(f.name)) rd.readAsText(f); else rd.readAsArrayBuffer(f);
    })();
    function finish() {
      if (done.length) { G3.data.source = "file"; G3.data.asOf = isoToday(); }
      G3.derive();
      G3.toast((done.length ? "Loaded " + done.join(", ") + ". " : "") + (fatal.length ? "Problems: " + fatal.join("; ") + ". " : "") + (miss.length ? "Not recognised: " + miss.join(", ") : ""), !!(miss.length || fatal.length));
      renderDrawer(); G3.refresh();
    }
  }
  G3.loadFiles = loadFiles;
  function isoToday() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function loadTest() {
    G3.data = { v: 2, source: "test", asOf: G3.TEST_ASOF, sets: {} };
    G3.makeTestFiles().forEach(function (f) { ingest(f.name + " (test)", f.sheets); });
    G3.derive();
  }

  // ---------- save with data ----------
  var SAVED_ID = "g3Saved";
  function readSaved() { var el = $(SAVED_ID); if (!el) return null; try { var o = JSON.parse(el.textContent); return o && o.v === 2 && o.data && o.data.sets ? o : null; } catch (e) { return null; } }
  function safeJson(o) { return JSON.stringify(o).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"); }
  function saveWithData() {
    var cap = w.__dashSrc, scripts = [], seen = false;
    document.querySelectorAll("script").forEach(function (sc) { if (sc.id === SAVED_ID) return; if (seen) scripts.push(sc.outerHTML); else if (sc.textContent.indexOf("__dashSrc") >= 0) seen = true; });
    if (!cap) { alert("Could not build the saved file."); return; }
    var html = "<!doctype html>\n" + cap.replace(/<\/body>\s*<\/html>\s*$/i, "") + "\n" + scripts.join("\n") + "\n";
    html += '<script id="' + SAVED_ID + '" type="application/json">' + safeJson({ v: 2, savedAt: new Date().toISOString(), data: { v: 2, source: G3.data.source, asOf: G3.data.asOf, sets: G3.data.sets } }) + "</scr" + "ipt>\n</body>\n</html>\n";
    var d = new Date(), name = "G3-Dashboard-" + ("0" + d.getDate()).slice(-2) + MONS[d.getMonth()] + String(d.getFullYear()).slice(2) + ".html";
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  // ---------- drawer ----------
  function openDrawer(on) { $("drawer").hidden = !on; $("scrim").hidden = !on; $("btnInfo").setAttribute("aria-expanded", on ? "true" : "false"); if (on) renderDrawer(); }
  function renderDrawer() {
    var d = G3.data, S = d.sets, esc = G3.esc;
    var wf = d.wfy ? ' Working fiscal year: <strong>FY' + esc(d.wfy) + '</strong> (latest in the funds export; funding, commitments and the spend plan without a Fiscal Year column use it).' : '';
    G3.$("dState").innerHTML = d.source === "test" ? "Showing <strong>fictional test data</strong>, read through the same loaders as real files. Your first upload clears it; after that each upload replaces only the datasets it brings." : "Showing data loaded from your files. Each upload replaces only the datasets it brings" + (d.asOf ? "; days open are counted to " + G3.dateText(d.asOf) : "") + "." + wf;
    G3.$("tFiles").querySelector("tbody").innerHTML = G3.KIND_ORDER.map(function (k) {
      var s = S[k];
      if (!s) return "<tr><td><strong>" + G3.KIND_LABEL[k] + '</strong></td><td class="muted" colspan="3">Not loaded</td></tr>';
      var rp = s.report, notes = [];
      if (rp.fatal) notes.push('<span class="err">' + esc(rp.fatal) + "</span>");
      Object.keys(rp.skipped || {}).forEach(function (why) { notes.push('<span class="warn">' + G3.num(rp.skipped[why]) + " " + esc(why) + "</span>"); });
      (rp.notes || []).forEach(function (n) { notes.push(esc(n)); });
      var dg = (d.diag || {})[k];
      if (dg) {
        var pc = dg.total ? dg.unmapped / dg.total : 0;
        notes.unshift('<span class="dmoney"><b>' + G3.whole(dg.total) + "</b> " + dg.label + " loaded" + (dg.unmapped ? ' &middot; <span class="' + (pc > .05 ? "err" : "warn") + '">' + G3.whole(dg.unmapped) + " (" + G3.pct(pc, 0) + ") unmapped: " + esc(dg.why) + "</span>" : "") +
          (dg.byFy && Object.keys(dg.byFy).length ? '<br><span class="muted">by fiscal year: ' + Object.keys(dg.byFy).sort().map(function (f) { return "FY" + esc(f) + " " + G3.money(dg.byFy[f]); }).join(" &middot; ") + "</span>" : "") +
          (k === "export" ? '<br><span class="muted">monthly actuals (Spend Plans / trends) through ' + (dg.lastFm ? G3.MONTHS[dg.lastFm - 1] + " (month " + dg.lastFm + ") of FY" + esc(d.wfy) : "no month") + "</span>" + (dg.noMonth ? ' &middot; <span class="warn">' + G3.whole(dg.noMonth) + " on lines with no readable fiscal month (in totals, not in any month)</span>" : "") : "") +
          (k === "plan" && d.planFy ? '<br><span class="muted">compared against FY' + esc(d.planFy.join(", FY")) + "</span>" : "") +
          (k === "export" && d.faPrefix ? '<br><span class="muted">' + G3.num(d.faPrefix) + " rows matched an Accounts-tab Functional Area by its first characters</span>" : "") +
          (k === "export" && dg.uicUnmapped ? '<br><span class="warn">' + G3.whole(dg.uicUnmapped) + " of obligations + disbursements have a UIC not on the Units tab</span>" : "") + "</span>");
      }
      return "<tr><td><strong>" + G3.KIND_LABEL[k] + "</strong></td><td>" + esc(s.name) + (s.sheet && s.sheet !== "Sheet1" ? ' <span class="muted">(' + esc(s.sheet) + " tab)</span>" : "") + '</td><td class="num">' + G3.num(s.rows.length) + '</td><td class="small">' + notes.join("<br>") + "</td></tr>";
    }).join("");
    var u = d.unmapped || {}, lists = [["fa", "Functional Areas in the Status of Funds export missing from the Accounts tab"], ["fmzFa", "Functional Areas in FMZ3 missing from the Accounts tab"], ["commitFa", "Functional Areas on commitments-report rows that matched neither the DPC tab nor the Accounts tab"], ["dpc", "Internal Orders (DPCs) in the commitments report missing from the DPC tab"], ["prio", "Prioritizations in the spend plan missing from the Spend Plan tab"], ["ci", "Commitment items (export / FMZ3) missing from the Commitment Item tab"], ["uic", "UICs in the Status of Funds export missing from the Units tab"]];
    var um = lists.filter(function (l) { return u[l[0]] && Object.keys(u[l[0]]).length; }).map(function (l) { return "<p><strong>" + l[1] + ":</strong> " + Object.keys(u[l[0]]).map(function (x) { return "<code>" + esc(x) + "</code> (" + u[l[0]][x] + ")"; }).join(" ") + "</p>"; }).join("");
    var tuf = d.topUnmappedFa || []; if (!um && !tuf.length) um = '<p class="ok">Everything maps.</p>';
    if (tuf.length) um = '<p><strong>Top unmapped Functional Areas</strong> (by $; closest Functional Area on your key in the last column):</p><table class="dtable small tufa"><thead><tr><th>Functional Area</th><th class="num">$</th><th class="num">Rows</th><th>Where</th><th>Closest key FA &rarr; account</th></tr></thead><tbody>' +
      tuf.map(function (o) { return "<tr><td><code>" + esc(o.fa) + '</code></td><td class="num">' + G3.whole(o.amt) + '</td><td class="num">' + G3.num(o.n) + "</td><td>" + esc(o.ds.join(", ")) + "</td><td>" + (o.closest ? "<code>" + esc(o.closest.fa) + "</code> &rarr; " + esc(o.closest.account || "") + ' <span class="muted">(first ' + o.closest.shared + " characters match)</span>" : '<span class="muted">none</span>') + "</td></tr>"; }).join("") + "</tbody></table>" + um;
    var tuu = d.topUnmappedUic || [];
    if (tuu.length) um += '<p><strong>Unmapped UICs</strong> in the Status of Funds export (obligations + disbursements; not on the Units tab, including blank UIC):</p><table class="dtable small tufa"><thead><tr><th>UIC</th><th class="num">$</th><th class="num">Rows</th></tr></thead><tbody>' +
      tuu.map(function (o) { return "<tr><td><code>" + esc(o.uic) + '</code></td><td class="num">' + G3.whole(o.amt) + '</td><td class="num">' + G3.num(o.n) + "</td></tr>"; }).join("") + "</tbody></table>";
    var fh = d.faHow || {}, fhs = Object.keys(fh).map(function (ds) { var o = fh[ds]; return "<strong>" + esc(G3.KIND_LABEL[ds] || ds) + ":</strong> " + [["exact", "exact FA"], ["prefix", "key FA is the start of the FA"], ["reverse", "FA is the start of a key FA"], ["dpc", "Internal Order (DPC tab)"], ["acct", "report Account column"]].filter(function (x) { return o[x[0]]; }).map(function (x) { return G3.num(o[x[0]]) + " " + x[1]; }).join(", "); });
    if (fhs.length) um = '<p class="muted">How rows mapped to an account &mdash; ' + fhs.join(" &middot; ") + "</p>" + um;
    G3.$("dUnmapped").innerHTML = um || '<p class="ok">Everything maps.</p>';
    var xc = d.acctCross;
    if (xc && xc.tabs.length > 1) {
      var miss = xc.rows.filter(function (r) { return r.missing.length; }), vars = xc.rows.filter(function (r) { return r.spellings.length > 1; });
      G3.$("dUnmapped").innerHTML += '<p><strong>Account cross-check</strong> (key tabs join on the account name, ignoring case, spacing and hidden characters; checked: ' + xc.tabs.join(", ") + "): " +
        (miss.length ? '</p><table class="dtable small tufa"><thead><tr><th>Account</th><th>On</th><th>Missing from</th></tr></thead><tbody>' + miss.map(function (r) { return "<tr><td><code>" + esc(r.name) + "</code></td><td>" + esc(r.on.join(", ")) + '</td><td class="warn">' + esc(r.missing.join(", ")) + "</td></tr>"; }).join("") + "</tbody></table>" : '<span class="ok">every account is on every tab.</span></p>') +
        (vars.length ? '<p class="muted">Joined despite different spelling: ' + vars.map(function (r) { return r.spellings.map(function (x) { return "<code>" + esc(x) + "</code>"; }).join(" = "); }).join(" &middot; ") + "</p>" : "");
    }
    var cfl = d.pgConflicts || [];
    G3.$("dUnmapped").innerHTML += "<p><strong>Account pay groups</strong> (first 5 digits of each account\u2019s Functional Areas): " + (d.accounts || []).filter(function (a) { return a.id !== "Unmapped"; }).map(function (a) { return esc(a.name) + " <code>" + (d.acctPg[a.id] || "none") + "</code>"; }).join(" &middot; ") + "</p>" +
      (cfl.length ? '<p class="warn"><strong>Key conflicts:</strong> ' + cfl.map(function (x) { return esc(x.name) + " has Functional Areas in " + x.pgs.map(function (p) { return p || "no pay group (131\u2026)"; }).join(" and ") + "; counted under " + (x.used || "no pay group"); }).join("; ") + ".</p>" : "");
    G3.$("dPrograms").innerHTML = "<p>Accounts feeding each program tab (edit <code>G3.PROGRAM_ACCOUNTS</code> at the top of loaders.js):</p>" + ["idt", "at", "sch", "mob"].map(function (p) { var acc = (d.accounts || []).filter(function (a) { return a.program === p; }).map(function (a) { return a.name; }); return "<p><strong>" + G3.PROGRAMS[p].title + ":</strong> " + (acc.length ? acc.map(function (a) { return "<code>" + esc(a) + "</code>"; }).join(" ") : '<span class="warn">no account matched</span>') + ' <span class="muted">(matches ' + G3.PROGRAM_ACCOUNTS[p].join(", ") + ")</span></p>"; }).join("");
    G3.$("dSchema").innerHTML = G3.KIND_ORDER.map(function (k) { return "<p><strong>" + G3.KIND_LABEL[k] + ":</strong> " + esc(G3.DATASET_COLS[k]) + "</p>"; }).join("") + '<p class="muted">Files are recognised by their header row, not their name. The Master Key can be one workbook with Funding, Accounts, DPC, Spend Plan, Commitment Item, Units and Hierarchy Level tabs, or separate files.</p>';
  }
  G3.renderDrawer = renderDrawer;
  var tt;
  G3.toast = function (msg, warn) { var t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, warn ? 7000 : 3500); };

  // ---------- init ----------
  function init() {
    chartsInit();
    var saved = readSaved();
    if (saved) { G3.data = saved.data; G3.derive(); } else loadTest();
    if (!G3.state.fy) G3.state.fy = G3.fyOf(G3.asOf());
    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-go]"); if (t && !e.target.closest("[data-stop]")) { G3.go(t.getAttribute("data-go")); return; }
      if (e.target.closest("[data-upload]")) $("fileInput").click();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") openDrawer(false); var t = e.target; if ((e.key === "Enter" || e.key === " ") && t.classList && t.classList.contains("ocard")) { e.preventDefault(); G3.go(t.getAttribute("data-go")); } });
    $("btnUpload").addEventListener("click", function () { $("fileInput").click(); });
    $("fileInput").addEventListener("change", function (e) { loadFiles(e.target.files); this.value = ""; });
    $("btnInfo").addEventListener("click", function () { openDrawer(true); });
    $("btnClose").addEventListener("click", function () { openDrawer(false); });
    $("scrim").addEventListener("click", function () { openDrawer(false); });
    $("btnSave").addEventListener("click", saveWithData);
    $("btnReset").addEventListener("click", function () { loadTest(); renderDrawer(); G3.refresh(); G3.toast("Test data restored."); });
    var dz = 0;
    document.addEventListener("dragenter", function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { dz++; $("dropOver").hidden = false; } });
    document.addEventListener("dragleave", function () { if (--dz <= 0) { dz = 0; $("dropOver").hidden = true; } });
    document.addEventListener("dragover", function (e) { e.preventDefault(); });
    document.addEventListener("drop", function (e) { e.preventDefault(); dz = 0; $("dropOver").hidden = true; if (e.dataTransfer.files.length) loadFiles(e.dataTransfer.files); });
    w.addEventListener("hashchange", show);
    headerState(); show();
  }
  G3.init = init;
})(window);
