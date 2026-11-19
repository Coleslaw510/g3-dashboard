/* G3 Dashboard loaders: read Cole's real report layouts and turn them into the dashboard's data.
   Every file is recognised by its HEADER ROW (first 20 rows scanned), never by its file name.
   Kinds:
     fundkey : Funding key / Master Key "Funding" tab   Account, TDP, AFP, SAG, MDEP (+ optional Allotment, Fiscal Year)
     acctkey : Account key / Master Key "Accounts" tab  Functional Area, Account
     dpckey  : DPC key / Master Key "DPC" tab           DPC, Description, Account, TDC    (DPC = Internal Order)
     spkey   : Master Key "Spend Plan" tab              Prioritization, Account
     export  : GFEBS funds export, read EXACTLY like the Aviation Dashboard (commitment_amt_cum / disbursement_amt_cum,
               signs flipped, Obligation = Total Expenditure - Disbursement, ALLOBJ lines dropped)
     commit  : Commitments report (checkbook drill down)  Entry Type + Internal Order + Pay Group + Amount
     fmz3    : FMZ3 unliquidated report                  Earmarked Funds + Amount Open (TC) + Amount Total (TC)
     plan    : Spend plan                                Prioritization + October ... September amounts
   Parsing helpers below are ported unchanged from the Aviation Dashboard (dashboards/finance/funding.js). */
(function (w) {
  var G3 = w.G3 = w.G3 || {};
  // ===== CONFIG =====
  var FLIP_EXPORT_SIGN = true;       // funds export: commitment_amt_cum and disbursement_amt_cum are negative, flip them (Aviation rule)
  var FLIP_COMMIT_SIGN = true;       // commitments report: amounts are negative, flip them positive
  // Which accounts feed the program tabs. An account belongs to a tab when its name equals one of these
  // (case/spacing ignored) or contains it as a whole word. Checked in this order; first match wins.
  G3.PROGRAM_ACCOUNTS = { mob: ["OSS OPS/TRAINING", "MOB", "MOBILIZATION"], idt: ["IDT"], at: ["AT", "ANNUAL TRAINING"], sch: ["SCHOOLS", "SCHOOL"] };
  // ==================

  // ---------- helpers (Aviation funding.js) ----------
  function decodeX(h) { return String(h == null ? "" : h).replace(/_x([0-9a-fA-F]{4})_/g, function (m, x) { return String.fromCharCode(parseInt(x, 16)); }); }
  function norm(h) { return decodeX(h).replace(/\u00a0/g, " ").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
  function isPii(h) { var s = decodeX(h).toLowerCase(); if (/social\s*_?security/.test(s)) return true; return s.split(/[^a-z0-9]+/).some(function (t) { return /^ssn|ssn$/.test(t); }); }
  function aliasMap(cols) { var m = {}; cols.forEach(function (c) { m[norm(c[1])] = c[0]; c[2].forEach(function (a) { if (!m[a]) m[a] = c[0]; }); }); return m; }
  function txt(v) { return v == null ? "" : String(v).replace(/\u00a0/g, " ").trim(); }
  function blankish(v) {
    if (v == null) return true; if (typeof v === "number") return !isFinite(v);
    var s = txt(v); return !s || /^#(ref!|n\/a|value!|div\/0!|name\?|null!|num!|spill!|calc!)$/i.test(s) || /^\(?\s*blank\s*\)?$/i.test(s) || /^(n\/a|null|none)$/i.test(s);
  }
  function parseAmt(v) {
    if (typeof v === "number") return isFinite(v) ? v : null;
    if (blankish(v)) return null;
    var s = txt(v).replace(/[\s$,]/g, ""); if (/^[-\u2013\u2014]+$/.test(s)) return 0;
    var neg = false; if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/^[-\u2212]/.test(s)) { neg = !neg; s = s.slice(1); } if (/-$/.test(s)) { neg = !neg; s = s.slice(0, -1); }
    s = s.replace(/^\$/, ""); if (!/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return NaN;
    var n = parseFloat(s); return neg ? -n : n;
  }
  function idText(v) { if (blankish(v)) return ""; if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v); return txt(v); }
  function fyText(v) { if (blankish(v)) return ""; var s = typeof v === "number" ? String(Math.round(v)) : txt(v), m = s.match(/^(?:fy\s*)?(\d{2}|\d{4})(?:\.0+)?$/i); if (!m) return s; return m[1].length === 2 ? "20" + m[1] : m[1]; }
  var MON_FM = { oct: 1, nov: 2, dec: 3, jan: 4, feb: 5, mar: 6, apr: 7, may: 8, jun: 9, jul: 10, aug: 11, sep: 12 };
  function fmNum(v) {
    if (blankish(v)) return null; if (typeof v === "number") return v === Math.round(v) && v >= 1 && v <= 12 ? v : NaN;
    var s = txt(v).toLowerCase(), m = s.match(/^(?:p|per|period|fm|m)?\s*0*(\d{1,2})(?:\.0+)?(?:\s*[-\u2013:.]?\s*[a-z]{3,9}\.?)?$/);
    if (m) { var x = +m[1]; return x >= 1 && x <= 12 ? x : NaN; }
    m = s.match(/^([a-z]{3})[a-z]*\.?$/); return m && MON_FM[m[1]] ? MON_FM[m[1]] : NaN;
  }
  function isAllobj(v) { return typeof v === "string" && txt(v).toUpperCase() === "ALLOBJ"; }
  function kn(v) { var s = idText(v).toUpperCase().replace(/\s+/g, ""); return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, "") : s; }
  function an(v) { return txt(v).replace(/\s+/g, " ").toUpperCase(); }
  function dateIso(v) {
    if (blankish(v)) return "";
    if (v instanceof Date) return v.getFullYear() + "-" + ("0" + (v.getMonth() + 1)).slice(-2) + "-" + ("0" + v.getDate()).slice(-2);
    if (typeof v === "number" && v > 20000 && v < 80000) { var d = new Date(Math.round((v - 25569) * 864e5)); return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + d.getUTCDate()).slice(-2); }
    var s = txt(v), m;
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/))) { var y = m[3].length === 2 ? "20" + m[3] : m[3]; return y + "-" + ("0" + m[1]).slice(-2) + "-" + ("0" + m[2]).slice(-2); }   // US m/d/y
    if ((m = s.match(/^(\d{4})(\d\d)(\d\d)$/))) return m[1] + "-" + m[2] + "-" + m[3];
    var d2 = new Date(s); return isNaN(d2) ? "" : dateIso(d2);
  }
  function aoaSource(aoa) { var wd = 0; aoa.forEach(function (r) { if (r && r.length > wd) wd = r.length; }); return { rows: aoa.length, cols: wd, get: function (r, c) { var row = aoa[r]; return row ? row[c] : null; } }; }
  function mapHeaders(src, alias) {
    var hi = 0, best = -1;
    for (var r = 0; r < Math.min(src.rows, 20); r++) { var sc = 0; for (var c = 0; c < src.cols; c++) { var h = src.get(r, c); if (h != null && h !== "" && alias[norm(h)]) sc++; } if (sc > best) { best = sc; hi = r; } }
    var map = {}, extra = [];
    for (var ci = 0; ci < src.cols; ci++) {
      var hv = src.get(hi, ci); if (hv == null || txt(hv) === "") continue; if (isPii(hv)) continue;
      var k = alias[norm(hv)]; if (!k) { extra.push(txt(decodeX(hv))); continue; } if (map[k] != null) continue; map[k] = ci;
    }
    return { hi: hi, map: map, extra: extra };
  }
  G3.util = { norm: norm, txt: txt, parseAmt: parseAmt, idText: idText, kn: kn, an: an, dateIso: dateIso, aoaSource: aoaSource };

  // ---------- column aliases ----------
  var ACCT_AL = ["account", "accountname", "acctname", "acct"], FA_AL = ["functionalareafarea", "functionalarea", "farea"];
  var EXPORT_COLS = [   // Aviation Status of Funds export, unchanged (+ optional Pay Group / Internal Order if the export carries them)
    ["doc", "Document Number", ["contractdocno"]], ["ci", "Commitment Item", ["commitmentitemfipex", "commitmentitem"]],
    ["fa", "Functional Area", ["functionalareafarea", "functionalarea"]], ["appn", "Appropriation", ["appropriationtype", "appropriation"]],
    ["fy", "Fiscal Year", ["fiscalyear"]], ["fm", "Fiscal Month", ["fiscalmonth", "fiscalmonthno", "fiscalmonthnumber", "fiscalmo", "fiscalperiod", "fiscalper"]],
    ["com", "Total Expenditure", ["commitmentamtcum", "totalexpenditure", "commitments"]], ["disb", "Disbursement", ["disbursementamtcum", "disbursement", "disbursements"]],
    ["pg", "Pay Group", ["paygroup", "paygrp"]], ["dpc", "Internal Order", ["internalorder", "dpc"]]
  ];
  var EXPORT_ONLY = ["contractdocno", "commitmentitemfipex", "obligationamtcum", "commitmentamtcum", "disbursementamtcum"];
  var COMMIT_COLS = [["business", "Business", []], ["fc", "Fund Center", ["fundscenter", "fundcenter"]], ["fund", "Fund", []], ["fundcode", "Fund Code", []],
    ["pg", "Pay Group", ["paygroup", "paygrp"]], ["fa", "Functional Area", FA_AL], ["io", "Internal Order", ["internalorder", "dpc"]], ["cc", "Cost Center", []],
    ["wbs", "WBS", ["wbselement"]], ["fp", "Funded Program", []], ["acct", "Account", ACCT_AL], ["sdn", "SDN", []], ["jd", "Journal Date", []],
    ["et", "Entry Type", ["entrytype"]], ["amt", "Amount", ["amount"]]];
  var FMZ_COLS = [["dt", "Document type", []], ["gl", "G/L Account", ["glaccount"]], ["ref", "Reference", []], ["open", "Amount Open (TC)", ["amountopentc", "amountopen"]],
    ["total", "Amount Total (TC)", ["amounttotaltc", "amounttotal"]], ["post", "Posting Date", []], ["docdate", "Document Date", []], ["fmz", "Earmarked Funds", ["earmarkedfunds", "earmarkedfundsdocument"]],
    ["fund", "Fund", []], ["fa", "Functional Area", FA_AL], ["fc", "Funds Center", ["fundscenter", "fundcenter"]], ["cc", "Cost Center", []], ["order", "Order", ["internalorder"]],
    ["supplier", "Supplier", ["vendor"]], ["hdr", "Document Header Text", ["documentheadertext", "headertext"]], ["by", "Created by", ["createdby"]],
    ["openlc", "Amount Open (LC)", ["amountopenlc"]], ["refitem", "Reference item", []], ["cust", "Customer", []], ["wbs", "WBS element", ["wbs"]], ["cur", "Currency", []],
    ["cocd", "Company Code", []], ["ci", "Commitment item", ["commitmentitem"]], ["text", "Text", []]];
  var FUND_COLS = [["fy", "Fiscal Year", ["fiscalyear", "fy"]], ["acct", "Account", ACCT_AL], ["tdp", "TDP", []], ["afp", "AFP", []], ["allot", "Allotment", ["allotment", "allot"]], ["sag", "SAG", []], ["mdep", "MDEP", []]];
  var AKEY_COLS = [["fa", "Functional Area", FA_AL], ["acct", "Account", ACCT_AL], ["sag", "Sag", []], ["mdep", "MDEP", []]];
  var DKEY_COLS = [["dpc", "DPC", ["dpc", "internalorder", "dpccode"]], ["desc", "Description", ["description", "desc", "dpcdescription"]], ["acct", "Account", ACCT_AL], ["tdc", "TDC", ["tdc"]]];
  var SKEY_COLS = [["prio", "Prioritization", ["prioritization", "priority", "prioritisation"]], ["acct", "Account", ACCT_AL]];
  var A = { export: aliasMap(EXPORT_COLS), commit: aliasMap(COMMIT_COLS), fmz3: aliasMap(FMZ_COLS), fundkey: aliasMap(FUND_COLS), acctkey: aliasMap(AKEY_COLS), dpckey: aliasMap(DKEY_COLS), spkey: aliasMap(SKEY_COLS) };
  function monthOf(h) { var s = norm(h).replace(/^(fy\d{2,4})/, ""), m = s.match(/^(oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep)/); if (!m) return 0; if (/^(total|actual|obl)/.test(s)) return 0; return MON_FM[m[1]]; }
  G3.KIND_LABEL = { fundkey: "Funding key", acctkey: "Account key", dpckey: "DPC key", spkey: "Spend plan key", export: "Status of Funds export", commit: "Commitments report", fmz3: "FMZ3 unliquidated", plan: "Spend plan" };
  G3.KIND_ORDER = ["fundkey", "acctkey", "dpckey", "spkey", "export", "commit", "fmz3", "plan"];

  // ---------- which kind of sheet is this? (header row, not file name) ----------
  function classify(src) {
    var best = null;
    for (var r = 0; r < Math.min(src.rows, 20); r++) {
      var H = {}, months = {};
      for (var c = 0; c < src.cols; c++) { var h = src.get(r, c); if (h == null || h === "") continue; H[norm(h)] = 1; var mo = monthOf(h); if (mo) months[mo] = 1; }
      var has = function () { for (var i = 0; i < arguments.length; i++) if (H[arguments[i]]) return true; return false; };
      var nMon = Object.keys(months).length, k = null;
      if (has("earmarkedfunds") && has("amountopentc", "amountopen")) k = "fmz3";
      else if (has("entrytype") && has("amount") && has("internalorder")) k = "commit";
      else if (EXPORT_ONLY.some(function (x) { return H[x]; })) k = "export";
      else if (has("prioritization", "priority", "prioritisation") && nMon >= 6) k = "plan";
      else if (has("prioritization", "priority", "prioritisation") && has.apply(null, ACCT_AL)) k = "spkey";
      else if (has("tdc") || (has("dpc", "internalorder") && has("description", "desc", "dpcdescription"))) k = "dpckey";
      else if (has("tdp", "afp") && has.apply(null, ACCT_AL)) k = "fundkey";
      else if (has.apply(null, FA_AL) && has.apply(null, ACCT_AL)) k = "acctkey";
      if (k) { best = { kind: k, row: r }; break; }
    }
    return best;
  }

  // ---------- parsers: each returns { rows, report } ----------
  function rep0(kind, hm) { return { kind: kind, headerRow: hm.hi + 1, rowsRead: 0, rowsLoaded: 0, blank: 0, skipped: {}, notes: [], ignoredCols: hm.extra.length, fatal: null }; }
  function skip(rep, why) { rep.skipped[why] = (rep.skipped[why] || 0) + 1; }
  function rowsOf(src, hm, fn, rep) {
    var keys = Object.keys(hm.map), out = [];
    for (var r = hm.hi + 1; r < src.rows; r++) {
      var raw = {}, empty = true; keys.forEach(function (k) { var v = src.get(r, hm.map[k]); raw[k] = v; if (!blankish(v)) empty = false; });
      if (empty) { rep.blank++; continue; } rep.rowsRead++;
      var x = fn(raw, r + 1); if (x) out.push(x);
    }
    rep.rowsLoaded = out.length; return out;
  }
  var P = {};
  P.export = function (src) {   // identical to the Aviation Dashboard's parseExport
    var hm = mapHeaders(src, A.export), map = hm.map, rep = rep0("export", hm);
    if (map.ci == null) { rep.fatal = "No Commitment Item column (commitment_item_fipex) was found."; return { rows: [], report: rep }; }
    if (map.com == null || map.disb == null) { rep.fatal = "Missing commitment_amt_cum or disbursement_amt_cum; both are needed to calculate Obligation."; return { rows: [], report: rep }; }
    rep.hasPg = map.pg != null; rep.hasDpc = map.dpc != null;
    var rows = rowsOf(src, hm, function (raw, rn) {
      if (isAllobj(raw.ci)) { skip(rep, "ALLOBJ lines removed"); return null; }
      var fm = "fm" in raw ? fmNum(raw.fm) : null; if (fm !== null && isNaN(fm)) { skip(rep, "unreadable fiscal month (kept, no month)"); fm = null; }
      var com = parseAmt(raw.com), disb = parseAmt(raw.disb);
      if (isNaN(com)) com = null; if (isNaN(disb)) disb = null;
      if (FLIP_EXPORT_SIGN) { if (com) com = -com; if (disb) disb = -disb; }
      var obl = Math.round(((com || 0) - (disb || 0)) * 100) / 100;          // Obligation = Total Expenditure - Disbursement
      return { doc: idText(raw.doc), ci: idText(raw.ci), fa: idText(raw.fa), appn: idText(raw.appn), fy: fyText(raw.fy), fm: fm, te: com || 0, oblig: obl, disb: disb || 0, pg: idText(raw.pg), dpc: idText(raw.dpc) };
    }, rep);
    if (FLIP_EXPORT_SIGN) rep.notes.push("Signs flipped; Obligation = Total Expenditure \u2212 Disbursement (Aviation rule)");
    return { rows: rows, report: rep };
  };
  P.commit = function (src) {
    var hm = mapHeaders(src, A.commit), map = hm.map, rep = rep0("commit", hm);
    if (map.et == null || map.amt == null) { rep.fatal = "A commitments report needs Entry Type and Amount columns."; return { rows: [], report: rep }; }
    rep.positive = 0; rep.nCommit = 0; rep.nOblig = 0;
    var rows = rowsOf(src, hm, function (raw) {
      var et = txt(raw.et), type = /commit/i.test(et) ? "commit" : /oblig/i.test(et) ? "oblig" : null;
      if (!type) { skip(rep, "other entry types ignored" + (et ? "" : " (blank)")); return null; }
      var a = parseAmt(raw.amt); if (a == null || isNaN(a)) { skip(rep, "blank or unreadable amount"); return null; }
      if (a > 0) rep.positive++;
      if (type === "commit") rep.nCommit++; else rep.nOblig++;
      return { type: type, pg: idText(raw.pg), dpc: idText(raw.io), rptAcct: txt(raw.acct), amt: FLIP_COMMIT_SIGN ? -a : a, sdn: idText(raw.sdn), fp: txt(raw.fp), fc: idText(raw.fc), fund: idText(raw.fund), wbs: idText(raw.wbs), cc: idText(raw.cc), et: et };
    }, rep);
    rep.notes.push(rep.nCommit + " commitment rows (count toward execution in TDP view)");
    rep.notes.push(rep.nOblig + " obligation rows loaded for spending-by-DPC tracking only (not added to totals; Status of Funds already counts obligations)");
    if (rep.positive) rep.notes.push(rep.positive + " rows had positive amounts (become negative after the flip, e.g. reversals)");
    rep.notes.push("Functional Area and Journal Date on this report are ignored");
    return { rows: rows, report: rep };
  };
  P.fmz3 = function (src) {
    var hm = mapHeaders(src, A.fmz3), map = hm.map, rep = rep0("fmz3", hm);
    if (map.open == null) { rep.fatal = "No Amount Open (TC) column was found."; return { rows: [], report: rep }; }
    var rows = rowsOf(src, hm, function (raw) {
      var open = parseAmt(raw.open), total = parseAmt(raw.total);
      if (open == null || isNaN(open) || Math.abs(open) < 0.005) { skip(rep, "zero-open rows excluded"); return null; }
      var trav = G3.traveler(raw.hdr);
      return { fmz: idText(raw.fmz), dt: txt(raw.dt), gl: idText(raw.gl), ref: idText(raw.ref), open: Math.abs(open), total: total == null || isNaN(total) ? Math.abs(open) : Math.abs(total),
        post: dateIso(raw.post), docdate: dateIso(raw.docdate), fund: idText(raw.fund), fa: idText(raw.fa), fc: idText(raw.fc), cc: idText(raw.cc), order: idText(raw.order),
        supplier: txt(raw.supplier), hdr: txt(raw.hdr), by: txt(raw.by), wbs: idText(raw.wbs), ci: txt(raw.ci), text: txt(raw.text), traveler: trav };
    }, rep);
    var nt = rows.filter(function (r) { return r.traveler; }).length; if (nt) rep.notes.push(nt + " DTS traveler names cleaned from Document Header Text");
    rep.notes.push("Days open = as-of date \u2212 Posting Date; no Pay Group on this report");
    return { rows: rows, report: rep };
  };
  P.fundkey = function (src) {
    var hm = mapHeaders(src, A.fundkey), map = hm.map, rep = rep0("fundkey", hm);
    if (map.acct == null) { rep.fatal = "The funding key needs an Account column."; return { rows: [], report: rep }; }
    rep.hasAllot = map.allot != null;
    var rows = rowsOf(src, hm, function (raw) {
      var ac = txt(raw.acct).replace(/\s+/g, " "); if (!ac) { skip(rep, "no Account"); return null; } if (/^total/i.test(ac)) { skip(rep, "total rows"); return null; }
      var f = function (k) { var x = parseAmt(raw[k]); return x == null || isNaN(x) ? 0 : x; };
      return { acct: ac, fy: fyText(raw.fy), tdp: f("tdp"), afp: f("afp"), allot: map.allot != null ? f("allot") : null, sag: idText(raw.sag), mdep: idText(raw.mdep) };
    }, rep);
    if (!rep.hasAllot) rep.notes.push("No Allotment column, so the Allotment view is off. Add an Allotment column to turn it on.");
    return { rows: rows, report: rep };
  };
  P.acctkey = function (src) {
    var hm = mapHeaders(src, A.acctkey), rep = rep0("acctkey", hm);
    if (hm.map.fa == null || hm.map.acct == null) { rep.fatal = "The account key needs Functional Area and Account columns."; return { rows: [], report: rep }; }
    return { rows: rowsOf(src, hm, function (raw) { var fa = idText(raw.fa), ac = txt(raw.acct).replace(/\s+/g, " "); if (!fa || !ac) { skip(rep, "missing Functional Area or Account"); return null; } return { fa: fa, acct: ac, sag: idText(raw.sag), mdep: idText(raw.mdep) }; }, rep), report: rep };
  };
  P.dpckey = function (src) {
    var hm = mapHeaders(src, A.dpckey), rep = rep0("dpckey", hm);
    if (hm.map.dpc == null) { rep.fatal = "The DPC key needs a DPC column."; return { rows: [], report: rep }; }
    return { rows: rowsOf(src, hm, function (raw) { var d = idText(raw.dpc); if (!d) { skip(rep, "no DPC"); return null; } return { dpc: d, desc: txt(raw.desc), acct: txt(raw.acct).replace(/\s+/g, " "), tdc: txt(raw.tdc) }; }, rep), report: rep };
  };
  P.spkey = function (src) {
    var hm = mapHeaders(src, A.spkey), rep = rep0("spkey", hm);
    return { rows: rowsOf(src, hm, function (raw) { var p = txt(raw.prio), ac = txt(raw.acct).replace(/\s+/g, " "); if (!p || !ac) { skip(rep, "missing Prioritization or Account"); return null; } return { prio: p, acct: ac }; }, rep), report: rep };
  };
  P.plan = function (src, cls) {
    var hi = cls ? cls.row : 0, pc = -1, fyc = -1, mc = {}, rep = { kind: "plan", headerRow: hi + 1, rowsRead: 0, rowsLoaded: 0, blank: 0, skipped: {}, notes: [], ignoredCols: 0, fatal: null };
    for (var c = 0; c < src.cols; c++) {
      var h = src.get(hi, c); if (h == null || h === "") continue; var nh = norm(h), mo = monthOf(h);
      if (pc < 0 && ["prioritization", "priority", "prioritisation"].indexOf(nh) >= 0) pc = c;
      else if (fyc < 0 && (nh === "fiscalyear" || nh === "fy")) fyc = c;
      else if (mo && mc[mo] == null) mc[mo] = c; else rep.ignoredCols++;
    }
    if (pc < 0) { rep.fatal = "No Prioritization column."; return { rows: [], report: rep }; }
    var out = [];
    for (var r = hi + 1; r < src.rows; r++) {
      var p = txt(src.get(r, pc)), m = [], any = false;
      for (var i = 1; i <= 12; i++) { var x = mc[i] != null ? parseAmt(src.get(r, mc[i])) : null; if (x == null || isNaN(x)) x = 0; else any = true; m.push(x); }
      if (!p && !any) { rep.blank++; continue; } rep.rowsRead++;
      if (!p) { skip(rep, "no Prioritization"); continue; } if (/^(grand\s*)?total/i.test(p)) { skip(rep, "total rows"); continue; }
      out.push({ prio: p, fy: fyc >= 0 ? fyText(src.get(r, fyc)) : "", m: m });
    }
    rep.rowsLoaded = out.length; rep.months = Object.keys(mc).length;
    rep.notes.push("Used Prioritization and " + rep.months + " month columns; " + rep.ignoredCols + " other columns ignored");
    return { rows: out, report: rep };
  };

  // ---------- DTS traveler names from Document Header Text ----------
  var FIRST = ("james john robert michael william david richard joseph thomas charles christopher daniel matthew anthony mark donald steven paul andrew joshua kenneth kevin brian george timothy ronald edward jason jeffrey ryan jacob gary nicholas eric jonathan stephen larry justin scott brandon benjamin samuel gregory alexander frank patrick raymond jack dennis jerry tyler aaron jose adam nathan henry douglas zachary peter kyle noah ethan jeremy walter christian keith roger terry austin sean gerald carl harold dylan arthur lawrence jordan jesse bryan billy bruce gabriel joe logan alan juan albert willie elijah wayne randy vincent mason roy ralph bobby russell bradley philip eugene luis carlos miguel cody travis derek marcus caleb hunter isaac luke evan " +
    "mary patricia jennifer linda elizabeth barbara susan jessica sarah karen lisa nancy betty sandra margaret ashley kimberly emily donna michelle carol amanda melissa deborah stephanie dorothy rebecca sharon laura cynthia amy kathleen angela shirley brenda emma anna pamela nicole samantha katherine christine helen debra rachel carolyn janet maria catherine heather diane olivia julie joyce victoria ruth virginia lauren kelly christina joan evelyn judith andrea hannah megan cheryl jacqueline martha madison teresa gloria sara janice ann kathryn abigail sophia frances jean alice judy isabella julia grace amber denise danielle marilyn beverly charlotte natalie theresa diana brittany doris kayla alexis lori marie taylor tiffany erin crystal jasmine morgan chloe").split(" ").filter(Boolean).sort(function (a, b) { return b.length - a.length; });
  function tc(s) { return s.toLowerCase().replace(/(^|[\s'\-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }); }
  G3.traveler = function (hdr) {
    var m = txt(hdr).match(/travell?er\s*[:\-=]?\s*([A-Za-z][A-Za-z ,.'\-]*)/i); if (!m) return "";
    var s = m[1].replace(/\s+/g, " ").trim().replace(/[.,]+$/, "");
    if (s.indexOf(",") >= 0) { var p = s.split(","); return tc((p[1] || "").trim().split(" ")[0] + " " + p[0].trim()); }      // LAST, FIRST
    var t = s.split(" ");
    if (t.length >= 2) return tc(t[1] + " " + t[0]);                                                                          // LAST FIRST [MI]
    var cc = s.match(/^([A-Z][a-z]+)([A-Z][a-z]+)$/); if (cc) return tc(cc[2] + " " + cc[1]);                                   // SmithJohn
    var low = s.toLowerCase();
    for (var i = 0; i < FIRST.length; i++) { var f = FIRST[i]; if (low.length - f.length >= 2 && low.slice(-f.length) === f) return tc(f + " " + low.slice(0, -f.length)); }  // smithjohn
    return tc(s);
  };

  // ---------- reading files ----------
  // sheets: [{name, aoa}] from one file. Returns [{kind, rows, report, sheet}] for each recognised sheet.
  G3.parseWorkbook = function (fileName, sheets) {
    var out = [], seen = {};
    sheets.forEach(function (sh) {
      var src = aoaSource(sh.aoa), cls = classify(src); if (!cls) return;
      if (seen[cls.kind]) return; seen[cls.kind] = 1;
      var res = P[cls.kind](src, cls); res.report.sheet = sh.name; res.report.file = fileName;
      out.push({ kind: cls.kind, rows: res.rows, report: res.report });
    });
    return out;
  };

  // ---------- build the dashboard's data from the loaded datasets ----------
  G3.programOf = function (acct) {
    var a = an(acct); if (!a) return null;
    var order = Object.keys(G3.PROGRAM_ACCOUNTS);
    for (var i = 0; i < order.length; i++) {
      var list = G3.PROGRAM_ACCOUNTS[order[i]];
      for (var j = 0; j < list.length; j++) { var p = an(list[j]); if (a === p || new RegExp("(^|[^A-Z0-9])" + p.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&") + "([^A-Z0-9]|$)").test(a)) return order[i]; }
    }
    return null;
  };
  G3.derive = function () {
    var d = G3.data, S = d.sets, cur = G3.fyOf(G3.asOf()), curFm = (G3.asOf().getMonth() + 3) % 12 + 1;
    var rows = function (k) { return S[k] ? S[k].rows : []; };
    var names = {}, accounts = [], unm = { fa: {}, dpc: {}, prio: {}, fmzFa: {} };
    function addAcct(ac) { var k = an(ac); if (!k) return ""; if (!names[k]) { names[k] = ac; accounts.push({ id: ac, name: ac, program: G3.programOf(ac) }); } return names[k]; }
    var faMap = {}, info = {};
    rows("fundkey").forEach(function (r) { addAcct(r.acct); });
    rows("acctkey").forEach(function (r) { var ac = addAcct(r.acct); if (!faMap[kn(r.fa)]) faMap[kn(r.fa)] = ac; });
    var dpcMap = {}; d.dpcs = [];
    rows("dpckey").forEach(function (r) { var ac = r.acct ? addAcct(r.acct) : ""; var k = kn(r.dpc); if (dpcMap[k]) return; dpcMap[k] = { code: r.dpc, name: r.desc || r.dpc, account: ac, tdc: r.tdc || "No TDC" }; d.dpcs.push(dpcMap[k]); });
    var prioMap = {}; rows("spkey").forEach(function (r) { prioMap[an(r.prio)] = addAcct(r.acct); });
    var UN = "Unmapped";
    function acctFa(fa, bucket) { var a = faMap[kn(fa)]; if (a) return a; if (fa) bucket[fa] = (bucket[fa] || 0) + 1; return UN; }
    // funding (no Fiscal Year column = current fiscal year)
    d.funding = []; var hasAllot = false;
    rows("fundkey").forEach(function (r) { if (r.allot != null) hasAllot = true; d.funding.push({ fy: r.fy || cur, account: names[an(r.acct)], pg: "", tdp: r.tdp, afp: r.afp, allot: r.allot || 0, sag: r.sag, mdep: r.mdep }); info[an(r.acct)] = { sag: r.sag, mdep: r.mdep }; });
    rows("acctkey").forEach(function (r) { var i = info[an(r.acct)] || (info[an(r.acct)] = {}); if (!i.sag && r.sag) i.sag = r.sag; if (!i.mdep && r.mdep) i.mdep = r.mdep; });
    d.hasAllot = hasAllot; d.acctInfo = info;
    // execution lines: export (obligations / disbursements) + commitments (commitments report, current FY)
    d.lines = [];
    rows("export").forEach(function (r) { d.lines.push({ fy: r.fy || cur, fm: r.fm || curFm, account: acctFa(r.fa, unm.fa), pg: r.pg, dpc: r.dpc, doc: r.doc, ci: r.ci, commit: 0, oblig: r.oblig, disb: r.disb, src: "export" }); });
    // commitments report rows: commitments feed execution; obligations feed spending-by-DPC only
    d.dpcLines = [];
    rows("commit").forEach(function (r) {
      var k = kn(r.dpc), m = dpcMap[k], ac = m && m.account ? m.account : (names[an(r.rptAcct)] || "");
      if (!m && r.dpc) unm.dpc[r.dpc] = (unm.dpc[r.dpc] || 0) + 1;
      ac = ac || UN;
      d.dpcLines.push({ type: r.type, account: ac, pg: r.pg, dpc: r.dpc, amt: r.amt, sdn: r.sdn });
      if (r.type === "commit") d.lines.push({ fy: cur, fm: curFm, account: ac, pg: r.pg, dpc: r.dpc, doc: r.sdn, ci: "", commit: r.amt, oblig: 0, disb: 0, src: "commit" });
    });
    // spend plan: Prioritization -> Account (Spend Plan tab, or an exact account name); several prioritizations add up
    var plan = {};
    rows("plan").forEach(function (r) {
      var ac = prioMap[an(r.prio)] || names[an(r.prio)]; if (!ac) { unm.prio[r.prio] = (unm.prio[r.prio] || 0) + 1; return; }
      var fy = r.fy || cur, key = fy + "|" + ac, p = plan[key] || (plan[key] = { fy: fy, account: ac, pg: "", m: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prios: [] });
      for (var i = 0; i < 12; i++) p.m[i] += r.m[i]; p.prios.push(r.prio);
    });
    d.plan = Object.keys(plan).map(function (k) { return plan[k]; });
    // unliquidated (FMZ3): Functional Area -> Account (Accounts tab); Order = DPC
    d.ulo = rows("fmz3").map(function (r) {
      var ac = faMap[kn(r.fa)] || (dpcMap[kn(r.order)] && dpcMap[kn(r.order)].account) || "";
      if (!ac) { if (r.fa) unm.fmzFa[r.fa] = (unm.fmzFa[r.fa] || 0) + 1; ac = UN; }
      return Object.assign({}, r, { account: ac, pg: "", dpc: r.order, date: r.post || r.docdate, ci: r.ci, type: r.traveler ? "DTS" : (r.ci || r.dt || "Other"), desc: r.traveler ? "DTS \u2013 " + r.traveler : (r.hdr || r.text || "") });
    });
    if ([d.lines, d.ulo, d.dpcLines].some(function (a) { return a.some(function (x) { return x.account === UN; }); })) addAcct(UN);
    d.accounts = accounts;
    var fys = {}; fys[cur] = 1; d.lines.forEach(function (l) { if (l.fy) fys[l.fy] = 1; }); d.funding.forEach(function (f) { fys[f.fy] = 1; });
    d.fys = Object.keys(fys).sort();
    d.unmapped = unm;
    d.hasPg = { export: !!(S.export && S.export.report.hasPg), commit: !!S.commit };
    if (d.fys.indexOf(G3.state.fy) < 0) G3.state.fy = cur;
    if (!d.hasAllot && G3.state.view === "allot") G3.state.view = "tdp";
  };
  G3.DATASET_COLS = {
    fundkey: "Account, TDP, AFP, SAG, MDEP (optional: Allotment, Fiscal Year)",
    acctkey: "Functional Area, Account",
    dpckey: "DPC, Description, Account, TDC",
    spkey: "Prioritization, Account",
    export: "contract_doc_no, commitment_item_fipex, functional_area_farea, appropriation_type, fiscal_year, fiscal_month, commitment_amt_cum, disbursement_amt_cum (same as Aviation)",
    commit: "Entry Type, Internal Order, Pay Group, Amount (Business, Fund Center, Fund, Fund Code, Functional Area, Cost Center, WBS, Funded Program, Account, SDN, Journal Date also present)",
    fmz3: "Amount Open (TC), Amount Total (TC), Posting Date, Earmarked Funds, Functional Area, Document Header Text, Commitment item, Order (+ the rest of the FMZ3 columns)",
    plan: "Prioritization, October \u2026 September (all other columns ignored)"
  };
})(window);
