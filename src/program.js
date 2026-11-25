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
    var tg = {}; dps.forEach(function (d) { var t = tg[d.tdc] || (tg[d.tdc] = { tdc: d.tdc, commit: 0, oblig: 0, disb: 0, total: 0, ulo: 0, dpcs: [] }); t.commit += d.commit; t.oblig += d.oblig; t.disb += d.disb || 0; t.total += d.total; t.ulo += d.ulo; t.dpcs.push(d); });
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
      h += '<div class="filters">' + G3.fySel() + G3.filterSeg() + '<div class="segwrap"><span class="seglbl">Trend chart</span>' + G3.seg("mode", [["monthly", "Monthly"], ["cumulative", "Cumulative"]], ui.mode) + '</div><button class="btn" type="button" id="' + id + 'Reset">Reset</button></div>' + G3.filterNote();
      var pctT = R.tdp ? (R.spent + R.commit) / R.tdp : null, pc = G3.pace(R.tdp ? R.spent / R.tdp : null, el.frac), v = R.planTD ? (R.spent - R.planTD) / R.planTD : null, top = R.tdcs[0], yoy = R.priorTD ? (R.spent - R.priorTD) / R.priorTD : null;
      var u90 = R.ulo.filter(function (u) { return u.days > 90; });
      h += '<div class="kpis k6">' +
        G3.kpi("", "Executed FYTD", G3.money(R.spent), "Obligations + disbursements &middot; " + G3.pct(R.tdp ? R.spent / R.tdp : null, 0) + " of TDP", ' style="--st:' + c.color + '"') +
        G3.kpi("res", "Open commitments", G3.money(R.commit), "Upcoming spending (no date yet), from the commitments report") +
        G3.kpi("", "TDP used", G3.pct(pctT), "Incl. commitments &middot; TDP " + G3.money(R.tdp) + ' <span class="pill ' + pc.k + '" title="Pace uses obligations + disbursements only (commitments can be months out)">' + pc.t + "</span>", ' style="--st:#b08968"') +
        G3.kpi("", "vs spend plan", '<span class="vtxt ' + G3.varClass(v) + '">' + G3.varText(v) + "</span>", G3.money(R.spent) + " actual / " + G3.money(R.planTD) + " planned to date", ' style="--st:#0d9488"') +
        G3.kpi("", "Largest TDC", top ? '<span class="kt">' + G3.esc(top.tdc) + "</span>" : "\u2014", top ? G3.money(top.total) + " &middot; " + G3.pct(R.dpcTotal ? top.total / R.dpcTotal : null, 0) + " of DPC spending" : (G3.data.hasSofDpc ? "No SOF / DPC rows" : "No commitments report rows"), ' style="--st:#7c3aed"') +
        G3.kpi(u90.length ? "warnv" : "", "Unliquidated open", G3.money(R.uloOpen), R.ulo.length + " lines &middot; " + G3.money(G3.sum(u90, "open")) + " over 90 days", ' style="--st:#d97706"') + "</div>";
      // TDC breakout
      var hasJoin = !!G3.data.hasSofDpc, noDpc = !R.tdcs.length;
      h += '<div class="panel"><div class="tablehead"><h2>Breakout by TDC</h2><span class="muted small">' + (hasJoin ? "SOF obligations + disbursements (Order from FMZ3) plus commitments-report Commitment rows, grouped by TDC from the DPC key" : "Obligations + commitments by Internal Order from the commitments report, grouped by TDC from the DPC key") + " &middot; click a TDC to see its DPCs</span></div>";
      if (noDpc) h += '<div class="nodata">' + (hasJoin ? "No SOF or commitment rows for this program yet." : (fy !== (G3.data.wfy || G3.fyOf(G3.asOf())) ? "The commitments report covers the working fiscal year (FY" + (G3.data.wfy || G3.fyOf(G3.asOf())) + "), so the TDC and DPC breakout shows there." : "No commitments report rows for this program yet.")) + "</div>";
      else {
        h += '<div class="row dpcrow"><div class="chartbox tall"><canvas id="c' + id + 'Tdc"></canvas></div><div class="tablewrap"><table class="grid tdct"><thead><tr><th>TDC</th><th class="num">DPCs</th>' + (hasJoin ? '<th class="num">Actuals</th>' : '<th class="num">Obligations</th>') + '<th class="num">Commitments</th><th class="num">Total</th><th class="num">% of program</th><th class="num">Unliquidated</th></tr></thead><tbody>' +
          R.tdcs.map(function (t, i) { var sh = R.dpcTotal ? t.total / R.dpcTotal : 0, act = t.oblig + (t.disb || 0); return '<tr class="tdcr' + (t.tdc === ui.tdc ? " sel" : "") + '" data-tdc="' + G3.esc(t.tdc) + '"><td><span class="tdcdot" style="background:' + TDCCOL[i % TDCCOL.length] + '"></span><strong>' + G3.esc(t.tdc) + '</strong></td><td class="num">' + t.dpcs.length + '</td><td class="num">' + G3.whole(hasJoin ? act : t.oblig) + '</td><td class="num">' + G3.whole(t.commit) + '</td><td class="num"><strong>' + G3.whole(t.total) + '</strong></td><td class="num"><span class="xbar"><i style="width:' + (sh * 100).toFixed(0) + "%;background:" + TDCCOL[i % TDCCOL.length] + '"></i></span>' + G3.pct(sh, 0) + '</td><td class="num">' + G3.money(t.ulo) + "</td></tr>"; }).join("") +
          '</tbody><tfoot><tr><td>Program total</td><td class="num">' + R.dps.length + '</td><td class="num">' + G3.whole(hasJoin ? G3.sum(R.dps, "oblig") + G3.sum(R.dps, "disb") : G3.sum(R.dps, "oblig")) + '</td><td class="num">' + G3.whole(G3.sum(R.dps, "commit")) + '</td><td class="num">' + G3.whole(R.dpcTotal) + '</td><td class="num">100%</td><td class="num">' + G3.money(G3.sum(R.dps, "ulo")) + "</td></tr></tfoot></table></div></div>";
      }
      h += "</div>";
      // Unit spending by DPC: MSC > Battalion/Unit > Company, then TDC > DPC (SOF actuals + FMZ3 Order)
      var utreeAll = G3.data.hasUnits ? G3.unitRollup(fy, function (x) { return R.accts.indexOf(x.account) >= 0; }, { withTdc: !!hasJoin }) : [];
      (function sortU(nodes) {
        var k = ui.unitSort || "total", dir = ui.unitAsc ? 1 : -1;
        (nodes || []).sort(function (a, b) {
          var av = k === "name" ? a.name : (a[k] || 0), bv = k === "name" ? b.name : (b[k] || 0);
          return (typeof av === "string" ? av.localeCompare(bv) : (av - bv)) * dir;
        });
        (nodes || []).forEach(function (n) {
          sortU(n.kids);
          if (n.tdcs) n.tdcs.sort(function (a, b) {
            if (k === "name" || k === "tdc") return String(a.tdc || "").localeCompare(String(b.tdc || "")) * (ui.unitAsc ? 1 : -1);
            return ((a[k] != null ? a[k] : a.total) - (b[k] != null ? b[k] : b.total)) * dir;
          });
        });
      })(utreeAll);
      var qUnit = (ui.unitQ || "").trim().toLowerCase();
      function unitMatch(o) {
        if (!qUnit) return true;
        var blob = (o.name + " " + (o.uic || "") + " " + (o.code || "") + " " + (o.tdc || "")).toLowerCase();
        if (blob.indexOf(qUnit) >= 0) return true;
        if ((o.tdcs || []).some(function (t) {
          if ((t.tdc || "").toLowerCase().indexOf(qUnit) >= 0) return true;
          return (t.dpcs || []).some(function (d) { return (d.name + " " + (d.code || "")).toLowerCase().indexOf(qUnit) >= 0; });
        })) return true;
        return (o.kids || []).some(unitMatch);
      }
      function filterTree(nodes) {
        if (!qUnit) return nodes || [];
        return (nodes || []).filter(unitMatch).map(function (o) { var c = Object.assign({}, o); c.kids = filterTree(o.kids || []); return c; });
      }
      var utree = filterTree(utreeAll);
      var uTotU = { oblig: G3.sum(utree, "oblig"), disb: G3.sum(utree, "disb"), total: G3.sum(utree, "total") };
      var view = ui.unitView || "msc";
      if (ui._uv !== view) { ui._uv = view; ui.openUnit = null; }
      function flatten(nodes, want, acc) {
        (nodes || []).forEach(function (o) {
          if (want === "msc" && (o.level === "MSC" || o.id === "__state__" || o.id === "__unmapped__")) acc.push(o);
          else if (want === "bn" && o.level === "Battalion / Unit") acc.push(o);
          else if (want === "co" && (o.level === "UIC" || o.level === "Company")) acc.push(o);
          flatten(o.kids, want, acc);
        });
        return acc;
      }
      var ulist = view === "tree" ? utree : flatten(utree, view, []).filter(unitMatch);
      if (ui.openUnit == null) {
        ui.openUnit = {};
        if (view === "tree") ulist.forEach(function (r) { if (r.id !== "__unmapped__" && r.id !== "__state__") ui.openUnit[r.id] = true; });
        else ulist.forEach(function (r) { ui.openUnit[r.id] = true; });
      }
      function uOpen(id) { return !!(ui.openUnit && ui.openUnit[id]); }
      function lvlClass(o) { return o.level === "MSC" ? "lmsc" : o.level === "Battalion / Unit" ? "lbn" : o.level === "State" ? "lst" : o.level === "TDC" ? "ltdc" : o.level === "DPC" ? "ldpc" : o.id === "__unmapped__" ? "lunmap" : "lco"; }
      function lvlBadge(o) { return o.level === "MSC" ? "MSC" : o.level === "Battalion / Unit" ? "Unit" : o.level === "State" ? "State" : o.level === "TDC" ? "TDC" : o.level === "DPC" ? "DPC" : o.id === "__unmapped__" ? "—" : "Co"; }
      function unitSub(o) {
        if (view === "bn" && (o.mscName || o.msc)) return '<span class="usub">' + G3.esc(o.mscName || G3.unitName(o.msc) || o.msc) + "</span>";
        if (view === "co") {
          var bits = [];
          if (o.bn) bits.push(G3.unitName(o.bn) || o.bn);
          if (o.msc) bits.push(o.mscName || G3.unitName(o.msc) || o.msc);
          return bits.length ? '<span class="usub">' + G3.esc(bits.join(" · ")) + "</span>" : "";
        }
        return "";
      }
      function unitRowHtml(o, depth, hasKids, open, sh, extraCls, badge, name, opts) {
        opts = opts || {};
        var caret = hasKids ? '<button class="caret" type="button" data-uopen="' + G3.esc(o.id) + '" aria-expanded="' + (open ? "true" : "false") + '" title="' + (open ? "Collapse" : "Expand") + '">' + (open ? "▾" : "▸") + "</button>" : '<span class="caret"></span>';
        var unitCell = opts.hideName ? caret + '<span class="lvg"></span><span class="lvlb">' + badge + "</span>" : caret + '<span class="lvg"></span><span class="lvlb">' + badge + "</span><span class=\"uname\">" + G3.esc(name) + "</span>" + (o.uic && o.level !== "TDC" && o.level !== "DPC" ? ' <span class="uic">' + G3.esc(o.uic) + "</span>" : "") + unitSub(o);
        var dpcCell = opts.dpcHtml || "";
        var tdcCell = opts.tdc || "";
        return '<tr class="urow l' + depth + " " + lvlClass(o) + (extraCls || "") + (open ? " open" : "") + '"><td class="un">' + unitCell + '</td><td class="tdcc">' + tdcCell + '</td><td class="dpcc">' + dpcCell + '</td><td class="num">' + G3.whole(o.oblig) + '</td><td class="num">' + G3.whole(o.disb) + "</td>" +
          '<td class="num"><strong>' + G3.whole(o.total) + '</strong></td><td class="num"><span class="xbar"><i style="width:' + (sh * 100).toFixed(0) + '%"></i></span>' + G3.pct(sh, 0) + "</td></tr>";
      }
      function tdcBlock(unit, depth, out) {
        (unit.tdcs || []).forEach(function (t) {
          var topen = uOpen(t.id), tsh = uTotU.total ? t.total / uTotU.total : 0, hasD = !!(t.dpcs && t.dpcs.length);
          out.push(unitRowHtml(t, depth, hasD, topen, tsh, "", "TDC", t.tdc, { hideName: true, tdc: G3.esc(t.tdc) }));
          if (topen) (t.dpcs || []).forEach(function (d) {
            var dpcHtml = '<span class="dpc-desc">' + G3.esc(d.name || d.code || "DPC") + "</span>" + (d.code ? ' <span class="dpc-code">' + G3.esc(d.code) + "</span>" : "");
            out.push(unitRowHtml(d, depth + 1, false, false, uTotU.total ? d.total / uTotU.total : 0, " ldpc", "DPC", d.name, { hideName: true, tdc: G3.esc(t.tdc), dpcHtml: dpcHtml }));
          });
        });
      }
      function groupRow(label, depth, tot) {
        return '<tr class="urow l' + depth + ' lgrp"><td class="un" colspan="3"><span class="caret"></span><span class="lvg"></span>' + G3.esc(label) + '</td><td class="num"></td><td class="num"></td><td class="num"><strong>' + G3.whole(tot) + '</strong></td><td class="num"></td></tr>';
      }
      function unitTdcRows(nodes, depth, out) {
        (nodes || []).forEach(function (o) {
          var tdcs = o.tdcs || [], hasKids = (view === "tree" && o.kids && o.kids.length) || tdcs.length, open = hasKids && uOpen(o.id), sh = uTotU.total ? o.total / uTotU.total : 0;
          out.push(unitRowHtml(o, depth, hasKids, open, sh, o.id === "__unmapped__" ? " unmap" : (o.id === "__state__" ? " state" : ""), lvlBadge(o), o.name, {}));
          if (open) {
            if (view === "tree" && o.kids && o.kids.length) unitTdcRows(o.kids, depth + 1, out);
            if (tdcs.length) {
              if (view === "tree" && o.kids && o.kids.length) out.push(groupRow("By TDC / DPC · " + o.name, depth + 1, o.total));
              tdcBlock(o, view === "tree" && o.kids && o.kids.length ? depth + 1 : depth + 1, out);
            }
          }
        });
        return out;
      }
      if (utreeAll.length || (G3.data.hasUnits && hasJoin)) {
        var uth = [["name", "Unit"], ["tdc", "TDC", ""], ["dpc", "DPC", ""], ["oblig", "Obligations", "num"], ["disb", "Disbursements", "num"], ["total", "Total", "num"], ["share", "% of spending", "num"]];
        var viewHint = view === "tree" ? "Tree view keeps the unit hierarchy. Under each MSC, battalion, or company a By TDC / DPC group shows rolled-up spending." : "Each " + (view === "msc" ? "MSC" : view === "bn" ? "battalion / unit" : "company") + " expands to its TDC totals, then each DPC (description and code) with the TDC it falls under.";
        h += '<div class="panel unitdpc" id="' + id + 'UnitDpc"><div class="tablehead"><h2>Unit spending by DPC</h2><span class="muted small">SOF obligations + disbursements with Order (DPC) from FMZ3, limited to this program. View spending by MSC, battalion / unit, or company — TDC and DPC at every level.</span>' +
          '<div class="unitacts"><button class="btn sm" type="button" id="' + id + 'UnitExpand">Expand all</button><button class="btn sm ghost" type="button" id="' + id + 'UnitCollapse">Collapse all</button></div></div>' +
          '<div class="filters"><div class="segwrap"><span class="seglbl">Show spending by</span>' + G3.seg("unitView", [["msc", "MSC"], ["bn", "Battalion / Unit"], ["co", "Company"], ["tree", "Tree"]], view) + "</div>" +
          '<label class="ufl u-search grow">Search units or DPCs<input type="search" data-ui="unitQ" value="' + G3.esc(ui.unitQ || "") + '" placeholder="Unit, UIC, TDC, DPC"></label></div>';
        h += '<div class="tablewrap"><table class="grid unit udpc"><thead><tr>' + uth.map(function (col) { return '<th data-uk="' + col[0] + '" class="' + (col[2] || "") + (col[0] === (ui.unitSort || "total") ? " sorted" + (ui.unitAsc ? " asc" : "") : "") + '">' + col[1] + "</th>"; }).join("") + "</tr></thead><tbody>" +
          (ulist.length ? unitTdcRows(ulist, 1, []).join("") : '<tr><td colspan="7" class="muted">' + (qUnit ? "No units or DPCs match that search." : "No UIC spending for this program yet.") + "</td></tr>") +
          '</tbody><tfoot><tr><td colspan="3">Program total</td><td class="num">' + G3.whole(uTotU.oblig) + '</td><td class="num">' + G3.whole(uTotU.disb) + '</td><td class="num">' + G3.whole(uTotU.total) + '</td><td class="num">100%</td></tr></tfoot></table></div><p class="hint">' + viewHint + "</p></div>";
      }
      // DPC detail
      if (!noDpc && R.dps.length) {
        var dl = R.dps.filter(function (d) { return !ui.tdc || d.tdc === ui.tdc; }), dsum = G3.sum(dl, "total");
        h += '<div class="panel"><div class="tablehead"><h2>DPC detail &middot; ' + (ui.tdc ? G3.esc(ui.tdc) : "all TDCs") + "</h2>" + (ui.tdc ? '<button class="btn sm" type="button" id="' + id + 'AllTdc">Show all TDCs</button>' : "") + '</div><div class="tablewrap"><table class="grid"><thead><tr><th>DPC</th><th>TDC</th>' + (hasJoin ? '<th class="num">Actuals</th>' : '<th class="num">Obligations</th>') + '<th class="num">Commitments</th><th class="num">Total</th><th class="num">Share</th><th class="num">Unliquidated open</th></tr></thead><tbody>' +
          dl.map(function (d) { var sh = dsum ? d.total / dsum : 0, act = d.oblig + (d.disb || 0); return '<tr><td class="dsc"><strong>' + G3.esc(d.name) + '</strong> ' + (d.code ? '<span class="dpc">' + G3.esc(d.code) + "</span>" : "") + "</td><td>" + G3.esc(d.tdc) + '</td><td class="num">' + G3.whole(hasJoin ? act : d.oblig) + '</td><td class="num">' + G3.whole(d.commit) + '</td><td class="num"><strong>' + G3.whole(d.total) + '</strong></td><td class="num"><span class="xbar"><i style="width:' + (sh * 100).toFixed(0) + "%;background:" + c.color + '"></i></span>' + G3.pct(sh, 0) + '</td><td class="num">' + G3.whole(d.ulo) + "</td></tr>"; }).join("") + "</tbody></table></div></div>";
      }
      h += '<div class="row r2"><div class="panel"><div class="tablehead"><h2>' + (ui.mode === "cumulative" ? "Cumulative execution vs spend plan" : "Monthly execution vs spend plan") + '</h2></div><div class="chartbox"><canvas id="c' + id + 'Main"></canvas></div><p class="hint">Obligations + disbursements from the funds export by fiscal month' + (R.hasPrior ? "; grey = FY" + R.pfy : "") + "; dashed = spend plan. Commitments have no date yet, so they sit in the Upcoming column.</p></div>" +
        '<div class="panel"><h2>Top DPCs</h2><div class="chartbox"><canvas id="c' + id + 'Top"></canvas></div><p class="hint">' + (hasJoin ? "Largest DPCs by SOF actuals + commitments, shown by description." : "Largest DPCs by obligations + commitments, shown by description.") + "</p></div></div>";
      var old = R.ulo.slice().sort(function (a, b) { return b.days - a.days; }).slice(0, 8);
      h += '<div class="row r2"><div class="panel"><h2>DPC spending by ' + (G3.USE_PAYGROUPS ? "pay group" : "fund") + '</h2><div class="chartbox"><canvas id="c' + id + 'Pg"></canvas></div><p class="hint">' + (hasJoin ? "SOF actuals (obligations + disbursements) plus commitments-report Commitment rows, by " + (G3.USE_PAYGROUPS ? "Pay Group" : "fund") + "." : "Commitments + obligations, by " + (G3.USE_PAYGROUPS ? "Pay Group (or the first 5 digits of Functional Area)" : "fund") + ".") + "</p></div>" +
        '<div class="panel"><div class="tablehead"><h2>Oldest open unliquidated</h2><button class="btn sm" type="button" id="' + id + 'Ulo">Open in Unliquidated</button></div><div class="tablewrap"><table class="grid ulo"><thead><tr><th>Item</th><th>Description</th><th>DPC</th><th class="num">Days</th><th class="num">Open</th></tr></thead><tbody>' +
        old.map(function (u) { return "<tr" + (u.days > 180 ? ' class="red"' : u.days > 90 ? ' class="amber"' : "") + '><td>' + G3.ciPill(u.type) + '</td><td class="wrapc">' + G3.esc(u.desc) + '</td><td class="wrapc small">' + G3.esc(G3.dpcName(u.order) || u.order) + '</td><td class="num"><span class="agepill" style="--bc:' + G3.mods.ulo.BCOL[u.b] + '">' + u.days + 'd</span></td><td class="num"><strong>' + G3.whole(u.open) + "</strong></td></tr>"; }).join("") + (old.length ? "" : '<tr><td colspan="5" class="muted">Nothing open.</td></tr>') + "</tbody></table></div></div></div>";
      root.innerHTML = h;
      G3.bindCommon(root, M);
      G3.$(id + "Reset").onclick = function () { ui.mode = "monthly"; ui.tdc = ""; ui.openUnit = null; ui.unitQ = ""; ui.unitView = "msc"; ui._uv = ""; G3.state.pg = "All"; G3.state.fund = "All"; G3.state.appr = "All"; G3.refresh(); };
      root.querySelectorAll("tr.tdcr").forEach(function (tr) { tr.onclick = function () { var t = tr.getAttribute("data-tdc"); ui.tdc = ui.tdc === t ? "" : t; M.render(); }; });
      var all = G3.$(id + "AllTdc"); if (all) all.onclick = function () { ui.tdc = ""; M.render(); };
      G3.$(id + "Ulo").onclick = function () { G3.mods.ulo.ui.page = 0; G3.go("ulo"); };
      function collectUnitIds(nodes, acc, treeWalk) {
        (nodes || []).forEach(function (o) { acc.push(o.id); if (treeWalk) collectUnitIds(o.kids, acc, true); });
        return acc;
      }
      var ux = G3.$(id + "UnitExpand"); if (ux) ux.onclick = function () { ui.openUnit = {}; collectUnitIds(ulist, [], view === "tree").forEach(function (k) { ui.openUnit[k] = true; }); M.render(); };
      var uc = G3.$(id + "UnitCollapse"); if (uc) uc.onclick = function () { ui.openUnit = {}; M.render(); };
      root.querySelectorAll("#" + id + "UnitDpc [data-uopen]").forEach(function (b) { b.onclick = function () { ui.openUnit = ui.openUnit || {}; var k = b.getAttribute("data-uopen"); ui.openUnit[k] = !ui.openUnit[k]; M.render(); }; });
      root.querySelectorAll("#" + id + "UnitDpc th[data-uk]").forEach(function (th) { th.onclick = function () { var kk = th.getAttribute("data-uk"); if (kk === "share") kk = "total"; if (ui.unitSort === kk) ui.unitAsc = !ui.unitAsc; else { ui.unitSort = kk; ui.unitAsc = kk === "name"; } M.render(); }; });
      // charts
      if (!noDpc && R.tdcs.length) G3.chart("c" + id + "Tdc", { type: "bar", data: { labels: R.tdcs.map(function (t) { return t.tdc; }), datasets: [{ label: hasJoin ? "Actuals" : "Obligations", data: R.tdcs.map(function (t) { return hasJoin ? t.oblig + (t.disb || 0) : t.oblig; }), backgroundColor: R.tdcs.map(function (t, i) { return TDCCOL[i % TDCCOL.length]; }), stack: "t", borderRadius: 4 }, { label: "Commitments", data: R.tdcs.map(function (t) { return t.commit; }), backgroundColor: R.tdcs.map(function (t, i) { return TDCCOL[i % TDCCOL.length] + "66"; }), stack: "t", borderRadius: 4 }] },
        options: { indexAxis: "y", onClick: function (e, el2) { if (el2.length) { var t = R.tdcs[el2[0].index].tdc; ui.tdc = ui.tdc === t ? "" : t; M.render(); } }, scales: { x: Object.assign({ stacked: true }, G3.axMoney), y: { stacked: true, grid: { display: false }, ticks: { autoSkip: false } } }, plugins: { tooltip: G3.tipMoney, legend: { labels: { generateLabels: function () { return [{ text: (hasJoin ? "Actuals" : "Obligations") + " (solid)", fillStyle: "#64748b", strokeStyle: "#64748b", pointStyle: "circle" }, { text: "Commitments (light)", fillStyle: "#cbd5e1", strokeStyle: "#cbd5e1", pointStyle: "circle" }]; } } } } } });
      var cumu = ui.mode === "cumulative", show = function (a) { return a.map(function (x, i) { return i < R.cur ? x : null; }); };
      var ds = [{ type: cumu ? "line" : "bar", label: "FY" + fy + " executed", data: show(cumu ? G3.cum(R.mon) : R.mon), backgroundColor: cumu ? c.color + "22" : c.color, borderColor: c.color, fill: cumu, borderRadius: 5, pointRadius: 3, order: 2 },
        { type: "line", label: "Spend plan", data: cumu ? G3.cum(R.plan) : R.plan, borderColor: "#0d9488", borderDash: [6, 4], pointRadius: 0, tension: .3, order: 1 }];
      if (R.hasPrior) ds.push({ type: "line", label: "FY" + R.pfy, data: cumu ? G3.cum(R.prior) : R.prior, borderColor: "#94a3b8", pointRadius: 0, tension: .3, order: 1 });
      ds.forEach(function (d) { d.data = d.data.concat([null]); });
      if (R.commit) ds.push({ type: "bar", label: cumu ? "Executed + upcoming commitments" : "Upcoming commitments (no date)", data: G3.MONTHS.map(function () { return null; }).concat([cumu ? R.spent + R.commit : R.commit]), backgroundColor: G3.COLORS.commit, borderRadius: 5, order: 3 });
      if (cumu && R.tdp) ds.push({ type: "line", label: "TDP", data: G3.MONTHS.map(function () { return R.tdp; }).concat([R.tdp]), borderColor: "#b08968", borderDash: [8, 4], pointRadius: 0 });
      G3.chart("c" + id + "Main", { type: "bar", data: { labels: G3.MONTHS.map(function (m, i) { return G3.monthLabel(fy, i + 1); }).concat(["Upcoming"]), datasets: ds }, options: { interaction: { mode: "index", intersect: false }, scales: { y: G3.axMoney, x: { grid: { display: false } } }, plugins: { tooltip: G3.tipMoney } } });
      var tp = R.dps.slice(0, 10);
      G3.chart("c" + id + "Top", { type: "bar", data: { labels: tp.map(function (d) { return d.name.length > 30 ? d.name.slice(0, 29) + "\u2026" : d.name; }), datasets: [{ label: hasJoin ? "Actuals" : "Obligations", data: tp.map(function (d) { return hasJoin ? d.oblig + (d.disb || 0) : d.oblig; }), backgroundColor: C.oblig, stack: "d" }, { label: "Commitments", data: tp.map(function (d) { return d.commit; }), backgroundColor: C.commit, stack: "d" }] }, options: { indexAxis: "y", scales: { x: Object.assign({ stacked: true }, G3.axMoney), y: { stacked: true, grid: { display: false }, ticks: { autoSkip: false, font: { size: 10.5 } } } }, plugins: { tooltip: G3.tipMoney } } });
      var pgs = G3.USE_PAYGROUPS ? G3.PAYGROUPS.filter(function (p) { return G3.state.pg === "All" || p === G3.state.pg; }).concat(G3.state.pg === "All" ? [""] : []) : (G3.FUNDS || []).filter(function (p) { return G3.state.fund === "All" || p === G3.state.fund; });
      var pgKey = G3.USE_PAYGROUPS ? "pg" : "fund", wfy = G3.data.wfy || G3.fyOf(G3.asOf());
      var pgv = pgs.map(function (p) {
        if (hasJoin) {
          var act = G3.sum(G3.lines(fy, function (l) { return l.src === "export" && l[pgKey] === p && R.accts.indexOf(l.account) >= 0; }), function (l) { return (l.oblig || 0) + (l.disb || 0); });
          var cm = fy === wfy ? G3.sum((G3.data.dpcLines || []).filter(function (x) { return x.type === "commit" && x[pgKey] === p && R.accts.indexOf(x.account) >= 0; }), "amt") : 0;
          return act + cm;
        }
        return G3.sum((G3.data.dpcLines || []).filter(function (x) { return R.accts.indexOf(x.account) >= 0 && fy === wfy && x[pgKey] === p; }), "amt");
      });
      G3.chart("c" + id + "Pg", { type: "doughnut", data: { labels: pgs.map(function (p, i) { return (G3.USE_PAYGROUPS ? (p ? "PG " + p : "No PG (131\u2026)") : ("Fund " + p)) + "  " + G3.money(pgv[i]); }), datasets: [{ data: pgv, backgroundColor: pgs.map(function (p) { return G3.USE_PAYGROUPS ? (p ? G3.pgCol(p) : "#94a3b8") : G3.fundCol(p); }), borderWidth: 2, borderColor: "#fff" }] }, options: { cutout: "62%", plugins: { legend: { position: "right" }, tooltip: { callbacks: { label: function (x) { return " " + G3.whole(x.raw); } } } } } });
    };
  }
  ["idt", "at", "sch", "mob"].forEach(make);
})(window);
