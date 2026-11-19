/* Unliquidated transactions: every open document, its age and how much is still open. */
(function (w) {
  var G3 = w.G3;
  var M = G3.mods.ulo = { ui: { q: "", ci: "", acct: "", age: "", sort: "days", asc: false, page: 0 } };
  M.BUCKETS = [["0-30", 0, 30], ["31-60", 31, 60], ["61-90", 61, 90], ["91-180", 91, 180], ["180+", 181, 1e9]];
  M.BCOL = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#dc2626"];
  M.days = function (r) { var d = G3.parseDate(r.date); return d ? Math.max(0, Math.round((G3.asOf() - d) / 864e5)) : 0; };
  M.bucket = function (days) { for (var i = 0; i < M.BUCKETS.length; i++) if (days <= M.BUCKETS[i][2]) return i; return M.BUCKETS.length - 1; };
  M.rows = function () { return G3.data.ulo.filter(function (r) { return G3.pgOk(r.pg) && r.open > 0.004; }).map(function (r) { var d = M.days(r); return Object.assign({}, r, { days: d, b: M.bucket(d), liq: r.total ? 1 - r.open / r.total : 0 }); }); };
  var PER = 25;
  M.render = function (focus) {
    var ui = M.ui, root = G3.$("page-ulo"), all = M.rows();
    var q = ui.q.trim().toLowerCase();
    var rows = all.filter(function (r) { return (!ui.ci || r.ci === ui.ci) && (!ui.acct || r.account === ui.acct) && (ui.age === "" || r.b === +ui.age) && (!q || (r.doc + " " + r.desc + " " + r.dpc + " " + r.ci).toLowerCase().indexOf(q) >= 0); });
    var openT = G3.sum(rows, "open"), totT = G3.sum(rows, "total"), o90 = rows.filter(function (r) { return r.days > 90; }), o180 = rows.filter(function (r) { return r.days > 180; });
    var avg = rows.length ? G3.sum(rows, "days") / rows.length : 0, oldest = rows.reduce(function (m, r) { return Math.max(m, r.days); }, 0);
    var cis = Object.keys(G3.group(all, "ci")).sort();
    var h = G3.head("ulo", "i-ulo", "Unliquidated", G3.scope("All fiscal years &middot; days open counted to " + G3.dateText(G3.data.asOf)).replace(/^<strong>FY\d+<\/strong> &middot; /, ""));
    h += '<div class="filters"><label class="grow">Search<input type="search" data-ui="q" placeholder="Document number, description, DPC" value="' + G3.esc(ui.q) + '"></label>' +
      '<label>Commitment item<select data-ui="ci"><option value="">All types</option>' + cis.map(function (c) { return '<option' + (c === ui.ci ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select></label>" +
      '<label>Account<select data-ui="acct"><option value="">All accounts</option>' + G3.data.accounts.map(function (a) { return '<option value="' + a.id + '"' + (a.id === ui.acct ? " selected" : "") + ">" + G3.esc(a.name) + "</option>"; }).join("") + "</select></label>" +
      '<label>Days open<select data-ui="age"><option value="">Any age</option>' + M.BUCKETS.map(function (b, i) { return '<option value="' + i + '"' + (String(i) === ui.age ? " selected" : "") + ">" + b[0] + " days</option>"; }).join("") + "</select></label>" +
      G3.pgSeg() + '<button class="btn" type="button" id="uloReset">Reset</button></div>';
    h += '<div class="kpis">' +
      G3.kpi("", "Open amount", G3.money(openT), G3.pct(totT ? openT / totT : null, 0) + " of " + G3.money(totT) + " still open", ' style="--st:#d97706"') +
      G3.kpi("", "Open transactions", G3.num(rows.length), Object.keys(G3.group(rows, "ci")).length + " commitment item types", ' style="--st:#2563eb"') +
      G3.kpi("warnv", "Open over 90 days", G3.money(G3.sum(o90, "open")), o90.length + " transactions &middot; " + G3.pct(openT ? G3.sum(o90, "open") / openT : null, 0) + " of open $", ' style="--st:#f97316"') +
      G3.kpi("bal bad", "Open over 180 days", G3.money(G3.sum(o180, "open")), o180.length + " transactions need follow-up", "") +
      G3.kpi("", "Average days open", Math.round(avg) + ' <span class="of">days</span>', "Oldest open " + oldest + " days", ' style="--st:#64748b"') + "</div>";
    // aging strip
    var bsum = M.BUCKETS.map(function (b, i) { var rr = rows.filter(function (r) { return r.b === i; }); return { n: rr.length, v: G3.sum(rr, "open") }; });
    h += '<div class="panel"><div class="tablehead"><h2>Aging</h2><span class="muted small">Open amount by days open &middot; click a bucket to filter</span></div><div class="agestrip">' +
      bsum.map(function (s, i) { return '<button type="button" class="ageb' + (String(i) === ui.age ? " on" : "") + '" data-age="' + i + '" style="--bc:' + M.BCOL[i] + ";flex:" + Math.max(.6, openT ? s.v / openT * 10 : 1).toFixed(2) + '"><span class="al">' + M.BUCKETS[i][0] + ' days</span><span class="av">' + G3.money(s.v) + '</span><span class="an">' + s.n + " docs</span></button>"; }).join("") + "</div></div>";
    h += '<div class="row r2"><div class="panel"><h2>Open amount by age and commitment item</h2><div class="chartbox"><canvas id="cUloAge"></canvas></div></div><div class="panel"><h2>Open amount by commitment item</h2><div class="chartbox"><canvas id="cUloCi"></canvas></div></div></div>';
    // table
    var k = ui.sort, dir = ui.asc ? 1 : -1;
    rows.sort(function (a, b) { var x = a[k], y = b[k]; if (k === "acctName") { x = G3.acct(a.account).name; y = G3.acct(b.account).name; } return (x > y ? 1 : x < y ? -1 : 0) * dir; });
    var pages = Math.max(1, Math.ceil(rows.length / PER)); ui.page = Math.min(ui.page, pages - 1);
    var vis = rows.slice(ui.page * PER, ui.page * PER + PER);
    var cols = [["doc", "Document"], ["ci", "Commitment item"], ["desc", "Description"], ["acctName", "Account"], ["dpc", "DPC"], ["pg", "Pay group"], ["date", "Doc date"], ["days", "Days open", "num"], ["total", "Total amount", "num"], ["open", "Open amount", "num"], ["liq", "Liquidated", "num"]];
    h += '<div class="panel"><div class="tablehead"><h2>Open transactions</h2><div class="tabletools"><span class="muted small">' + rows.length + " transactions &middot; " + G3.whole(openT) + ' open</span><button class="btn sm" type="button" id="uloCsv">Export CSV</button></div></div><p class="muted small">Rows open more than 90 days are flagged amber, more than 180 days red. Click a column header to sort.</p>' +
      '<div class="tablewrap"><table class="grid ulo"><thead><tr>' + cols.map(function (c) { return '<th data-k="' + c[0] + '" class="' + (c[2] || "") + (c[0] === k ? " sorted" + (ui.asc ? " asc" : "") : "") + '">' + c[1] + "</th>"; }).join("") + "</tr></thead><tbody>" +
      vis.map(function (r) {
        var fl = r.days > 180 ? "red" : r.days > 90 ? "amber" : "";
        return '<tr class="' + fl + '"><td><strong>' + G3.esc(r.doc) + '</strong></td><td><span class="cipill" style="--cc:' + (G3.CICOL[r.ci] || "#64748b") + '">' + G3.esc(r.ci) + '</span></td><td class="wrapc">' + G3.esc(r.desc) + "</td><td>" + G3.esc(G3.acct(r.account).name) + '</td><td><span class="dpc" title="' + G3.esc(G3.dpcName(r.dpc, r.account)) + '">' + G3.esc(r.dpc) + "</span></td><td>" + G3.esc(r.pg) + "</td><td>" + G3.dateText(r.date) + '</td><td class="num"><span class="agepill" style="--bc:' + M.BCOL[r.b] + '">' + r.days + "d</span></td><td class=\"num\">" + G3.full(r.total) + '</td><td class="num"><strong>' + G3.full(r.open) + '</strong></td><td class="num"><span class="xbar"><i style="width:' + (r.liq * 100).toFixed(0) + '%;background:#16a34a"></i></span>' + G3.pct(r.liq, 0) + "</td></tr>";
      }).join("") + (vis.length ? "" : '<tr><td colspan="11" class="muted">Nothing matches the current filters.</td></tr>') + "</tbody></table></div>" +
      '<div class="pager"><button class="btn sm" type="button" data-pg="-1"' + (ui.page ? "" : " disabled") + '>&lsaquo; Prev</button><span class="muted small">Page ' + (ui.page + 1) + " of " + pages + '</span><button class="btn sm" type="button" data-pg="1"' + (ui.page < pages - 1 ? "" : " disabled") + ">Next &rsaquo;</button></div></div>";
    root.innerHTML = h;
    G3.bindCommon(root, M);
    if (focus) { var inp = root.querySelector('[data-ui="' + focus + '"]'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } }
    G3.$("uloReset").onclick = function () { Object.assign(ui, { q: "", ci: "", acct: "", age: "", page: 0 }); G3.state.pg = "All"; G3.refresh(); };
    root.querySelectorAll("[data-age]").forEach(function (b) { b.onclick = function () { var v = b.getAttribute("data-age"); ui.age = ui.age === v ? "" : v; ui.page = 0; M.render(); }; });
    root.querySelectorAll("th[data-k]").forEach(function (th) { th.onclick = function () { var kk = th.getAttribute("data-k"); if (ui.sort === kk) ui.asc = !ui.asc; else { ui.sort = kk; ui.asc = ["doc", "ci", "desc", "acctName", "dpc", "pg"].indexOf(kk) >= 0; } M.render(); }; });
    root.querySelectorAll("[data-pg]").forEach(function (b) { b.onclick = function () { ui.page += +b.getAttribute("data-pg"); M.render(); }; });
    G3.$("uloCsv").onclick = function () { G3.csv([["Document", "Commitment item", "Description", "Account", "DPC", "Pay group", "Document date", "Days open", "Total amount", "Open amount"]].concat(rows.map(function (r) { return [r.doc, r.ci, r.desc, G3.acct(r.account).name, r.dpc, r.pg, r.date, r.days, r.total.toFixed(2), r.open.toFixed(2)]; })), "G3-Unliquidated.csv"); };
    var types = Object.keys(G3.group(rows, "ci")).sort();
    G3.chart("cUloAge", { type: "bar", data: { labels: M.BUCKETS.map(function (b) { return b[0] + " days"; }), datasets: types.map(function (t) { return { label: t, data: M.BUCKETS.map(function (b, i) { return G3.sum(rows.filter(function (r) { return r.ci === t && r.b === i; }), "open"); }), backgroundColor: G3.CICOL[t] || "#64748b", stack: "a" }; }) }, options: { scales: { x: { stacked: true, grid: { display: false } }, y: Object.assign({ stacked: true }, G3.axMoney) }, plugins: { tooltip: G3.tipMoney } } });
    var byCi = types.map(function (t) { var rr = rows.filter(function (r) { return r.ci === t; }); return { t: t, v: G3.sum(rr, "open"), n: rr.length, o: G3.sum(rr.filter(function (r) { return r.days > 90; }), "open") }; }).sort(function (a, b) { return b.v - a.v; });
    G3.chart("cUloCi", { type: "bar", data: { labels: byCi.map(function (x) { return x.t + " (" + x.n + ")"; }), datasets: [{ label: "Open 0\u201390 days", data: byCi.map(function (x) { return x.v - x.o; }), backgroundColor: byCi.map(function (x) { return G3.CICOL[x.t] || "#64748b"; }), stack: "c", borderRadius: 4 }, { label: "Open over 90 days", data: byCi.map(function (x) { return x.o; }), backgroundColor: "#f97316", stack: "c", borderRadius: 4 }] }, options: { indexAxis: "y", scales: { x: Object.assign({ stacked: true }, G3.axMoney), y: { stacked: true, grid: { display: false } } }, plugins: { tooltip: G3.tipMoney } } });
  };
})(window);
