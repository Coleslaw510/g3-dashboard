/* IDT, AT, Schools and Mob pages: one layout, four programs. Spend = obligations + disbursements. */
(function (w) {
  var G3 = w.G3;
  var CFG = {
    idt: { acct: "IDT", title: "IDT (Drill)", icon: "i-idt", color: "#4f46e5", qty: "Man-days", qtyShort: "man-days", per: "$ / man-day", breakout: "dpc", lead: "Inactive duty training: drill weekends, additional and readiness assemblies, IDT travel." },
    at: { acct: "AT", title: "Annual Training", icon: "i-at", color: "#16a34a", qty: "Man-days", qtyShort: "man-days", per: "$ / man-day", breakout: "dpc", lead: "Annual training periods: unit collective, individual, travel and subsistence." },
    sch: { acct: "SCH", title: "Schools", icon: "i-sch", color: "#9333ea", qty: "Soldiers", qtyShort: "soldiers", per: "$ / soldier", breakout: "school", lead: "Soldiers attending schools: NCO PME, accessions, MOS-T and skill schools." },
    mob: { acct: "MOB", title: "Mobilization", icon: "i-mob", color: "#be123c", qty: "Man-days", qtyShort: "man-days", per: "$ / man-day", breakout: "dpc", lead: "Pre-mobilization training, SRP, mob station travel, demob and reintegration." }
  };
  G3.PROGRAMS = CFG;

  function calc(id, fy, ui) {
    var c = CFG[id], ui2 = ui || {};
    var f = function (l) { return l.account === c.acct && (!ui2.unit || l.unit === ui2.unit) && (!ui2.school || l.school === ui2.school); };
    var L = G3.lines(fy, f), pfy = G3.priorFy(fy), hasPrior = G3.data.fys.indexOf(pfy) >= 0, LP = hasPrior ? G3.lines(pfy, f) : [];
    var mon = G3.spendByFm(L), prior = hasPrior ? G3.spendByFm(LP) : null, cur = G3.curFm(fy), frac = G3.mods.spend.monthFrac(fy, cur);
    var plan = G3.planMonths(G3.plans(fy, function (p) { return p.account === c.acct; })), fyPlan = G3.sum(plan, function (x) { return x; });
    var tdp = G3.sum(G3.funding(fy, function (x) { return x.account === c.acct; }), "tdp");
    var spent = 0, planTD = 0, priorTD = 0; for (var i = 0; i < cur; i++) { spent += mon[i]; planTD += plan[i] * (i === cur - 1 ? frac : 1); if (prior) priorTD += prior[i] * (i === cur - 1 ? frac : 1); }
    var filtered = !!(ui2.unit || ui2.school), ratio = planTD ? spent / planTD : null;
    var proj = ratio != null && !filtered ? spent + plan.slice(cur).reduce(function (s, v) { return s + v * ratio; }, 0) + plan[cur - 1] * (1 - frac) * ratio : null;
    return { c: c, L: L, LP: LP, mon: mon, prior: prior, cur: cur, frac: frac, plan: plan, fyPlan: fyPlan, tdp: tdp, spent: spent, planTD: planTD, priorTD: priorTD, proj: proj, ratio: ratio, filtered: filtered,
      oblig: G3.sum(L, "oblig"), disb: G3.sum(L, "disb"), commit: G3.sum(L, "commit"), qty: G3.sum(L, "qty"), pfy: pfy, hasPrior: hasPrior };
  }
  G3.programCalc = calc;

  function make(id) {
    var c = CFG[id], M = G3.mods[id] = { ui: { unit: "", school: "", mode: "monthly" } };
    M.render = function () {
      var st = G3.state, ui = M.ui, fy = st.fy, root = G3.$("page-" + id), R = calc(id, fy, ui), el = G3.fyElapsed(fy);
      var units = Object.keys(G3.group(G3.data.lines.filter(function (l) { return l.account === c.acct && l.unit; }), "unit")).sort();
      var h = G3.head(id, c.icon, c.title, G3.scope((ui.unit ? G3.esc(ui.unit) : "All units") + (ui.school ? " &middot; " + G3.esc(ui.school) : "") + " &middot; spend through " + (R.cur ? G3.MONTHS[R.cur - 1] : "\u2014")));
      h += '<div class="filters">' + G3.fySel() + G3.pgSeg() + '<label>Unit<select data-ui="unit"><option value="">All units</option>' + units.map(function (u) { return "<option" + (u === ui.unit ? " selected" : "") + ">" + G3.esc(u) + "</option>"; }).join("") + "</select></label>" +
        (id === "sch" ? '<label>School<select data-ui="school"><option value="">All schools</option>' + G3.data.schools.map(function (s) { return "<option" + (s.name === ui.school ? " selected" : "") + ">" + s.name + "</option>"; }).join("") + "</select></label>" : "") +
        '<div class="segwrap"><span class="seglbl">Chart</span>' + G3.seg("mode", [["monthly", "Monthly"], ["cumulative", "Cumulative"]], ui.mode) + '</div><button class="btn" type="button" id="' + id + 'Reset">Reset</button></div>';
      var pctT = R.tdp ? R.spent / R.tdp : null, pc = G3.pace(pctT, el.frac), lastM = R.cur ? R.mon[R.cur - 1] : 0, prevM = R.cur > 1 ? R.mon[R.cur - 2] : (R.prior ? R.prior[11] : null);
      var yoy = R.priorTD ? (R.spent - R.priorTD) / R.priorTD : null;
      h += '<div class="kpis k6">' +
        G3.kpi("", "Spent FYTD", G3.money(R.spent), "Obligations " + G3.money(R.oblig) + " &middot; disbursed " + G3.money(R.disb), ' style="--st:' + c.color + '"') +
        G3.kpi("", "% of TDP", G3.pct(pctT), "TDP " + G3.money(R.tdp) + (R.filtered ? "" : ' <span class="pill ' + pc.k + '">' + pc.t + "</span>"), ' style="--st:#b08968"') +
        G3.kpi("", R.cur ? G3.MONTHS[R.cur - 1] + (R.frac < 1 ? " to date" : "") : "Latest month", G3.money(lastM), prevM != null ? (R.cur > 1 ? G3.MONTHS[R.cur - 2] : "Prior Sep") + " " + G3.money(prevM) + (R.frac < 1 ? " &middot; month " + G3.pct(R.frac, 0) + " elapsed" : "") : "&nbsp;", ' style="--st:#64748b"') +
        G3.kpi("", c.qty + " FYTD", G3.num(R.qty), (R.qty ? G3.money(R.spent / R.qty) : "\u2014") + " " + c.per.replace("$ ", ""), ' style="--st:#0ea5e9"') +
        G3.kpi("", "Projected year-end", R.proj != null ? G3.money(R.proj) : "\u2014", R.proj != null ? (R.proj > R.tdp ? '<span class="vtxt r">' + G3.money(R.proj - R.tdp) + " over TDP</span>" : G3.money(R.tdp - R.proj) + " under TDP") + " &middot; run rate vs plan" : R.filtered ? "Clear unit/school filter to project" : "No plan", ' style="--st:' + (R.proj > R.tdp ? "#dc2626" : "#16a34a") + '"') +
        G3.kpi("", "vs FY" + R.pfy + " same point", yoy != null ? '<span class="vtxt ' + (Math.abs(yoy) <= .05 ? "g" : yoy > 0 ? "r" : "y") + '">' + G3.varText(yoy) + "</span>" : "\u2014", R.hasPrior ? "FY" + R.pfy + " through " + G3.MONTHS[Math.max(0, R.cur - 1)] + ": " + G3.money(R.priorTD) : "No prior year loaded", ' style="--st:#94a3b8"') + "</div>";
      h += '<div class="panel"><div class="tablehead"><h2>' + (ui.mode === "cumulative" ? "Cumulative spend vs plan, prior year and TDP" : "Monthly spend, plan and trend") + '</h2><span class="muted small">FY' + fy + " &middot; " + G3.esc(c.title) + "</span></div><div class=\"chartbox tall\"><canvas id=\"c" + id + 'Main"></canvas></div><p class="hint">Bars = obligations + disbursements by fiscal month. Dashed = spend plan' + (R.filtered ? " (whole account)" : "") + "; grey = FY" + R.pfy + "; dotted = projection at the current run rate vs plan" + (ui.mode === "monthly" ? "; trend = 3-month moving average (from month 3)" : "") + ".</p></div>";
      var bTitle = c.breakout === "school" ? "By school" : "By DPC (duty purpose code)";
      h += '<div class="row r3"><div class="panel"><h2>By pay group</h2><div class="chartbox"><canvas id="c' + id + 'Pg"></canvas></div></div><div class="panel"><h2>By unit</h2><div class="chartbox"><canvas id="c' + id + 'Unit"></canvas></div></div><div class="panel"><h2>' + bTitle + '</h2><div class="chartbox"><canvas id="c' + id + 'Brk"></canvas></div></div></div>';
      // breakout table
      var bkey = c.breakout === "school" ? "school" : "dpc", grp = G3.group(R.L, bkey), keys;
      if (bkey === "school") keys = G3.data.schools.map(function (s) { return s.name; }).filter(function (k) { return grp[k]; });
      else keys = G3.data.dpcs.filter(function (d) { return d.account === c.acct; }).map(function (d) { return d.code; }).filter(function (k) { return grp[k]; });
      var brk = keys.map(function (k) { var rr = grp[k]; return { k: k, spent: G3.sum(rr, function (l) { return l.oblig + l.disb; }), commit: G3.sum(rr, "commit"), qty: G3.sum(rr, "qty"), n: rr.length }; }).sort(function (a, b) { return b.spent - a.spent; });
      h += '<div class="panel"><div class="tablehead"><h2>' + (bkey === "school" ? "School breakout" : "DPC breakout") + '</h2><span class="muted small">Committed = orders/travel committed but not yet obligated (upcoming)</span></div><div class="tablewrap"><table class="grid"><thead><tr>' +
        (bkey === "school" ? "<th>School</th><th>Category</th>" : "<th>DPC</th><th>Description</th>") + '<th class="num">Spent FYTD</th><th class="num">Share</th><th class="num">' + c.qty + '</th><th class="num">' + c.per + '</th><th class="num">Committed (upcoming)</th></tr></thead><tbody>' +
        brk.map(function (b) {
          var share = R.spent ? b.spent / R.spent : 0, cat = "";
          if (bkey === "school") { var s = G3.data.schools.filter(function (x) { return x.name === b.k; })[0]; cat = s ? G3.dpcName(s.dpc, "SCH").replace(/\s*\(.*\)$/, "") : ""; }
          return "<tr><td>" + (bkey === "school" ? "<strong>" + G3.esc(b.k) + "</strong>" : '<span class="dpc">' + b.k + "</span>") + '</td><td class="wrapc">' + G3.esc(bkey === "school" ? cat : G3.dpcName(b.k, c.acct)) + '</td><td class="num"><strong>' + G3.whole(b.spent) + '</strong></td><td class="num"><span class="xbar"><i style="width:' + (share * 100).toFixed(0) + "%;background:" + c.color + '"></i></span>' + G3.pct(share, 0) + '</td><td class="num">' + G3.num(b.qty) + '</td><td class="num">' + (b.qty ? G3.whole(b.spent / b.qty) : "\u2014") + '</td><td class="num">' + G3.whole(b.commit) + "</td></tr>";
        }).join("") + '</tbody><tfoot><tr><td colspan="2">Total</td><td class="num">' + G3.whole(R.spent) + '</td><td class="num">100%</td><td class="num">' + G3.num(R.qty) + '</td><td class="num">' + (R.qty ? G3.whole(R.spent / R.qty) : "\u2014") + '</td><td class="num">' + G3.whole(R.commit) + "</td></tr></tfoot></table></div></div>";
      // monthly table
      var cumA = 0, cumP = 0;
      h += '<div class="panel"><div class="tablehead"><h2>By month</h2></div><div class="tablewrap"><table class="grid"><thead><tr><th>Month</th><th class="num">Spent</th><th class="num">Plan</th><th class="num">Variance</th><th class="num">Cumulative spent</th><th class="num">Cumulative plan</th>' + (R.hasPrior ? '<th class="num">FY' + R.pfy + "</th>" : "") + '<th class="num">' + c.qty + "</th></tr></thead><tbody>" +
        G3.MONTHS.map(function (m, i) {
          var show = i < R.cur, pp = R.plan[i] * (i === R.cur - 1 ? R.frac : 1); cumP += show ? pp : R.plan[i]; if (show) cumA += R.mon[i];
          var q = G3.sum(R.L.filter(function (l) { return l.fm === i + 1; }), "qty");
          return '<tr class="' + (show ? "" : "futr") + '"><td>' + G3.monthLabel(fy, i + 1) + (i === R.cur - 1 && R.frac < 1 ? ' <span class="muted small">(to date)</span>' : "") + '</td><td class="num">' + (show ? G3.whole(R.mon[i]) : "\u2014") + '</td><td class="num">' + G3.whole(show ? pp : R.plan[i]) + '</td><td class="num">' + (show ? G3.chip(pp ? (R.mon[i] - pp) / pp : null) : "") + '</td><td class="num">' + (show ? G3.whole(cumA) : "\u2014") + '</td><td class="num">' + G3.whole(cumP) + "</td>" + (R.hasPrior ? '<td class="num muted">' + G3.whole(R.prior[i]) + "</td>" : "") + '<td class="num">' + (show ? G3.num(q) : "\u2014") + "</td></tr>";
        }).join("") + "</tbody></table></div></div>";
      root.innerHTML = h;
      G3.bindCommon(root, M);
      G3.$(id + "Reset").onclick = function () { ui.unit = ""; ui.school = ""; ui.mode = "monthly"; G3.state.pg = "All"; G3.refresh(); };
      // ---- charts ----
      var cumu = ui.mode === "cumulative", show = function (a) { return a.map(function (v, i) { return i < R.cur ? v : null; }); };
      var projM = R.plan.map(function (p, i) { if (R.ratio == null || R.filtered) return null; if (i === R.cur - 1) return R.mon[i] + p * (1 - R.frac) * R.ratio; return i >= R.cur ? p * R.ratio : null; });
      var ds;
      if (!cumu) {
        var ma = R.mon.map(function (v, i) { if (i >= R.cur || i < 2) return null; var s = 0, n = 0; for (var j = Math.max(0, i - 2); j <= i; j++) { s += R.mon[j]; n++; } return s / n; });
        ds = [{ type: "bar", label: "FY" + fy + " spend", data: show(R.mon), backgroundColor: c.color, borderRadius: 5, order: 3 },
          { type: "line", label: "Spend plan", data: R.plan, borderColor: "#0d9488", borderDash: [6, 4], pointRadius: 0, tension: .3, order: 1 },
          { type: "line", label: "Projection", data: projM, borderColor: c.color, borderDash: [2, 3], pointRadius: 2, tension: .3, order: 1 },
          { type: "line", label: "3-mo trend", data: ma, borderColor: "#0f172a", borderWidth: 1.5, pointRadius: 2, tension: .35, order: 0 }];
        if (R.hasPrior) ds.splice(1, 0, { type: "line", label: "FY" + R.pfy, data: R.prior, borderColor: "#94a3b8", backgroundColor: "#94a3b822", pointRadius: 0, tension: .3, fill: true, order: 2 });
      } else {
        var cA = G3.cum(R.mon), cProj = G3.MONTHS.map(function () { return null; });
        if (R.ratio != null && !R.filtered && R.cur >= 1) { var run = R.cur >= 2 ? cA[R.cur - 2] : 0; if (R.cur >= 2) cProj[R.cur - 2] = run; for (var i = R.cur - 1; i < 12; i++) { run += projM[i]; cProj[i] = run; } }
        ds = [{ type: "line", label: "FY" + fy + " cumulative", data: show(cA), borderColor: c.color, backgroundColor: c.color + "22", fill: true, pointRadius: 3, tension: .25 },
          { type: "line", label: "Spend plan", data: G3.cum(R.plan), borderColor: "#0d9488", borderDash: [6, 4], pointRadius: 0, tension: .25 },
          { type: "line", label: "Projection", data: cProj, borderColor: c.color, borderDash: [2, 3], pointRadius: 2, tension: .25 },
          { type: "line", label: "TDP", data: G3.MONTHS.map(function () { return R.tdp; }), borderColor: "#b08968", borderDash: [8, 4], pointRadius: 0 }];
        if (R.hasPrior) ds.splice(1, 0, { type: "line", label: "FY" + R.pfy + " cumulative", data: G3.cum(R.prior), borderColor: "#94a3b8", pointRadius: 0, tension: .25 });
      }
      G3.chart("c" + id + "Main", { type: "bar", data: { labels: G3.MONTHS.map(function (m, i) { return G3.monthLabel(fy, i + 1); }), datasets: ds }, options: { interaction: { mode: "index", intersect: false }, scales: { y: G3.axMoney, x: { grid: { display: false } } }, plugins: { tooltip: G3.tipMoney } } });
      var pgs = G3.PAYGROUPS.filter(G3.pgOk), pgv = pgs.map(function (p) { return G3.sum(R.L.filter(function (l) { return l.pg === p; }), function (l) { return l.oblig + l.disb; }); });
      G3.chart("c" + id + "Pg", { type: "doughnut", data: { labels: pgs.map(function (p, i) { return "PG " + p + "  " + G3.money(pgv[i]); }), datasets: [{ data: pgv, backgroundColor: pgs.map(function (p) { return G3.PGCOL[p]; }), borderWidth: 2, borderColor: "#fff" }] }, options: { cutout: "62%", plugins: { legend: { position: "right" }, tooltip: { callbacks: { label: function (x) { return " " + G3.whole(x.raw); } } } } } });
      var ug = G3.group(R.L, "unit"), uk = Object.keys(ug).map(function (u) { return { u: u, v: G3.sum(ug[u], function (l) { return l.oblig + l.disb; }) }; }).sort(function (a, b) { return b.v - a.v; });
      G3.chart("c" + id + "Unit", { type: "bar", data: { labels: uk.map(function (x) { return x.u; }), datasets: [{ label: "Spent", data: uk.map(function (x) { return x.v; }), backgroundColor: c.color + "cc", borderRadius: 4 }] }, options: { indexAxis: "y", scales: { x: G3.axMoney, y: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: G3.tipMoney } } });
      G3.chart("c" + id + "Brk", { type: "bar", data: { labels: brk.map(function (b) { return bkey === "school" ? b.k : b.k + " " + G3.dpcName(b.k, c.acct).slice(0, 18); }), datasets: [{ label: "Spent", data: brk.map(function (b) { return b.spent; }), backgroundColor: c.color, borderRadius: 4 }, { label: "Committed", data: brk.map(function (b) { return b.commit; }), backgroundColor: "#f59e0b", borderRadius: 4 }] }, options: { indexAxis: "y", scales: { x: Object.assign({ stacked: true }, G3.axMoney), y: { stacked: true, grid: { display: false }, ticks: { autoSkip: false, font: { size: 10.5 } } } }, plugins: { tooltip: G3.tipMoney } } });
    };
  }
  ["idt", "at", "sch", "mob"].forEach(make);
})(window);
