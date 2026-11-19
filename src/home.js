/* Home: headline numbers from every page. */
(function (w) {
  var G3 = w.G3;
  var M = G3.mods.home = { ui: {} };
  function ring(frac) {
    var r = 26, c = 2 * Math.PI * r;
    return '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="' + r + '" fill="none" stroke="#e2e8f0" stroke-width="7"/><circle cx="32" cy="32" r="' + r + '" fill="none" stroke="#2563eb" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + (c * frac).toFixed(1) + " " + c.toFixed(1) + '" transform="rotate(-90 32 32)"/></svg>';
  }
  function card(id, cls, icon, title, body, wide, noTag) {
    return '<article class="ocard' + (wide ? " wide" : "") + '" data-go="' + id + '" tabindex="0"><h3><span class="pic ' + cls + '"><svg class="ic"><use href="#' + icon + '"/></svg></span>' + title + (noTag ? "" : G3.testTag()) + '<span class="more">Open &rsaquo;</span></h3>' + body + "</article>";
  }
  function stat(l, v, s, cls) { return '<div class="stat ' + (cls || "") + '"><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="s">' + (s || "&nbsp;") + "</div></div>"; }
  M.render = function () {
    var st = G3.state, fy = st.fy, V = G3.VIEWS[st.view], root = G3.$("page-home"), el = G3.fyElapsed(fy), meta = G3.data.fyMeta[fy] || {};
    var T = G3.totals(G3.lines(fy), G3.funding(fy)), exp = G3.mods.sof.expected(fy, st.view);
    var SP = G3.mods.spend.calc(fy, ""), ulo = G3.mods.ulo.rows(), uOpen = G3.sum(ulo, "open"), u90 = ulo.filter(function (r) { return r.days > 90; });
    var P = {}; ["idt", "at", "sch", "mob"].forEach(function (k) { P[k] = G3.programCalc(k, fy); });
    var h = '<div class="hero"><div><div class="eyebrow">FY' + fy + " &middot; Day " + el.day + " of " + el.total + "</div><h1>G3 Dashboard" + G3.testTag() + '</h1><p class="lead">' + (G3.data.asOf ? "Data as of " + G3.dateText(G3.data.asOf) + " &middot; " : "") + "Funds, spend plans, unliquidated transactions and training spend in one place.</p>" +
      '<div class="hctl">' + G3.seg("view", [["tdp", "TDP"], ["afp", "AFP"], ["allot", "Allotment"]], st.view) + G3.seg("pg", [["All", "All pay groups"]].concat(G3.PAYGROUPS.map(function (p) { return [p, p]; })), st.pg) + "</div></div>" +
      '<div class="fyring">' + ring(el.frac) + '<div><div class="rv">' + G3.pct(el.frac, 0) + '</div><div class="rl">of FY' + fy + " elapsed</div></div></div></div>";
    var tiles = [
      ["sof", "t-sof", "i-sof", "Status of Funds", G3.pct(T.pctx, 0) + " of " + V.label + " executed"],
      ["spend", "t-plan", "i-plan", "Spend Plans", "Variance " + G3.varText(SP.tot.v) + " to date"],
      ["ulo", "t-ulo", "i-ulo", "Unliquidated", G3.money(uOpen) + " open &middot; " + u90.length + " over 90 days"],
      ["idt", "t-idt", "i-idt", "IDT", G3.money(P.idt.spent) + " FYTD"],
      ["at", "t-at", "i-at", "Annual Training", G3.money(P.at.spent) + " FYTD"],
      ["sch", "t-sch", "i-sch", "Schools", G3.money(P.sch.spent) + " &middot; " + G3.num(P.sch.qty) + " soldiers"],
      ["mob", "t-mob", "i-mob", "Mob", G3.money(P.mob.spent) + " FYTD"]
    ];
    h += '<div class="tiles t7">' + tiles.map(function (t) { return '<button class="tile ' + t[1] + '" type="button" data-go="' + t[0] + '"><span class="tic"><svg class="ic"><use href="#' + t[2] + '"/></svg></span><span class="tt">' + t[3] + '</span><span class="ts">' + t[4] + "</span></button>"; }).join("") + "</div>";
    // SOF card
    var accts = G3.data.accounts.map(function (a) { var t = G3.totals(G3.lines(fy, function (l) { return l.account === a.id; }), G3.funding(fy, function (f) { return f.account === a.id; })); t.a = a; return t; }).sort(function (x, y) { return (y.pctx || 0) - (x.pctx || 0); });
    var pc = st.view === "allot" ? null : G3.pace(T.pctx, exp && exp.v);
    var sofB = '<div class="big3">' + stat(V.label, G3.money(T.level), st.view === "tdp" ? "AFP " + G3.money(T.afp) + " &middot; Allot " + G3.money(T.allot) : st.view === "afp" ? "Through " + G3.dateText(meta.afpThrough) : "As of " + G3.dateText(meta.allotThrough)) + stat("Total execution", G3.money(T.exec), V.withCommit ? "Incl. " + G3.money(T.commit) + " commitments" : "Obligations + disbursements") + stat("Balance", G3.money(T.bal), V.label + " &minus; execution", T.bal < 0 ? "bad" : "good") + "</div>" +
      '<div class="gwrap">' + G3.track(T.pctx || 0, "linear-gradient(90deg,#60a5fa,#2563eb)", exp ? exp.v : null, exp ? exp.label : "") + '<div class="gl"><span>' + G3.pct(T.pctx, 0) + " of " + V.label + " executed</span>" + (pc ? '<span class="pill ' + pc.k + '">' + pc.t + "</span>" : "") + "</div></div>" +
      '<div class="hacc"><h4>Accounts by % executed</h4>' + accts.map(function (t) { return '<div class="ha"><span class="nm">' + G3.esc(t.a.name) + '</span><div class="tr"><div class="fi' + (t.pctx > 1 ? " over" : "") + '" style="width:' + Math.min(100, (t.pctx || 0) * 100).toFixed(1) + '%"></div>' + (exp ? '<span class="mk2" style="left:' + (exp.v * 100).toFixed(1) + '%"></span>' : "") + '</div><span class="nv">' + G3.pct(t.pctx, 0) + " &middot; " + G3.money(t.exec) + "</span></div>"; }).join("") + "</div>";
    // ULO card
    var B = G3.mods.ulo.BUCKETS, bs = B.map(function (b, i) { return G3.sum(ulo.filter(function (r) { return r.b === i; }), "open"); });
    var byCi = Object.keys(G3.group(ulo, "ci")).map(function (k) { var rr = ulo.filter(function (r) { return r.ci === k; }); return { k: k, v: G3.sum(rr, "open"), n: rr.length }; }).sort(function (a, b) { return b.v - a.v; });
    var uloB = '<div class="big3">' + stat("Open amount", G3.money(uOpen), ulo.length + " transactions") + stat("Over 90 days", G3.money(G3.sum(u90, "open")), u90.length + " transactions", "warnv") + stat("Over 180 days", G3.money(G3.sum(ulo.filter(function (r) { return r.days > 180; }), "open")), ulo.filter(function (r) { return r.days > 180; }).length + " need follow-up", "bad") + "</div>" +
      '<div class="agebar">' + bs.map(function (v, i) { return '<i style="flex:' + Math.max(.02, v / (uOpen || 1)).toFixed(3) + ";background:" + G3.mods.ulo.BCOL[i] + '" title="' + B[i][0] + " days: " + G3.money(v) + '"></i>'; }).join("") + '</div><div class="agelg">' + B.map(function (b, i) { return '<span><b style="background:' + G3.mods.ulo.BCOL[i] + '"></b>' + b[0] + "d " + G3.money(bs[i]) + "</span>"; }).join("") + "</div>" +
      '<div class="hafl"><h4>Open by commitment item</h4>' + byCi.slice(0, 5).map(function (x) { return '<div class="r"><span><span class="cipill" style="--cc:' + (G3.CICOL[x.k] || "#64748b") + '">' + x.k + '</span> <span class="muted small">' + x.n + " docs</span></span><strong>" + G3.money(x.v) + "</strong></div>"; }).join("") + "</div>";
    // spend card
    var vk = G3.varClass(SP.tot.v);
    var spB = '<div class="sp4"><div class="big3">' + stat("Planned to date", G3.money(SP.tot.pTD), "Year plan " + G3.money(SP.tot.fyPlan)) + stat("Actual to date", G3.money(SP.tot.aTD), "Obligations + disbursements") + stat("Variance", '<span class="vtxt ' + vk + '">' + G3.varText(SP.tot.v) + "</span>", SP.accts.filter(function (r) { return G3.varClass(r.v) !== "g"; }).length + " accounts off plan (\u00b15%)") + "</div>" +
      '<div class="hvar h6">' + SP.accts.map(function (r) { return '<div class="hv1"><div class="nm">' + G3.esc(r.a.name) + "</div>" + G3.chip(r.v) + '<div class="muted small">' + G3.money(r.aTD) + " / " + G3.money(r.pTD) + "</div></div>"; }).join("") + "</div></div>";
    h += '<div class="overview">' + card("sof", "t-sof", "i-sof", "Status of Funds &middot; FY" + fy + " &middot; " + V.label, sofB) + card("ulo", "t-ulo", "i-ulo", "Unliquidated", uloB) + card("spend", "t-plan", "i-plan", "Spend Plans &middot; FY" + fy, spB, true) + "</div>";
    // program cards
    h += '<div class="overview o4">' + ["idt", "at", "sch", "mob"].map(function (k) {
      var R = P[k], c = R.c, pt = R.tdp ? R.spent / R.tdp : null, yoy = R.priorTD ? (R.spent - R.priorTD) / R.priorTD : null;
      return card(k, "t-" + k, c.icon, c.title, '<div class="big2">' + stat("Spent FYTD", G3.money(R.spent), G3.pct(pt, 0) + " of TDP " + G3.money(R.tdp)) + stat(c.qty, G3.num(R.qty), yoy != null ? G3.varText(yoy) + " vs FY" + R.pfy : "") + '</div><div class="chartbox spark"><canvas id="hs' + k + '"></canvas></div>', false, true);
    }).join("") + "</div>";
    root.innerHTML = h;
    G3.bindCommon(root, M);
    root.querySelectorAll(".hctl [data-seg]").forEach(function (s) { s.setAttribute("data-stop", "1"); });
    ["idt", "at", "sch", "mob"].forEach(function (k) {
      var R = P[k];
      var ds = [{ type: "bar", label: "FY" + fy, data: R.mon.map(function (v, i) { return i < R.cur ? v : null; }), backgroundColor: R.c.color, borderRadius: 3 }];
      if (R.prior) ds.push({ type: "line", label: "FY" + R.pfy, data: R.prior, borderColor: "#94a3b8", borderWidth: 1.5, pointRadius: 0, tension: .35 });
      ds.push({ type: "line", label: "Plan", data: R.plan, borderColor: "#0d9488", borderDash: [4, 3], borderWidth: 1.5, pointRadius: 0, tension: .35 });
      G3.chart("hs" + k, { type: "bar", data: { labels: G3.MONTHS, datasets: ds }, options: { animation: false, plugins: { legend: { display: false }, tooltip: G3.tipMoney }, scales: { x: { grid: { display: false }, ticks: { font: { size: 9.5 }, maxRotation: 0, autoSkip: false, callback: function (v, i) { return G3.MONTHS[i].charAt(0); } } }, y: { display: false } } } });
    });
  };
})(window);
