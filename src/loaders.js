/* G3 Dashboard loaders: read Cole's real report layouts and turn them into the dashboard's data.
   Every file is recognised by its HEADER ROW (first 20 rows scanned), never by its file name.
   Kinds:
     fundkey : Funding key / Master Key "Funding" tab   Account, TDP, AFP, SAG, MDEP (+ optional Allotment, Fiscal Year)
     acctkey : Account key / Master Key "Accounts" tab  Functional Area, Account
     dpckey  : DPC key / Master Key "DPC" tab           DPC, Description, Account, TDC    (DPC = Internal Order)
     spkey   : Master Key "Spend Plan" tab              Prioritization, Account
     unitkey : Master Key "Units" tab                   UIC, Unit Name, MSC, Battalion/Unit
     hierkey : Master Key "Hierarchy Level" tab         level order and/or UIC + parent/level
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
  // Erroneous Internal Orders / Orders to drop from commitments, DPC spending, the FMZ3 Order join and Unliquidated DPC labels.
  // SOF dollars on these Orders are kept (execution totals do not change) and shown as "No order (excluded DPC)".
  G3.EXCLUDED_DPCS = ["NGDFHDOU"];
  // Pay group filter is kept in the code but turned off. The live filter is SOF fund (206010 / 206011 / 206510).
  G3.USE_PAYGROUPS = false;
  // Display / filter codes, with the trailing D27 (or other non-numeric suffix) stripped. 206511 is intentionally omitted.
  G3.FUNDS = ["206010", "206011", "206510"];
  // TDP / AFP / Allotment for a fund = the sum of these accounts (names matched case-insensitively / normalized).
  G3.FUND_ACCOUNTS = {
    "206010": ["AT", "IDT", "AFTP", "EBDL", "IET", "SCHOOLS", "IDT SUPPORT", "TRAINING SUPPORT", "LANGUAGE", "CYBER", "FOUNDRY", "SRP SUPPORT", "NET", "NTC", "TRAUMA TRAINING"],
    "206011": ["OSS SCHOOLS", "OSS OPS/TRAINING"],
    "206510": ["ANTITERRORISM", "SECURITY", "TRAUMA TRAINING 2065"]
  };
  // ==================

  // ---------- helpers (Aviation funding.js) ----------
  function decodeX(h) { return String(h == null ? "" : h).replace(/_x([0-9a-fA-F]{4})_/g, function (m, x) { return String.fromCharCode(parseInt(x, 16)); }); }
  function norm(h) { return canon(decodeX(h).replace(/\u00a0/g, " ").toLowerCase().replace(/[^a-z0-9]+/g, "")); }
  // real exports and keys label the same column several ways: fold the common ones onto one name
  function canon(s) {
    if (/^(func(tional|t)?area(farea|fa|code|cd|id)?|farea|fa)$/.test(s)) return "functionalarea";
    if (/^(acct|account)(name|title|nm)?$/.test(s)) return "account";
    if (/^(fiscalyr|fiscyear|fyr)$/.test(s)) return "fiscalyear";
    if (/^(fiscalmonth|fiscalmonthno|fiscalmonthnumber|fiscalmo|fmonth)$/.test(s)) return "fiscalmonth";
    if (/^(commitmentitem(fipex|code|cd)?|cmmtitem|cmtitem|fipex|ci)$/.test(s)) return "commitmentitem";
    if (/^(totalexpenditures?|totalexp|commitmentamtcum|commitmentamount|commitmentscum)$/.test(s)) return "commitmentamtcum";
    if (/^(disbursementamtcum|disbursements?|disbursementamount|disbursedamt|disbursed)$/.test(s)) return "disbursementamtcum";
    // UIC (not OUID): unit_identification_code_|_uic, UIC, Unit Identification Code
    if (/^(uic|unitidentificationcode(uic)?|unitid(entification)?code)$/.test(s) || /(^|[^a-z])uic$/.test(s)) return "uic";
    if (/^(unitname|unitnm|unittitle|nameofunit)$/.test(s)) return "unitname";
    if (/^(msc|majorsubordinatecommand|majorsubordinatecmd|majorsubcommand)$/.test(s)) return "msc";
    if (/^(battalionunit|battalionorunit|bnunit|battalion|bn|unitbattalion)$/.test(s)) return "battalionunit";
    if (/^(hierarchylevel|hierlevel|hierarchylvl|levelname)$/.test(s)) return "hierarchylevel";
    if (/^(parentuic|parent|higheruic|parentunit|higherunit)$/.test(s)) return "parentuic";
    return s;
  }
  function isPii(h) { var s = decodeX(h).toLowerCase(); if (/social\s*_?security/.test(s)) return true; return s.split(/[^a-z0-9]+/).some(function (t) { return /^ssn|ssn$/.test(t); }); }
  function aliasMap(cols) { var m = {}, x = {}; cols.forEach(function (c) { m[norm(c[1])] = c[0]; c[2].forEach(function (a) { if (!m[a]) m[a] = c[0]; if (!x[a]) x[a] = c[0]; }); }); Object.defineProperty(m, "__exact", { value: x }); return m; }
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
    if (blankish(v)) return null; if (typeof v === "number") { if (v >= 2000001 && v <= 2099012 && v === Math.round(v)) v = v % 1000; return v === Math.round(v) && v >= 1 && v <= 12 ? v : NaN; }
    var s = txt(v).toLowerCase(), m = s.match(/^(?:20\d\d)[\/.]?(0\d\d)$|^(0\d\d)[\/.](?:20\d\d)$/);   // SAP fiscal year/period: 2027002, 2027/002, 002.2027
    if (m) { var pp = +(m[1] || m[2]); return pp >= 1 && pp <= 12 ? pp : NaN; }
    m = s.match(/^(?:p|per|period|fm|m)?\s*0*(\d{1,2})(?:\.0+)?(?:\s*[-\u2013:.]?\s*[a-z]{3,9}\.?)?$/);
    if (m) { var x = +m[1]; return x >= 1 && x <= 12 ? x : NaN; }
    m = s.match(/^([a-z]{3})[a-z]*\.?$/); return m && MON_FM[m[1]] ? MON_FM[m[1]] : NaN;
  }
  function fmOfDate(v) { var d = dateIso(v); return d ? (+d.slice(5, 7) + 2) % 12 + 1 : null; }
  function isAllobj(v) { return typeof v === "string" && txt(v).toUpperCase() === "ALLOBJ"; }
  function kn(v) { var s = idText(v).toUpperCase().replace(/\s+/g, ""); return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, "") : s; }
  // Functional Area join key: letters and digits only, upper case (drops spaces, non-breaking/zero-width characters, dashes, a trailing *); leading zeros ignored when all digits
  function fk(v) { var s = idText(v).toUpperCase().replace(/[^A-Z0-9]/g, ""); return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, "") : s; }
  // Account join key, used by EVERY key tab and report (Funding, Accounts, DPC, Spend Plan, plan Account column, commitments Account column):
  // case, repeated/odd spaces, hidden characters and spacing around / - & are ignored ("Oss Ops / Training" = "OSS OPS/TRAINING")
  function an(v) { return txt(v).replace(/[\u200b-\u200d\u2060\ufeff]/g, "").replace(/\s+/g, " ").replace(/\s*([\/&\-])\s*/g, "$1").trim().toUpperCase(); }
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
    var map = {}, extra = [], used = {};
    for (var c0 = 0; c0 < src.cols; c0++) {   // pass 1: a header that IS one of the listed names (e.g. fiscal_month, commitment_amt_cum) wins
      var h0 = src.get(hi, c0); if (h0 == null || txt(h0) === "" || isPii(h0)) continue;
      var r0 = decodeX(h0).replace(/\u00a0/g, " ").toLowerCase().replace(/[^a-z0-9]+/g, ""), k0 = alias.__exact[r0];
      if (k0 && map[k0] == null) { map[k0] = c0; used[c0] = 1; }
    }
    for (var ci = 0; ci < src.cols; ci++) {   // pass 2: header variants (FA, Func Area, Total Expenditure ...)
      if (used[ci]) continue; var hv = src.get(hi, ci); if (hv == null || txt(hv) === "") continue; if (isPii(hv)) continue;
      var k = alias[norm(hv)]; if (!k) { extra.push(txt(decodeX(hv))); continue; } if (map[k] != null) continue; map[k] = ci;
    }
    return { hi: hi, map: map, extra: extra };
  }
  function uk(v) { return idText(v).toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  G3.util = { fmNum: fmNum, norm: norm, txt: txt, parseAmt: parseAmt, idText: idText, kn: kn, uk: uk, an: an, dateIso: dateIso, aoaSource: aoaSource };

  // ---------- column aliases ----------
  var ACCT_AL = ["account", "accountname", "acctname", "acct"], FA_AL = ["functionalarea", "functionalareafarea", "farea"];
  var EXPORT_COLS = [   // Aviation Status of Funds export, unchanged (+ optional Pay Group / Internal Order if the export carries them)
    ["doc", "Document Number", ["contractdocno"]], ["ci", "Commitment Item", ["commitmentitem", "commitmentitemfipex"]],
    ["fa", "Functional Area", ["functionalareafarea", "functionalarea"]], ["appn", "Appropriation", ["appropriationtype", "appropriation"]],
    ["fund", "Fund", ["fund", "fundfincode", "fundfinds", "fundfonds", "fundcode"]],
    ["fy", "Fiscal Year", ["fiscalyear"]], ["fm", "Fiscal Month", ["fiscalmonth", "fiscalmonthno", "fiscalmonthnumber", "fiscalmo"]],
    ["fm2", "Fiscal Period", ["fiscalperiod", "fiscalper", "periodperio", "postingperiod", "period"]], ["pdate", "Posting Date", ["postingdateinthedocumentbudat", "postingdate"]],
    ["com", "Total Expenditure", ["commitmentamtcum", "commitments"]], ["disb", "Disbursement", ["disbursementamtcum"]],
    ["pg", "Pay Group", ["paygroup", "paygrp"]], ["dpc", "Internal Order", ["internalorder", "dpc"]],
    ["uic", "UIC", ["uic", "unitidentificationcodeuic", "unitidentificationcode"]]
  ];
  var EXPORT_ONLY = ["contractdocno", "obligationamtcum", "commitmentamtcum", "disbursementamtcum"];
  var COMMIT_COLS = [["business", "Business", []], ["fc", "Fund Center", ["fundscenter", "fundcenter"]], ["fund", "Fund", []], ["fundcode", "Fund Code", []],
    ["pg", "Pay Group", ["paygroup", "paygrp"]], ["fa", "Functional Area", FA_AL], ["io", "Internal Order", ["internalorder", "dpc"]], ["cc", "Cost Center", []],
    ["wbs", "WBS", ["wbselement"]], ["fp", "Funded Program", []], ["acct", "Account", ACCT_AL], ["sdn", "SDN", []], ["jd", "Journal Date", []],
    ["et", "Entry Type", ["entrytype"]], ["amt", "Amount", ["amount"]], ["uic", "UIC", ["uic", "unitidentificationcodeuic", "unitidentificationcode"]]];
  var FMZ_COLS = [["dt", "Document type", []], ["gl", "G/L Account", ["glaccount"]], ["ref", "Reference", []], ["open", "Amount Open (TC)", ["amountopentc", "amountopen"]],
    ["total", "Amount Total (TC)", ["amounttotaltc", "amounttotal"]], ["post", "Posting Date", []], ["docdate", "Document Date", []], ["fmz", "Earmarked Funds", ["earmarkedfunds", "earmarkedfundsdocument"]],
    ["fund", "Fund", []], ["fa", "Functional Area", FA_AL], ["fc", "Funds Center", ["fundscenter", "fundcenter"]], ["cc", "Cost Center", []], ["order", "Order", ["internalorder"]],
    ["supplier", "Supplier", ["vendor"]], ["hdr", "Document Header Text", ["documentheadertext", "headertext"]], ["by", "Created by", ["createdby"]],
    ["openlc", "Amount Open (LC)", ["amountopenlc"]], ["refitem", "Reference item", []], ["cust", "Customer", []], ["wbs", "WBS element", ["wbs"]], ["cur", "Currency", []],
    ["cocd", "Company Code", []], ["ci", "Commitment item", ["commitmentitem"]], ["text", "Text", []]];
  var FUND_COLS = [["fy", "Fiscal Year", ["fiscalyear", "fy"]], ["acct", "Account", ACCT_AL], ["fa", "Functional Area", FA_AL], ["tdp", "TDP", []], ["afp", "AFP", []], ["allot", "Allotment", ["allotment", "allot", "allotted", "allotmentamt", "allotmentamount", "allotments"]], ["sag", "SAG", []], ["mdep", "MDEP", []]];
  var AKEY_COLS = [["fa", "Functional Area", FA_AL], ["acct", "Account", ACCT_AL], ["sag", "Sag", []], ["mdep", "MDEP", []]];
  var DKEY_COLS = [["dpc", "DPC", ["dpc", "internalorder", "dpccode"]], ["desc", "Description", ["description", "desc", "dpcdescription"]], ["acct", "Account", ACCT_AL], ["tdc", "TDC", ["tdc"]]];
  var CKEY_COLS = [["ci", "Commitment Item", ["commitmentitem", "commitmentitemfipex", "commititem", "ci"]], ["desc", "Description", ["description", "desc", "commitmentitemdescription", "cidescription"]]];
  var SKEY_COLS = [["prio", "Prioritization", ["prioritization", "priority", "prioritisation"]], ["acct", "Account", ACCT_AL]];
  var UNIT_COLS = [["uic", "UIC", ["uic", "unitidentificationcodeuic", "unitidentificationcode"]], ["name", "Unit Name", ["unitname", "name", "unit", "unitnm", "unittitle"]], ["msc", "MSC", ["msc", "majorsubordinatecommand", "majorsubordinatecmd"]], ["bn", "Battalion / Unit", ["battalionunit", "battalionorunit", "battalion", "bn", "unitbattalion"]], ["level", "Hierarchy Level", ["hierarchylevel", "level", "hierlevel"]], ["parent", "Parent UIC", ["parentuic", "parent", "higheruic", "parentunit"]], ["ord", "Order", ["order", "sequence", "seq", "rank", "sortorder"]]];
  var HIER_COLS = [["uic", "UIC", ["uic", "unitidentificationcodeuic", "unitidentificationcode"]], ["level", "Hierarchy Level", ["hierarchylevel", "level", "hierlevel", "levelname"]], ["parent", "Parent UIC", ["parentuic", "parent", "higheruic", "parentunit", "higherunit"]], ["ord", "Order", ["order", "sequence", "seq", "rank", "hierarchyrank", "sortorder", "sort"]], ["name", "Level Name", ["levelname", "name", "description", "desc"]]];
  var A = { export: aliasMap(EXPORT_COLS), commit: aliasMap(COMMIT_COLS), fmz3: aliasMap(FMZ_COLS), fundkey: aliasMap(FUND_COLS), acctkey: aliasMap(AKEY_COLS), dpckey: aliasMap(DKEY_COLS), spkey: aliasMap(SKEY_COLS), cikey: aliasMap(CKEY_COLS), unitkey: aliasMap(UNIT_COLS), hierkey: aliasMap(HIER_COLS) };
  function monthOf(h) {
    if (h instanceof Date) return (h.getMonth() + 3) % 12 + 1;
    if (typeof h === "number") { if (h > 20000 && h < 80000) { var dd = new Date(Math.round((h - 25569) * 864e5)); return (dd.getUTCMonth() + 3) % 12 + 1; } return 0; }
    var raw = txt(h).toLowerCase(), mm;
    if ((mm = raw.match(/^(\d{4})[-\/.](\d{1,2})(?:[-\/.]\d{1,2})?(?:[ t].*)?$/)) && +mm[2] >= 1 && +mm[2] <= 12) return (+mm[2] + 2) % 12 + 1;   // 2026-10-01
    if ((mm = raw.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})$/)) && +mm[1] >= 1 && +mm[1] <= 12) return (+mm[1] + 2) % 12 + 1;          // 10/1/2026
    if ((mm = norm(h).match(/^(?:month|fm|m|fiscalmonth)(\d{1,2})$/)) && +mm[1] >= 1 && +mm[1] <= 12) return +mm[1];                               // Month 1 = Oct
    return monthName(h);
  }
  function monthName(h) { var s = norm(h).replace(/^(fy\d{2,4})/, ""), m = s.match(/^(oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep)/); if (!m) return 0; if (/^(total|actual|obl)/.test(s)) return 0; return MON_FM[m[1]]; }
  G3.KIND_LABEL = { fundkey: "Funding key", acctkey: "Account key", dpckey: "DPC key", spkey: "Spend plan key", cikey: "Commitment item key", unitkey: "Units key", hierkey: "Hierarchy level key", export: "Status of Funds export", commit: "Commitments report", fmz3: "FMZ3 unliquidated", plan: "Spend plan" };
  G3.KIND_ORDER = ["fundkey", "acctkey", "dpckey", "spkey", "cikey", "unitkey", "hierkey", "export", "commit", "fmz3", "plan"];
  G3.UNIT_LEVELS = ["MSC", "Battalion / Unit", "UIC"];
  G3.NONE_DPC = "__none__";
  G3.NONE_DPC_NAME = "No order (no FMZ3 match)";
  G3.EXCL_DPC = "__excl__";
  G3.EXCL_DPC_NAME = "No order (excluded DPC)";

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
      else if (has.apply(null, ACCT_AL) && nMon >= 6 && !has("tdp", "afp")) k = "plan";   // Aviation/G1 layout: Account, October ... September
      else if (has("prioritization", "priority", "prioritisation") && has.apply(null, ACCT_AL)) k = "spkey";
      else if (has("commitmentitem", "commititem") && has("description", "desc", "commitmentitemdescription") && !has("dpc", "internalorder", "tdc") && !has.apply(null, ACCT_AL)) k = "cikey";
      else if (has("uic") && (has("unitname", "unit") || (has("name") && has("msc", "battalionunit", "battalion")))) k = "unitkey";
      else if (has("hierarchylevel") || (has("level") && has("parentuic", "parent", "higheruic", "order", "sequence", "rank"))) k = "hierkey";
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
    rep.hasPg = map.pg != null || map.fa != null; rep.hasDpc = map.dpc != null;
    var rows = rowsOf(src, hm, function (raw, rn) {
      if (isAllobj(raw.ci)) { skip(rep, "ALLOBJ lines removed"); return null; }
      var fm = "fm" in raw ? fmNum(raw.fm) : null; if (fm !== null && isNaN(fm)) fm = null;
      if (fm == null && "fm2" in raw) { fm = fmNum(raw.fm2); if (isNaN(fm)) fm = null; if (fm != null) rep.fmFrom2 = (rep.fmFrom2 || 0) + 1; }
      if (fm == null && "pdate" in raw) { fm = fmOfDate(raw.pdate); if (fm != null) rep.fmFromDate = (rep.fmFromDate || 0) + 1; }
      if (fm == null) skip(rep, "no readable fiscal month (counted in totals, not in any month)");
      var com = parseAmt(raw.com), disb = parseAmt(raw.disb);
      if (isNaN(com)) com = null; if (isNaN(disb)) disb = null;
      if (FLIP_EXPORT_SIGN) { if (com) com = -com; if (disb) disb = -disb; }
      var obl = Math.round(((com || 0) - (disb || 0)) * 100) / 100;          // Obligation = Total Expenditure - Disbursement
      return { doc: idText(raw.doc), ci: idText(raw.ci), fa: idText(raw.fa), appn: idText(raw.appn), fundRaw: idText(raw.fund), fund: G3.fundFromRaw(raw.fund), fy: fyText(raw.fy), fm: fm, te: com || 0, oblig: obl, disb: disb || 0, pg: idText(raw.pg) || G3.pgFromFa(raw.fa), dpc: idText(raw.dpc), uic: idText(raw.uic) };
    }, rep);
    if (FLIP_EXPORT_SIGN) rep.notes.push("Signs flipped; Obligation = Total Expenditure \u2212 Disbursement (Aviation rule)");
    var used = ["doc", "ci", "fa", "appn", "fund", "fy", "fm", "com", "disb", "uic"].filter(function (k) { return map[k] != null; }).map(function (k) { return '"' + txt(decodeX(src.get(hm.hi, map[k]))) + '"'; });
    rep.hasUic = map.uic != null; rep.hasFund = map.fund != null;
    rep.notes.push("Columns read (Aviation/G1 rule): " + used.join(", ") + "; " + hm.extra.length + " other columns ignored (obligation_amt_cum is not read)");
    if (rep.hasUic) rep.notes.push("UIC read from " + ('"' + txt(decodeX(src.get(hm.hi, map.uic))) + '"') + " for Spending by Unit");
    else rep.notes.push("No UIC column; Spending by Unit will be empty until the export includes one (unit_identification_code_|_uic)");
    if (rep.hasFund) rep.notes.push("Fund read from " + ('"' + txt(decodeX(src.get(hm.hi, map.fund))) + '"') + " (trailing D27 / non-numeric suffix stripped; filter uses 206010, 206011, 206510)");
    else rep.notes.push("No Fund column (fund_fonds / fund_finds / fund_fincode); SOF spending cannot be filtered by fund until the export includes one");
    if (rep.fmFrom2) rep.notes.push(rep.fmFrom2 + " lines had no readable fiscal_month; month taken from the fiscal period column");
    if (rep.fmFromDate) rep.notes.push(rep.fmFromDate + " lines had no readable fiscal month; month taken from the posting date");
    return { rows: rows, report: rep };
  };
  P.commit = function (src) {
    var hm = mapHeaders(src, A.commit), map = hm.map, rep = rep0("commit", hm);
    if (map.et == null || map.amt == null) { rep.fatal = "A commitments report needs Entry Type and Amount columns."; return { rows: [], report: rep }; }
    rep.positive = 0; rep.nCommit = 0; rep.nOblig = 0; rep.pgFromFa = 0;
    var rows = rowsOf(src, hm, function (raw) {
      var et = txt(raw.et), type = /commit/i.test(et) ? "commit" : /oblig/i.test(et) ? "oblig" : null;
      if (!type) { skip(rep, "other entry types ignored" + (et ? "" : " (blank)")); return null; }
      if (G3.excludedDpc(raw.io)) { skip(rep, "excluded DPC (" + (G3.EXCLUDED_DPCS || []).join(", ") + ")"); return null; }
      var a = parseAmt(raw.amt); if (a == null || isNaN(a)) { skip(rep, "blank or unreadable amount"); return null; }
      if (a > 0) rep.positive++;
      if (type === "commit") rep.nCommit++; else rep.nOblig++;
      var pgc = idText(raw.pg), fa = idText(raw.fa); if (!pgc && G3.pgFromFa(fa)) rep.pgFromFa++;
      return { type: type, pg: pgc || G3.pgFromFa(fa), fa: fa, dpc: idText(raw.io), rptAcct: txt(raw.acct), raw: a, amt: a, sdn: idText(raw.sdn), fp: txt(raw.fp), fc: idText(raw.fc), fund: idText(raw.fund), wbs: idText(raw.wbs), cc: idText(raw.cc), et: et, uic: idText(raw.uic) };
    }, rep);
    rep.hasUic = map.uic != null;
    // show both entry types as positive spending: if a type's rows net negative (GFEBS style) flip that type; reversals keep their opposite sign
    ["commit", "oblig"].forEach(function (t) {
      var rr = rows.filter(function (x) { return x.type === t; }), net = rr.reduce(function (a, x) { return a + x.raw; }, 0), flip = net < 0;
      rr.forEach(function (x) { x.amt = flip ? -x.raw : x.raw; });
      if (rr.length) rep.notes.push((t === "commit" ? "Commitment" : "Obligation") + " amounts came in " + (flip ? "negative and were flipped to positive" : "positive and were kept"));
    });
    rep.notes.push(rep.nCommit + " commitment rows (count toward execution in TDP view)");
    rep.notes.push(rep.nOblig + " obligation rows loaded for spending-by-DPC tracking only (not added to totals; used when no FMZ3 Order join is available, because the Status of Funds export already counts obligations)");
    rep.notes.push(map.pg != null ? "Pay Group column used" + (rep.pgFromFa ? "; " + rep.pgFromFa + " blank pay groups filled from Functional Area" : "") : "No Pay Group column: pay group taken from the first 5 digits of Functional Area");
    rep.notes.push("Journal Date ignored (commitments are upcoming, with no working date)");
    if (rep.hasUic) rep.notes.push("UIC column used; commitment rows with a UIC appear in Spending by Unit");
    else rep.notes.push("No UIC column; commitments are left out of Spending by Unit");
    return { rows: rows, report: rep };
  };
  P.fmz3 = function (src) {
    var hm = mapHeaders(src, A.fmz3), map = hm.map, rep = rep0("fmz3", hm);
    if (map.open == null) { rep.fatal = "No Amount Open (TC) column was found."; return { rows: [], report: rep }; }
    var rows = rowsOf(src, hm, function (raw) {
      var open = parseAmt(raw.open), total = parseAmt(raw.total);
      if (open == null || isNaN(open)) { skip(rep, "no Amount Open"); return null; }
      if (Math.abs(open) < 0.005) skip(rep, "zero-open rows excluded");
      var trav = G3.traveler(raw.hdr), ord = idText(raw.order), drop = G3.excludedDpc(ord);
      if (drop) skip(rep, "excluded DPC Order (" + (G3.EXCLUDED_DPCS || []).join(", ") + ") cleared");
      return { fmz: idText(raw.fmz), dt: txt(raw.dt), gl: idText(raw.gl), ref: idText(raw.ref), open: Math.abs(open), total: total == null || isNaN(total) ? Math.abs(open) : Math.abs(total),
        post: dateIso(raw.post), docdate: dateIso(raw.docdate), fund: idText(raw.fund), fa: idText(raw.fa), fc: idText(raw.fc), cc: idText(raw.cc), order: drop ? "" : ord, orderRaw: ord, orderExcluded: drop,
        supplier: txt(raw.supplier), hdr: txt(raw.hdr), by: txt(raw.by), wbs: idText(raw.wbs), ci: txt(raw.ci), text: txt(raw.text), traveler: trav };
    }, rep);
    var nt = rows.filter(function (r) { return r.traveler; }).length; if (nt) rep.notes.push(nt + " DTS traveler names cleaned from Document Header Text");
    var z = (rep.skipped && rep.skipped["zero-open rows excluded"]) || 0;
    if (z) rep.notes.push(z + " zero-open rows kept for SOF Order lookup, excluded from Unliquidated");
    rep.notes.push("Days open = as-of date \u2212 Posting Date; pay group = first 5 digits of Functional Area");
    rep.notes.push("Earmarked Funds is joined to the funds export contract_doc_no to put Order (DPC) on SOF spending");
    return { rows: rows, report: rep };
  };
  P.fundkey = function (src) {
    var hm = mapHeaders(src, A.fundkey), map = hm.map, rep = rep0("fundkey", hm);
    if (map.acct == null) { rep.fatal = "The funding key needs an Account column."; return { rows: [], report: rep }; }
    if (map.allot == null && map.afp != null && map.afp + 1 < src.cols) {
      var used = Object.keys(map).map(function (k) { return map[k]; }), nx = map.afp + 1, hv = src.get(hm.hi, nx);
      if (used.indexOf(nx) < 0) { map.allot = nx; rep.notes.push("Allotment read from the column right of AFP" + (hv != null && txt(hv) !== "" ? ' ("' + txt(hv) + '")' : " (no header)")); }
    }
    rep.hasAllot = map.allot != null;
    var rows = rowsOf(src, hm, function (raw) {
      var ac = txt(raw.acct).replace(/\s+/g, " "); if (!ac) { skip(rep, "no Account"); return null; } if (/^total/i.test(ac)) { skip(rep, "total rows"); return null; }
      var f = function (k) { var x = parseAmt(raw[k]); return x == null || isNaN(x) ? 0 : x; };
      return { acct: ac, fa: idText(raw.fa), fy: fyText(raw.fy), tdp: f("tdp"), afp: f("afp"), allot: map.allot != null ? f("allot") : null, sag: idText(raw.sag), mdep: idText(raw.mdep) };
    }, rep);
    if (!rep.hasAllot) rep.notes.push("No Allotment column, so the Allotment view is off. Put Allotment right of AFP to turn it on.");
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
  P.cikey = function (src) {
    var hm = mapHeaders(src, A.cikey), rep = rep0("cikey", hm);
    if (hm.map.ci == null || hm.map.desc == null) { rep.fatal = "The commitment item key needs Commitment Item and Description columns."; return { rows: [], report: rep }; }
    return { rows: rowsOf(src, hm, function (raw) { var c = idText(raw.ci), d = txt(raw.desc); if (!c || !d) { skip(rep, "missing Commitment Item or Description"); return null; } return { ci: c, desc: d }; }, rep), report: rep };
  };
  P.spkey = function (src) {
    var hm = mapHeaders(src, A.spkey), rep = rep0("spkey", hm);
    return { rows: rowsOf(src, hm, function (raw) { var p = txt(raw.prio), ac = txt(raw.acct).replace(/\s+/g, " "); if (!p || !ac) { skip(rep, "missing Prioritization or Account"); return null; } return { prio: p, acct: ac }; }, rep), report: rep };
  };
  P.plan = function (src, cls) {
    var hi = cls ? cls.row : 0, pc = -1, ac = -1, fyc = -1, mc = {}, rep = { kind: "plan", headerRow: hi + 1, rowsRead: 0, rowsLoaded: 0, blank: 0, skipped: {}, notes: [], ignoredCols: 0, fatal: null };
    for (var c = 0; c < src.cols; c++) {
      var h = src.get(hi, c); if (h == null || h === "") continue; var nh = norm(h), mo = monthOf(h);
      if (pc < 0 && ["prioritization", "priority", "prioritisation"].indexOf(nh) >= 0) pc = c;
      else if (ac < 0 && ACCT_AL.indexOf(nh) >= 0) ac = c;
      else if (fyc < 0 && (nh === "fiscalyear" || nh === "fy")) fyc = c;
      else if (mo && mc[mo] == null) mc[mo] = c; else rep.ignoredCols++;
    }
    if (pc < 0 && ac < 0) { rep.fatal = "No Prioritization or Account column."; return { rows: [], report: rep }; }
    var out = [];
    for (var r = hi + 1; r < src.rows; r++) {
      var p = pc >= 0 ? txt(src.get(r, pc)) : "", pa = ac >= 0 ? txt(src.get(r, ac)).replace(/\s+/g, " ") : "", m = [], any = false;
      for (var i = 1; i <= 12; i++) { var x = mc[i] != null ? parseAmt(src.get(r, mc[i])) : null; if (x == null || isNaN(x)) x = 0; else any = true; m.push(x); }
      if (!p && !pa && !any) { rep.blank++; continue; } rep.rowsRead++;
      if (!p && !pa) { skip(rep, "no Prioritization or Account"); continue; } if (/^(grand\s*)?(sub\s*)?total/i.test(p || pa)) { skip(rep, "total rows"); continue; }
      out.push({ prio: p, acct: pa, fy: fyc >= 0 ? fyText(src.get(r, fyc)) : "", m: m });
    }
    rep.rowsLoaded = out.length; rep.months = Object.keys(mc).length;
    rep.notes.push("Used " + (pc >= 0 ? "Prioritization" + (ac >= 0 ? " (Account column when a prioritization isn't on the Spend Plan tab)" : "") : "Account") + " and " + rep.months + " month columns; " + rep.ignoredCols + " other columns ignored");
    return { rows: out, report: rep };
  };

  P.unitkey = function (src) {
    var hm = mapHeaders(src, A.unitkey), map = hm.map, rep = rep0("unitkey", hm);
    if (map.uic == null) { rep.fatal = "The Units tab needs a UIC column."; return { rows: [], report: rep }; }
    var rows = rowsOf(src, hm, function (raw) {
      var u = idText(raw.uic); if (!u) { skip(rep, "no UIC"); return null; }
      return { uic: u, name: txt(raw.name) || u, msc: idText(raw.msc) || txt(raw.msc), bn: idText(raw.bn) || txt(raw.bn), level: txt(raw.level), parent: idText(raw.parent) || txt(raw.parent), ord: raw.ord };
    }, rep);
    rep.notes.push("Units: UIC, Unit Name, MSC, Battalion/Unit" + (map.level != null ? " (Hierarchy Level on this tab too)" : "") + (map.parent != null ? "; Parent UIC used when present" : ""));
    return { rows: rows, report: rep };
  };
  P.hierkey = function (src) {
    var hm = mapHeaders(src, A.hierkey), map = hm.map, rep = rep0("hierkey", hm);
    if (map.level == null && map.uic == null) { rep.fatal = "The Hierarchy Level tab needs a Hierarchy Level or UIC column."; return { rows: [], report: rep }; }
    var rows = rowsOf(src, hm, function (raw) {
      var level = txt(raw.level), uic = idText(raw.uic), parent = idText(raw.parent) || txt(raw.parent), name = txt(raw.name);
      var ord = raw.ord, o = (ord == null || ord === "") ? null : parseAmt(ord);
      if (!level && !uic) { skip(rep, "no Hierarchy Level or UIC"); return null; }
      return { uic: uic, level: level, parent: parent, name: name, ord: o != null && !isNaN(o) ? o : ord };
    }, rep);
    var nMap = rows.filter(function (r) { return r.uic; }).length, nLvl = rows.filter(function (r) { return r.level && !r.uic; }).length;
    rep.notes.push("Hierarchy Level tab: " + (nMap ? nMap + " UIC-to-level/parent rows" : "no UIC mapping") + (nLvl || rows.some(function (r) { return r.level; }) ? "; level order taken from this tab (MSC highest, then Battalion/Unit, then UIC)" : ""));
    return { rows: rows, report: rep };
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
  // Pay group = first 5 characters of the Functional Area when all 5 are digits (100101B3PRAT -> 10010).
  // Anything else (e.g. 131G48ASDF) is another appropriation: no pay group (""). Kept for when G3.USE_PAYGROUPS is turned back on.
  G3.pgFromFa = function (fa) { var m = String(fa == null ? "" : fa).trim().match(/^(\d{5})/); return m ? m[1] : ""; };
  // SOF fund: 206010D27 / 206011D27 / 206510D27 -> 206010 / 206011 / 206510 (strip trailing D27 or other non-numeric suffix).
  G3.normFund = function (v) {
    var s = String(v == null ? "" : v).toUpperCase().replace(/[\u00a0\s]/g, "").replace(/[^0-9A-Z]/g, "");
    if (!s) return "";
    s = s.replace(/[A-Z]+\d*$/, "").replace(/[A-Z]+$/, "");
    return s;
  };
  G3.isSofFund = function (f) { return /^206\d{3}$/.test(f || ""); };
  G3.fundFromRaw = function (v) { var f = G3.normFund(v); return G3.isSofFund(f) ? f : ""; };
  G3.fundFromAcct = function (ac) {
    var k = an(ac); if (!k) return "";
    if (!G3._fundByAcct) {
      var m = {};
      Object.keys(G3.FUND_ACCOUNTS || {}).forEach(function (fund) {
        (G3.FUND_ACCOUNTS[fund] || []).forEach(function (name) { var nk = an(name); if (nk) m[nk] = fund; });
      });
      G3._fundByAcct = m;
    }
    return G3._fundByAcct[k] || "";
  };
  G3.rowFund = function (raw, account) { return G3.fundFromRaw(raw) || G3.fundFromAcct(account) || ""; };
  G3.excludedDpc = function (code) {
    var k = kn(code); if (!k) return false;
    var list = G3.EXCLUDED_DPCS || [];
    for (var i = 0; i < list.length; i++) if (kn(list[i]) === k) return true;
    return false;
  };
  G3.derive = function () {
    G3.dataVer = (G3.dataVer || 0) + 1;
    var d = G3.data, S = d.sets, cur = G3.fyOf(G3.asOf()), curFm = (G3.asOf().getMonth() + 3) % 12 + 1;
    var rows = function (k) { return S[k] ? S[k].rows : []; };
    var names = {}, accounts = [], unm = { fa: {}, dpc: {}, prio: {}, fmzFa: {}, commitFa: {}, ci: {}, uic: {} };
    function addAcct(ac) { var k = an(ac); if (!k) return ""; if (!names[k]) { names[k] = ac; accounts.push({ id: ac, name: ac, program: G3.programOf(ac) }); } return names[k]; }
    var faMap = {}, info = {};
    rows("fundkey").forEach(function (r) { addAcct(r.acct); });
    rows("acctkey").forEach(function (r) { var ac = addAcct(r.acct); var f = fk(r.fa); if (f && !faMap[f]) faMap[f] = ac; });
    // Aviation rule: Functional Area + Account pairs on the funding file fill gaps in the Accounts tab
    rows("fundkey").forEach(function (r) { var f = fk(r.fa); if (f && !faMap[f]) faMap[f] = names[an(r.acct)]; });
    // working fiscal year: the latest one in the funds export (what the dashboard opens on); no export -> the current fiscal year
    var expFys = {}; rows("export").forEach(function (r) { if (r.fy) expFys[r.fy] = 1; });
    // Aviation/G1 rule: the current fiscal year when the export has it, else the latest earlier year, else the latest year
    var eys = Object.keys(expFys).sort(), wfy = eys.indexOf(cur) >= 0 ? cur : (eys.filter(function (y) { return +y < +cur; }).pop() || eys[eys.length - 1] || cur); d.wfy = wfy;
    // pay groups per account, from the Functional Areas mapped to it on the Accounts tab
    var acctPgs = {}; rows("acctkey").forEach(function (r) { var k = an(r.acct), o = acctPgs[k] || (acctPgs[k] = {}); o[G3.pgFromFa(r.fa)] = 1; });
    // account pay group: the pay group of its Functional Areas; several -> the one with most FAs (first on ties), listed as a key conflict.
    // Only non-pay-group FAs (131...) -> "" (counts under All only). Account not on the Accounts tab -> null (can't be split; shown under every pay group).
    var acctPgOrder = {}; rows("acctkey").forEach(function (r) { var k = an(r.acct), p = G3.pgFromFa(r.fa), o = acctPgOrder[k] || (acctPgOrder[k] = []); if (o.indexOf(p) < 0) o.push(p); });
    function fundPg(ac) {
      var o = acctPgs[an(ac)]; if (!o) return null;
      var cnt = {}; rows("acctkey").forEach(function (r) { if (an(r.acct) === an(ac)) { var p = G3.pgFromFa(r.fa); cnt[p] = (cnt[p] || 0) + 1; } });
      var best = null; acctPgOrder[an(ac)].forEach(function (p) { if (p && (best == null || cnt[p] > cnt[best])) best = p; });
      return best != null ? best : "";
    }
    var dpcMap = {}; d.dpcs = [];
    rows("dpckey").forEach(function (r) { var ac = r.acct ? addAcct(r.acct) : ""; var k = kn(r.dpc); if (dpcMap[k]) return; dpcMap[k] = { code: r.dpc, name: r.desc || r.dpc, account: ac, tdc: r.tdc || "No TDC" }; d.dpcs.push(dpcMap[k]); });
    var prioMap = {}; rows("spkey").forEach(function (r) { prioMap[an(r.prio)] = addAcct(r.acct); });
    // account cross-check: which key tabs name each account (they all join on the account name)
    var xtab = { fundkey: "Funding", acctkey: "Accounts", dpckey: "DPC", spkey: "Spend Plan" }, xs = {}, loadedTabs = Object.keys(xtab).filter(function (k) { return S[k]; });
    loadedTabs.forEach(function (k) { rows(k).forEach(function (r) { var a = an(r.acct); if (!a) return; var o = xs[a] || (xs[a] = { name: names[a] || r.acct, tabs: {}, spell: {} }); o.tabs[xtab[k]] = 1; o.spell[txt(r.acct)] = 1; }); });
    d.acctCross = { tabs: loadedTabs.map(function (k) { return xtab[k]; }), rows: Object.keys(xs).map(function (a) { var o = xs[a]; return { name: o.name, on: Object.keys(o.tabs), missing: loadedTabs.map(function (k) { return xtab[k]; }).filter(function (t) { return !o.tabs[t]; }), spellings: Object.keys(o.spell) }; }) };
    d.ciMap = {}; rows("cikey").forEach(function (r) { if (!d.ciMap[kn(r.ci)]) d.ciMap[kn(r.ci)] = r.desc; });
    var hasCi = !!S.cikey;
    function ciSeen(c) { if (hasCi && c && !d.ciMap[kn(c)]) unm.ci[c] = (unm.ci[c] || 0) + 1; }

    // ---------- Units + Hierarchy Level (MSC > Battalion/Unit > subordinate UIC) ----------
    function isStateLevel(s) {
      var x = an(s);
      return /^(STATE|STATEROOT|STATELEVEL|STATELEVELROOT|STATELVL|TAG|STARC|ROOT)$/.test(x) || /^(STATE)(LEVEL|ROOT|LVL|\s)/.test(x) || /STATELEVELROOT|STATE\s*LEVEL\s*ROOT/.test(x);
    }
    function lvlCanon(s) {
      var x = an(s);
      if (!x) return "";
      if (isStateLevel(s)) return "State";
      if (/^MSC|MAJORSUBORDINATE/.test(x) || x === "MAJOR SUBORDINATE COMMAND") return "MSC";
      if (/BATTALION|\bBN\b|^UNIT$|BATTALIONUNIT|BATTALION\/UNIT/.test(x) || x === "BATTALION / UNIT") return "Battalion / Unit";
      if (/^(UIC|SUBORDINATE|SUBORDINATEUIC|COMPANY|BATTERY|TROOP|DETACHMENT|UNITIDENTIFICATION)/.test(x) || /SUBORDINATE\s*UIC/.test(x)) return "UIC";
      return txt(s);
    }
    var defLevels = G3.UNIT_LEVELS.slice(), levelOrder = [], levelSeen = {};
    function addLevel(s, ord) {
      var L = lvlCanon(s); if (!L) return;
      if (!levelSeen[L]) { levelSeen[L] = { name: L, ord: ord == null || ord === "" || isNaN(+ord) ? 1000 + levelOrder.length : +ord }; levelOrder.push(L); }
      else if (ord != null && ord !== "" && !isNaN(+ord) && +ord < levelSeen[L].ord) levelSeen[L].ord = +ord;
    }
    rows("hierkey").forEach(function (r) { if (r.level) addLevel(r.level, r.ord); });
    rows("unitkey").forEach(function (r) { if (r.level) addLevel(r.level, r.ord); });
    if (!levelOrder.length) levelOrder = defLevels.slice();
    else levelOrder.sort(function (a, b) { return levelSeen[a].ord - levelSeen[b].ord || defLevels.indexOf(a) - defLevels.indexOf(b); });
    // Prefer the standard three names when the tab's labels fold onto them
    d.unitLevels = levelOrder;
    var unitBy = {}, units = [];
    function putUnit(r) {
      var k = uk(r.uic); if (!k) return null;
      if (unitBy[k]) return unitBy[k];
      var u = { uic: k, raw: r.uic, name: r.name || r.uic, msc: r.msc || "", bn: r.bn || "", level: lvlCanon(r.level), parent: r.parent || "", kids: [] };
      unitBy[k] = u; units.push(u); return u;
    }
    rows("unitkey").forEach(putUnit);
    rows("hierkey").forEach(function (r) {
      if (!r.uic) return;
      var u = putUnit({ uic: r.uic, name: r.name || r.uic, msc: "", bn: "", level: r.level, parent: r.parent });
      if (r.level) u.level = u.level || lvlCanon(r.level);
      if (r.parent && !u.parent) u.parent = r.parent;
    });
    // If MSC / Battalion values are UICs, resolve to unit names. Also fill missing parent/level from the Units columns.
    function resolveRef(v) {
      if (!v) return { key: "", name: "", uic: "" };
      var k = uk(v);
      if (k && unitBy[k]) return { key: k, name: unitBy[k].name, uic: k };
      var nm = txt(v), hit = "";
      if (nm) units.forEach(function (u) { if (!hit && an(u.name) === an(nm)) hit = u.uic; });
      if (hit) return { key: hit, name: unitBy[hit].name, uic: hit };
      return { key: k || an(nm), name: nm || k, uic: k };
    }
    units.forEach(function (u) {
      var m = resolveRef(u.msc), b = resolveRef(u.bn), p = resolveRef(u.parent);
      u.msc = m.key; u.mscName = m.name || u.msc; u.bn = b.key; u.bnName = b.name || u.bn;
      if (p.key) u.parent = p.key;
      if (!u.level) {
        if (u.uic && u.msc && u.uic === u.msc && (!u.bn || u.uic === u.bn)) u.level = "MSC";
        else if (u.uic && u.bn && u.uic === u.bn) u.level = "Battalion / Unit";
        else if (u.msc && !u.bn && u.uic === u.msc) u.level = "MSC";
        else u.level = "UIC";
      }
      if (!u.parent) {
        if (u.level === "MSC") u.parent = "";
        else if (u.level === "Battalion / Unit") u.parent = u.msc && u.msc !== u.uic ? u.msc : "";
        else u.parent = (u.bn && u.bn !== u.uic ? u.bn : "") || (u.msc && u.msc !== u.uic ? u.msc : "");
      }
    });
    // State-level root rows (Hierarchy Level = State / State Level Root / TAG / STARC, etc.)
    // stay in the UIC lookup so SOF spending on those UICs is not unmapped, but they are
    // not used as parents of MSCs and they are not MSC-tree roots.
    units.forEach(function (u) {
      if (u.level === "State") { u.stateRoot = true; u.parent = ""; return; }
      var pU = u.parent ? unitBy[uk(u.parent)] : null;
      if (pU && pU.level === "State") u.parent = "";
      if (u.msc && unitBy[u.msc] && unitBy[u.msc].level === "State") {
        u.stateUic = u.msc;
        if (u.level === "MSC") u.msc = u.uic;
        else u.msc = "";
      }
    });
    units.forEach(function (u) {
      if (u.stateRoot) return;
      if (!u.parent) {
        if (u.level === "MSC") u.parent = "";
        else if (u.level === "Battalion / Unit") u.parent = (u.msc && unitBy[u.msc] && unitBy[u.msc].level === "MSC" && u.msc !== u.uic) ? u.msc : "";
        else u.parent = (u.bn && u.bn !== u.uic && unitBy[u.bn] ? u.bn : "") || (u.msc && unitBy[u.msc] && unitBy[u.msc].level === "MSC" && u.msc !== u.uic ? u.msc : "");
      }
      if (u.level !== "MSC" && u.parent && !unitBy[uk(u.parent)] && u.msc && unitBy[u.msc] && unitBy[u.msc].level === "MSC") u.parent = u.msc;
    });
    d.stateRoots = units.filter(function (u) { return u.stateRoot; });
    if (d.stateRoots.length && S.unitkey && S.unitkey.report) {
      var note = d.stateRoots.length + " state-level root row" + (d.stateRoots.length > 1 ? "s" : "") + " left out of the MSC tree (spending on those UICs goes under State / JFHQ (root), not Unmapped UIC)";
      S.unitkey.report.notes = (S.unitkey.report.notes || []).filter(function (n) { return String(n).indexOf("state-level root") < 0; });
      S.unitkey.report.notes.push(note);
    }
    var unitKeys = Object.keys(unitBy).sort(function (a, b) { return b.length - a.length; });
    function uicFind(raw) {
      var k = uk(raw); if (!k) return { u: null, how: "", key: "" };
      if (unitBy[k]) return { u: unitBy[k], how: "exact", key: k };
      if (k.length > 6 && unitBy[k.slice(0, 6)]) return { u: unitBy[k.slice(0, 6)], how: "base", key: k.slice(0, 6) };
      for (var i = 0; i < unitKeys.length; i++) if (unitKeys[i].length >= 6 && k.indexOf(unitKeys[i]) === 0) return { u: unitBy[unitKeys[i]], how: "prefix", key: unitKeys[i] };
      return { u: null, how: "", key: k };
    }
    d.units = units;
    d.unitBy = unitBy;
    d.uicFind = uicFind;
    d.hasUnits = units.length > 0;
    d.commitHasUic = !!(S.commit && S.commit.report && S.commit.report.hasUic);

    var UN = "Unmapped";
    // Functional Area -> Account (Accounts tab, plus FA/Account pairs on the funding key).
    //   1. exact: same letters/digits, ignoring case, spaces, dashes and hidden characters
    //   2. prefix: the LONGEST key FA (5+ characters) that the report's FA starts with (key lists 100101B1PR or 10010 -> covers 100101B1PRID)
    //   3. reverse: the report's FA (8+ characters) is the start of exactly one account's key FAs
    // How each row mapped is counted per dataset in Data details.
    var faKeys = Object.keys(faMap).filter(function (k) { return k.length >= 5; }).sort(function (a, b) { return b.length - a.length; }), faMemo = {}; d.faPrefix = 0;
    d.faHow = {};
    function faFind(fa) {
      var k = fk(fa); if (!k) return { ac: "", how: "" }; if (faMap[k]) return { ac: faMap[k], how: "exact" }; if (k in faMemo) return faMemo[k];
      var hit = { ac: "", how: "" }, i;
      for (i = 0; i < faKeys.length; i++) if (k.indexOf(faKeys[i]) === 0) { hit = { ac: faMap[faKeys[i]], how: "prefix", key: faKeys[i] }; break; }
      if (!hit.ac && k.length >= 8) { var acs = {}, first = ""; faKeys.forEach(function (f) { if (f.indexOf(k) === 0) { acs[faMap[f]] = 1; first = first || f; } }); var l = Object.keys(acs); if (l.length === 1) hit = { ac: l[0], how: "reverse", key: first }; }
      return (faMemo[k] = hit);
    }
    function faLookup(fa, ds) { var h = faFind(fa); if (ds && h.how) { var o = d.faHow[ds] || (d.faHow[ds] = { exact: 0, prefix: 0, reverse: 0, dpc: 0, acct: 0 }); o[h.how]++; } return h.ac; }
    function acctFa(fa, bucket, ds) { var h = faFind(fa); if (h.ac) { faLookup(fa, ds); if (h.how !== "exact") d.faPrefix++; return h.ac; } if (fa) bucket[fa] = (bucket[fa] || 0) + 1; return UN; }
    function howCount(ds, how) { var o = d.faHow[ds] || (d.faHow[ds] = { exact: 0, prefix: 0, reverse: 0, dpc: 0, acct: 0 }); o[how]++; }
    // closest key Functional Area for an unmapped one (longest shared start), for the data panel
    var allKeys = Object.keys(faMap);
    d.closestFa = function (fa) {
      var k = fk(fa), best = "", bl = 0; allKeys.forEach(function (f) { var n = 0; while (n < f.length && n < k.length && f[n] === k[n]) n++; if (n > bl) { bl = n; best = f; } });
      return best ? { fa: best, account: faMap[best], shared: bl } : null;
    };
    // pay group on a spending row: its ACCOUNT's pay group (Accounts tab) when the account is known; otherwise the row's own (Pay Group column / FA).
    // Pay group never decides whether a row counts: under All every row counts.
    var pgMemo = {};
    function rowPg(ac, own) { if (ac && ac !== UN) { if (!(ac in pgMemo)) pgMemo[ac] = fundPg(ac); if (pgMemo[ac] != null) return pgMemo[ac]; } return own || ""; }
    // funding (no Fiscal Year column = current fiscal year)
    d.funding = []; var hasAllot = false;
    rows("fundkey").forEach(function (r) { if (r.allot != null) hasAllot = true; d.funding.push({ fy: r.fy || wfy, account: names[an(r.acct)], pg: fundPg(r.acct), fund: G3.fundFromAcct(r.acct), tdp: r.tdp, afp: r.afp, allot: r.allot || 0, sag: r.sag, mdep: r.mdep }); info[an(r.acct)] = { sag: r.sag, mdep: r.mdep }; });
    rows("acctkey").forEach(function (r) { var i = info[an(r.acct)] || (info[an(r.acct)] = {}); if (!i.sag && r.sag) i.sag = r.sag; if (!i.mdep && r.mdep) i.mdep = r.mdep; });
    d.hasAllot = hasAllot; d.acctInfo = info;
    // execution lines: export (obligations / disbursements) + commitments (commitments report, current FY)
    d.lines = [];
    function unitFields(rawUic, bucket) {
      var hit = uicFind(rawUic), u = hit.u;
      if (u) return { uic: rawUic, uicKey: u.uic, uicName: u.name, msc: u.msc, bn: u.bn, uicHow: hit.how };
      if (rawUic || hit.key) { var mk = hit.key || uk(rawUic) || "(none)"; if (bucket) unm.uic[mk] = (unm.uic[mk] || 0) + 1; }
      return { uic: rawUic || "", uicKey: "", uicName: "", msc: "", bn: "", uicHow: "" };
    }
    rows("export").forEach(function (r) { ciSeen(r.ci); var ac = acctFa(r.fa, unm.fa, "export"), uf = unitFields(r.uic, true); var fd = G3.fundFromRaw(r.fund) || G3.fundFromAcct(ac); d.lines.push({ fy: r.fy || wfy, fm: r.fm || null, account: ac, pg: rowPg(ac, r.pg), fund: fd, fundRaw: r.fundRaw || r.fund || "", appn: r.appn, fa: r.fa, dpc: r.dpc, doc: r.doc, ci: r.ci, commit: 0, oblig: r.oblig, disb: r.disb, src: "export", uic: uf.uic, uicKey: uf.uicKey, uicName: uf.uicName, msc: uf.msc, bn: uf.bn }); });
    // commitments report rows: commitments feed execution; obligations feed spending-by-DPC only
    d.dpcLines = [];
    rows("commit").forEach(function (r) {
      // Internal Order -> DPC tab account; else Functional Area -> Accounts tab (military pay 2060 rows often carry no Internal Order); else the report's Account column
      var k = kn(r.dpc), m = dpcMap[k], ac = "";
      if (m && m.account) { ac = m.account; howCount("commit", "dpc"); }
      if (!ac && r.fa) ac = faLookup(r.fa, "commit");
      if (!ac && names[an(r.rptAcct)]) { ac = names[an(r.rptAcct)]; howCount("commit", "acct"); }
      if (!m && r.dpc && !G3.excludedDpc(r.dpc)) unm.dpc[r.dpc] = (unm.dpc[r.dpc] || 0) + 1;
      if (!ac) { if (r.fa) unm.commitFa[r.fa] = (unm.commitFa[r.fa] || 0) + 1; ac = UN; }
      var pg = rowPg(ac, r.pg);
      var uf = r.uic ? unitFields(r.uic, false) : { uic: "", uicKey: "", uicName: "", msc: "", bn: "" };
      var fd = G3.rowFund(r.fund, ac);
      d.dpcLines.push({ type: r.type, account: ac, pg: pg, fund: fd, dpc: r.dpc, fa: r.fa, amt: r.amt, sdn: r.sdn, uic: uf.uic, uicKey: uf.uicKey, msc: uf.msc, bn: uf.bn });
      if (r.type === "commit") d.lines.push({ fy: wfy, fm: null, upcoming: true, account: ac, pg: pg, fund: fd, dpc: r.dpc, doc: r.sdn, ci: "", commit: r.amt, oblig: 0, disb: 0, src: "commit", uic: uf.uic, uicKey: uf.uicKey, uicName: uf.uicName, msc: uf.msc, bn: uf.bn });
    });
    // spend plan: Prioritization -> Account (Spend Plan tab, or an exact account name); several prioritizations add up
    var plan = {};
    rows("plan").forEach(function (r) {
      var ac = (r.prio && (prioMap[an(r.prio)] || names[an(r.prio)])) || (r.acct && (names[an(r.acct)] || addAcct(r.acct))) || "";
      if (!ac) { var pk = r.prio || r.acct; unm.prio[pk] = (unm.prio[pk] || 0) + 1; ac = UN; }
      var fy = r.fy || wfy, key = fy + "|" + ac, p = plan[key] || (plan[key] = { fy: fy, account: ac, pg: null, fund: G3.fundFromAcct(ac), m: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prios: [] });
      for (var i = 0; i < 12; i++) p.m[i] += r.m[i]; p.prios.push(r.prio);
    });
    d.plan = Object.keys(plan).map(function (k) { return plan[k]; });
    d.planFy = Object.keys(d.plan.reduce(function (o, p) { o[p.fy] = 1; return o; }, {})).sort();
    // unliquidated (FMZ3): Functional Area -> Account (Accounts tab); Order = DPC
    // $0-open rows are kept on the FMZ3 dataset for the SOF Order lookup, but stay out of Unliquidated
    var fmzAll = rows("fmz3");
    d.ulo = fmzAll.filter(function (r) { return (r.open || 0) > 0.004; }).map(function (r) {
      var ac = faLookup(r.fa, "fmz3") || (dpcMap[kn(r.order)] && dpcMap[kn(r.order)].account) || "";
      if (!ac) { if (r.fa) unm.fmzFa[r.fa] = (unm.fmzFa[r.fa] || 0) + 1; ac = UN; }
      ciSeen(r.ci);
      return Object.assign({}, r, { account: ac, pg: rowPg(ac, G3.pgFromFa(r.fa)), fundRaw: r.fund, fund: G3.rowFund(r.fund, ac), dpc: r.order, date: r.post || r.docdate, ci: r.ci, type: r.ci || r.dt || "Other", desc: r.traveler ? "DTS \u2013 " + r.traveler : (r.hdr || r.text || "") });
    });
    // Join FMZ3 Earmarked Funds -> Order onto SOF contract_doc_no (does not change execution totals)
    d.hasSofDpc = !!(S.export && S.fmz3);
    d.sofJoin = { matched: 0, unmatched: 0, matchAmt: 0, unmatchAmt: 0, conflicts: 0, conflictAmt: 0, conflictDocs: 0, how: { exact: 0, base: 0 }, unmatchedList: [], conflictList: [] };
    if (d.hasSofDpc) {
      function docKeys(v) {
        var raw = idText(v).toUpperCase().replace(/\u00a0/g, " ").replace(/\s+/g, "").trim();
        var compact = raw.replace(/[^A-Z0-9]/g, "");
        var noz = compact.replace(/^0+/, "") || (compact ? "0" : "");
        var exact = [], bases = [];
        if (compact) exact.push(compact);
        if (noz && noz !== compact) exact.push(noz);
        var m = compact.match(/^([A-Z0-9]{6,}?)(\d{1,4})$/);
        if (m && m[1].length >= 6) {
          bases.push(m[1]);
          var z = m[1].replace(/^0+/, "") || "0";
          if (z !== m[1]) bases.push(z);
        }
        return { compact: compact, noz: noz, exact: exact, bases: bases };
      }
      var byExact = {}, byBase = {};
      function addIdx(map, k, r) { if (!k) return; (map[k] = map[k] || []).push(r); }
      fmzAll.forEach(function (r) {
        var ks = docKeys(r.fmz);
        ks.exact.forEach(function (k) { addIdx(byExact, k, r); });
        ks.bases.forEach(function (k) { addIdx(byBase, k, r); });
      });
      var prefixKeys = Object.keys(byExact).filter(function (k) { return k.length >= 6; }).sort(function (a, b) { return b.length - a.length; });
      var cache = {};
      function lookupFmz(doc) {
        var ks = docKeys(doc), ck = ks.compact || ("?" + doc);
        if (ck in cache) return cache[ck];
        var hits = null, how = "";
        function take(map, k, h) { if (!hits && k && map[k] && map[k].length) { hits = map[k]; how = h; } }
        ks.exact.forEach(function (k) { take(byExact, k, "exact"); });
        ks.bases.forEach(function (k) { take(byExact, k, "base"); take(byBase, k, "base"); });
        if (!hits) {
          var needles = ks.exact.slice();
          var i, j, pk;
          for (i = 0; i < prefixKeys.length && !hits; i++) {
            pk = prefixKeys[i];
            for (j = 0; j < needles.length; j++) {
              if (needles[j].indexOf(pk) === 0 || (needles[j].length >= 6 && pk.indexOf(needles[j]) === 0)) { hits = byExact[pk]; how = "base"; break; }
            }
          }
        }
        return (cache[ck] = { rows: hits || [], how: how });
      }
      function ordersFrom(list) {
        var by = {};
        list.forEach(function (r) {
          var k = kn(r.order) || r.order || "";
          var o = by[k] || (by[k] = { order: r.order || "", total: 0, open: 0, n: 0 });
          o.total += r.total || 0; o.open += r.open || 0; o.n++;
        });
        var orders = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.total - a.total || b.open - a.open || b.n - a.n; });
        var sumT = 0; orders.forEach(function (o) { sumT += o.total; });
        if (!sumT) { sumT = 0; orders.forEach(function (o) { sumT += o.n; }); }
        orders.forEach(function (o) { o.share = sumT ? (o.total || o.n) / sumT : 1 / (orders.length || 1); });
        return orders;
      }
      function fixParts(parts, key, target) {
        var s = 0; parts.forEach(function (p) { s += p[key]; });
        if (parts.length) parts[0][key] = Math.round((parts[0][key] + (target - s)) * 100) / 100;
      }
      var join = d.sofJoin, seenConf = {}, umDocs = {};
      d.lines.forEach(function (l) {
        if (l.src !== "export") return;
        var amt = (l.oblig || 0) + (l.disb || 0);
        var hit = lookupFmz(l.doc);
        if (!hit.rows.length) {
          l.dpcHow = l.dpc ? "export" : "";
          l.dpcParts = [{ dpc: l.dpc || "", share: 1, oblig: l.oblig, disb: l.disb }];
          join.unmatched++; join.unmatchAmt += amt;
          var dk = l.doc || "(none)";
          var u = umDocs[dk] || (umDocs[dk] = { doc: dk, n: 0, amt: 0 });
          u.n++; u.amt += amt;
          return;
        }
        var usable = hit.rows.filter(function (r) { return r.order && !G3.excludedDpc(r.order) && !r.orderExcluded; });
        if (!usable.length) {
          l.dpcHow = "excluded"; l.dpc = ""; l.dpcExcluded = true;
          l.dpcParts = [{ dpc: G3.EXCL_DPC, share: 1, oblig: l.oblig, disb: l.disb }];
          join.excluded = (join.excluded || 0) + 1; join.excludedAmt = (join.excludedAmt || 0) + amt;
          join.unmatched++; join.unmatchAmt += amt;
          var dk2 = l.doc || "(none)";
          var u2 = umDocs[dk2] || (umDocs[dk2] = { doc: dk2, n: 0, amt: 0, why: "excluded DPC" });
          u2.n++; u2.amt += amt;
          return;
        }
        var orders = ordersFrom(usable);
        join.matched++; join.matchAmt += amt;
        join.how[hit.how] = (join.how[hit.how] || 0) + 1;
        l.dpcHow = hit.how;
        if (orders.length > 1) {
          l.dpcConflict = true; join.conflicts++; join.conflictAmt += amt;
          var ck = docKeys(hit.rows[0].fmz).compact || hit.rows[0].fmz;
          if (!seenConf[ck]) {
            seenConf[ck] = 1; join.conflictDocs++;
            join.conflictList.push({ doc: hit.rows[0].fmz || l.doc, orders: orders.map(function (o) { return o.order; }), amt: amt });
          } else {
            var exC = join.conflictList.filter(function (x) { return docKeys(x.doc).compact === ck; })[0];
            if (exC) exC.amt += amt;
          }
        }
        l.dpc = orders[0].order;
        l.dpcParts = orders.map(function (o) { return { dpc: o.order, share: o.share, oblig: (l.oblig || 0) * o.share, disb: (l.disb || 0) * o.share }; });
        fixParts(l.dpcParts, "oblig", l.oblig || 0);
        fixParts(l.dpcParts, "disb", l.disb || 0);
      });
      join.unmatchedList = Object.keys(umDocs).map(function (k) { return umDocs[k]; }).sort(function (a, b) { return b.amt - a.amt; }).slice(0, 15);
      join.conflictList.sort(function (a, b) { return b.amt - a.amt; });
      var den = join.matched + join.unmatched;
      join.matchRate = den ? join.matchAmt / (join.matchAmt + join.unmatchAmt || 1) : 0;
      join.lineRate = den ? join.matched / den : 0;
    }
    if ([d.lines, d.ulo, d.dpcLines, d.plan].some(function (a) { return a.some(function (x) { return x.account === UN; }); })) addAcct(UN);
    d.accounts = accounts;
    var fys = {}; fys[wfy] = 1; d.lines.forEach(function (l) { if (l.fy) fys[l.fy] = 1; }); d.funding.forEach(function (f) { fys[f.fy] = 1; });
    d.fys = Object.keys(fys).sort();
    d.unmapped = unm;
    // top unmapped Functional Areas by dollars (export obligations + disbursements, commitments report, FMZ3 open), with the closest key FA
    var tu = {};
    function addU(fa, ds, v) { if (!fa) return; var k = fk(fa), o = tu[k] || (tu[k] = { fa: fa, amt: 0, n: 0, ds: {} }); o.amt += Math.abs(v || 0); o.n++; o.ds[ds] = 1; }
    d.lines.forEach(function (l) { if (l.src === "export" && l.account === UN) addU(l.fa, "SOF export", l.oblig + l.disb); });
    d.dpcLines.forEach(function (x) { if (x.account === UN) addU(x.fa, "commitments report", x.amt); });
    d.ulo.forEach(function (u) { if (u.account === UN) addU(u.fa, "FMZ3", u.open); });
    d.topUnmappedFa = Object.keys(tu).map(function (k) { var o = tu[k]; o.closest = d.closestFa(o.fa); o.ds = Object.keys(o.ds); return o; }).sort(function (a, b) { return b.amt - a.amt; }).slice(0, 15);
    var tuU = {};
    d.lines.forEach(function (l) {
      if (l.src !== "export") return;
      if (l.uicKey) return;
      var k = uk(l.uic) || "(none)", o = tuU[k] || (tuU[k] = { uic: l.uic || "(none)", amt: 0, n: 0 });
      o.amt += Math.abs((l.oblig || 0) + (l.disb || 0)); o.n++;
    });
    d.topUnmappedUic = Object.keys(tuU).map(function (k) { return tuU[k]; }).sort(function (a, b) { return b.amt - a.amt; }).slice(0, 15);
    d.hasPg = { export: d.lines.some(function (l) { return l.src === "export" && l.pg; }), commit: !!S.commit, fmz3: d.ulo.some(function (u) { return u.pg; }) };
    // pay group list: the four standard ones plus any other 5-digit pay group found
    var pgs = {}; G3.BASE_PAYGROUPS.forEach(function (p) { pgs[p] = 1; });
    d.lines.concat(d.ulo, d.dpcLines).forEach(function (x) { if (x.pg) pgs[x.pg] = 1; });
    G3.PAYGROUPS = Object.keys(pgs).sort();
    var XC = ["#0891b2", "#db2777", "#65a30d", "#a16207", "#4338ca"], xi = 0; G3.PAYGROUPS.forEach(function (p) { if (!G3.PGCOL[p]) G3.PGCOL[p] = XC[xi++ % XC.length]; });
    if (G3.state.pg !== "All" && G3.PAYGROUPS.indexOf(G3.state.pg) < 0) G3.state.pg = "All";
    if (G3.state.msc && !unitBy[G3.state.msc]) { G3.state.msc = ""; G3.state.bn = ""; G3.state.uic = ""; }
    if (G3.state.bn && !unitBy[G3.state.bn]) { G3.state.bn = ""; G3.state.uic = ""; }
    if (G3.state.uic && !unitBy[G3.state.uic]) G3.state.uic = "";
    // accounts whose funding can't be split by pay group (FAs in several pay groups)
    d.acctPg = {}; accounts.forEach(function (a) { d.acctPg[a.id] = fundPg(a.id); });
    d.pgConflicts = accounts.map(function (a) { var o = acctPgOrder[an(a.id)] || []; return { name: a.name, pgs: o, used: d.acctPg[a.id] }; }).filter(function (x) { return x.pgs.length > 1; });
    d.acctFund = {}; accounts.forEach(function (a) { d.acctFund[a.id] = G3.fundFromAcct(a.id); });
    d.fundUnknownAccounts = accounts.filter(function (a) { return a.id !== UN && !G3.fundFromAcct(a.id); }).map(function (a) { return { name: a.name, id: a.id }; });
    d.sofOddFunds = []; d.sofMissingFund = { n: 0, amt: 0 };
    (function () {
      var odd = {}, missN = 0, missAmt = 0;
      d.lines.forEach(function (l) {
        if (l.src !== "export") return;
        var raw = l.fundRaw || "", got = G3.fundFromRaw(raw), amt = (l.oblig || 0) + (l.disb || 0);
        if (got && (G3.FUNDS || []).indexOf(got) < 0) {
          var o = odd[got] || (odd[got] = { fund: got, raw: raw, n: 0, amt: 0 });
          o.n++; o.amt += amt;
        } else if (!got) { missN++; missAmt += amt; }
      });
      d.sofOddFunds = Object.keys(odd).sort().map(function (k) { return odd[k]; });
      d.sofMissingFund = { n: missN, amt: missAmt };
    })();
    d.hasFund = { export: d.lines.some(function (l) { return l.src === "export" && l.fund; }), commit: d.dpcLines.some(function (x) { return x.fund; }), fmz3: d.ulo.some(function (u) { return u.fund; }) };
    if (G3.state.fund && G3.state.fund !== "All" && (G3.FUNDS || []).indexOf(G3.state.fund) < 0) G3.state.fund = "All";
    if (G3._wfy !== wfy || d.fys.indexOf(G3.state.fy) < 0) { G3.state.fy = wfy; G3._wfy = wfy; }   // open on the export's fiscal year
    // money check per dataset, so a zero on the page can be traced in Data details
    var sum = function (a, f) { return a.reduce(function (t, x) { return t + (f(x) || 0); }, 0); }, byFy = function (a, f) { var o = {}; a.forEach(function (x) { o[x.fy] = (o[x.fy] || 0) + (f(x) || 0); }); return o; };
    var ex = d.lines.filter(function (l) { return l.src === "export"; }), cm = d.lines.filter(function (l) { return l.src === "commit"; });
    var od = function (l) { return l.oblig + l.disb; };
    d.diag = {
      fundkey: { total: sum(d.funding, function (f) { return f.tdp; }), label: "TDP", unmapped: 0, byFy: byFy(d.funding, function (f) { return f.tdp; }) },
      export: { total: sum(ex, od), label: "obligations + disbursements", unmapped: sum(ex.filter(function (l) { return l.account === UN; }), od), byFy: byFy(ex, od), why: "Functional Area not on the Accounts tab", noMonth: sum(ex.filter(function (l) { return !l.fm; }), od), lastFm: G3.curFm ? ex.reduce(function (m, l) { return l.fy === wfy && l.fm > m ? l.fm : m; }, 0) : 0, uicUnmapped: sum(ex.filter(function (l) { return !l.uicKey; }), od), sofJoin: d.sofJoin },
      unitkey: { total: units.length, label: "units", unmapped: 0 },
      commit: { total: sum(d.dpcLines, function (x) { return x.amt; }), label: "commitments + obligations", unmapped: sum(d.dpcLines.filter(function (x) { return x.account === UN; }), function (x) { return x.amt; }), why: "Internal Order not on the DPC tab and Functional Area not on the Accounts tab", commit: sum(cm, function (l) { return l.commit; }) },
      fmz3: { total: sum(d.ulo, function (u) { return u.open; }), label: "open", unmapped: sum(d.ulo.filter(function (u) { return u.account === UN; }), function (u) { return u.open; }), why: "Functional Area not on the Accounts tab (and Order not on the DPC tab)" },
      plan: { total: sum(d.plan, function (p) { return p.m.reduce(function (a, b) { return a + b; }, 0); }), label: "planned", unmapped: sum(d.plan.filter(function (p) { return p.account === UN; }), function (p) { return p.m.reduce(function (a, b) { return a + b; }, 0); }), why: "Prioritization not on the Spend Plan tab (and no matching Account)" }
    };
    if (!d.hasAllot && G3.state.view === "allot") G3.state.view = "tdp";
  };
  G3.DATASET_COLS = {
    fundkey: "Account, TDP, AFP, Allotment (right of AFP), SAG, MDEP (optional: Fiscal Year)",
    acctkey: "Functional Area, Account",
    dpckey: "DPC, Description, Account, TDC",
    cikey: "Commitment Item, Description",
    spkey: "Prioritization, Account",
    unitkey: "UIC, Unit Name, MSC, Battalion/Unit, Hierarchy Level (MSC highest, then Battalion/Unit, then Subordinate UIC = company). State-level root rows are left out of the MSC tree; spending on those UICs goes under State / JFHQ (root), not Unmapped. Parent UIC used when present",
    hierkey: "Hierarchy Level and/or UIC, optional Parent UIC and Order (defines MSC > Battalion/Unit > UIC; UIC rows build the tree when present)",
    export: "contract_doc_no, commitment_item_fipex, functional_area_farea, appropriation_type, fund_fonds / fund_finds / fund_fincode (206010D27 \u2192 206010; filter is 206010, 206011, 206510), fiscal_year, fiscal_month, commitment_amt_cum, disbursement_amt_cum, unit_identification_code_|_uic (same as Aviation, plus UIC and Fund). contract_doc_no is joined to FMZ3 Earmarked Funds to attach Order (DPC)",
    commit: "Entry Type, Internal Order, Pay Group, Amount (Business, Fund Center, Fund, Fund Code, Functional Area, Cost Center, WBS, Funded Program, Account, SDN, Journal Date also present; UIC used in Spending by Unit when present)",
    fmz3: "Amount Open (TC), Amount Total (TC), Posting Date, Earmarked Funds, Functional Area, Document Header Text, Commitment item, Order (+ the rest of the FMZ3 columns). Earmarked Funds = SOF contract_doc_no (Order becomes the DPC on SOF spending). $0-open rows are used for that lookup but left out of the Unliquidated view",
    plan: "Prioritization (or Account, as on the Aviation/G1 spend plan), October \u2026 September; month headers may be names, dates or Month 1\u201312 (all other columns ignored)"
  };
})(window);
