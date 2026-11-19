/* Unliquidated (FMZ3): every open line, how old it is and how much is still open. */
(function (w) {
  var G3 = w.G3;
  var M = G3.mods.ulo = { ui: { q: "", ci: "", acct: "", age: "", sort: "days", asc: false, page: 0, open: {} } };
  M.BUCKETS = [["0-30", 0, 30], ["31-60", 31, 60], ["61-90", 61, 90], ["91-180", 91, 180], ["180+", 181, 1e9]];
  M.BCOL = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#dc2626"];
  M.days = function (r) { var d = G3.parseDate(r.date); return d ? Math.max(0, Math.round((G3.asOf() - d) / 864e5)) : 0; };
  M.bucket = function (days) { for (var i = 0; i < M.BUCKETS.length; i++) if (days <= M.BUCKETS[i][2]) return i; return M.BUCKETS.length - 1; };
  M.rows = function (filter) { return (G3.data.ulo || []).filter(function (r) { return r.open > 0.004 && (!filter || filter(r)); }).map(function (r, i) { var d = M.days(r); return Object.assign({}, r, { _i: i, days: d, b: M.bucket(d), liq: r.total ? Math.max(0, 1 - r.open / r.total) : 0, acctName: G3.acct(r.account).name }); }); };
  M.typeCol = function (t) { var k = String(t || "").toUpperCase(); return G3.CICOL[k === "ORDERS" ? "Orders" : k] || "#64748b"; };
  var PER = 25;
  M.render = function (focus) {
    var ui = M.ui, root = G3.$("page-ulo"), all = M.rows(), q = ui.q.trim().toLowerCase();
    var rows = all.filter(function (r) { return (!ui.ci || r.type === ui.ci) && (!ui.acct || r.account === ui.acct) && (ui.age === "" || r.b === +ui.age) && (!q || [r.fmz, r.desc, r.hdr, r.ref, r.order, r.supplier, r.type, G3.dpcName(r.order)].join(" ").toLowerCase().indexOf(q) >= 0); });
    var openT = G3.sum(rows, "open"), totT = G3.sum(rows, "total"), o90 = rows.filter(function (r) { return r.days > 90; }), o180 = rows.filter(function (r) { return r.days > 180; });
    var avg = rows.length ? G3.sum(rows, "days") / rows.length : 0, oldest = rows.reduce(function (m, r) { return Math.max(m, r.days); }, 0);
    var types = Object.keys(G3.group(all, "type")).sort();
    var h = G3.head("ulo", "i-ulo", "Unliquidated", "All open FMZ3 lines &middot; days open counted from Posting Date to " + G3.dateText(G3.data.asOf) + ' &middot; <span class="muted">no pay group on FMZ3</span>');
    h += '<div class="filters"><label class="grow">Search<input type="search" data-ui="q" placeholder="Traveler, FMZ number, header text, DPC, supplier" value="' + G3.esc(ui.q) + '"></label>' +
      '<label>Commitment item<select data-ui="ci"><option value="">All types</option>' + types.map(function (c) { return '<option' + (c === ui.ci ? " selected" : "") + ">" + G3.esc(c) + "</option>"; }).join("") + "</select></label>" +
      '<label>Account<select data-ui="acct"><option value="">All accounts</option>' + G3.data.accounts.map(function (a) { return '<option value="' + G3.esc(a.id) + '"' + (a.id === ui.acct ? " selected" : "") + ">" + G3.esc(a.name) + "</option>"; }).join("") + "</select></label>" +
      '<label>Days open<select data-ui="age"><option value="">Any age</option>' + M.BUCKETS.map(function (b, i) { return '<option value="' + i + '"' + (String(i) === ui.age ? " selected" : "") + ">" + b[0] + " days</option>"; }).join("") + "</select></label>" +
      '<button class="btn" type="button" id="uloReset">Reset</button></div>';
    var zero = G3.data.sets.fmz3 && G3.data.sets.fmz3.report.skipped["zero-open rows excluded"];
    h += '<div class="kpis">' +
      G3.kpi("", "Open amount", G3.money(openT), G3.pct(totT ? openT / totT : null, 0) + " of " + G3.money(totT) + " original total", ' style="--st:#d97706"') +
      G3.kpi("", "Open lines", G3.num(rows.length), zero ? G3.num(zero) + " zero-open lines left out" : "&nbsp;", ' style="--st:#2563eb"') +
      G3.kpi("warnv", "Open over 90 days", G3.money(G3.sum(o90, "open")), o90.length + " lines &middot; " + G3.pct(openT ? G3.sum(o90, "open") / openT : null, 0) + " of open $", ' style="--st:#f97316"') +
      G3.kpi("bal bad", "Open over 180 days", G3.money(G3.sum(o180, "open")), o180.length + " lines need follow-up", "") +
      G3.kpi("", "Average days open", Math.round(avg) + ' <span class="of">days</span>', "Oldest open " + oldest + " days", ' style="--st:#64748b"') + "</div>";
    var bsum = M.BUCKETS.map(function (b, i) { var rr = rows.filter(function (r) { return r.b === i; }); return { n: rr.length, v: G3.sum(rr, "open") }; });
    h += '<div class="panel"><div class="tablehead"><h2>Aging</h2><span class="muted small">Open amount by days since posting &middot; click a bucket to filter</span></div><div class="agestrip">' +
      bsum.map(function (s, i) { return '<button type="button" class="ageb' + (String(i) === ui.age ? " on" : "") + '" data-age="' + i + '" style="--bc:' + M.BCOL[i] + ";flex:" + Math.max(.6, openT ? s.v / openT * 10 : 1).toFixed(2) + '"><span class="al">' + M.BUCKETS[i][0] + ' days</span><span class="av">' + G3.money(s.v) + '</span><span class="an">' + s.n + " lines</span></button>"; }).join("") + "</div></div>";
    h += '<div class="row r2"><div class="panel"><h2>Open amount by age and commitment item</h2><div class="chartbox"><canvas id="cUloAge"></canvas></div></div><div class="panel"><h2>Open amount by account</h2><div class="chartbox"><canvas id="cUloAcct"></canvas></div></div></div>';
    var k = ui.sort, dir = ui.asc ? 1 : -1;
    rows.sort(function (a, b) { var x = a[k], y = b[k]; return (x > y ? 1 : x < y ? -1 : 0) * dir; });
    var pages = Math.max(1, Math.ceil(rows.length / PER)); ui.page = Math.min(ui.page, pages - 1);
    var vis = rows.slice(ui.page * PER, ui.page * PER + PER);
    var cols = [["type", "Commitment item"], ["desc", "Description"], ["acctName", "Account"], ["order", "DPC"], ["date", "Posted"], ["days", "Days open", "num"], ["total", "Total", "num"], ["open", "Open", "num"], ["liq", "Liquidated", "num"]];
    function det(l, v) { return v ? "<div><span>" + l + "</span><b>" + G3.esc(v) + "</b></div>" : ""; }
    h += '<div class="panel"><div class="tablehead"><h2>Open lines</h2><div class="tabletools"><span class="muted small">' + rows.length + " lines &middot; " + G3.whole(openT) + ' open</span><button class="btn sm" type="button" id="uloCsv">Export CSV</button></div></div><p class="muted small">Over 90 days is amber, over 180 days red. Click a row for the FMZ number and the rest of the line. Click a column header to sort.</p>' +
      '<div class="tablewrap"><table class="grid ulo"><thead><tr><th></th>' + cols.map(function (c) { return '<th data-k="' + c[0] + '" class="' + (c[2] || "") + (c[0] === k ? " sorted" + (ui.asc ? " asc" : "") : "") + '">' + c[1] + "</th>"; }).join("") + "</tr></thead><tbody>" +
      vis.map(function (r) {
        var fl = r.days > 180 ? "red" : r.days > 90 ? "amber" : "", op = ui.open[r._i], dn = G3.dpcName(r.order);
        var s = '<tr class="ulr ' + fl + '" data-row="' + r._i + '"><td class="caret">' + (op ? "\u25BE" : "\u25B8") + '</td><td><span class="cipill" style="--cc:' + M.typeCol(r.type) + '">' + G3.esc(r.type) + '</span></td><td class="wrapc">' + (r.traveler ? '<strong>' + G3.esc(r.desc) + '</strong>' : G3.esc(r.desc)) + "</td><td>" + G3.esc(r.acctName) + '</td><td class="wrapc small">' + (dn ? G3.esc(dn) : G3.esc(r.order || "")) + "</td><td>" + G3.dateText(r.date) + '</td><td class="num"><span class="agepill" style="--bc:' + M.BCOL[r.b] + '">' + r.days + 'd</span></td><td class="num">' + G3.full(r.total) + '</td><td class="num"><strong>' + G3.full(r.open) + '</strong></td><td class="num"><span class="xbar"><i style="width:' + (r.liq * 100).toFixed(0) + '%;background:#16a34a"></i></span>' + G3.pct(r.liq, 0) + "</td></tr>";
        if (op) s += '<tr class="uldet"><td></td><td colspan="9"><div class="detgrid">' + det("FMZ number (Earmarked Funds)", r.fmz) + det("Document type", r.dt) + det("Reference", r.ref) + det("Document Header Text", r.hdr) + det("Commitment item", r.ci) + det("Functional Area", r.fa) + det("Order (DPC)", r.order + (dn ? " \u2013 " + dn : "")) + det("Fund", r.fund) + det("Funds Center", r.fc) + det("Cost Center", r.cc) + det("G/L Account", r.gl) + det("Supplier", r.supplier) + det("Created by", r.by) + det("Document Date", G3.dateText(r.docdate)) + det("Text", r.text) + "</div></td></tr>";
        return s;
      }).join("") + (vis.length ? "" : '<tr><td colspan="10" class="muted">Nothing matches the current filters.</td></tr>') + "</tbody></table></div>" +
      '<div class="pager"><button class="btn sm" type="button" data-pg="-1"' + (ui.page ? "" : " disabled") + '>&lsaquo; Prev</button><span class="muted small">Page ' + (ui.page + 1) + " of " + pages + '</span><button class="btn sm" type="button" data-pg="1"' + (ui.page < pages - 1 ? "" : " disabled") + ">Next &rsaquo;</button></div></div>";
    root.innerHTML = h;
    G3.bindCommon(root, M);
    if (focus) { var inp = root.querySelector('[data-ui="' + focus + '"]'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } }
    G3.$("uloReset").onclick = function () { Object.assign(ui, { q: "", ci: "", acct: "", age: "", page: 0, open: {} }); M.render(); };
    root.querySelectorAll("[data-age]").forEach(function (b) { b.onclick = function () { var v = b.getAttribute("data-age"); ui.age = ui.age === v ? "" : v; ui.page = 0; M.render(); }; });
    root.querySelectorAll("tr.ulr").forEach(function (tr) { tr.onclick = function () { var i = tr.getAttribute("data-row"); ui.open[i] = !ui.open[i]; M.render(); }; });
    root.querySelectorAll("th[data-k]").forEach(function (th) { th.onclick = function () { var kk = th.getAttribute("data-k"); if (ui.sort === kk) ui.asc = !ui.asc; else { ui.sort = kk; ui.asc = ["type", "desc", "acctName", "order", "date"].indexOf(kk) >= 0; } M.render(); }; });
    root.querySelectorAll("[data-pg]").forEach(function (b) { b.onclick = function () { ui.page += +b.getAttribute("data-pg"); M.render(); }; });
    G3.$("uloCsv").onclick = function () { G3.csv([["FMZ number", "Commitment item", "Description", "Traveler", "Account", "DPC", "DPC description", "Posting date", "Days open", "Total", "Open", "Document Header Text", "Functional Area", "Reference", "Supplier"]].concat(rows.map(function (r) { return [r.fmz, r.type, r.desc, r.traveler, r.acctName, r.order, G3.dpcName(r.order), r.date, r.days, r.total.toFixed(2), r.open.toFixed(2), r.hdr, r.fa, r.ref, r.supplier]; })), "G3-Unliquidated.csv"); };
    var tys = Object.keys(G3.group(rows, "type")).sort();
    G3.chart("cUloAge", { type: "bar", data: { labels: M.BUCKETS.map(function (b) { return b[0] + " days"; }), datasets: tys.map(function (t) { return { label: t, data: M.BUCKETS.map(function (b, i) { return G3.sum(rows.filter(function (r) { return r.type === t && r.b === i; }), "open"); }), backgroundColor: M.typeCol(t), stack: "a" }; }) }, options: { scales: { x: { stacked: true, grid: { display: false } }, y: Object.assign({ stacked: true }, G3.axMoney) }, plugins: { tooltip: G3.tipMoney } } });
    var byA = Object.keys(G3.group(rows, "acctName")).map(function (a) { var rr = rows.filter(function (r) { return r.acctName === a; }); return { a: a, v: G3.sum(rr, "open"), o: G3.sum(rr.filter(function (r) { return r.days > 90; }), "open"), n: rr.length }; }).sort(function (x, y) { return y.v - x.v; });
    G3.chart("cUloAcct", { type: "bar", data: { labels: byA.map(function (x) { return x.a + " (" + x.n + ")"; }), datasets: [{ label: "Open 0\u201390 days", data: byA.map(function (x) { return x.v - x.o; }), backgroundColor: "#3b82f6", stack: "c", borderRadius: 4 }, { label: "Open over 90 days", data: byA.map(function (x) { return x.o; }), backgroundColor: "#f97316", stack: "c", borderRadius: 4 }] }, options: { indexAxis: "y", scales: { x: Object.assign({ stacked: true }, G3.axMoney), y: { stacked: true, grid: { display: false } } }, plugins: { tooltip: G3.tipMoney } } });
  };
})(window);
