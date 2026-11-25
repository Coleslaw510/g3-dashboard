/* IDT, AT, Schools and Mob: program views built around TDC and DPC (with descriptions), not copies of Status of Funds.
   Which accounts feed each tab: G3.PROGRAM_ACCOUNTS in loaders.js. */
(function (w) {
  var G3 = w.G3, C = G3.COLORS;
  var CFG = {
    idt: { title: "IDT (Drill)", icon: "i-idt", color: "#4f46e5" },
    at: { title: "Annual Training", icon: "i-at", color: "#16a34a" },
    sch: { title: "Schools", icon: "i-sch", color: "#9333ea" },
    mob: { title: "Mobilization", icon: "i-mob", color: "#be123c" }
  };
  G3.PROGRAMS = CFG;
  var TDCCOL = ["#4f46e5", "#0d9488", "#ea580c", "#9333ea", "#0284c7", "#be123c", "#65a30d", "#a16207"];

  function calc(id, fy) {
    var accts = (G3.data.accounts || []).filter(function (a) { return a.program === id; }).map(function (a) { return a.id; }), inP = function (x) { return accts.indexOf(x.account) >= 0; };
    var L = G3.lines(fy, inP), ex = L.filter(function (l) { return l.src === "export"; }), pfy = G3.priorFy(fy), hasPrior = G3.data.fys.indexOf(pfy) >= 0;
    var mon = G3.spendByFm(ex), prior = hasPrior ? G3.spendByFm(G3.lines(pfy, function (l) { return inP(l) && l.src === "export"; })) : null;
    var cur = G3.curFm(fy), frac = G3.mods.spend.monthFrac(fy, cur), plan = G3.planMonths(G3.plans(fy, inP)), fyPlan = G3.sum(plan, function (x) { return x; });
    var tdp = G3.sum(G3.funding(fy, inP), "tdp"), spent = 0, planTD = 0, priorTD = 0;
    for (var i = 0; i < cur; i++) { spent += mon[i]; planTD += plan[i] * (i === cur - 1 ? frac : 1); if (prior) priorTD += prior[i] * (i === cur - 1 ? frac : 1); }
    var dps = G3.dpcRollup(fy, inP), ulo = G3.mods.ulo.rows(inP), uloBy = {};
    ulo.forEach(function (u) { var k = G3.util.kn(u.order); uloBy[k] = (uloBy[k] || 0) + u.open; });
    dps.forEach(function (d) { d.ulo = uloBy[G3.util.kn(d.code)] || 0; });
    var tg = {}; dps.forEach(function (d) { var t = tg[d.tdc] || (tg[d.tdc] = { tdc: d.tdc, commit: 0, oblig: 0, total: 0, ulo: 0, dpcs: [] }); t.commit += d.commit; t.oblig += d.oblig; t.total += d.total; t.ulo += d.ulo; t.dpcs.push(d); });
    var tdcs = Object.keys(tg).map(function (k) { return tg[k]; }).sort(function (a, b) { return b.total - a.total; });
    return { id: id, c: CFG[id], accts: accts, fy: fy, mon: mon, prior: prior, pfy: pfy, hasPrior: hasPrior, cur: cur, frac: frac, plan: plan, fyPlan: fyPlan, tdp: tdp, spent: spent, planTD: planTD, priorTD: priorTD,
      commit: G3.sum(L, "commit"), oblig: G3.sum(ex, "oblig"), disb: G3.sum(ex, "disb"), dps: dps, tdcs: tdcs, dpcTotal: G3.sum(dps, "total"), ulo: ulo, uloOpen: G3.sum(ulo, "open") };
  }
  G3.programCalc = calc;

  function make(id) {
    var c = CFG[id], M = G3.mods[id] = { ui: { mode: "monthly", tdc: "" } };
    M.render = function () {
      var st = G3.state, ui = M.ui, fy = st.fy, root = G3.$("page-" + id), R = calc(id, fy), el = G3.fyElapsed(fy);
      if (ui.tdc && !R.tdcs.some(function (t) { return t.tdc === ui.tdc; })) ui.tdc = "";
      var h = G3.head(id, c.icon, c.title, G3.scope((R.accts.length ? R.accts.map(G3.esc).join(", ") : '<span class="warn">no account matched; see Data details</span>')));
      h += '<div class="filters">' + G3.fySel() + G3.pgSeg() + '<div class="segwrap"><span class="seglbl">Trend chart</span>' + G3.seg("mode", [["monthly", "Monthly"], ["cumulative", "Cumulative"]], ui.mode) + '</div><button class="btn" type="button" id="' + id + 'Reset">Reset</button></div>' + G3.pgNote();
      var pctT = R.tdp ? (R.spent + R.commit) / R.tdp : null, pc = G3.pace(R.tdp ? R.spent / R.tdp : null, el.frac), v = R.planTD ? (R.spent - R.planTD) / R.planTD : null, top = R.tdcs[0], yoy = R.priorTD ? (R.spent - R.priorTD) / R.priorTD : null;
      var u90 = R.ulo.filter(function (u) { return u.days > 90; });
      h += '<div class="kpis k6">' +
        G3.kpi("", "Executed FYTD", G3.money(R.spent), "Obligations + disbursements &middot; " + G3.pct(R.tdp ? R.spent / R.tdp : null, 0) + " of TDP", ' style="--st:' + c.color + '"') +
        G3.kpi("res", "Open commitments", G3.money(R.commit), "Upcoming spending (no date yet), from the commitments report") +
        G3.kpi("", "TDP used", G3.pct(pctT), "Incl. commitments &middot; TDP " + G3.money(R.tdp) + ' <span class="pill ' + pc.k + '" title="Pace uses obligations + disbursements only (commitments can be months out)">' + pc.t + "</span>", ' style="--st:#b08968"') +
        G3.kpi("", "vs spend plan", '<span class="vtxt ' + G3.varClass(v) + '">' + G3.varText(v) + "</span>", G3.money(R.spent) + " actual / " + G3.money(R.planTD) + " planned to date", ' style="--st:#0d9488"') +
        G3.kpi("", "Largest TDC", top ? '<span class="kt">' + G3.esc(top.tdc) + "</span>" : "\u2014", top ? G3.money(top.total) + " &middot; " + G3.pct(R.dpcTotal ? top.total / R.dpcTotal : null, 0) + " of DPC spending" : "No commitments report rows", ' style="--st:#7c3aed"') +
        G3.kpi(u90.length ? "warnv" : "", "Unliquidated open", G3.money(R.uloOpen), R.ulo.length + " lines &middot; " + G3.money(G3.sum(u90, "open")) + " over 90 days", ' style="--st:#d97706"') + "</div>";
      // TDC breakout
      var noDpc = fy !== (G3.data.wfy || G3.fyOf(G3.asOf()));
      h += '<div class="panel"><div class="tablehead"><h2>Breakout by TDC</h2><span class="muted small">Obligations + commitments by Internal Order from the commitments report, grouped by TDC from the DPC key &middot; click a TDC to see its DPCs</span></div>';
      if (noDpc || !R.tdcs.length) h += '<div class="nodata">' + (noDpc ? "The commitments report covers the working fiscal year (FY" + (G3.data.wfy || G3.fyOf(G3.asOf())) + "), so the TDC and DPC breakout shows there." : "No commitments report rows for this program yet.") + "</div>";
      else {
        h += '<div class="row dpcrow"><div class="chartbox tall"><canvas id="c' + id + 'Tdc"></canvas></div><div class="tablewrap"><table class="grid tdct"><thead><tr><th>TDC</th><th class="num">DPCs</th><th class="num">Obligations</th><th class="num">Commitments</th><th class="num">Total</th><th class="num">% of program</th><th class="num">Unliquidated</th></tr></thead><tbody>' +
          R.tdcs.map(function (t, i) { var sh = R.dpcTotal ? t.total / R.dpcTotal : 0; return '<tr class="tdcr' + (t.tdc === ui.tdc ? " sel" : "") + '" data-tdc="' + G3.esc(t.tdc) + '"><td><span class="tdcdot" style="background:' + TDCCOL[i % TDCCOL.length] + '"></span><strong>' + G3.esc(t.tdc) + '</strong></td><td class="num">' + t.dpcs.length + '</td><td class="num">' + G3.whole(t.oblig) + '</td><td class="num">' + G3.whole(t.commit) + '</td><td class="num"><strong>' + G3.whole(t.total) + '</strong></td><td class="num"><span class="xbar"><i style="width:' + (sh * 100).toFixed(0) + "%;background:" + TDCCOL[i % TDCCOL.length] + '"></i></span>' + G3.pct(sh, 0) + '</td><td class="num">' + G3.money(t.ulo) + "</td></tr>"; }).join("") +
          '</tbody><tfoot><tr><td>Program total</td><td class="num">' + R.dps.length + '</td><td class="num">' + G3.whole(G3.sum(R.dps, "oblig")) + '</td><td class="num">' + G3.whole(G3.sum(R.dps, "commit")) + '</td><td class="num">' + G3.whole(R.dpcTotal) + '</td><td class="num">100%</td><td class="num">' + G3.money(G3.sum(R.dps, "ulo")) + "</td></tr></tfoot></table></div></div>";
      }
      h += "</div>";
      // Spending by MSC (from the funds export UIC + Units tab)
      var mscR = (G3.data.hasUnits ? G3.unitRollup(fy, function (x) { return R.accts.indexOf(x.account) >= 0; }) : []).filter(function (o) { return o.total; }), mscT = G3.sum(mscR, "total");
      if (mscR.length) {
        h += '<div class="panel"><div class="tablehead"><h2>Spending by MSC</h2><span class="muted small">Obligations + disbursements from the funds export, rolled up from UIC through the unit hierarchy</span></div>' +
          '<div class="tablewrap"><table class="grid unit"><thead><tr><th>MSC</th><th class="num">Obligations</th><th class="num">Disbursements</th><th class="num">Total</th><th class="num">Share</th></tr></thead><tbody>' +
          mscR.map(function (o) { var sh = mscT ? o.total / mscT : 0; return "<tr><td><strong>" + G3.esc(o.name) + "</strong>" + (o.uic ? ' <span class="uic">' + G3.esc(o.uic) + "</span>" : "") + '</td><td class="num">' + G3.whole(o.oblig) + '</td><td class="num">' + G3.whole(o.disb) + '</td><td class="num"><strong>' + G3.whole(o.total) + '</strong></td><td class="num"><span class="xbar"><i style="width:' + (sh * 100).toFixed(0) + "%;background:" + c.color + '"></i></span>' + G3.pct(sh, 0) + "</td></tr>"; }).join("") +
          '</tbody><tfoot><tr><td>Program total</td><td class="num">' + G3.whole(G3.sum(mscR, "oblig")) + '</td><td class="num">' + G3.whole(G3.sum(mscR, "disb")) + '</td><td class="num">' + G3.whole(mscT) + '</td><td class="num">100%</td></tr></tfoot></table></div></div>';
      }
      // DPC detail
      if (!noDpc && R.dps.length) {
        var dl = R.dps.filter(function (d) { return !ui.tdc || d.tdc === ui.tdc; }), dsum = G3.sum(dl, "total");
        h += '<div class="panel"><div class="tablehead"><h2>DPC detail &middot; ' + (ui.tdc ? G3.esc(ui.tdc) : "all TDCs") + "</h2>" + (ui.tdc ? '<button class="btn sm" type="button" id="' + id + 'AllTdc">Show all TDCs</button>' : "") + '</div><div class="tablewrap"><table class="grid"><thead><tr><th>DPC</th><th>TDC</th><th class="num">Obligations</th><th class="num">Commitments</th><th class="num">Total</th><th class="num">Share</th><th class="num">Unliquidated open</th></tr></thead><tbody>' +
          dl.map(function (d) { var sh = dsum ? d.total / dsum : 0; return '<tr><td class="dsc"><strong>' + G3.esc(d.name) + '</strong> <span class="dpc">' + G3.esc(d.code) + "</span></td><td>" + G3.esc(d.tdc) + '</td><td class="num">' + G3.whole(d.oblig) + '</td><td class="num">' + G3.whole(d.commit) + '</td><td class="num"><strong>' + G3.whole(d.total) + '</strong></td><td class="num"><span class="xbar"><i style="width:' + (sh * 100).toFixed(0) + "%;background:" + c.color + '"></i></span>' + G3.pct(sh, 0) + '</td><td class="num">' + G3.whole(d.ulo) + "</td></tr>"; }).join("") + "</tbody></table></div></div>";
      }
      h += '<div class="row r2"><div class="panel"><div class="tablehead"><h2>' + (ui.mode === "cumulative" ? "Cumulative execution vs spend plan" : "Monthly execution vs spend plan") + '</h2></div><div class="chartbox"><canvas id="c' + id + 'Main"></canvas></div><p class="hint">Obligations + disbursements from the funds export by fiscal month' + (R.hasPrior ? "; grey = FY" + R.pfy : "") + "; dashed = spend plan. Commitments have no date yet, so they sit in the Upcoming column.</p></div>" +
        '<div class="panel"><h2>Top DPCs</h2><div class="chartbox"><canvas id="c' + id + 'Top"></canvas></div><p class="hint">Largest DPCs by obligations + commitments, shown by description.</p></div></div>';
      var old = R.ulo.slice().sort(function (a, b) { return b.days - a.days; }).slice(0, 8);
      h += '<div class="row r2"><div class="panel"><h2>DPC spending by pay group</h2><div class="chartbox"><canvas id="c' + id + 'Pg"></canvas></div><p class="hint">Commitments + obligations from the commitments report, by Pay Group (or the first 5 digits of Functional Area).</p></div>' +
        '<div class="panel"><div class="tablehead"><h2>Oldest open unliquidated</h2><button class="btn sm" type="button" id="' + id + 'Ulo">Open in Unliquidated</button></div><div class="tablewrap"><table class="grid ulo"><thead><tr><th>Item</th><th>Description</th><th>DPC</th><th class="num">Days</th><th class="num">Open</th></tr></thead><tbody>' +
        old.map(function (u) { return "<tr" + (u.days > 180 ? ' class="red"' : u.days > 90 ? ' class="amber"' : "") + '><td>' + G3.ciPill(u.type) + '</td><td class="wrapc">' + G3.esc(u.desc) + '</td><td class="wrapc small">' + G3.esc(G3.dpcName(u.order) || u.order) + '</td><td class="num"><span class="agepill" style="--bc:' + G3.mods.ulo.BCOL[u.b] + '">' + u.days + 'd</span></td><td class="num"><strong>' + G3.whole(u.open) + "</strong></td></tr>"; }).join("") + (old.length ? "" : '<tr><td colspan="5" class="muted">Nothing open.</td></tr>') + "</tbody></table></div></div></div>";
      root.innerHTML = h;
      G3.bindCommon(root, M);
      G3.$(id + "Reset").onclick = function () { ui.mode = "monthly"; ui.tdc = ""; G3.state.pg = "All"; G3.refresh(); };
      root.querySelectorAll("tr.tdcr").forEach(function (tr) { tr.onclick = function () { var t = tr.getAttribute("data-tdc"); ui.tdc = ui.tdc === t ? "" : t; M.render(); }; });
      var all = G3.$(id + "AllTdc"); if (all) all.onclick = function () { ui.tdc = ""; M.render(); };
      G3.$(id + "Ulo").onclick = function () { G3.mods.ulo.ui.page = 0; G3.go("ulo"); };
      // charts
      if (!noDpc && R.tdcs.length) G3.chart("c" + id + "Tdc", { type: "bar", data: { labels: R.tdcs.map(function (t) { return t.tdc; }), datasets: [{ label: "Obligations", data: R.tdcs.map(function (t) { return t.oblig; }), backgroundColor: R.tdcs.map(function (t, i) { return TDCCOL[i % TDCCOL.length]; }), stack: "t", borderRadius: 4 }, { label: "Commitments", data: R.tdcs.map(function (t) { return t.commit; }), backgroundColor: R.tdcs.map(function (t, i) { return TDCCOL[i % TDCCOL.length] + "66"; }), stack: "t", borderRadius: 4 }] },
        options: { indexAxis: "y", onClick: function (e, el2) { if (el2.length) { var t = R.tdcs[el2[0].index].tdc; ui.tdc = ui.tdc === t ? "" : t; M.render(); } }, scales: { x: Object.assign({ stacked: true }, G3.axMoney), y: { stacked: true, grid: { display: false }, ticks: { autoSkip: false } } }, plugins: { tooltip: G3.tipMoney, legend: { labels: { generateLabels: function () { return [{ text: "Obligations (solid)", fillStyle: "#64748b", strokeStyle: "#64748b", pointStyle: "circle" }, { text: "Commitments (light)", fillStyle: "#cbd5e1", strokeStyle: "#cbd5e1", pointStyle: "circle" }]; } } } } } });
      var cumu = ui.mode === "cumulative", show = function (a) { return a.map(function (x, i) { return i < R.cur ? x : null; }); };
      var ds = [{ type: cumu ? "line" : "bar", label: "FY" + fy + " executed", data: show(cumu ? G3.cum(R.mon) : R.mon), backgroundColor: cumu ? c.color + "22" : c.color, borderColor: c.color, fill: cumu, borderRadius: 5, pointRadius: 3, order: 2 },
        { type: "line", label: "Spend plan", data: cumu ? G3.cum(R.plan) : R.plan, borderColor: "#0d9488", borderDash: [6, 4], pointRadius: 0, tension: .3, order: 1 }];
      if (R.hasPrior) ds.push({ type: "line", label: "FY" + R.pfy, data: cumu ? G3.cum(R.prior) : R.prior, borderColor: "#94a3b8", pointRadius: 0, tension: .3, order: 1 });
      ds.forEach(function (d) { d.data = d.data.concat([null]); });
      if (R.commit) ds.push({ type: "bar", label: cumu ? "Executed + upcoming commitments" : "Upcoming commitments (no date)", data: G3.MONTHS.map(function () { return null; }).concat([cumu ? R.spent + R.commit : R.commit]), backgroundColor: G3.COLORS.commit, borderRadius: 5, order: 3 });
      if (cumu && R.tdp) ds.push({ type: "line", label: "TDP", data: G3.MONTHS.map(function () { return R.tdp; }).concat([R.tdp]), borderColor: "#b08968", borderDash: [8, 4], pointRadius: 0 });
      G3.chart("c" + id + "Main", { type: "bar", data: { labels: G3.MONTHS.map(function (m, i) { return G3.monthLabel(fy, i + 1); }).concat(["Upcoming"]), datasets: ds }, options: { interaction: { mode: "index", intersect: false }, scales: { y: G3.axMoney, x: { grid: { display: false } } }, plugins: { tooltip: G3.tipMoney } } });
      var tp = R.dps.slice(0, 10);
      G3.chart("c" + id + "Top", { type: "bar", data: { labels: tp.map(function (d) { return d.name.length > 30 ? d.name.slice(0, 29) + "\u2026" : d.name; }), datasets: [{ label: "Obligations", data: tp.map(function (d) { return d.oblig; }), backgroundColor: C.oblig, stack: "d" }, { label: "Commitments", data: tp.map(function (d) { return d.commit; }), backgroundColor: C.commit, stack: "d" }] }, options: { indexAxis: "y", scales: { x: Object.assign({ stacked: true }, G3.axMoney), y: { stacked: true, grid: { display: false }, ticks: { autoSkip: false, font: { size: 10.5 } } } }, plugins: { tooltip: G3.tipMoney } } });
      var pgs = G3.PAYGROUPS.filter(function (p) { return G3.state.pg === "All" || p === G3.state.pg; }).concat(G3.state.pg === "All" ? [""] : []), dlp = G3.data.dpcLines.filter(function (x) { return R.accts.indexOf(x.account) >= 0 && fy === (G3.data.wfy || G3.fyOf(G3.asOf())); });
      var pgv = pgs.map(function (p) { return G3.sum(dlp.filter(function (x) { return x.pg === p; }), "amt"); });
      G3.chart("c" + id + "Pg", { type: "doughnut", data: { labels: pgs.map(function (p, i) { return (p ? "PG " + p : "No PG (131\u2026)") + "  " + G3.money(pgv[i]); }), datasets: [{ data: pgv, backgroundColor: pgs.map(function (p) { return p ? G3.pgCol(p) : "#94a3b8"; }), borderWidth: 2, borderColor: "#fff" }] }, options: { cutout: "62%", plugins: { legend: { position: "right" }, tooltip: { callbacks: { label: function (x) { return " " + G3.whole(x.raw); } } } } } });
    };
  }
  ["idt", "at", "sch", "mob"].forEach(make);
})(window);
