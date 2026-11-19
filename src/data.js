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
  G3.BASE_PAYGROUPS = ["10010", "10070", "10080", "10090"];
  G3.PAYGROUPS = G3.BASE_PAYGROUPS.slice();
  G3.MONTHS = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
  G3.TEST_ASOF = "2026-11-19";

  G3.makeTestFiles = function () {
    var r = rng(20261119), asOf = new Date(2026, 10, 19), curFm = 2, frac = 19 / 30;
    var ACC = [
      { a: "IDT", tag: "IDT", tdp: 38.4e6, sag: "135", mdep: "VTRN", pg: [1, 0, 0, 0], prof: [8, 9, 6, 9, 9, 9, 9, 8, 5, 6, 9, 8], bias: 1.02 },
      { a: "AT", tag: "RAT", tdp: 24.6e6, sag: "135", mdep: "VTRN", pg: [0, 1, 0, 0], prof: [1, 1, .6, 1, 1.5, 3, 5, 10, 22, 28, 20, 6], bias: .86 },
      { a: "SCHOOLS", tag: "SCH", blankPg: true, tdp: 12.9e6, sag: "135", mdep: "VSCH", pg: [0, 0, 1, 0], prof: [7, 9, 5, 9, 9, 9, 9, 9, 8, 8, 9, 8], bias: 1.08 },
      { a: "OSS OPS/TRAINING", tag: "MOB", x131: ["131G48MOBX"], x131w: .12, tdp: 6.3e6, sag: "131", mdep: "VMOB", pg: [0, 0, 1, 0], prof: [4, 4, 6, 10, 12, 10, 8, 8, 10, 12, 10, 6], bias: .95 },
      { a: "ADOS", tag: "ADS", x131: ["131G48ADOS", "131G48ASDF"], x131w: 1, tdp: 9.4e6, sag: "131", mdep: "VADS", pg: [0, 0, 0, 0], prof: [8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9], bias: 1.12 },
      { a: "TRAINING SUPPORT", tag: "TSP", tdp: 4.1e6, sag: "132", mdep: "VTSP", pg: [0, 0, 0, 1], prof: [5, 6, 4, 6, 7, 7, 8, 8, 9, 10, 14, 16], bias: .78 }
    ];
    // Each account ties to one pay group (Cole's model). OSS OPS/TRAINING also has a 131G FA, so it shows as a key conflict.
    // Functional Areas: pay group (5 digits) + "1B3P" + tag, e.g. 100101B3PRAT -> pay group 10010.  131G... = another appropriation (no pay group)
    ACC.forEach(function (a) {
      var w131 = a.x131w || 0; a.faList = [];
      a.pg.forEach(function (wt, pi) { if (wt > 0) a.faList.push({ fa: G3.BASE_PAYGROUPS[pi] + "1B3P" + a.tag, pg: G3.BASE_PAYGROUPS[pi], w: wt * (1 - w131) }); });
      (a.x131 || []).forEach(function (f) { a.faList.push({ fa: f, pg: "", w: w131 / a.x131.length }); });
      a.fa = a.faList.map(function (f) { return f.fa; });
    });
    function pickFa(r, a) { return pick(r, a.faList, a.faList.map(function (f) { return f.w; })); }
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
    var ciTab = [["Commitment Item", "Description"], ["21TD", "DTS travel (TDY)"], ["21T1", "Travel on orders (non-DTS)"], ["21T2", "Travel - lodging & per diem"], ["22P1", "PCS household goods move"], ["2511", "Contracted services"], ["25MI", "MIPR - services from other agencies"], ["26B1", "Supplies & materials"], ["26GP", "GPC card purchases"], ["1121", "Military pay - IDT/AT"]];   // 25G1 left out on purpose: shows as unmapped
    var fundTab = [["Account", "TDP", "AFP", "Allotment", "SAG", "MDEP"]], acctTab = [["Functional Area", "Account"]], dpcTab = [["DPC", "Description", "Account", "TDC"]], spTab = [["Prioritization", "Account"]];
    ACC.forEach(function (a) {
      var prof = norm(a.prof), afp = Math.round(a.tdp * (prof[0] + prof[1] + prof[2]) * 1.12 / 1000) * 1000;
      a.afp = afp; fundTab.push([a.a, a.tdp, afp, Math.round(afp * (.8 + r() * .12) / 1000) * 1000, a.sag, a.mdep]);
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
            ex.push(["W91" + fy.slice(2) + "N" + (docN++), pick(r, CI), pickFa(r, a).fa, "OMNG", Number(fy), fm, -r2(v), -r2(v * paid)]);
          });
        }
      });
    });
    ex.push(["", "ALLOBJ", "100101B3PIDT", "OMNG", 2027, 1, -1250000, 0]);   // GFEBS rollup line: dropped like Aviation

    // ---------- commitments report ("checkbook drill down") ----------
    var cm = [["Business", "Fund Center", "Fund", "Fund Code", "Pay Group", "Functional Area", "Internal Order", "Cost Center", "WBS", "Funded Program", "Account", "SDN", "Journal Date", "Entry Type", "Amount"]];
    ACC.forEach(function (a) {
      var prof = norm(a.prof), ahead = prof[curFm] + prof[curFm + 1] * .6 + prof[curFm + 2] * .3;
      dpcsBy[a.a].forEach(function (d) {
        a.faList.forEach(function (F, pi) {
          var ps = F.w, pg = a.blankPg ? "" : F.pg, tot = a.tdp * d.sh * ps * ahead * (.35 + r() * .3), n = 1 + Math.floor(r() * 3);
          for (var i = 0; i < n; i++) cm.push(["NGB", "NGIA" + a.sag, "2027" + "OMNG", "2065", pg, F.fa, d.code, "W8AL" + (10 + pi), "", "OMNG-" + a.sag, "610" + pi + "00", "SDN27" + Math.floor(r() * 9e5 + 1e5), "11/" + (1 + Math.floor(r() * 18)) + "/2026", "Commitment", -r2(tot / n)]);
          // obligation rows: spending by DPC (already in the funds export totals)
          var ob = a.tdp * d.sh * ps * (prof[0] + prof[1] * frac) * a.bias * (.8 + r() * .4) * .45;
          cm.push(["NGB", "NGIA" + a.sag, "2027OMNG", "2065", pg, F.fa, d.code, "W8AL" + (10 + pi), "", "OMNG-" + a.sag, "610" + pi + "00", "SDN27" + Math.floor(r() * 9e5 + 1e5), "11/" + (1 + Math.floor(r() * 18)) + "/2026", "Obligation", -r2(ob)]);
        });
      });
    });
    cm.push(["NGB", "NGIA135", "2027OMNG", "2065", "10010", "100101B3PIDT", "NG7U01", "W8AL10", "", "OMNG-135", "610000", "SDN27000001", "11/02/2026", "Disbursement", -45210.5]);   // ignored entry type
    cm.push(["NGB", "NGIA135", "2027OMNG", "2065", "10070", "100101B3PIDT", "NG7U01", "W8AL11", "", "OMNG-135", "610100", "SDN27000002", "11/03/2026", "Budget", -100000]);           // ignored entry type
    cm.push(["NGB", "NGIA135", "2027OMNG", "2065", "10080", "100101B3PIDT", "NGZZ99", "W8AL12", "", "OMNG-135", "610200", "SDN27000003", "11/05/2026", "Commitment", -8800]);         // DPC not in key -> listed as unmapped

    // ---------- FMZ3 unliquidated ----------
    var fz = [["Document type", "G/L Account", "Reference", "Amount Open (TC)", "Amount Total (TC)", "Posting Date", "Document Date", "Earmarked Funds", "Fund", "Functional Area", "Funds Center", "Cost Center", "Order", "Supplier", "Document Header Text", "Created by", "Amount Open (LC)", "Reference item", "Customer", "WBS element", "Currency", "Company Code", "Commitment item", "Text"]];
    var LAST = ["SMITH", "JOHNSON", "WILLIAMS", "BROWN", "JONES", "GARCIA", "MILLER", "DAVIS", "RODRIGUEZ", "MARTINEZ", "ANDERSON", "TAYLOR", "THOMAS", "MOORE", "JACKSON", "MARTIN", "LEE", "THOMPSON", "WHITE", "HARRIS", "CLARK", "LEWIS", "ROBINSON", "WALKER"];
    var FIRSTN = ["JOHN", "MARIA", "ROBERT", "SARAH", "DAVID", "EMILY", "JAMES", "ASHLEY", "MICHAEL", "JESSICA", "DANIEL", "LAURA", "KEVIN", "MEGAN", "BRIAN", "NICOLE", "TYLER", "AMANDA"];
    var CIT = [["DTS", 40, 250, 6500, ["SCHOOLS", "AT", "ADOS", "IDT", "OSS OPS/TRAINING"]], ["ORDERS", 24, 1800, 48000, ["AT", "ADOS", "IDT", "OSS OPS/TRAINING", "SCHOOLS"]], ["PR", 14, 900, 85000, ["TRAINING SUPPORT", "AT", "ADOS"]], ["PCS", 5, 4500, 26000, ["OSS OPS/TRAINING", "ADOS"]], ["GPC", 11, 90, 3200, ["TRAINING SUPPORT", "AT", "IDT"]], ["MIPR", 6, 12000, 160000, ["TRAINING SUPPORT", "OSS OPS/TRAINING"]]];
    var FCI = { DTS: "21TD", ORDERS: "21T1", PR: "26B1", PCS: "22P1", GPC: "26GP", MIPR: "25MI" };
    var accBy = {}; ACC.forEach(function (a) { accBy[a.a] = a; });
    for (var i = 0; i < 250; i++) {
      var t = pick(r, CIT, CIT.map(function (c) { return c[1]; })), a = accBy[pick(r, t[4])], d = pick(r, dpcsBy[a.a]);
      var days = Math.min(400, Math.round(-Math.log(1 - r() * .97) * 95)), dt = new Date(asOf.getTime() - days * 864e5);
      var total = r2(t[2] + Math.pow(r(), 2.2) * (t[3] - t[2])), of = days < 21 ? 1 : days < 60 ? (r() < .6 ? 1 : .4 + r() * .6) : (r() < .35 ? 1 : .08 + r() * .85), open = i % 25 === 7 ? 0 : r2(total * of);
      var ln = pick(r, LAST), fn = pick(r, FIRSTN), styles = ["TRAVELER:" + ln + fn, "traveler:" + (ln + fn).toLowerCase(), "TRAVELER: " + ln + " " + fn, "Traveler:" + ln + ", " + fn];
      var hdr = t[0] === "DTS" ? pick(r, styles) : t[0] === "ORDERS" ? a.a + " ORDERS " + pick(r, ["1-133 IN", "2-34 BCT", "JFHQ", "185 ENG", "HHC 1BCT"]) : t[0] === "PR" ? "PR " + d.desc.toUpperCase().slice(0, 24) : t[0] === "PCS" ? "PCS MOVE " + ln : t[0] === "GPC" ? "GPC TRAINING SUPPLIES" : "MIPR " + d.desc.toUpperCase().slice(0, 20);
      var fmz = "0" + String(300000000 + Math.floor(r() * 9e7));
      fz.push([t[0] === "PR" || t[0] === "MIPR" ? "FMZ" : "ZT", "61" + Math.floor(r() * 9e5 + 1e5), t[0] === "DTS" ? "T" + Math.floor(r() * 9e6 + 1e6) : "R" + Math.floor(r() * 9e6 + 1e6), open, total, iso(dt), iso(new Date(dt.getTime() - Math.floor(r() * 9) * 864e5)), fmz, "2027OMNG", pickFa(r, a).fa, "NGIA" + a.sag, "W8AL" + Math.floor(10 + r() * 4), d.code, t[0] === "PR" || t[0] === "MIPR" ? pick(r, ["ACME TRAINING LLC", "HAWKEYE RANGE SVCS", "PRAIRIE BUS CO"]) : "", hdr, "USER" + Math.floor(r() * 90 + 10), open, "", "", "", "USD", "NG00", FCI[t[0]], ""]);
    }

    // ---------- spend plan (only Prioritization + Oct..Sep are read) ----------
    var sp = [["Prioritization", "Requirement", "POC", "Fund Type", "October", "November", "December", "January", "February", "March", "April", "May", "June", "July", "August", "September", "Total", "Remarks"]];
    ACC.forEach(function (a) {
      var prof = norm(a.prof), pr = PRIO[a.a], w2 = norm(pr.map(function () { return .5 + r(); }));
      pr.forEach(function (p, k) { var m = prof.map(function (x) { return Math.round(a.tdp * .985 * x * w2[k]); }); sp.push([p, "FY27 " + p.replace(/^P\d+ /, ""), "G3 RM", "OMNG"].concat(m, [m.reduce(function (s, v) { return s + v; }, 0), ""])); });
    });
    sp.push(["Total", "", "", ""].concat([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ""]));

    return [
      { name: "G3 Master Key.xlsx", sheets: [{ name: "Funding", aoa: fundTab }, { name: "Accounts", aoa: acctTab }, { name: "DPC", aoa: dpcTab }, { name: "Spend Plan", aoa: spTab }, { name: "Commitment Item", aoa: ciTab }] },
      { name: "Status of Funds export.xlsx", sheets: [{ name: "Export", aoa: ex }] },
      { name: "Checkbook Drill Down - Commitments.xlsx", sheets: [{ name: "Sheet1", aoa: cm }] },
      { name: "FMZ3 Unliquidated.xlsx", sheets: [{ name: "Sheet1", aoa: fz }] },
      { name: "G3 Spend Plan FY27.xlsx", sheets: [{ name: "Spend Plan", aoa: sp }] }
    ];
  };

  // The same test data written the way real exports often look: a title row above the headers, header variants, amounts as text
  // ("($1,234.56)", "1,234.56-", "$-12.00"), fiscal year "FY27", period "P02", Functional Areas in lower case with stray spaces,
  // account names with different case / trailing spaces, blank rows. Used by verify.js and written to samples/realistic/.
  G3.makeMessyFiles = function () {
    var F = G3.makeTestFiles(), key = F[0], ex = F[1].sheets[0].aoa;
    var fmtAmt = function (v, i) { var a = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); if (v >= 0) return i % 3 ? a : "$" + a; return i % 3 === 0 ? "(" + "$" + a + ")" : i % 3 === 1 ? a + "-" : "$-" + a; };
    var out = [["Status of Funds - Funds Execution Detail (GFEBS)"], [], ["Contract Doc No", "Commitment Item (FIPEX)", "Functional Area (FAREA)", "Appropriation Type", "Fiscal Year", "Fiscal Period", "Obligation Amt Cum", "Total Expenditure", "Disbursements"]];
    ex.slice(1).forEach(function (r, i) {
      if (i % 50 === 25) out.push([]);
      out.push([r[0], r[1], " " + String(r[2]).toLowerCase() + "  ", r[3], "FY" + String(r[4]).slice(2), "P" + ("0" + r[5]).slice(-2), fmtAmt(r[6] - r[7], i), fmtAmt(r[6], i), fmtAmt(r[7], i + 1)]);
    });
    var mk = key.sheets.map(function (sh) {
      var a = sh.aoa.map(function (r) { return r.slice(); });
      if (sh.name === "Accounts") { a[0] = ["FA", "Account Name"]; a.slice(1).forEach(function (r) { r[0] = String(r[0]).toLowerCase(); r[1] = String(r[1]).toLowerCase() + "  "; }); }
      if (sh.name === "Funding") { a[0] = a[0].map(function (h) { return h === "Account" ? "Acct" : h; }); a.slice(1).forEach(function (r) { r[1] = "$" + Number(r[1]).toLocaleString("en-US"); r[2] = Number(r[2]).toLocaleString("en-US"); }); }
      return { name: sh.name, aoa: a };
    });
    return [{ name: "G3 Master Key (realistic).xlsx", sheets: mk }, { name: "Status of Funds export (realistic).xlsx", sheets: [{ name: "Sheet1", aoa: out }] }];
  };

  // Cole's real GFEBS Status of Funds export header (the same report the Aviation and G1 dashboards load), all columns in order.
  G3.GFEBS_COLS = ["contract_doc_no", "commitment_item_fipex", "funds_center_fistl", "functional_area_farea", "appropriation_type", "fiscal_year_period", "fiscal_year_gjahr", "fund_fonds", "fund_type", "fiscal_year", "allotment_amt_cum", "afp_amt_cum", "reference_document_number_refbn", "treasury_account_symbol_main_account_main_acct", "funds_management_update_date_zhldt", "number_that_clearly_identifies_the_line_key_in_database_stunr", "wbs_element_|_posid", "reference_document_category_refbt", "fiscal_year_for_fi_document_number_kngjahr", "obligation_amt_cum", "order_|_aufnr", "cost_collector_type", "functional_cost_account_code", "source_table", "deletion_indicator_loekz", "description_|_post1", "item_for_payment_document_number_vobuzei", "company_code_for_payment_document_number_vobukrs", "application_of_secondary_source_funds_finuse", "period_perio", "attribute2", "predecessor_account_assignment_vrfknt", "description_|_postu", "commitment_item_category_potyp", "payment_document_number_vobelnr", "fiscal_year_for_payment_document_number_vogjahr", "amount_in_fm_area_currency_fkbtr", "fund_description_beschr", "time_of_data_entry_cputm", "unit_identification_code_|_uic", "cost_center_|_kostl", "amount_type_btart", "document_item_for_fi_document_number_knbuzei", "object_number_objnrz", "primary_key", "accounting_document_entry_date_cpudt", "posting_date_in_the_document_budat", "fi_document_number_knbelnr", "commitment_amt_cum", "attribute1", "value_type_wrttp", "description_|_ktext", "attribute4", "attribute3", "account_assignment_number_of_reference_document_rfknt", "funds_management_statistical_indicator_stats", "funded_program_measure", "predecessor_document_item_vrfpos", "fm_fund_type_type", "disbursement_amt_cum", "predecessor_document_number_vrefbn", "predecessor_document_category_vrefbt", "item_number_of_reference_document_rfpos", "organizational_unique_identifier_|_ouid", "expenditure_amt_cum", "wbs_element_|_pspnr", "source_system", "years_of_availability", "supplemental_apportionment_id", "fund_number_charachters", "fund_type_designator", "fiscal_year_of_issue", "fiscal_year_of_funds", "fund_description", "spend_type", "division", "ssn", "cost_type", "line_item_segment", "ape", "project", "fiscal_year_spend_occurred", "fiscal_month", "fiscal_date", "fiscal_period", "fiscal_year_of_expiry", "fiscal_date_of_expiry", "ending_fund_year", "sag", "mdep", "functional_area_description", "budget_activity", "mdep_description", "sag_description", "fund_center_description", "fund_center_l4_description", "fund_center_l3_description", "fund_center_l2_description", "commitment_item_described", "zz_issuing", "zz_req_office", "zz_admin_office", "zz_pay_office", "zz_piin", "zz_spiin", "zz_href", "zz_mod_num", "date_on_which_the_record_was_created_aedat", "purchasing_document_date_bedat", "purchasing_group_description_eknam", "purchasing_document_type_bsart"];
  // The test export written with that full header. Only the Aviation/G1 columns carry the real values; the look-alike columns
  // (fiscal_period, period_perio, fiscal_year_gjahr, obligation_amt_cum, expenditure_amt_cum, functional_area_description ...) hold
  // different numbers on purpose, so a check proves the loader reads the right ones.
  G3.makeGfebsExport = function () {
    var ex = G3.makeTestFiles()[1].sheets[0].aoa, H = G3.GFEBS_COLS, at = {}; H.forEach(function (h, i) { at[h] = i; });
    var out = [H.slice()];
    ex.slice(1).forEach(function (r, n) {
      var row = H.map(function () { return null; }), set = function (h, v) { row[at[h]] = v; };
      set("contract_doc_no", r[0]); set("commitment_item_fipex", r[1]); set("functional_area_farea", r[2]); set("appropriation_type", r[3]);
      set("fiscal_year", +r[4]); set("fiscal_month", +r[5]); set("commitment_amt_cum", r[6]); set("disbursement_amt_cum", r[7]);
      set("fiscal_period", (+r[5] + 5) % 12 + 1); set("period_perio", (+r[5] + 3) % 12 + 1); set("fiscal_year_period", "2019" + ("00" + ((+r[5] + 7) % 12 + 1)).slice(-3));
      set("fiscal_year_gjahr", 2019); set("fiscal_year_of_funds", 2025); set("fiscal_year_spend_occurred", 2024); set("fiscal_year_of_issue", 2023); set("ending_fund_year", 2028);
      set("obligation_amt_cum", r[6] * 7); set("expenditure_amt_cum", r[6] * 3); set("amount_in_fm_area_currency_fkbtr", 12345.67); set("allotment_amt_cum", -999999); set("afp_amt_cum", -888888);
      set("functional_area_description", "PAY AND ALLOWANCES " + String(r[2]).slice(-4)); set("commitment_item_described", "Described " + r[1]); set("commitment_item_category_potyp", 3);
      set("funds_center_fistl", "W7NZAA"); set("fund_fonds", "2060" + r[4]); set("fund_type", "NGPA"); set("order_|_aufnr", "000" + (100000 + n)); set("description_|_post1", "Line " + n);
      set("sag", "131"); set("mdep", "VTRN"); set("budget_activity", "01"); set("fund_center_description", "G3 TRAINING"); set("source_system", "GFEBS"); set("fiscal_date", "2026-1" + (n % 2) + "-15");
      set("posting_date_in_the_document_budat", "2019-03-0" + (1 + n % 9)); set("deletion_indicator_loekz", "");
      out.push(row);
    });
    return { name: "Status of Funds export (GFEBS full columns).xlsx", sheets: [{ name: "Sheet1", aoa: out }] };
  };
  // Aviation/G1 spend plan layout: Account, then month columns as dates; no Prioritization column.
  G3.makeAcctPlan = function () {
    var F = G3.makeTestFiles(), sp = F[4].sheets[0].aoa, key = F[0].sheets.filter(function (s) { return s.name === "Spend Plan"; })[0].aoa, map = {};
    key.slice(1).forEach(function (r) { map[String(r[0]).toUpperCase()] = r[1]; });
    var mi = []; sp[0].forEach(function (h, i) { if (/^(October|November|December|January|February|March|April|May|June|July|August|September)$/.test(h)) mi.push(i); });
    var head = ["Account"].concat(mi.map(function (_, k) { return new Date(2026 + (k >= 3 ? 1 : 0), (9 + k) % 12, 1); }));
    var acc = {}; sp.slice(1).forEach(function (r) { var a = map[String(r[0]).toUpperCase()]; if (!a) return; var o = acc[a] || (acc[a] = mi.map(function () { return 0; })); mi.forEach(function (c, k) { o[k] += +r[c] || 0; }); });
    return { name: "Spend plan (Account layout).xlsx", sheets: [{ name: "Plan", aoa: [head].concat(Object.keys(acc).map(function (a) { return [a].concat(acc[a]); })) }] };
  };
})(window);
