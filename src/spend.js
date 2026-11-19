/* Spend Plans: planned vs actual (obligations + disbursements) by fiscal month, per G3 account. */
(function (w) {
  var G3 = w.G3;
  var M = G3.mods.spend = { ui: { acct: "", mode: "monthly" } };
  // share of the current fiscal month that has elapsed (planned-to-date prorates it)
  // Aviation/G1 rule: to-date figures run through the latest month that has actuals, whole months (no proration)
  M.monthFrac = function () { return 1; };
  M.calc = function (fy, acctFilter) {
    var cur = G3.curFm(fy), frac = M.monthFrac(fy, cur);
    var accts = G3.data.accounts.filter(function (a) { return !acctFilter || a.id === acctFilter; }).map(function (a) {
      var p = G3.planMonths(G3.plans(fy, function (r) { return r.account === a.id; })), act = G3.spendByFm(G3.lines(fy, function (l) { return l.account === a.id; }));
      var pTD = 0, aTD = 0; for (var i = 0; i < cur; i++) { pTD += p[i] * (i === cur - 1 ? frac : 1); aTD += act[i]; }
      return { a: a, p: p, act: act, pTD: pTD, aTD: aTD, v: pTD ? (aTD - pTD) / pTD : null, fyPlan: G3.sum(p, function (x) { return x; }) };
    });
    var tot = { p: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], act: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], pTD: 0, aTD: 0, fyPlan: 0 };
    accts.forEach(function (r) { for (var i = 0; i < 12; i++) { tot.p[i] += r.p[i]; tot.act[i] += r.act[i]; } tot.pTD += r.pTD; tot.aTD += r.aTD; tot.fyPlan += r.fyPlan; });
    tot.v = tot.pTD ? (tot.aTD - tot.pTD) / tot.pTD : null;
    return { cur: cur, frac: frac, accts: accts, tot: tot };
  };
  M.render = function () {
    var st = G3.state, ui = M.ui, fy = st.fy, root = G3.$("page-spend");
    var R = M.calc(fy, ui.acct), cur = R.cur, tot = R.tot, off = R.accts.filter(function (r) { return G3.varClass(r.v) !== "g" && r.v != null; });
    var vk = G3.varClass(tot.v), stc = { g: "#16a34a", y: "#eab308", r: "#dc2626", na: "#94a3b8" };
    var h = G3.head("plan", "i-plan", "Spend Plans", G3.scope((ui.acct ? G3.esc(G3.acct(ui.acct).name) : "All accounts") + " &middot; actuals through " + (cur ? G3.MONTHS[cur - 1] + " (month " + cur + ")" : "\u2014")));
    h += '<div class="filters">' + G3.fySel() + '<label class="grow">Account<select data-ui="acct"><option value="">All accounts</option>' + G3.data.accounts.map(function (a) { return '<option value="' + a.id + '"' + (a.id === ui.acct ? " selected" : "") + ">" + G3.esc(a.name) + "</option>"; }).join("") + "</select></label>" + G3.pgSeg() +
      '<div class="segwrap"><span class="seglbl">View</span>' + G3.seg("mode", [["monthly", "Monthly"], ["cumulative", "Cumulative"]], ui.mode) + '</div><button class="btn" type="button" id="spReset">Reset</button></div>' + G3.pgNote();
    h += '<div class="kpis k4">' +
      G3.kpi("", "Planned to date", G3.money(tot.pTD), (cur ? "Oct\u2013" + G3.MONTHS[cur - 1] + (R.frac < 1 ? " (" + G3.MONTHS[cur - 1] + " prorated)" : "") : "No actuals") + " &middot; year plan " + G3.money(tot.fyPlan), ' style="--st:#94a3b8"') +
      G3.kpi("", "Actual to date", G3.money(tot.aTD), "Obligations + disbursements", ' style="--st:#2563eb"') +
      G3.kpi("", "Variance to date", '<span class="vtxt ' + vk + '">' + G3.varText(tot.v) + "</span>", G3.money(Math.abs(tot.aTD - tot.pTD)) + (tot.aTD >= tot.pTD ? " over" : " under") + " plan", ' style="--st:' + stc[vk] + '"') +
      G3.kpi("", "Accounts off plan", off.length + ' <span class="of">of ' + R.accts.length + "</span>", "Outside \u00b15% to date &middot; " + off.filter(function (r) { return G3.varClass(r.v) === "y"; }).length + " yellow, " + off.filter(function (r) { return G3.varClass(r.v) === "r"; }).length + " red", ' style="--st:' + (off.length ? "#dc2626" : "#16a34a") + '"') + "</div>";
    h += '<div class="panel"><div class="tablehead"><h2>Planned vs actual by month &middot; ' + (ui.acct ? G3.esc(G3.acct(ui.acct).name) : "All accounts") + '</h2><span class="vlegend"><span class="vchip g">\u00b15%</span><span class="vchip y">5\u201310%</span><span class="vchip r">&gt;10%</span></span></div><div class="chartbox tall"><canvas id="cSpend"></canvas></div><p class="hint">Actual = obligations + disbursements from the execution lines, colored by its variance from plan. ' + (R.frac < 1 ? G3.MONTHS[cur - 1] + " plan is prorated to the as-of date. " : "") + (ui.mode === "cumulative" ? "Cumulative from October." : "Each month on its own.") + "</p></div>";
    // grid
    function cell(p, a, show, isCur) {
      var pp = isCur ? p * R.frac : p, v = pp ? (a - pp) / pp : null;
      if (!show) return '<td class="vc fut"><div class="pa"><span>P</span>' + G3.money(p) + '</div><div class="pa"><span>A</span>\u2014</div><span class="vchip none">&nbsp;</span></td>';
      return '<td class="vc ' + G3.varClass(v) + '"><div class="pa"><span>P</span>' + G3.money(pp) + '</div><div class="pa"><span>A</span>' + G3.money(a) + "</div>" + G3.chip(v) + "</td>";
    }
    function rowH(name, r, cls) {
      var s = '<tr class="' + (cls || "") + '"><td class="an">' + name + "</td>";
      for (var i = 0; i < 12; i++) s += cell(r.p[i], r.act[i], i < cur, i === cur - 1 && R.frac < 1);
      return s + '<td class="vc td ' + G3.varClass(r.v) + '"><div class="pa"><span>P</span>' + G3.money(r.pTD) + '</div><div class="pa"><span>A</span>' + G3.money(r.aTD) + "</div>" + G3.chip(r.v) + '</td><td class="num fyp">' + G3.money(r.fyPlan) + "</td></tr>";
    }
    h += '<div class="panel"><div class="tablehead"><h2>Accounts by month</h2></div><p class="muted small">P = planned, A = actual (obligations + disbursements). Chips show variance: green within \u00b15%, yellow 5\u201310%, red over 10%. ' + (R.frac < 1 ? G3.MONTHS[cur - 1] + " plan is prorated to the as-of date. " : "") + "Click an account to filter.</p>" +
      '<div class="tablewrap"><table class="grid spgrid"><thead><tr><th>Account</th>' + G3.MONTHS.map(function (m, i) { return '<th class="num' + (i >= cur ? " fut" : "") + '">' + m + "<small>" + (i + 1) + "</small></th>"; }).join("") + '<th class="num">To date</th><th class="num">FY plan</th></tr></thead><tbody>' +
      R.accts.map(function (r) { return rowH('<button class="alink" type="button" data-acct="' + r.a.id + '">' + G3.esc(r.a.name) + "</button>", r, r.a.id === ui.acct ? "sel" : ""); }).join("") +
      "</tbody><tfoot>" + rowH("<strong>" + (ui.acct ? "Selected" : "All accounts") + "</strong>", tot) + "</tfoot></table></div></div>";
    root.innerHTML = h;
    G3.bindCommon(root, M);
    G3.$("spReset").onclick = function () { ui.acct = ""; ui.mode = "monthly"; G3.state.pg = "All"; G3.refresh(); };
    root.querySelectorAll("[data-acct]").forEach(function (b) { b.onclick = function () { var k = b.getAttribute("data-acct"); ui.acct = ui.acct === k ? "" : k; M.render(); }; });
    var pAdj = tot.p.map(function (v, i) { return i === cur - 1 ? v * R.frac : v; }), cumu = ui.mode === "cumulative", P = cumu ? G3.cum(pAdj) : pAdj, A = cumu ? G3.cum(tot.act) : tot.act;
    var Aplot = A.map(function (v, i) { return i < cur ? v : null; });
    var col = A.map(function (v, i) { if (i >= cur) return "#cbd5e1"; var pp = P[i]; return stc[G3.varClass(pp ? (v - pp) / pp : null)]; });
    G3.chart("cSpend", { type: "bar", data: { labels: G3.MONTHS.map(function (m, i) { return m + " (" + (i + 1) + ")"; }), datasets: [{ label: "Planned", data: P, backgroundColor: "#cbd5e1", borderRadius: 4 }, { label: "Actual, colored by variance", data: Aplot, backgroundColor: col, borderRadius: 4 }] }, options: { scales: { y: G3.axMoney, x: { grid: { display: false } } }, plugins: { tooltip: G3.tipMoney, legend: { labels: { generateLabels: function () { return [{ text: "Planned", fillStyle: "#cbd5e1", strokeStyle: "#cbd5e1", pointStyle: "circle" }, { text: "Actual, colored by variance", fillStyle: "#2563eb", strokeStyle: "#2563eb", pointStyle: "circle" }]; } } } } } });
  };
})(window);
