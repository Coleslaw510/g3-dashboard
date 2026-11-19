/* Status of Funds: TDP / AFP / Allotment views, pay group filter, spend by DPC. */
(function (w) {
  var G3 = w.G3, C = G3.COLORS;
  var M = G3.mods.sof = { ui: { acct: "", dpcAcct: "IDT", open: {} } };

  function expected(fy, view) {
    if (view !== "tdp") return null;
    var el = G3.fyElapsed(fy); return { v: el.frac, label: "FY elapsed " + G3.pct(el.frac, 0) };
  }
  M.expected = expected;

  M.render = function () {
    var st = G3.state, ui = M.ui, fy = st.fy, V = G3.VIEWS[st.view], root = G3.$("page-sof");
    var aOk = function (r) { return !ui.acct || r.account === ui.acct; };
    var L = G3.lines(fy, aOk), F = G3.funding(fy, aOk), T = G3.totals(L, F), exp = expected(fy, st.view);
    var levelSub = st.view === "tdp" ? "" : G3.pct(T.tdp ? T.level / T.tdp : null, 0) + " of TDP";
    var accts = G3.data.accounts;
    var pc = st.view === "allot" ? null : G3.pace(T.pctx, exp && exp.v);
    var h = G3.head("sof", "i-sof", "Status of Funds", G3.scope(V.label + " view" + (ui.acct ? " &middot; " + G3.esc(G3.acct(ui.acct).name) : "")));
    h += '<div class="filters">' +
      '<div class="segwrap"><span class="seglbl">Funding view</span>' + G3.viewSeg() + "</div>" +
      G3.fySel() + G3.pgSeg() +
      '<label>Account<select data-ui="acct"><option value="">All accounts</option>' + accts.map(function (a) { return '<option value="' + a.id + '"' + (a.id === ui.acct ? " selected" : "") + ">" + G3.esc(a.name) + "</option>"; }).join("") + "</select></label>" +
      '<button class="btn" type="button" id="sofReset">Reset</button></div>';
    // math strip
    h += G3.pgNote();
    h += '<div class="kpis k6">' +
      G3.kpi(st.view, V.label, G3.money(T.level), levelSub, ' title="' + G3.full(T.level) + '"') +
      G3.kpi("res" + (V.withCommit ? "" : " excl"), "Commitments", G3.money(T.commit), "Upcoming (no date yet)") +
      G3.kpi("obl", "Obligations", G3.money(T.oblig), G3.pct(T.level ? T.oblig / T.level : null) + " of " + V.label) +
      G3.kpi("disb", "Disbursements", G3.money(T.disb), G3.pct(T.level ? T.disb / T.level : null) + " of " + V.label) +
      G3.kpi("tex", "Total execution", G3.money(T.exec), G3.pct(T.pctx) + " of " + V.label + (pc ? ' <span class="pill ' + pc.k + '">' + pc.t + "</span>" : "")) +
      G3.kpi("bal " + (T.bal < 0 ? "bad" : "good"), "Balance available", G3.money(T.bal), "", ' title="' + G3.full(T.bal) + '"') + "</div>";
    // RM summary
    var rows = accts.map(function (a) { var t = G3.totals(G3.lines(fy, function (l) { return l.account === a.id; }), G3.funding(fy, function (f) { return f.account === a.id; })); t.a = a; return t; }).filter(function (t) { return t.level || t.exec; });
    var hi = rows.slice().sort(function (x, y) { return (y.pctx || 0) - (x.pctx || 0); })[0];
    var over = rows.filter(function (t) { return st.view !== "allot" && exp && t.pctx - exp.v > .05; }).length, neg = rows.filter(function (t) { return t.bal < 0; }).length;
    h += '<div class="panel summary"><h2>Resource Manager summary</h2><p>FY' + fy + " " + V.label + " of " + G3.whole(T.level) + "; total execution " + G3.whole(T.exec) + " (" + G3.pct(T.pctx) + (exp ? ", " + exp.label.toLowerCase() : "") + "); balance available " + G3.whole(T.bal) + "." + (hi ? " Highest % executed: " + G3.esc(hi.a.name) + " at " + G3.pct(hi.pctx) + "." : "") + (st.view !== "allot" ? " " + over + " account" + (over === 1 ? "" : "s") + " over pace." : "") + (neg ? " <strong>" + neg + " account" + (neg === 1 ? " is" : "s are") + " over " + V.label + ".</strong>" : "") + (V.withCommit ? " Open commitments of " + G3.money(T.commit) + " are counted against TDP." : " " + G3.money(T.commit) + " of open commitments are not counted in this view.") + "</p></div>";
    // charts row 1
    h += '<div class="row r2"><div class="panel"><div class="tablehead"><h2>Execution by account vs ' + V.label + '</h2></div><div class="chartbox"><canvas id="cSofAcct"></canvas></div><p class="hint">Bar length = ' + V.label + ". Click an account to see its DPC breakdown.</p></div>" +
      '<div class="panel"><div class="tablehead"><h2>' + (G3.data.hasPg.export ? V.label + " vs execution by pay group" : "Commitments and obligations by pay group") + '</h2></div><div class="chartbox"><canvas id="cSofPg"></canvas></div><p class="hint">' + (G3.data.hasPg.export ? V.label + " vs total execution per pay group. Pay group = first 5 digits of the account\u2019s Functional Areas." : "From the commitments report, the only file with a Pay Group column.") + "</p></div></div>";
    // trend
    var el = G3.fyElapsed(fy);
    h += '<div class="panel"><div class="tablehead"><h2>Execution trend</h2><span class="muted small">FY' + fy + " &middot; day " + el.day + " of " + el.total + "</span></div>" +
      '<div class="pacegrid"><div class="pbar"><span class="plbl">% of ' + V.label + ' executed</span>' + G3.track(T.pctx || 0, "#3b82f6") + '<span class="pval">' + G3.pct(T.pctx, 0) + "</span></div>" +
      (exp ? '<div class="pbar"><span class="plbl">' + (st.view === "afp" ? "% of AFP period" : "% of year elapsed") + "</span>" + G3.track(exp.v, "#94a3b8") + '<span class="pval">' + G3.pct(exp.v, 0) + "</span></div>" : '<div class="pbar"><span class="plbl">Allotment remaining</span>' + G3.track(T.level ? Math.max(0, T.bal / T.level) : 0, "#0ea5e9") + '<span class="pval">' + G3.pct(T.level ? T.bal / T.level : null, 0) + "</span></div>") + "</div>" +
      '<div class="row r2" style="margin-top:14px"><div><h3 class="sub">Cumulative execution vs ' + (st.view === "tdp" ? "straight-line pace and " : V.label + " level and ") + 'spend plan</h3><div class="chartbox"><canvas id="cSofCum"></canvas></div></div><div><h3 class="sub">Monthly execution</h3><div class="chartbox"><canvas id="cSofMon"></canvas></div></div></div></div>';
    // DPC section
    var dA = ui.acct || ui.dpcAcct; if (!accts.some(function (a) { return a.id === dA; })) dA = ui.dpcAcct = (accts[0] || {}).id;
    var dps = G3.dpcRollup(fy, function (x) { return x.account === dA; }), dT = { commit: G3.sum(dps, "commit"), oblig: G3.sum(dps, "oblig") }; dT.total = dT.commit + dT.oblig;
    var dTot = {}; G3.dpcRollup(fy).forEach(function (x) { dTot[x.account] = (dTot[x.account] || 0) + x.total; });
    h += '<div class="panel" id="dpcPanel"><div class="tablehead"><h2>Spending by DPC</h2><span class="muted small">Obligations and commitments by Internal Order, from the commitments report</span></div>' +
      '<div class="achips">' + accts.filter(function (a) { return dTot[a.id]; }).map(function (a) { return '<button type="button" class="achip' + (a.id === dA ? " on" : "") + '" data-dpc="' + G3.esc(a.id) + '"><span class="an">' + G3.esc(a.name) + '</span><span class="av">' + G3.money(dTot[a.id]) + "</span></button>"; }).join("") + "</div>";
    h += '<div class="row dpcrow"><div><div class="chartbox tall"><canvas id="cSofDpc"></canvas></div></div><div class="tablewrap"><table class="grid"><thead><tr><th>DPC</th><th>TDC</th><th class="num">Obligations</th><th class="num">Commitments</th><th class="num">Total</th><th class="num">% of account</th></tr></thead><tbody>' +
      dps.map(function (t) { var sh = dT.total ? t.total / dT.total : 0; return '<tr><td class="dsc"><strong>' + G3.esc(t.name) + '</strong> <span class="dpc">' + G3.esc(t.code) + "</span></td><td>" + G3.esc(t.tdc) + '</td><td class="num">' + G3.whole(t.oblig) + '</td><td class="num">' + G3.whole(t.commit) + '</td><td class="num"><strong>' + G3.whole(t.total) + '</strong></td><td class="num"><span class="xbar"><i style="width:' + (sh * 100).toFixed(0) + '%"></i></span>' + G3.pct(sh, 0) + "</td></tr>"; }).join("") +
      (dps.length ? "" : '<tr><td colspan="6" class="muted">No commitments report rows for this account.</td></tr>') +
      "</tbody><tfoot><tr><td>" + G3.esc(G3.acct(dA).name) + ' total</td><td></td><td class="num">' + G3.whole(dT.oblig) + '</td><td class="num">' + G3.whole(dT.commit) + '</td><td class="num">' + G3.whole(dT.total) + '</td><td class="num">100%</td></tr></tfoot></table></div></div><p class="hint">Obligation rows on the commitments report are for DPC tracking only. They are not added to execution, because the funds export already counts obligations.</p></div>';
    // accounts table
    var cols = [["tdp", "TDP"], ["afp", "AFP"], ["allot", "Allotment"]];
    function trow(t, name, cls, caret) {
      var pc2 = st.view === "allot" ? (t.bal < 0 ? { k: "over", t: "Over allotment" } : t.level && t.bal / t.level < .1 ? { k: "funder", t: "Under 10% left" } : { k: "on", t: "Funds available" }) : G3.pace(t.pctx, exp && exp.v);
      var inf = (G3.data.acctInfo || {})[G3.util.an(t.a ? t.a.id : "")] || {};
      return '<tr class="' + (cls || "") + '"><td>' + (caret || "") + name + '</td><td class="sec">' + G3.esc(t.a ? inf.sag || "" : "") + '</td><td class="sec">' + G3.esc(t.a ? inf.mdep || "" : "") + "</td>" + cols.map(function (c) { return '<td class="num' + (c[0] === st.view ? " act" : " sec") + '">' + G3.whole(t[c[0]]) + "</td>"; }).join("") +
        '<td class="num' + (V.withCommit ? "" : " sec") + '">' + G3.whole(t.commit) + '</td><td class="num">' + G3.whole(t.oblig) + '</td><td class="num">' + G3.whole(t.disb) + '</td><td class="num act"><strong>' + G3.whole(t.exec) + '</strong></td><td class="num act' + (t.bal < 0 ? " neg" : "") + '">' + G3.whole(t.bal) + '</td><td class="num"><span class="xbar"><i style="width:' + Math.min(100, (t.pctx || 0) * 100).toFixed(0) + "%" + (t.pctx > 1 ? ";background:#dc2626" : "") + '"></i></span>' + G3.pct(t.pctx) + '</td><td><span class="pill ' + pc2.k + '">' + pc2.t + "</span></td></tr>";
    }
    h += '<div class="panel"><div class="tablehead"><h2>Accounts</h2><button class="btn sm" type="button" id="sofCsv">Export CSV</button></div><p class="muted small">Highlighted columns drive the ' + V.label + " view. Click an account name to open its DPC breakdown.</p>" +
      '<div class="tablewrap"><table class="grid acct"><thead><tr><th>Account</th><th>SAG</th><th>MDEP</th>' + cols.map(function (c) { return '<th class="num' + (c[0] === st.view ? " act" : "") + '">' + c[1] + "</th>"; }).join("") + '<th class="num">Commitments</th><th class="num">Obligations</th><th class="num">Disbursements</th><th class="num act">Total execution</th><th class="num act">Balance</th><th class="num">% executed</th><th>Status</th></tr></thead><tbody>';
    rows.forEach(function (t) {
      var a = t.a, op = !!ui.open[a.id];
      h += trow(t, '<button class="alink" type="button" data-dpc="' + a.id + '">' + G3.esc(a.name) + "</button>", "", G3.data.hasPg.export ? '<button class="caret" type="button" data-open="' + a.id + '">' + (op ? "\u25BE" : "\u25B8") + "</button>" : "");
      if (op && G3.data.hasPg.export) {
        G3.PAYGROUPS.filter(G3.pgOk).concat(G3.state.pg === "All" ? [""] : []).forEach(function (pg) {
          var t2 = G3.totals(G3.lines(fy, function (l) { return l.account === a.id && l.pg === pg; }), G3.funding(fy, function (f) { return f.account === a.id && f.pg === pg; }));
          if (t2.level || t2.exec || t2.tdp) h += trow(t2, pg ? '<span class="pgdot" style="background:' + G3.pgCol(pg) + '"></span>Pay group ' + pg : '<span class="pgdot" style="background:#94a3b8"></span>No pay group (other appropriation)', "cirow", '<span class="caret"></span>');
        });
      }
    });
    var TT = G3.totals(G3.lines(fy), G3.funding(fy));
    h += '</tbody><tfoot><tr><td>Total (' + rows.length + " accounts)</td><td></td><td></td>" + cols.map(function (c) { return '<td class="num">' + G3.whole(TT[c[0]]) + "</td>"; }).join("") + '<td class="num">' + G3.whole(TT.commit) + '</td><td class="num">' + G3.whole(TT.oblig) + '</td><td class="num">' + G3.whole(TT.disb) + '</td><td class="num">' + G3.whole(TT.exec) + '</td><td class="num">' + G3.whole(TT.bal) + '</td><td class="num">' + G3.pct(TT.pctx) + "</td><td></td></tr></tfoot></table></div></div>";
    root.innerHTML = h;
    G3.bindCommon(root, M);
    G3.$("sofReset").onclick = function () { G3.state.view = "tdp"; G3.state.pg = "All"; ui.acct = ""; ui.open = {}; G3.refresh(); };
    root.querySelectorAll("[data-open]").forEach(function (b) { b.onclick = function () { var k = b.getAttribute("data-open"); ui.open[k] = !ui.open[k]; M.render(); }; });
    root.querySelectorAll("[data-dpc]").forEach(function (b) { b.onclick = function () { ui.dpcAcct = b.getAttribute("data-dpc"); if (ui.acct && ui.acct !== ui.dpcAcct) ui.acct = ""; M.render(); if (b.classList.contains("alink")) G3.$("dpcPanel").scrollIntoView({ behavior: "smooth" }); }; });
    G3.$("sofCsv").onclick = function () {
      var out = [["Account", "Pay group", "TDP", "AFP", "Allotment", "Commitments", "Obligations", "Disbursements", "Total execution (" + V.label + ")", "Balance (" + V.label + ")"]];
      rows.forEach(function (t) { G3.PAYGROUPS.filter(G3.pgOk).forEach(function (pg) { var t2 = G3.totals(G3.lines(fy, function (l) { return l.account === t.a.id && l.pg === pg; }), G3.funding(fy, function (f) { return f.account === t.a.id && f.pg === pg; })); out.push([t.a.name, pg, t2.tdp, t2.afp, t2.allot, t2.commit.toFixed(2), t2.oblig.toFixed(2), t2.disb.toFixed(2), t2.exec.toFixed(2), t2.bal.toFixed(2)]); }); });
      G3.csv(out, "G3-Status-of-Funds-FY" + fy + "-" + V.label + ".csv");
    };

    // ---- charts ----
    var ds = [];
    ds.push({ label: "Disbursements", data: rows.map(function (t) { return t.disb; }), backgroundColor: C.disb, stack: "s" });
    ds.push({ label: "Obligations", data: rows.map(function (t) { return t.oblig; }), backgroundColor: C.oblig, stack: "s" });
    if (V.withCommit) ds.push({ label: "Commitments", data: rows.map(function (t) { return t.commit; }), backgroundColor: C.commit, stack: "s" });
    ds.push({ label: "Balance (" + V.label + ")", data: rows.map(function (t) { return Math.max(0, t.bal); }), backgroundColor: C.remain, stack: "s" });
    G3.chart("cSofAcct", { type: "bar", data: { labels: rows.map(function (t) { return t.a.name; }), datasets: ds }, options: { indexAxis: "y", scales: { x: Object.assign({ stacked: true }, G3.axMoney), y: { stacked: true, grid: { display: false } } }, plugins: { tooltip: G3.tipMoney }, onClick: function (e, el) { if (el.length) { ui.dpcAcct = rows[el[0].index].a.id; M.render(); G3.$("dpcPanel").scrollIntoView({ behavior: "smooth" }); } } } });
    var pgs = G3.PAYGROUPS.filter(G3.pgOk), pgT = pgs.map(function (pg) { return G3.totals(G3.lines(fy, function (l) { return aOk(l) && l.pg === pg; }), G3.funding(fy, function (f) { return aOk(f) && f.pg === pg; })); });
    if (G3.data.hasPg.export) {
      var pgs2 = pgs.concat(st.pg === "All" ? [""] : []), pgT2 = pgs2.map(function (pg) { return G3.totals(G3.lines(fy, function (l) { return aOk(l) && l.pg === pg; }), G3.funding(fy, function (f) { return aOk(f) && f.pg === pg; })); });
      G3.chart("cSofPg", { type: "bar", data: { labels: pgs2.map(function (p) { return p ? "PG " + p : "No PG (131\u2026)"; }), datasets: [{ label: V.label, data: pgT2.map(function (t) { return t.level; }), backgroundColor: C[st.view] + "55", borderColor: C[st.view], borderWidth: 1.5, borderRadius: 6 }, { label: "Total execution", data: pgT2.map(function (t) { return t.exec; }), backgroundColor: pgs2.map(function (p) { return p ? G3.pgCol(p) : "#94a3b8"; }), borderRadius: 6 }] }, options: { scales: { y: G3.axMoney, x: { grid: { display: false } } }, plugins: { tooltip: G3.tipMoney } } });
    }
    else { var dl2 = G3.data.dpcLines.filter(function (x) { return aOk(x) && G3.pgOk(x.pg); }); G3.chart("cSofPg", { type: "bar", data: { labels: pgs.map(function (p) { return "PG " + p; }), datasets: [{ label: "Obligations (DPC tracking)", data: pgs.map(function (p) { return G3.sum(dl2.filter(function (x) { return x.pg === p && x.type === "oblig"; }), "amt"); }), backgroundColor: C.oblig, stack: "p", borderRadius: 4 }, { label: "Commitments", data: pgs.map(function (p) { return G3.sum(dl2.filter(function (x) { return x.pg === p && x.type === "commit"; }), "amt"); }), backgroundColor: C.commit, stack: "p", borderRadius: 4 }] }, options: { scales: { y: Object.assign({ stacked: true }, G3.axMoney), x: { stacked: true, grid: { display: false } } }, plugins: { tooltip: G3.tipMoney } } }); }
    var cur = G3.curFm(fy), mon = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], ob = mon.slice(), db = mon.slice(), cm = mon.slice();
    var upc = 0;
    L.forEach(function (l) { if (!l.fm) { upc += l.commit; return; } ob[l.fm - 1] += l.oblig; db[l.fm - 1] += l.disb; });
    var monEx = ob.map(function (v, i) { return v + db[i]; });
    var cumEx = G3.cum(monEx).map(function (v, i) { return i < cur ? v : null; });
    var planM = G3.planMonths(G3.plans(fy, aOk)), cumPlan = G3.cum(planM);
    var cds = [{ label: "Cumulative execution", data: cumEx, borderColor: "#2563eb", backgroundColor: "#2563eb22", fill: true, tension: .25, pointRadius: 3 }, { label: "Spend plan (cumulative)", data: cumPlan, borderColor: "#0d9488", borderDash: [5, 4], pointRadius: 0, tension: .25 }];
    if (V.withCommit && upc && cur) cds.push({ label: "With upcoming commitments", data: G3.MONTHS.map(function (m, i) { return i === cur - 1 ? cumEx[i] + upc : null; }), borderColor: C.commit, backgroundColor: C.commit, pointRadius: 7, pointStyle: "rectRot", showLine: false });
    if (st.view === "tdp") cds.push({ label: "Straight-line pace (TDP \u00f7 12)", data: G3.MONTHS.map(function (m, i) { return T.tdp * (i + 1) / 12; }), borderColor: "#94a3b8", borderDash: [2, 3], pointRadius: 0 });
    else cds.push({ label: V.label + " level", data: G3.MONTHS.map(function () { return T.level; }), borderColor: C[st.view], borderDash: [6, 3], pointRadius: 0 });
    G3.chart("cSofCum", { type: "line", data: { labels: G3.MONTHS, datasets: cds }, options: { scales: { y: G3.axMoney, x: { grid: { display: false } } }, plugins: { tooltip: G3.tipMoney } } });
    var mds = [{ label: "Disbursements", data: db, backgroundColor: C.disb, stack: "m" }, { label: "Obligations", data: ob, backgroundColor: C.oblig, stack: "m" }];
    var pad = function (a) { return V.withCommit ? a.concat([null]) : a; };
    mds[0].data = pad(db); mds[1].data = pad(ob);
    if (V.withCommit) mds.push({ label: "Upcoming commitments (no date)", data: G3.MONTHS.map(function () { return null; }).concat([upc]), backgroundColor: C.commit, stack: "m" });
    mds.push({ type: "line", label: "Spend plan", data: pad(planM), borderColor: "#0d9488", borderDash: [5, 4], pointRadius: 2, tension: .25 });
    G3.chart("cSofMon", { type: "bar", data: { labels: G3.MONTHS.concat(V.withCommit ? ["Upcoming"] : []), datasets: mds }, options: { scales: { x: { stacked: true, grid: { display: false } }, y: Object.assign({ stacked: true }, G3.axMoney) }, plugins: { tooltip: G3.tipMoney } } });
    var dds = [{ label: "Obligations", data: dps.map(function (t) { return t.oblig; }), backgroundColor: C.oblig, stack: "d" }, { label: "Commitments", data: dps.map(function (t) { return t.commit; }), backgroundColor: C.commit, stack: "d" }];
    G3.chart("cSofDpc", { type: "bar", data: { labels: dps.slice(0, 14).map(function (t) { return t.name.length > 34 ? t.name.slice(0, 33) + "\u2026" : t.name; }), datasets: dds.map(function (x) { x.data = x.data.slice(0, 14); return x; }) }, options: { indexAxis: "y", scales: { x: Object.assign({ stacked: true }, G3.axMoney), y: { stacked: true, grid: { display: false }, ticks: { autoSkip: false } } }, plugins: { tooltip: G3.tipMoney } } });
  };

  G3.csv = function (rows, name) {
    var t = rows.map(function (r) { return r.map(function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\r\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "text/csv" })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
})(window);
