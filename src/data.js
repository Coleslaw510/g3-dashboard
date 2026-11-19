/* G3 Dashboard - FICTIONAL test files, built in the exact layouts of Cole's real reports.
   G3.makeTestFiles() returns [{name, sheets:[{name, aoa}]}]; the dashboard reads them through the SAME loaders as
   real uploads (loaders.js), and tools/make-samples.js writes them out as .xlsx under samples/. */
(function (w) {
  var G3 = w.G3 = w.G3 || {};
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function pick(r, arr, wts) { if (!wts) return arr[Math.floor(r() * arr.length)]; var s = 0, i; for (i = 0; i < wts.length; i++) s += wts[i]; var x = r() * s; for (i = 0; i < arr.length; i++) { x -= wts[i]; if (x <= 0) return arr[i]; } return arr[arr.length - 1]; }
  function norm(a) { var s = a.reduce(function (x, y) { return x + y; }, 0); return a.map(function (v) { return v / s; }); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function iso(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  G3.PAYGROUPS = ["10010", "10070", "10080", "10090"];
  G3.MONTHS = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
  G3.TEST_ASOF = "2026-11-19";

  G3.makeTestFiles = function () {
    var r = rng(20261119), asOf = new Date(2026, 10, 19), curFm = 2, frac = 19 / 30;
    var ACC = [
      { a: "IDT", fa: ["2NGIDT1", "2NGIDT2"], tdp: 38.4e6, sag: "135", mdep: "VTRN", pg: [.52, .18, .2, .1], prof: [8, 9, 6, 9, 9, 9, 9, 8, 5, 6, 9, 8], bias: 1.02 },
      { a: "AT", fa: ["2NGAT01"], tdp: 24.6e6, sag: "135", mdep: "VTRN", pg: [.48, .22, .2, .1], prof: [1, 1, .6, 1, 1.5, 3, 5, 10, 22, 28, 20, 6], bias: .86 },
      { a: "SCHOOLS", fa: ["2NGSCH1", "2NGSCH2"], tdp: 12.9e6, sag: "135", mdep: "VSCH", pg: [.3, .35, .2, .15], prof: [7, 9, 5, 9, 9, 9, 9, 9, 8, 8, 9, 8], bias: 1.08 },
      { a: "OSS OPS/TRAINING", fa: ["2NGMOB1"], tdp: 6.3e6, sag: "131", mdep: "VMOB", pg: [.25, .2, .45, .1], prof: [4, 4, 6, 10, 12, 10, 8, 8, 10, 12, 10, 6], bias: .95 },
      { a: "ADOS", fa: ["2NGADS1"], tdp: 9.4e6, sag: "131", mdep: "VADS", pg: [.2, .4, .25, .15], prof: [8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9], bias: 1.12 },
      { a: "TRAINING SUPPORT", fa: ["2NGTSP1"], tdp: 4.1e6, sag: "132", mdep: "VTSP", pg: [.1, .2, .2, .5], prof: [5, 6, 4, 6, 7, 7, 8, 8, 9, 10, 14, 16], bias: .78 }
    ];
    // DPC (= Internal Order) key: code, description, account, TDC, share of the account
    var DPC = [
      ["IDT", "UNIT TRAINING", [["NG7U01", "Unit training assembly (drill weekend)", .48], ["NG7U02", "Multiple UTA - battle assembly", .14], ["NG7U03", "Make-up / split drill", .06]]],
      ["IDT", "READINESS", [["NG7R01", "Readiness management assembly (RMA)", .09], ["NG7R02", "Additional training assembly (ATA)", .1]]],
      ["IDT", "IDT TRAVEL", [["NG7T01", "IDT travel & lodging (over 50 miles)", .13]]],
      ["AT", "UNIT AT", [["NG8A01", "AT - unit collective training", .52], ["NG8A02", "AT - early/late individual", .1]]],
      ["AT", "AT SUPPORT", [["NG8S01", "AT transportation (bus & air)", .17], ["NG8S02", "AT subsistence (meals)", .11]]],
      ["AT", "EXPORTABLE TRAINING", [["NG8X01", "Overseas deployment training", .1]]],
      ["SCHOOLS", "NCO PME", [["NG9N01", "Basic Leader Course (BLC)", .13], ["NG9N02", "Advanced Leader Course (ALC)", .1], ["NG9N03", "Senior Leader Course (SLC)", .07]]],
      ["SCHOOLS", "OFFICER / WO", [["NG9O01", "Officer Candidate School (OCS)", .12], ["NG9O02", "Warrant Officer Candidate School (WOCS)", .07], ["NG9O03", "BOLC / CCC", .09]]],
      ["SCHOOLS", "MOS QUALIFICATION", [["NG9M01", "MOS-T reclassification", .2]]],
      ["SCHOOLS", "SKILL SCHOOLS", [["NG9K01", "Air Assault School", .08], ["NG9K02", "Airborne School", .06], ["NG9K03", "Ranger / Pathfinder", .08]]],
      ["OSS OPS/TRAINING", "PRE-MOB", [["NGMP01", "Pre-mobilization training", .38], ["NGMP02", "SRP & medical readiness", .17]]],
      ["OSS OPS/TRAINING", "MOB MOVEMENT", [["NGMM01", "Mob station travel", .25]]],
      ["OSS OPS/TRAINING", "DEMOB", [["NGMD01", "Demob & Yellow Ribbon reintegration", .2]]],
      ["ADOS", "OPERATIONAL SUPPORT", [["NGAD01", "ADOS - operational support", .55], ["NGAD02", "ADOS - staff augmentation", .25]]],
      ["ADOS", "EXERCISES", [["NGAD03", "Exercise support", .2]]],
      ["TRAINING SUPPORT", "RANGES", [["NGTS01", "Range operations", .4]]],
      ["TRAINING SUPPORT", "TADSS", [["NGTS02", "Simulators / TADSS", .35], ["NGTS03", "Training supplies", .25]]]
    ];
    var dpcsBy = {}; DPC.forEach(function (g) { g[2].forEach(function (d) { (dpcsBy[g[0]] = dpcsBy[g[0]] || []).push({ code: d[0], desc: d[1], tdc: g[1], sh: d[2] }); }); });

    // ---------- master key (4 tabs) ----------
    var fundTab = [["Account", "TDP", "AFP", "SAG", "MDEP", "Allotment"]], acctTab = [["Functional Area", "Account"]], dpcTab = [["DPC", "Description", "Account", "TDC"]], spTab = [["Prioritization", "Account"]];
    ACC.forEach(function (a) {
      var prof = norm(a.prof), afp = Math.round(a.tdp * (prof[0] + prof[1] + prof[2]) * 1.12 / 1000) * 1000;
      a.afp = afp; fundTab.push([a.a, a.tdp, afp, a.sag, a.mdep, Math.round(afp * (.8 + r() * .12) / 1000) * 1000]);
      a.fa.forEach(function (f) { acctTab.push([f, a.a]); });
      dpcsBy[a.a].forEach(function (d) { dpcTab.push([d.code, d.desc, a.a, d.tdc]); });
    });
    // spend plan prioritizations: several per account (they add up)
    var PRIO = { "IDT": ["P1 IDT DRILL PAY", "P2 IDT TRAVEL", "P7 IDT RMA/ATA"], "AT": ["P3 AT UNIT", "P8 AT TRANSPORT"], "SCHOOLS": ["P4 NCOPDS SCHOOLS", "P5 ACCESSION SCHOOLS", "P9 MOS-T"], "OSS OPS/TRAINING": ["P6 PRE-MOB"], "ADOS": ["P10 ADOS"], "TRAINING SUPPORT": ["P11 RANGES", "P12 TADSS"] };
    Object.keys(PRIO).forEach(function (a) { PRIO[a].forEach(function (p) { spTab.push([p, a]); }); });

    // ---------- Status of Funds export (Aviation layout; amounts negative as in GFEBS) ----------
    var ex = [["contract_doc_no", "commitment_item_fipex", "functional_area_farea", "appropriation_type", "fiscal_year", "fiscal_month", "commitment_amt_cum", "disbursement_amt_cum"]], docN = 4000;
    var CI = ["21T1", "21T2", "2511", "25G1", "26B1", "1121"];
    ["2026", "2027"].forEach(function (fy) {
      var nm = fy === "2026" ? 12 : curFm;
      ACC.forEach(function (a) {
        var prof = norm(a.prof), tdp = a.tdp * (fy === "2026" ? .955 : 1), bias = fy === "2027" ? a.bias : .975;
        for (var fm = 1; fm <= nm; fm++) {
          var amt = tdp * prof[fm - 1] * (fm === nm && fy === "2027" ? frac : 1) * bias * (.9 + r() * .2), n = 6 + Math.floor(r() * 5), parts = norm(Array.apply(null, Array(n)).map(function () { return .3 + r(); }));
          parts.forEach(function (p) {
            var v = amt * p, age = nm - fm, paid = fy === "2026" ? .93 + r() * .06 : age >= 1 ? .7 + r() * .2 : .35 + r() * .25;
            ex.push(["W91" + fy.slice(2) + "N" + (docN++), pick(r, CI), pick(r, a.fa), "OMNG", Number(fy), fm, -r2(v), -r2(v * paid)]);
          });
        }
      });
    });
    ex.push(["", "ALLOBJ", "2NGIDT1", "OMNG", 2027, 1, -1250000, 0]);   // GFEBS rollup line: dropped like Aviation

    // ---------- commitments report ("checkbook drill down") ----------
    var cm = [["Business", "Fund Center", "Fund", "Fund Code", "Pay Group", "Functional Area", "Internal Order", "Cost Center", "WBS", "Funded Program", "Account", "SDN", "Journal Date", "Entry Type", "Amount"]];
    ACC.forEach(function (a) {
      var prof = norm(a.prof), ahead = prof[curFm] + prof[curFm + 1] * .6 + prof[curFm + 2] * .3;
      dpcsBy[a.a].forEach(function (d) {
        a.pg.forEach(function (ps, pi) {
          var pg = G3.PAYGROUPS[pi], tot = a.tdp * d.sh * ps * ahead * (.35 + r() * .3), n = 1 + Math.floor(r() * 3);
          for (var i = 0; i < n; i++) cm.push(["NGB", "NGIA" + a.sag, "2027" + "OMNG", "2065", pg, "XX0000", d.code, "W8AL" + (10 + pi), "", "OMNG-" + a.sag, "610" + pi + "00", "SDN27" + Math.floor(r() * 9e5 + 1e5), "11/" + (1 + Math.floor(r() * 18)) + "/2026", "Commitment", -r2(tot / n)]);
          // obligation rows: spending by DPC (already in the funds export totals)
          var ob = a.tdp * d.sh * ps * (prof[0] + prof[1] * frac) * a.bias * (.8 + r() * .4) * .45;
          cm.push(["NGB", "NGIA" + a.sag, "2027OMNG", "2065", pg, "XX0000", d.code, "W8AL" + (10 + pi), "", "OMNG-" + a.sag, "610" + pi + "00", "SDN27" + Math.floor(r() * 9e5 + 1e5), "11/" + (1 + Math.floor(r() * 18)) + "/2026", "Obligation", -r2(ob)]);
        });
      });
    });
    cm.push(["NGB", "NGIA135", "2027OMNG", "2065", "10010", "XX0000", "NG7U01", "W8AL10", "", "OMNG-135", "610000", "SDN27000001", "11/02/2026", "Disbursement", -45210.5]);   // ignored entry type
    cm.push(["NGB", "NGIA135", "2027OMNG", "2065", "10070", "XX0000", "NG7U01", "W8AL11", "", "OMNG-135", "610100", "SDN27000002", "11/03/2026", "Budget", -100000]);           // ignored entry type
    cm.push(["NGB", "NGIA135", "2027OMNG", "2065", "10080", "XX0000", "NGZZ99", "W8AL12", "", "OMNG-135", "610200", "SDN27000003", "11/05/2026", "Commitment", -8800]);         // DPC not in key -> listed as unmapped

    // ---------- FMZ3 unliquidated ----------
    var fz = [["Document type", "G/L Account", "Reference", "Amount Open (TC)", "Amount Total (TC)", "Posting Date", "Document Date", "Earmarked Funds", "Fund", "Functional Area", "Funds Center", "Cost Center", "Order", "Supplier", "Document Header Text", "Created by", "Amount Open (LC)", "Reference item", "Customer", "WBS element", "Currency", "Company Code", "Commitment item", "Text"]];
    var LAST = ["SMITH", "JOHNSON", "WILLIAMS", "BROWN", "JONES", "GARCIA", "MILLER", "DAVIS", "RODRIGUEZ", "MARTINEZ", "ANDERSON", "TAYLOR", "THOMAS", "MOORE", "JACKSON", "MARTIN", "LEE", "THOMPSON", "WHITE", "HARRIS", "CLARK", "LEWIS", "ROBINSON", "WALKER"];
    var FIRSTN = ["JOHN", "MARIA", "ROBERT", "SARAH", "DAVID", "EMILY", "JAMES", "ASHLEY", "MICHAEL", "JESSICA", "DANIEL", "LAURA", "KEVIN", "MEGAN", "BRIAN", "NICOLE", "TYLER", "AMANDA"];
    var CIT = [["DTS", 40, 250, 6500, ["SCHOOLS", "AT", "ADOS", "IDT", "OSS OPS/TRAINING"]], ["ORDERS", 24, 1800, 48000, ["AT", "ADOS", "IDT", "OSS OPS/TRAINING", "SCHOOLS"]], ["PR", 14, 900, 85000, ["TRAINING SUPPORT", "AT", "ADOS"]], ["PCS", 5, 4500, 26000, ["OSS OPS/TRAINING", "ADOS"]], ["GPC", 11, 90, 3200, ["TRAINING SUPPORT", "AT", "IDT"]], ["MIPR", 6, 12000, 160000, ["TRAINING SUPPORT", "OSS OPS/TRAINING"]]];
    var accBy = {}; ACC.forEach(function (a) { accBy[a.a] = a; });
    for (var i = 0; i < 250; i++) {
      var t = pick(r, CIT, CIT.map(function (c) { return c[1]; })), a = accBy[pick(r, t[4])], d = pick(r, dpcsBy[a.a]);
      var days = Math.min(400, Math.round(-Math.log(1 - r() * .97) * 95)), dt = new Date(asOf.getTime() - days * 864e5);
      var total = r2(t[2] + Math.pow(r(), 2.2) * (t[3] - t[2])), of = days < 21 ? 1 : days < 60 ? (r() < .6 ? 1 : .4 + r() * .6) : (r() < .35 ? 1 : .08 + r() * .85), open = i % 25 === 7 ? 0 : r2(total * of);
      var ln = pick(r, LAST), fn = pick(r, FIRSTN), styles = ["TRAVELER:" + ln + fn, "traveler:" + (ln + fn).toLowerCase(), "TRAVELER: " + ln + " " + fn, "Traveler:" + ln + ", " + fn];
      var hdr = t[0] === "DTS" ? pick(r, styles) : t[0] === "ORDERS" ? a.a + " ORDERS " + pick(r, ["1-133 IN", "2-34 BCT", "JFHQ", "185 ENG", "HHC 1BCT"]) : t[0] === "PR" ? "PR " + d.desc.toUpperCase().slice(0, 24) : t[0] === "PCS" ? "PCS MOVE " + ln : t[0] === "GPC" ? "GPC TRAINING SUPPLIES" : "MIPR " + d.desc.toUpperCase().slice(0, 20);
      var fmz = "0" + String(300000000 + Math.floor(r() * 9e7));
      fz.push([t[0] === "PR" || t[0] === "MIPR" ? "FMZ" : "ZT", "61" + Math.floor(r() * 9e5 + 1e5), t[0] === "DTS" ? "T" + Math.floor(r() * 9e6 + 1e6) : "R" + Math.floor(r() * 9e6 + 1e6), open, total, iso(dt), iso(new Date(dt.getTime() - Math.floor(r() * 9) * 864e5)), fmz, "2027OMNG", pick(r, a.fa), "NGIA" + a.sag, "W8AL" + Math.floor(10 + r() * 4), d.code, t[0] === "PR" || t[0] === "MIPR" ? pick(r, ["ACME TRAINING LLC", "HAWKEYE RANGE SVCS", "PRAIRIE BUS CO"]) : "", hdr, "USER" + Math.floor(r() * 90 + 10), open, "", "", "", "USD", "NG00", t[0], ""]);
    }

    // ---------- spend plan (only Prioritization + Oct..Sep are read) ----------
    var sp = [["Prioritization", "Requirement", "POC", "Fund Type", "October", "November", "December", "January", "February", "March", "April", "May", "June", "July", "August", "September", "Total", "Remarks"]];
    ACC.forEach(function (a) {
      var prof = norm(a.prof), pr = PRIO[a.a], w2 = norm(pr.map(function () { return .5 + r(); }));
      pr.forEach(function (p, k) { var m = prof.map(function (x) { return Math.round(a.tdp * .985 * x * w2[k]); }); sp.push([p, "FY27 " + p.replace(/^P\d+ /, ""), "G3 RM", "OMNG"].concat(m, [m.reduce(function (s, v) { return s + v; }, 0), ""])); });
    });
    sp.push(["Total", "", "", ""].concat([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ""]));

    return [
      { name: "G3 Master Key.xlsx", sheets: [{ name: "Funding", aoa: fundTab }, { name: "Accounts", aoa: acctTab }, { name: "DPC", aoa: dpcTab }, { name: "Spend Plan", aoa: spTab }] },
      { name: "Status of Funds export.xlsx", sheets: [{ name: "Export", aoa: ex }] },
      { name: "Checkbook Drill Down - Commitments.xlsx", sheets: [{ name: "Sheet1", aoa: cm }] },
      { name: "FMZ3 Unliquidated.xlsx", sheets: [{ name: "Sheet1", aoa: fz }] },
      { name: "G3 Spend Plan FY27.xlsx", sheets: [{ name: "Spend Plan", aoa: sp }] }
    ];
  };
})(window);
