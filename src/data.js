/* G3 Dashboard - TEST DATA generator (fictional).
   Everything the pages read lives in one normalized object, G3.data:
     accounts : [{id, name, program}]                      program = IDT | AT | SCH | MOB | null
     dpcs     : [{code, account, name}]                     duty purpose codes within an account
     funding  : [{fy, account, pg, tdp, afp, allot}]        one row per FY x account x pay group
     fyMeta   : {fy: {afpThrough, allotThrough}}
     lines    : [{fy, fm, account, pg, dpc, doc, ci, unit, school, commit, oblig, disb, qty}]
     plan     : [{fy, account, pg, m:[12 monthly planned $]}]
     ulo      : [{doc, ci, account, pg, dpc, desc, date, total, open}]
   Real report loaders (core.js -> G3.loaders) only have to produce these same shapes. */
(function (w) {
  var G3 = w.G3 = w.G3 || {};
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function pick(r, arr, wts) { var s = 0, i; if (!wts) return arr[Math.floor(r() * arr.length)]; for (i = 0; i < wts.length; i++) s += wts[i]; var x = r() * s; for (i = 0; i < arr.length; i++) { x -= wts[i]; if (x <= 0) return arr[i]; } return arr[arr.length - 1]; }
  function norm(a) { var s = a.reduce(function (x, y) { return x + y; }, 0); return a.map(function (v) { return v / s; }); }
  function r2(v) { return Math.round(v * 100) / 100; }

  G3.PAYGROUPS = ["10010", "10070", "10080", "10090"];
  G3.MONTHS = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];

  G3.makeTestData = function () {
    var r = rng(20261118);
    var asOf = "2026-11-18";
    var accounts = [
      { id: "IDT", name: "IDT (Drill)", program: "IDT", tdp: 38.4e6, pg: [.52, .18, .2, .1], prof: [8, 9, 6, 9, 9, 9, 9, 8, 5, 6, 9, 8], payish: true },
      { id: "AT", name: "Annual Training", program: "AT", tdp: 24.6e6, pg: [.48, .22, .2, .1], prof: [1, 1, .6, 1, 1.5, 3, 5, 10, 22, 28, 20, 6], payish: true },
      { id: "SCH", name: "Schools", program: "SCH", tdp: 12.9e6, pg: [.3, .35, .2, .15], prof: [7, 9, 5, 9, 9, 9, 9, 9, 8, 8, 9, 8] },
      { id: "MOB", name: "Mobilization", program: "MOB", tdp: 6.3e6, pg: [.25, .2, .45, .1], prof: [4, 4, 6, 10, 12, 10, 8, 8, 10, 12, 10, 6], payish: true },
      { id: "ADOS", name: "Special Training (ADOS)", program: null, tdp: 9.4e6, pg: [.2, .4, .25, .15], prof: [8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9] },
      { id: "TSPT", name: "Training Support", program: null, tdp: 4.1e6, pg: [.1, .2, .2, .5], prof: [5, 6, 4, 6, 7, 7, 8, 8, 9, 10, 14, 16] }
    ];
    var dpcDef = {
      IDT: [["U01", "Unit Training Assembly (UTA)", .62], ["U02", "Additional Training Assembly (ATA)", .1], ["U03", "Readiness Management Assembly (RMA)", .09], ["U04", "Make-up / split UTA", .07], ["U05", "IDT travel & lodging", .12]],
      AT: [["A01", "AT - unit collective training", .55], ["A02", "AT - individual / early-late", .12], ["A03", "AT travel & transportation", .16], ["A04", "AT subsistence", .09], ["A05", "Overseas deployment training", .08]],
      SCH: [["S01", "NCO PME (BLC / ALC / SLC)", .3], ["S02", "Officer & WO accession (OCS / WOCS / BOLC / CCC)", .27], ["S03", "MOS-T / reclassification", .2], ["S04", "Skill schools (Air Assault, Airborne, Ranger, Pathfinder)", .13], ["S05", "School TDY travel", .1]],
      MOB: [["M01", "Pre-mobilization training", .44], ["M02", "SRP & medical readiness", .17], ["M03", "Mob station travel", .21], ["M04", "Demob & reintegration", .18]],
      ADOS: [["T01", "ADOS - operational support", .5], ["T02", "Special training - staff", .22], ["T03", "Exercise support", .18], ["T04", "Training conferences", .1]],
      TSPT: [["R01", "Range operations", .34], ["R02", "TADSS / simulations", .26], ["R03", "Training supplies (GPC)", .2], ["R04", "Training services contracts", .2]]
    };
    var units = ["JFHQ", "HHC 1st BDE", "1st BN (IN)", "2nd BN (FA)", "3rd BN (EN)", "4th BN (BSB)", "5th BN (CAV)"], unitW = [.08, .1, .22, .17, .16, .14, .13];
    var schools = [
      ["BLC", "S01", 5200, 30], ["ALC", "S01", 7800, 18], ["SLC", "S01", 9600, 8],
      ["OCS", "S02", 11200, 12], ["WOCS", "S02", 9300, 6], ["BOLC", "S02", 14200, 8], ["CCC", "S02", 12100, 5],
      ["MOS-T", "S03", 10400, 1],
      ["Air Assault", "S04", 3800, 10], ["Airborne", "S04", 4600, 6], ["Ranger", "S04", 16500, 2], ["Pathfinder", "S04", 4200, 3]
    ];
    var rate = { IDT: 255, AT: 285, MOB: 310, ADOS: 330 };
    var fyMeta = {
      "2026": { afpThrough: "2026-09-30", allotThrough: "2026-09-30", afpShare: 1, allotShare: 1, curFm: 12, frac: 1 },
      "2027": { afpThrough: "2026-12-31", allotThrough: "2026-11-18", curFm: 2, frac: 18 / 30 }
    };
    // FY27 bias so spend plans show a mix of on/off plan
    var bias27 = { IDT: 1.02, AT: .86, SCH: 1.08, MOB: .95, ADOS: 1.12, TSPT: .78 };
    var funding = [], lines = [], plan = [], dpcs = [], docN = 1000;
    accounts.forEach(function (a) { dpcDef[a.id].forEach(function (d) { dpcs.push({ code: d[0], account: a.id, name: d[1] }); }); });

    ["2026", "2027"].forEach(function (fy) {
      var meta = fyMeta[fy], fyScale = fy === "2026" ? .955 : 1;
      accounts.forEach(function (a) {
        var prof = norm(a.prof);
        a.pg.forEach(function (share, pi) {
          var pg = G3.PAYGROUPS[pi];
          var tdp = Math.round(a.tdp * share * fyScale / 1000) * 1000;
          var afp, allot;
          if (fy === "2026") { afp = tdp; allot = tdp; }
          else {
            afp = Math.round(tdp * (prof[0] + prof[1] + prof[2]) * 1.12 / 1000) * 1000;      // Q1 AFP, a little front-loaded
            allot = Math.round(afp * (.78 + r() * .12) / 1000) * 1000;                       // released so far
          }
          funding.push({ fy: fy, account: a.id, pg: pg, tdp: tdp, afp: afp, allot: allot });
          plan.push({ fy: fy, account: a.id, pg: pg, m: prof.map(function (p) { return Math.round(tdp * p * .985); }) });
          var bias = fy === "2027" ? bias27[a.id] : .975;
          dpcDef[a.id].forEach(function (d) {
            for (var fm = 1; fm <= meta.curFm; fm++) {
              var f = fm === meta.curFm ? meta.frac : 1;
              var amt = tdp * d[2] * prof[fm - 1] * f * bias * (.86 + r() * .28);
              var n = 2 + Math.floor(r() * 3), parts = norm(Array.apply(null, Array(n)).map(function () { return .4 + r(); }));
              parts.forEach(function (p) {
                var v = amt * p, sch = null, unit = pick(r, units, unitW);
                if (a.id === "SCH") { var sc = d[0] === "S05" ? pick(r, schools) : pick(r, schools.filter(function (s) { return s[1] === d[0]; }), schools.filter(function (s) { return s[1] === d[0]; }).map(function (s) { return s[3]; })); sch = sc[0]; }
                // split execution into obligations (open) and disbursements (paid)
                var age = meta.curFm - fm, paid;
                if (fy === "2026") paid = .93 + r() * .06; else paid = age >= 1 ? .66 + r() * .2 : .32 + r() * .22;
                if (a.payish) paid = Math.min(.99, paid + .08);
                var disb = r2(v * paid), oblig = r2(v - disb);
                var ci = a.id === "TSPT" ? pick(r, ["PR", "GPC", "MIPR"], [5, 3, 1]) : a.id === "SCH" ? pick(r, ["DTS", "Orders"], [3, 2]) : a.payish ? pick(r, ["Orders", "DTS"], [4, 1]) : pick(r, ["Orders", "DTS", "PR"], [3, 2, 1]);
                var qty = 0;
                if (a.id === "SCH") { var cost = schools.filter(function (s) { return s[0] === sch; })[0][2]; qty = Math.max(1, Math.round(v / cost)); }
                else if (rate[a.id]) qty = Math.round(v / rate[a.id]);
                lines.push({ fy: fy, fm: fm, account: a.id, pg: pg, dpc: d[0], doc: (fy === "2026" ? "W26" : "W27") + (docN++), ci: ci, unit: unit, school: sch, commit: 0, oblig: oblig, disb: disb, qty: qty });
              });
            }
            // commitments: documents committed but not yet obligated (upcoming orders, PRs, travel)
            var ahead = fy === "2027" ? prof[meta.curFm] + prof[meta.curFm + 1] * .6 + prof[meta.curFm + 2] * .3 : .004;
            var c = tdp * d[2] * ahead * (.35 + r() * .3);
            if (c > 500) lines.push({ fy: fy, fm: meta.curFm, account: a.id, pg: pg, dpc: d[0], doc: (fy === "2026" ? "C26" : "C27") + (docN++), ci: a.id === "TSPT" ? "PR" : "Orders", unit: pick(r, units, unitW), school: a.id === "SCH" ? pick(r, schools.filter(function (s) { return s[1] === (d[0] === "S05" ? "S01" : d[0]); }))[0] : null, commit: r2(c), oblig: 0, disb: 0, qty: 0 });
          });
        });
      });
    });

    // ---------- unliquidated transactions ----------
    var ulo = [], ciDef = {
      DTS: { w: 40, lo: 250, hi: 6500, acct: ["SCH", "AT", "ADOS", "IDT", "MOB"], aw: [4, 3, 2, 2, 1] },
      Orders: { w: 24, lo: 1800, hi: 48000, acct: ["AT", "ADOS", "IDT", "MOB", "SCH"], aw: [3, 3, 2, 2, 1] },
      PR: { w: 14, lo: 900, hi: 85000, acct: ["TSPT", "AT", "ADOS"], aw: [5, 2, 1] },
      PCS: { w: 5, lo: 4500, hi: 26000, acct: ["MOB", "ADOS"], aw: [2, 3] },
      GPC: { w: 11, lo: 90, hi: 3200, acct: ["TSPT", "AT", "IDT"], aw: [4, 2, 1] },
      MIPR: { w: 6, lo: 12000, hi: 160000, acct: ["TSPT", "MOB"], aw: [3, 1] }
    };
    var cis = Object.keys(ciDef), asD = new Date(2026, 10, 18);
    var descT = {
      DTS: ["TDY voucher - {s} course", "TDY voucher - AT advance party", "Local travel - {u}", "TDY - staff conference", "TDY voucher - {s} (partial pay)"],
      Orders: ["AT orders - {u}", "ADOS orders - {u}", "Pre-mob training orders - {u}", "IDT travel orders - {u}", "School orders - {s}"],
      PR: ["Range target maintenance", "Simulator support services", "Training area portable latrines", "Classroom AV equipment", "AT bus transportation"],
      PCS: ["PCS move - mob support", "PCS - AGR backfill", "PCS move - household goods"],
      GPC: ["Training supplies - {u}", "Range consumables", "Classroom supplies"],
      MIPR: ["MIPR - training ammunition handling", "MIPR - mob station support", "MIPR - TADSS maintenance"]
    };
    var descA = {
      DTS: { SCH: "TDY voucher - {s} course", AT: "TDY voucher - AT advance party", ADOS: "TDY - staff conference", IDT: "IDT travel - {u}", MOB: "TDY - mob station SRP" },
      Orders: { AT: "AT orders - {u}", ADOS: "ADOS orders - {u}", IDT: "IDT travel orders - {u}", MOB: "Pre-mob training orders - {u}", SCH: "School orders - {s}" },
      PCS: { MOB: "PCS move - mob support", ADOS: "PCS - AGR backfill" },
      MIPR: { TSPT: "MIPR - TADSS maintenance", MOB: "MIPR - mob station support" }
    };
    for (var i = 0; i < 236; i++) {
      var ci = pick(r, cis, cis.map(function (k) { return ciDef[k].w; })), def = ciDef[ci];
      var days = Math.min(400, Math.round(-Math.log(1 - r() * .97) * 95));
      var dt = new Date(asD.getTime() - days * 864e5);
      var acct = pick(r, def.acct, def.aw), ds = dpcs.filter(function (d) { return d.account === acct; });
      var total = r2(def.lo + Math.pow(r(), 2.2) * (def.hi - def.lo));
      var openFrac = days < 21 ? 1 : days < 60 ? (r() < .6 ? 1 : .4 + r() * .6) : (r() < .35 ? 1 : .08 + r() * .85);
      var u = pick(r, units, unitW), s = pick(r, schools)[0];
      var dT = descA[ci] && descA[ci][acct] ? descA[ci][acct] : pick(r, descT[ci]); var desc = dT.replace("{u}", u).replace("{s}", s);
      var fyd = String(dt.getFullYear() + (dt.getMonth() >= 9 ? 1 : 0));
      var docno = ci === "DTS" ? "T" + fyd.slice(2) + String(Math.floor(r() * 9e6 + 1e6)) : ci === "Orders" ? "ORD-" + fyd.slice(2) + "-" + String(Math.floor(r() * 9e4 + 1e4)) : ci === "PR" ? "00105" + String(Math.floor(r() * 9e4 + 1e4)) : ci === "PCS" ? "PCS" + fyd.slice(2) + String(Math.floor(r() * 9e4 + 1e4)) : ci === "GPC" ? "GPC" + String(Math.floor(r() * 9e5 + 1e5)) : "MIPR" + fyd.slice(2) + "G" + String(Math.floor(r() * 9e3 + 1e3));
      ulo.push({ doc: docno, ci: ci, account: acct, pg: pick(r, G3.PAYGROUPS, [4, 3, 2, 1.5]), dpc: pick(r, ds).code, desc: desc, date: dt.getFullYear() + "-" + ("0" + (dt.getMonth() + 1)).slice(-2) + "-" + ("0" + dt.getDate()).slice(-2), total: total, open: r2(total * openFrac) });
    }

    return {
      v: 1, source: "test", asOf: asOf, fys: ["2026", "2027"],
      accounts: accounts.map(function (a) { return { id: a.id, name: a.name, program: a.program }; }),
      dpcs: dpcs, schools: schools.map(function (s) { return { name: s[0], dpc: s[1], seatCost: s[2] }; }),
      fyMeta: { "2026": { afpThrough: fyMeta["2026"].afpThrough, allotThrough: fyMeta["2026"].allotThrough }, "2027": { afpThrough: fyMeta["2027"].afpThrough, allotThrough: fyMeta["2027"].allotThrough } },
      funding: funding, lines: lines, plan: plan, ulo: ulo
    };
  };
})(window);
