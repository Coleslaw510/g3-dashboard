const { chromium } = require('playwright-core'); const fs = require('fs'), path = require('path');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 1000 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + __dirname + '/g3-dashboard.html#/sof'); await p.waitForTimeout(600);
  const fp = () => p.evaluate(() => {
    const o = {}, fys = G3.data.fys;
    fys.forEach(fy => ['All'].concat(G3.PAYGROUPS).forEach(pg => ['tdp', 'afp', 'allot'].forEach(v => { G3.state.pg = pg; const t = G3.totals(G3.lines(fy), G3.funding(fy), v); o[fy + pg + v] = [t.level, t.commit, t.oblig, t.disb, t.exec, t.bal].map(x => Math.round(x * 100)); })));
    G3.state.fund = 'All'; G3.state.pg = 'All'; const cf = G3.fyOf(G3.asOf());
    o.dpc = G3.dpcRollup(cf).map(d => d.code + ':' + Math.round(d.total * 100) + ':' + d.tdc).join('|');
    o.ulo = [G3.data.ulo.length, Math.round(G3.sum(G3.data.ulo, 'open') * 100)];
    o.plan = G3.data.plan.map(r => r.account + ':' + Math.round(G3.sum(r.m, x => x) * 100)).sort().join('|');
    o.prog = ['idt', 'at', 'sch', 'mob'].map(k => G3.data.accounts.filter(a => a.program === k).map(a => a.id).join(',')).join('/');
    return o;
  });
  const A = await fp();
  // ---- unit-ish checks on the test load ----
  const r = await p.evaluate(() => {
    const S = G3.data.sets, c = S.commit, raw = G3.makeTestFiles().find(f => /Commit/.test(f.name)).sheets[0].aoa;
    const hdr = raw[0], iE = hdr.indexOf('Entry Type'), iA = hdr.indexOf('Amount');
    const iIo = hdr.indexOf('Internal Order');
    const kept = x => !G3.excludedDpc(x[iIo]);
    const rawC = raw.slice(1).filter(x => /commit/i.test(x[iE]) && kept(x)), rawO = raw.slice(1).filter(x => /oblig/i.test(x[iE]) && kept(x)), rawX = raw.slice(1).filter(x => !/commit|oblig/i.test(x[iE]));
    const rawExcl = raw.slice(1).filter(x => /commit|oblig/i.test(x[iE]) && !kept(x));
    const cur = G3.fyOf(G3.asOf()); G3.state.fund = 'All'; G3.state.pg = 'All';
    const commitLines = G3.data.lines.filter(l => l.src === 'commit');
    const planRaw = G3.makeTestFiles().find(f => /Spend Plan FY/.test(f.name)).sheets[0].aoa, key = G3.makeTestFiles()[0].sheets.find(s => s.name === 'Spend Plan').aoa;
    const prio2acct = {}; key.slice(1).forEach(x => prio2acct[x[0]] = x[1]);
    const ph = planRaw[0], oct = ph.indexOf('October');
    const idtRaw = planRaw.slice(1).filter(x => prio2acct[x[0]] === 'IDT');
    const idtRawSum = idtRaw.reduce((s, x) => s + x.slice(oct, oct + 12).reduce((a, v) => a + (+v || 0), 0), 0);
    const idtPlan = G3.data.plan.filter(x => x.account === 'IDT').reduce((s, x) => s + x.m.reduce((a, v) => a + v, 0), 0);
    const fz = G3.makeTestFiles().find(f => /FMZ3/.test(f.name)).sheets[0].aoa, fo = fz[0].indexOf('Amount Open (TC)');
    return {
      rawNeg: rawC.every(x => +x[iA] < 0), allPos: c.rows.every(x => x.amt > 0), nC: rawC.length, nO: rawO.length, nX: rawX.length, nExcl: rawExcl.length, skippedExcl: c.report.skipped['excluded DPC (NGDFHDOU)'] || 0,
      rowsC: c.rows.filter(x => x.type === 'commit').length, rowsO: c.rows.filter(x => x.type === 'oblig').length,
      commitInTotals: Math.round(G3.sum(G3.lines(cur), 'commit')), commitRows: Math.round(G3.sum(c.rows.filter(x => x.type === 'commit'), 'amt')),
      obligFromCommitInLines: commitLines.filter(l => l.oblig || l.disb).length, commitLineCount: commitLines.length,
      dpcOblig: Math.round(G3.sum(G3.dpcRollup(cur), 'oblig')), dpcDisb: Math.round(G3.sum(G3.dpcRollup(cur), 'disb')), dpcCommit: Math.round(G3.sum(G3.dpcRollup(cur), 'commit')),
      obligRows: Math.round(G3.sum(c.rows.filter(x => x.type === 'oblig'), 'amt')),
      commitRows: Math.round(G3.sum(c.rows.filter(x => x.type === 'commit'), 'amt')),
      exOblig: Math.round(G3.sum(G3.data.lines.filter(l => l.src === 'export' && l.fy === cur), 'oblig')),
      exDisb: Math.round(G3.sum(G3.data.lines.filter(l => l.src === 'export' && l.fy === cur), 'disb')),
      hasSofDpc: !!G3.data.hasSofDpc,
      notes: c.report.notes.concat(Object.keys(c.report.skipped).map(k => c.report.skipped[k] + ' ' + k)),
      zeroRaw: fz.slice(1).filter(x => Math.abs(+x[fo]) < 0.005).length, zeroSkipped: S.fmz3.report.skipped['zero-open rows excluded'], zeroLoaded: G3.data.ulo.filter(u => !(u.open > 0)).length,
      trav: [G3.traveler('traveler:smithjohn'), G3.traveler('TRAVELER: SMITH, JOHN'), G3.traveler('Traveler:JohnsonMaria')],
      dtsDesc: G3.data.ulo.filter(u => /^DTS – /.test(u.desc)).slice(0, 3).map(u => u.hdr + ' -> ' + u.desc),
      idtPrios: idtRaw.length, idtRawSum: Math.round(idtRawSum), idtPlan: Math.round(idtPlan), fmzSample: G3.data.ulo[0].fmz
    };
  });
  console.log(JSON.stringify(r, null, 1));
  ok(r.rawNeg && r.allPos, 'commitments sign flip (raw negative -> loaded positive)');
  ok(r.rowsC === r.nC && r.rowsO === r.nO && r.nO > 0 && r.nExcl === r.skippedExcl && r.nExcl === 2, 'entry-type filter keeps commitment (' + r.rowsC + ') and obligation (' + r.rowsO + ') rows, ignores ' + r.nX + ' other types, drops ' + r.nExcl + ' excluded DPC rows');
  ok(r.commitInTotals === r.commitRows && r.obligFromCommitInLines === 0 && r.commitLineCount === r.rowsC, 'obligation rows NOT in execution totals');
  ok(r.hasSofDpc && r.dpcOblig === r.exOblig && r.dpcDisb === r.exDisb && r.dpcCommit === r.commitRows && r.dpcOblig !== r.obligRows, 'DPC spending uses SOF actuals (join on) + commitment rows only; commitments-report obligation rows are not added');
  ok(r.notes.some(n => /obligation rows loaded/i.test(n)), 'drawer note counts obligation rows');
  ok(r.zeroRaw > 0 && r.zeroSkipped === r.zeroRaw && r.zeroLoaded === 0, 'zero-open FMZ3 rows excluded (' + r.zeroRaw + ')');
  ok(r.trav[0] === 'John Smith' && r.trav[1] === 'John Smith' && r.trav[2] === 'Maria Johnson' && r.dtsDesc.length, 'traveler cleanup ' + r.trav.join(' / '));
  ok(r.idtPrios > 1 && Math.abs(r.idtRawSum - r.idtPlan) <= 1, 'multiple prioritizations summed for IDT (' + r.idtPrios + ' rows)');
  // ---- pay group / allotment / upcoming commitments ----
  const q = await p.evaluate(() => {
    const t = G3.pgFromFa, d = G3.data, cur = G3.fyOf(G3.asOf());
    const parse = hdr => G3.parseWorkbook('k.xlsx', [{ name: 'Funding', aoa: [hdr, ['IDT', 100, 60, 45, '135', 'VTRN']] }]);
    const a1 = parse(['Account', 'TDP', 'AFP', 'Allotment', 'SAG', 'MDEP']), a2 = parse(['Account', 'TDP', 'AFP', 'Allot Amt (Q1)', 'SAG', 'MDEP']);
    const g = x => x.map(o => o.rows ? o : o).flat ? x : x;
    const f1 = (Array.isArray(a1) ? a1 : a1.results || [a1]).find(z => z.kind === 'fundkey' || (z.report && z.report.kind === 'fundkey'));
    const f2 = (Array.isArray(a2) ? a2 : a2.results || [a2]).find(z => z.kind === 'fundkey' || (z.report && z.report.kind === 'fundkey'));
    G3.state.fund = 'All'; const allU = G3.mods.ulo.rows().length, all011 = G3.mods.ulo.rows().filter(u => u.fund === '206011').length;
    G3.state.fund = '206010'; const u10 = G3.mods.ulo.rows(), L10 = G3.lines(cur), F10 = G3.funding(cur); G3.state.fund = 'All';
    const sch = d.dpcLines.filter(x => x.account === 'SCHOOLS'), schRaw = G3.data.sets.commit.rows.filter(x => /1B3PSCH/.test(x.fa));
    const nf = G3.normFund, fr = G3.fundFromRaw, fa = G3.fundFromAcct;
    return {
      pg: [t('100101B3PRAT'), t('131G48ASDF'), t('100701B3PIDT'), t(''), t('1234X')],
      nf: [nf('206010D27'), nf('206011d27'), nf(' 206510 D27 '), nf('206511D27'), fr('2027OMNG'), fr('2060')],
      fa: [fa('IDT'), fa('OSS OPS/TRAINING'), fa('ANTITERRORISM'), fa('ADOS'), fa('trauma training 2065'), fa('SCHOOLS')],
      funds: (G3.FUNDS || []).join(','),
      exp010: d.lines.filter(l => l.src === 'export' && l.fund === '206010').length,
      exp011: d.lines.filter(l => l.src === 'export' && l.fund === '206011').length,
      exp510: d.lines.filter(l => l.src === 'export' && l.fund === '206510').length,
      exp511: d.lines.filter(l => l.src === 'export' && l.fund === '206511').length,
      ulo010: d.ulo.filter(u => u.fund === '206010').length, ulo011: d.ulo.filter(u => u.fund === '206011').length,
      allU, all011, u10n: u10.length, u10bad: u10.filter(u => u.fund !== '206010').length,
      L10bad: L10.filter(l => l.fund !== '206010').length, L10n: L10.length,
      fundMap: d.funding.filter(f => f.fy === cur).map(f => f.account + '=' + (f.fund || '')).join(' '), F10: F10.map(f => f.account).sort().join(','),
      unk: (d.fundUnknownAccounts || []).map(x => x.name).join(','), odd: (d.sofOddFunds || []).map(o => o.fund).join(','),
      expPg: d.lines.filter(l => l.src === 'export' && l.pg).length, exp131: d.lines.filter(l => l.src === 'export' && l.pg === '').length,
      schBlankCol: schRaw.length && schRaw.every(x => x.pg === x.fa.slice(0, 5)),
      a1: f1 ? (f1.report || f1).hasAllot : 'nf', a1v: f1 ? (f1.rows || [])[0] && f1.rows[0].allot : null, a2: f2 ? (f2.rows || [])[0] && f2.rows[0].allot : null, a2note: f2 ? JSON.stringify((f2.report || {}).notes) : '',
      hasAllot: d.hasAllot, allotTot: Math.round(G3.sum(d.funding.filter(f => f.fy === cur), 'allot')),
      commitFm: d.lines.filter(l => l.src === 'commit' && l.fm != null).length, monthCommit: G3.spendByFm(G3.lines(cur)).reduce((a, b) => a + b, 0) === G3.spendByFm(G3.lines(cur, l => l.src === 'export')).reduce((a, b) => a + b, 0)
    };
  });
  console.log(JSON.stringify(q, null, 1));
  ok(q.pg.join() === '10010,,10070,,', 'pay group from Functional Area still coded: 100101B3PRAT->10010, 131G48ASDF->none (filter is off)');
  ok(q.nf.join() === '206010,206011,206510,206511,,' && q.funds === '206010,206011,206510', 'fund strips D27 / non-numeric suffix; 206511 is recognized but is not a filter option');
  ok(q.fa.join() === '206010,206011,206510,,206510,206010', 'fund from account map: IDT/SCHOOLS=206010, OSS OPS/TRAINING=206011, ANTITERRORISM=206510, ADOS not on the map');
  ok(q.exp010 > 0 && q.exp011 > 0 && q.exp510 > 0 && q.exp511 > 0 && q.ulo010 > 0 && q.ulo011 > 0, 'SOF rows carry 206010/206011/206510/206511; FMZ3 rows get a fund from their account when the report Fund is not a SOF fund');
  ok(q.all011 > 0 && q.u10n > 0 && q.u10bad === 0 && q.L10bad === 0, 'fund filter 206010 keeps only 206010 lines (Unliquidated too)');
  ok(q.fundMap === 'IDT=206010 AT=206010 SCHOOLS=206010 OSS OPS/TRAINING=206011 ADOS= TRAINING SUPPORT=206010 ANTITERRORISM=206510' && /ADOS/.test(q.F10) === false && /IDT/.test(q.F10) && /ANTITERRORISM/.test(q.F10) === false, 'funding per fund is the sum of mapped accounts (' + q.fundMap + ')');
  ok(/ADOS/.test(q.unk) && /206511/.test(q.odd), 'Data details will list ADOS as not on the fund map and 206511 as an out-of-range SOF fund');
  const h = await p.evaluate(() => {
    const cur = G3.fyOf(G3.asOf()), out = {};
    G3.state.fund = 'All'; const all = G3.totals(G3.lines(cur), G3.funding(cur));
    let sum = 0, unmappedTdp = 0;
    (G3.FUNDS || []).forEach(fd => { sum += G3.sum(G3.data.funding.filter(x => x.fy === cur && x.fund === fd), 'tdp'); });
    unmappedTdp = G3.sum(G3.data.funding.filter(x => x.fy === cur && !x.fund), 'tdp');
    G3.state.fund = '206011'; G3.refresh(); const T = G3.totals(G3.lines(cur), G3.funding(cur));
    const exp11 = G3.data.funding.filter(f => f.fy === cur && f.fund === '206011').reduce((a, f) => a + f.tdp, 0);
    const ex11 = G3.data.lines.filter(l => l.fy === cur && l.fund === '206011').reduce((a, l) => a + l.commit + l.oblig + l.disb, 0);
    location.hash = '#/sof'; G3.refresh(); const kpi = document.querySelector('#page-sof .kpi .val').textContent;
    const segs = [...document.querySelectorAll('#page-sof [data-seg="fund"] button')].map(b => b.getAttribute('data-v')).join(',');
    G3.state.fund = 'All'; G3.refresh(); const dtext = (G3.renderDrawer(), document.getElementById('dUnmapped').textContent);
    return { allTdp: all.tdp, sumByFund: sum, unmappedTdp, lvl: T.level, exp11, bal: Math.round(T.bal), expBal: Math.round(exp11 - ex11), kpi, money: G3.money(exp11), segs,
      unk: /Master-key accounts not on the fund map/i.test(dtext) && /ADOS/.test(dtext),
      odd: /SOF fund values outside/.test(dtext) && /206511/.test(dtext),
      no511: !/206511/.test(segs), off: /pay group filter is turned off/i.test(dtext) && /Fund 206010/.test(dtext) };
  });
  console.log(JSON.stringify(h));
  ok(Math.round(h.allTdp) === Math.round(h.sumByFund + h.unmappedTdp), 'TDP of 206010 + 206011 + 206510 plus unmapped-account funding (ADOS) adds back to the All total');
  ok(h.lvl === h.exp11 && h.bal === h.expBal && h.kpi === h.money, 'fund 206011: TDP = OSS OPS/TRAINING, balance = TDP - 206011 execution, card shows it (' + h.kpi + ')');
  ok(h.unk && h.odd && h.off && h.no511 && h.segs === 'All,206010,206011,206510', 'Data details lists ADOS and SOF fund 206511; filter options are exactly 206010, 206011, 206510 (no 206511); pay group filter noted as off');
  const ci = await p.evaluate(() => ({ key: G3.data.sets.cikey && G3.data.sets.cikey.rows.length, kind: G3.parseWorkbook('x.xlsx', [{ name: 'S', aoa: [['Commitment Item', 'Description'], ['21TD', 'DTS travel']] }])[0].kind, name: G3.ciName('21TD'), unm: Object.keys(G3.data.unmapped.ci), html: (location.hash = '#/ulo', G3.refresh(), document.querySelector('#page-ulo td.cic').innerHTML), opt: document.querySelector('#page-ulo select[data-ui="ci"]').textContent }));
  console.log(JSON.stringify(ci));
  ok(ci.key === 9 && ci.kind === 'cikey' && ci.name === 'DTS travel (TDY)', 'Commitment Item tab detected by headers and loaded');
  ok(/cicode/.test(ci.html) && /DTS travel|Travel on orders|Supplies|GPC|MIPR|PCS/.test(ci.html) && /DTS travel \(TDY\) \(21TD\)/.test(ci.opt), 'commitment item descriptions shown (code secondary) in table and filter');
  ok(ci.unm.join() === '25G1', 'unmapped commitment item listed (' + ci.unm.join() + ')');
  ok(q.schBlankCol, 'commitments with blank Pay Group column take pay group from Functional Area');
  ok(q.a1 === true && q.a1v === 45 && q.a2 === 45 && /right of AFP/.test(q.a2note) && q.hasAllot && q.allotTot > 0, 'Allotment parsed (header, and odd header right of AFP)');
  ok(q.commitFm === 0 && q.monthCommit, 'commitments are upcoming (no month), not in monthly actuals');
  // FMZ number in the expanded row
  await p.evaluate(() => G3.go('ulo')); await p.waitForTimeout(300);
  await p.click('#page-ulo tr.ulr'); await p.waitForTimeout(200);
  const det = await p.textContent('#page-ulo tr.uldet');
  ok(/FMZ number/i.test(det) && /\d{6,}/.test(det), 'FMZ number shown in expanded row: ' + det.slice(0, 80).replace(/\s+/g, ' '));
  // drawer text
  await p.click('#btnInfo'); await p.waitForTimeout(200);
  const dtext = await p.textContent('#drawer'); ok(/obligation rows loaded for spending-by-DPC/i.test(dtext) && /NGZZ99/.test(dtext) && /25G1/.test(dtext), 'drawer shows obligation count and unmapped DPC');
  await p.click('#btnClose');
  // ---- upload samples through the UI ----
  const files = fs.readdirSync(path.join(__dirname, 'samples')).filter(f => /\.xlsx$/.test(f)).map(f => path.join(__dirname, 'samples', f));
  await p.setInputFiles('#fileInput', files); await p.waitForFunction(() => G3.data.source === 'file', null, { timeout: 15000 }); await p.waitForTimeout(800);
  const kinds = await p.evaluate(() => Object.keys(G3.data.sets).map(k => k + '<-' + G3.data.sets[k].name + (G3.data.sets[k].sheet ? '[' + G3.data.sets[k].sheet + ']' : '')).join('\n'));
  console.log(kinds);
  const B = await fp(); const diff = Object.keys(A).filter(k => JSON.stringify(A[k]) !== JSON.stringify(B[k]));
  ok(diff.length === 0, 'sample upload reproduces test-data dashboard' + (diff.length ? ' DIFF ' + diff.join(',') : ''));
  // partial upload replaces only its dataset
  const before = await p.evaluate(() => G3.data.sets.commit.at);
  await p.setInputFiles('#fileInput', [path.join(__dirname, 'samples', 'FMZ3 Unliquidated.xlsx')]); await p.waitForTimeout(1200);
  ok(await p.evaluate(b => G3.data.sets.commit.at === b && Object.keys(G3.data.sets).length === 11, before), 'partial upload (FMZ3 only) left other datasets in place');
  for (const t of ['home', 'sof', 'spend', 'ulo', 'idt', 'at', 'sch', 'mob']) { await p.evaluate(t => G3.go(t), t); await p.waitForTimeout(250); }
  // save with data round trip
  const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => document.getElementById('btnSave').click())]);
  const sp = path.join(__dirname, 'saved-test.html'); await dl.saveAs(sp);
  const p2 = await ctx.newPage(); const e2 = []; p2.on('pageerror', e => e2.push(e.message));
  await p2.goto('file://' + sp + '#/idt'); await p2.waitForTimeout(800);
  const C2 = await p2.evaluate(() => [G3.data.source, G3.data.ulo.length, Math.round(G3.sum(G3.data.lines, 'commit'))]);
  const C1 = await p.evaluate(() => [G3.data.source, G3.data.ulo.length, Math.round(G3.sum(G3.data.lines, 'commit'))]);
  ok(JSON.stringify(C1) === JSON.stringify(C2) && !e2.length, 'save-with-data v2 round trip ' + JSON.stringify(C2));
  fs.unlinkSync(sp);
  // ---- pace, DPC signs, Unliquidated columns (test data) ----
  const p3 = await ctx.newPage(); p3.on('pageerror', e => errs.push(e.message));
  await p3.goto('file://' + __dirname + '/g3-dashboard.html#/sof'); await p3.waitForTimeout(600);
  const pc = await p3.evaluate(() => {
    const fy = G3.state.fy, T = G3.totals(G3.lines(fy), G3.funding(fy), 'tdp'), exp = G3.mods.sof.expected(fy, 'tdp');
    const pill = document.querySelector('#page-sof .kpi.tex .pill'), pctTxt = document.querySelector('#page-sof .kpi.tex .sub').textContent;
    const r = G3.parseWorkbook('c.xlsx', [{ name: 'S', aoa: [['Pay Group', 'Internal Order', 'Entry Type', 'Amount'], ['10010', 'NG7U01', 'Commitment', -100], ['10010', 'NG7U01', 'Commitment', 20], ['10010', 'NG7U01', 'Obligation', 300], ['10010', 'NG7U02', 'Obligation', 50]] }])[0];
    location.hash = '#/ulo'; G3.refresh();
    const heads = [...document.querySelectorAll('#page-ulo table.ulo thead th')].map(t => t.textContent);
    return { pill: pill && pill.textContent, want: G3.pace(T.od / T.level, exp.v).t, withCommit: G3.pace(T.pctx, exp.v).t, pctTxt, pctx: G3.pct(T.pctx), od: T.od, commit: T.commit,
      obl: G3.data.dpcLines.filter(x => x.type === 'oblig'), r: r.rows.map(x => x.type + ':' + x.amt).join(','), heads, acctSel: !!document.querySelector('#page-ulo select[data-ui="acct"]') };
  });
  ok(pc.pill === pc.want && pc.pctTxt.indexOf(pc.pctx) === 0 && pc.commit > 0, 'pace uses obligations + disbursements only (' + pc.pill + '; with commitments it would be ' + pc.withCommit + '); % executed still includes commitments (' + pc.pctx + ')');
  ok(pc.obl.length && pc.obl.every(x => x.amt > 0) && pc.r === 'commit:100,commit:-20,oblig:300,oblig:50', 'spending by DPC: obligations positive; sign set per entry type (negative or positive source) -> ' + pc.r);
  ok(pc.heads.indexOf('Account') < 0 && !pc.acctSel, 'Unliquidated has no Account column or filter (' + pc.heads.join(', ') + ')');
  // ---- realistic (messy) export + key: actuals populate under All and per pay group ----
  const clean = await p3.evaluate(() => { const fy = '2027'; G3.state.fund = 'All'; G3.state.pg = 'All'; const T = G3.totals(G3.lines(fy, l => l.src === 'export'), G3.funding(fy)); G3.state.fund = '206010'; const T1 = G3.totals(G3.lines(fy, l => l.src === 'export'), G3.funding(fy)); G3.state.fund = 'All'; G3.state.pg = 'All';
    return { od: Math.round(T.od), tdp: T.tdp, od10: Math.round(T1.od), tdp10: T1.tdp, idt: Math.round(G3.programCalc('idt', fy).spent), rows: G3.data.sets.export.rows.length }; });
  const real = [path.join(__dirname, 'samples', 'realistic', 'G3 Master Key (realistic).xlsx'), path.join(__dirname, 'samples', 'realistic', 'Status of Funds export (realistic).xlsx')];
  await p3.setInputFiles('#fileInput', real); await p3.waitForFunction(() => G3.data.source === 'file', null, { timeout: 15000 }); await p3.waitForTimeout(800);
  const m = await p3.evaluate(() => { const fy = G3.state.fy; G3.state.fund = 'All'; G3.state.pg = 'All'; const T = G3.totals(G3.lines(fy), G3.funding(fy)); G3.state.fund = '206010'; const T1 = G3.totals(G3.lines(fy), G3.funding(fy)); G3.state.fund = 'All'; G3.state.pg = 'All';
    location.hash = '#/spend'; G3.refresh(); const sp = G3.mods.spend.calc ? null : null;
    location.hash = '#/sof'; G3.refresh(); const kOb = document.querySelector('#page-sof .kpi.obl .val').textContent;
    G3.renderDrawer(); const dr = document.getElementById('tFiles').textContent;
    return { fy, kinds: Object.keys(G3.data.sets), od: Math.round(T.od), tdp: T.tdp, od10: Math.round(T1.od), tdp10: T1.tdp, idt: Math.round(G3.programCalc('idt', fy).spent), rows: G3.data.sets.export.rows.length, unm: G3.data.diag.export.unmapped, kOb, dr: /obligations \+ disbursements loaded/.test(dr), notes: G3.data.sets.export.report };
  });
  console.log(JSON.stringify({ clean, m: Object.assign({}, m, { notes: undefined }) }));
  ok(m.kinds.indexOf('export') >= 0 && m.kinds.indexOf('acctkey') >= 0 && m.rows === clean.rows && m.unm === 0, 'realistic export (title row, header variants, text amounts, FY27/P02, messy FAs and account names) loads all ' + m.rows + ' rows, $0 unmapped');
  ok(m.od === clean.od && m.od > 0 && m.tdp === clean.tdp && m.kOb !== '$0', 'realistic export: actuals under All match the clean export (' + m.od + ')');
  ok(m.od10 === clean.od10 && m.od10 > 0 && m.tdp10 === clean.tdp10 && m.idt === clean.idt && m.idt > 0, 'realistic export: fund 206010 and the IDT tab populate (' + m.od10 + ', IDT ' + m.idt + ')');
  ok(m.dr, 'data panel shows $ loaded / $ unmapped per dataset');
  // ---- Cole's full GFEBS export header (Aviation/G1 column rules) + Spend Plans ----
  const p4 = await ctx.newPage(); p4.on('pageerror', e => errs.push(e.message));
  await p4.goto('file://' + __dirname + '/g3-dashboard.html#/spend'); await p4.waitForTimeout(600);
  const sfp = async pg => pg.evaluate(() => { const fy = G3.state.fy; G3.state.fund = 'All'; G3.state.pg = 'All'; const sp = G3.mods.spend.calc(fy, ''); const T = G3.totals(G3.lines(fy), G3.funding(fy));
    G3.state.fund = '206010'; const sp10 = G3.mods.spend.calc(fy, ''); G3.state.fund = 'All'; G3.state.pg = 'All';
    const prog = ['idt', 'at', 'sch', 'mob'].map(k => Math.round(G3.programCalc(k, fy).spent) + '/' + Math.round(G3.programCalc(k, fy).planTD));
    return { fy, cur: sp.cur, pTD: Math.round(sp.tot.pTD), aTD: Math.round(sp.tot.aTD), fyPlan: Math.round(sp.tot.fyPlan), aTD10: Math.round(sp10.tot.aTD), od: Math.round(T.od), tdp: T.tdp, prog: prog.join(' '),
      acts: sp.accts.filter(r => r.aTD > 0 && r.pTD > 0).length, ulo: G3.data.ulo.length }; });
  const F0 = await sfp(p4);
  const sdir = path.join(__dirname, 'samples'), gdir = path.join(sdir, 'gfebs');
  const gFiles = fs.readdirSync(sdir).filter(f => /\.xlsx$/.test(f) && !/^Status of Funds export/.test(f)).map(f => path.join(sdir, f)).concat([path.join(gdir, 'Status of Funds export (GFEBS full columns).xlsx')]);
  await p4.setInputFiles('#fileInput', gFiles); await p4.waitForFunction(() => G3.data.source === 'file', null, { timeout: 15000 }); await p4.waitForTimeout(800);
  const F1 = await sfp(p4);
  const gx = await p4.evaluate(() => { const r = G3.data.sets.export.report; location.hash = '#/spend'; G3.refresh(); const k = [...document.querySelectorAll('#page-spend .kpi .val')].map(x => x.textContent);
    return { notes: r.notes, ign: r.ignoredCols, rows: G3.data.sets.export.rows.length, unm: G3.data.diag.export.unmapped, noMonth: G3.data.diag.export.noMonth, kpis: k, sets: Object.keys(G3.data.sets).length }; });
  console.log(JSON.stringify({ F0, F1, gx }, null, 1));
  ok(gx.rows === 637 && gx.unm === 0 && gx.noMonth === 0 && /"fiscal_month"/.test(gx.notes.join(' ')) && /"commitment_amt_cum"/.test(gx.notes.join(' ')) && /unit_identification_code/.test(gx.notes.join(' ')) && /fund_fonds/.test(gx.notes.join(' ')) && !/organizational_unique_identifier/.test(gx.notes.join(' ')), "Cole's full GFEBS header (111 columns): reads Aviation/G1 columns plus UIC and fund_fonds (not OUID); ignores " + gx.ign + ' others; 637 rows, $0 unmapped, every line has a month');
  ok(F1.od === F0.od && F1.tdp === F0.tdp && F1.prog === F0.prog && F1.ulo === F0.ulo && gx.sets === 11, 'GFEBS export: Status of Funds, program tabs and Unliquidated match the test data (look-alike columns fiscal_period / obligation_amt_cum / fiscal_year_gjahr not read)');
  ok(F1.pTD === F0.pTD && F1.aTD === F0.aTD && F1.pTD > 0 && F1.aTD > 0 && F1.aTD10 > 0 && F1.acts >= 4 && gx.kpis.every(v => v !== '$0'), 'Spend Plans populate from the GFEBS export: planned to date ' + F1.pTD + ', actual ' + F1.aTD + ' through month ' + F1.cur + ' (206010 actual ' + F1.aTD10 + ')');
  // Aviation/G1 spend plan layout (Account + date month headers) also loads
  await p4.setInputFiles('#fileInput', [path.join(gdir, 'Spend plan (Account layout).xlsx')]); await p4.waitForTimeout(1200);
  const F2 = await sfp(p4), pr = await p4.evaluate(() => G3.data.sets.plan.report);
  ok(pr.months === 12 && F2.fyPlan === F0.fyPlan && F2.pTD === F0.pTD, 'spend plan with Account + date month headers (Aviation/G1 layout) loads: 12 months, year plan ' + F2.fyPlan);
  const fmv = await p4.evaluate(() => ['2027002', 2027002, '002.2027', 'P02', '02 - Nov', 'Nov', 2, '002'].map(v => G3.util.fmNum(v)));
  ok(fmv.every(x => x === 2), 'fiscal month formats (2027002, 002.2027, P02, 02 - Nov, Nov, 2, 002) all read as month 2');
  // ---- military pay (2060): 100101B1PRID-style Functional Areas map; commitments-report obligations with no Internal Order map by FA ----
  const p5 = await ctx.newPage(); p5.on('pageerror', e => errs.push(e.message));
  await p5.goto('file://' + __dirname + '/g3-dashboard.html#/sof'); await p5.waitForTimeout(500);
  const mdir = path.join(__dirname, 'samples', 'milpay');
  const mFiles = fs.readdirSync(mdir).map(f => path.join(mdir, f)).concat(['FMZ3 Unliquidated.xlsx', 'G3 Spend Plan FY27.xlsx'].map(f => path.join(__dirname, 'samples', f)));
  await p5.setInputFiles('#fileInput', mFiles); await p5.waitForFunction(() => G3.data.source === 'file', null, { timeout: 15000 }); await p5.waitForTimeout(800);
  const mp = await p5.evaluate(() => {
    const L = G3.data.lines.filter(l => l.src === 'export' && /^MILPAY/.test(l.doc)), D = G3.data.dpcLines.filter(x => /^MPAY/.test(x.sdn));
    G3.renderDrawer(); const um = document.getElementById('dUnmapped').innerHTML;
    return { exp: L.map(l => l.fa + '>' + l.account).join(' '), com: D.map(x => x.fa + '>' + x.account + ':' + x.amt).join(' '), how: G3.data.faHow, top: (G3.data.topUnmappedFa || []).map(o => o.fa + ' $' + Math.round(o.amt) + ' ~' + (o.closest && o.closest.fa)),
      expUnm: G3.data.diag.export.unmapped, comUnm: G3.data.diag.commit.unmapped, hasTable: /Top unmapped Functional Areas/.test(um) && /100991B1PRZZ/.test(um), hasHow: /How rows mapped/.test(um) };
  });
  console.log(JSON.stringify(mp, null, 1));
  ok(mp.exp === '100101B1PRID>IDT 100101B1PRID>IDT 100101B1PRDR>IDT 100701B1PRAT>AT 100991B1PRZZ>Unmapped', '2060 export lines map: 100101B1PRID / 100101B1PRDR via key FA 100101B1PR (prefix), 100701B1PRAT despite hidden characters on the key (' + mp.exp + ')');
  ok(mp.com === '100101B1PRID>IDT:264000 100101B1PRID>IDT:118250 100701B1PRAT>AT:51000 100991B1PRZZ>Unmapped:9000', 'commitments-report 2060 obligation rows with no Internal Order map by Functional Area, shown positive (' + mp.com + ')');
  ok(mp.top[0] && /^100991B1PRZZ \$34000 ~/.test(mp.top[0]) && mp.hasTable && mp.hasHow && mp.how.export.prefix >= 3 && mp.how.commit.exact + mp.how.commit.prefix >= 3, 'data panel: top unmapped Functional Areas with $ and closest key FA (' + mp.top[0] + '), and how rows mapped');
  // ---- SOF export math (Cole): commitment_amt_cum = Total Expenditure, disbursement_amt_cum = Disbursement, Obligation = TE - Disb; never commitments ----
  const sm = await p3.evaluate(() => {
    const r = G3.parseWorkbook('x.xlsx', [{ name: 'S', aoa: [['contract_doc_no', 'commitment_item_fipex', 'functional_area_farea', 'appropriation_type', 'fiscal_year', 'fiscal_month', 'obligation_amt_cum', 'commitment_amt_cum', 'disbursement_amt_cum'],
      ['D1', '21TD', '100101B3PIDT', '2060', 2027, 1, -999999, -1000, -400], ['D2', 'ALLOBJ', '100101B3PIDT', '2060', 2027, 1, 0, -5000, 0]] }])[0];
    location.hash = '#/sof'; G3.refresh();
    return { kind: r.kind, row: r.rows.map(x => x.te + '/' + x.oblig + '/' + x.disb).join(','), n: r.rows.length, exportCommit: G3.data.lines.filter(l => l.src === 'export').reduce((t, l) => t + l.commit, 0) };
  });
  ok(sm.kind === 'export' && sm.row === '1000/600/400' && sm.n === 1 && sm.exportCommit === 0, 'SOF export: TE = -commitment_amt_cum (1000), Disb = -disbursement_amt_cum (400), Obligation = TE - Disb (600); obligation_amt_cum ignored; ALLOBJ dropped; export adds $0 to commitments');
  // ---- keys join on account name across tabs (case / spacing / hidden characters) + account cross-check ----
  const p6 = await ctx.newPage(); p6.on('pageerror', e => errs.push(e.message)); await p6.goto('file://' + __dirname + '/g3-dashboard.html#/sof'); await p6.waitForTimeout(500);
  const kj = await p6.evaluate(() => {
    const fy = G3.state.fy, before = {}; G3.data.accounts.forEach(a => { before[a.id] = Math.round(G3.planMonths(G3.plans(fy, p => p.account === a.id)).reduce((x, y) => x + y, 0)); });
    G3.data.sets.spkey.rows.forEach(r => { r.acct = ' ' + r.acct.toLowerCase().replace('/', ' / ') + '\u200b '; });
    G3.data.sets.dpckey.rows.push({ dpc: 'NGOR01', desc: 'Orphan DPC', acct: 'ORPHAN ACCT', tdc: 'X' });
    G3.derive(); G3.renderDrawer();
    const after = {}; G3.data.accounts.forEach(a => { after[a.id] = Math.round(G3.planMonths(G3.plans(fy, p => p.account === a.id)).reduce((x, y) => x + y, 0)); });
    const idt = G3.programCalc('idt', fy), html = document.getElementById('dUnmapped').innerHTML;
    return { same: Object.keys(before).every(k => before[k] === after[k]), unm: Object.keys(G3.data.unmapped.prio).length, idtPlan: Math.round(idt.planTD), idtSpent: Math.round(idt.spent), idtTdp: idt.tdp,
      miss: G3.data.acctCross.rows.filter(r => r.missing.length).map(r => r.name + ':' + r.missing.join('/')), cross: /Account cross-check/.test(html) && /ORPHAN ACCT/.test(html) };
  });
  console.log(JSON.stringify(kj));
  ok(kj.same && kj.unm === 0 && kj.idtPlan > 0 && kj.idtSpent > 0 && kj.idtTdp > 0, 'Spend Plan tab accounts in different case / spacing / hidden characters still join: prioritization -> account <- Functional Area / funding (IDT plan ' + kj.idtPlan + ', spent ' + kj.idtSpent + ')');
  ok(kj.cross && kj.miss.join(',') === 'ORPHAN ACCT:Funding/Accounts/Spend Plan', 'account cross-check lists accounts missing from other key tabs (' + kj.miss.join(',') + ')');
  // ---- UIC / Spending by Unit: Units + Hierarchy Level tabs, GFEBS UIC column, rollups, unmapped, filters ----
  const pU = await ctx.newPage(); pU.on('pageerror', e => errs.push(e.message));
  await pU.goto('file://' + __dirname + '/g3-dashboard.html#/sof'); await pU.waitForTimeout(700);
  const ur = await pU.evaluate(() => {
    const fy = G3.state.fy;
    const ex = G3.data.lines.filter(l => l.src === 'export' && l.fy === fy);
    const od = (l) => (l.oblig || 0) + (l.disb || 0);
    const tree = G3.unitRollup(fy);
    const sumT = (nodes) => nodes.reduce((s, n) => s + n.total, 0);
    function kidsOk(n) {
      const child = n.kids.reduce((s, k) => s + k.total, 0);
      const own = n._own ? n._own.total : 0;
      return Math.abs((own + child) - n.total) < 0.05 && n.kids.every(kidsOk);
    }
    const w8 = ex.filter(l => l.uicKey === 'W8AQ0B' || /^W8AQ0B/i.test(l.uic || ''));
    const suff = ex.filter(l => /01$/i.test(l.uic || '') && G3.util.uk(l.uic).length > 6);
    const un = ex.filter(l => !l.uicKey);
    const mscAM = tree.find(n => n.uic === 'W8AMAA');
    const bn133 = mscAM && mscAM.kids.find(n => n.uic === 'W8AQAA');
    G3.state.msc = 'W8AMAA'; const tAM = G3.unitRollup(fy); G3.state.msc = '';
    G3.renderDrawer(); const um = document.getElementById('dUnmapped').innerHTML;
    const panel = !!document.getElementById('unitPanel');
    const uicNote = (G3.data.sets.commit.report.notes || []).join(' ');
    const named = G3.unitName('W8AMAA');
    const levels = (G3.data.unitLevels || []).join('>');
    const mscFromUic = (G3.data.unitBy.W8AQ0B || {}).mscName || (G3.data.unitBy.W8AQ0B || {}).msc;
    return {
      hasUnits: G3.data.hasUnits, nUnits: (G3.data.units || []).length, nEx: ex.length, nUic: ex.filter(l => l.uic).length,
      named, levels, mscFromUic,
      suffN: suff.length, suffMapped: suff.filter(l => l.uicKey === G3.util.uk(l.uic).slice(0, 6)).length,
      treeN: tree.length, treeSum: Math.round(sumT(tree) * 100) / 100, exSum: Math.round(ex.reduce((s, l) => s + od(l), 0) * 100) / 100,
      kidsOk: tree.every(kidsOk), hasAM: !!mscAM, has133: !!bn133,
      unN: un.length, unAmt: Math.round(un.reduce((s, l) => s + od(l), 0)),
      hasUnTable: /Unmapped UICs/.test(um) && /W9UNKN/i.test(um),
      commitNoUic: /No UIC column/.test(uicNote),
      filterAM: tAM.length === 1 && tAM[0].uic === 'W8AMAA' && Math.abs(tAM[0].total - (mscAM ? mscAM.total : -1)) < 0.05,
      panel, sets: ['unitkey', 'hierkey'].every(k => G3.data.sets[k]),
      decoy: ex.every(l => l.uic !== 'OUID' && !(l.uic || '').startsWith('OUID'))
    };
  });
  console.log(JSON.stringify(ur));
  ok(ur.hasUnits && ur.sets && ur.nUnits >= 15 && ur.nUic === ur.nEx, 'Units and Hierarchy Level tabs load; every SOF export row carries a UIC (' + ur.nUic + ' rows, ' + ur.nUnits + ' units)');
  ok(ur.named === '2nd Brigade, 34th Infantry Division' && /MSC/.test(ur.levels) && /Battalion/.test(ur.levels) && ur.mscFromUic && /2nd Brigade|W8AMAA/.test(String(ur.mscFromUic)), 'Hierarchy is MSC > Battalion/Unit > UIC; MSC/battalion UICs resolve to unit names (' + ur.named + ', levels ' + ur.levels + ')');
  ok(ur.suffN > 0 && ur.suffMapped === ur.suffN && ur.decoy, 'Suffixed UICs (e.g. W8AQ0B01) map to the 6-character base; OUID is not read as UIC');
  ok(ur.kidsOk && ur.hasAM && ur.has133 && Math.abs(ur.treeSum - ur.exSum) < 0.05 && ur.exSum > 0, 'Unit rollups add up: children + own = parent, and all MSCs + unmapped = export obligations + disbursements (' + ur.treeSum + ')');
  ok(ur.unN > 0 && ur.hasUnTable && ur.unAmt > 0, 'Unmapped UIC W9UNKN is grouped and listed in Data details with dollars ($' + ur.unAmt + ', ' + ur.unN + ' rows)');
  ok(ur.commitNoUic && ur.filterAM && ur.panel, 'Commitments report (no UIC) is noted and left out of Spending by Unit; MSC filter narrows the tree to 2-34 IBCT; the SOF section is on the page');

  // ---- FMZ3 Order join, unit tree (MSC > unit > company), state roots, excluded DPC ----
  const jn = await pU.evaluate(() => {
    const fy = G3.state.fy;
    const ex = G3.data.lines.filter(l => l.src === 'export' && l.fy === fy);
    const od = l => (l.oblig || 0) + (l.disb || 0);
    const beforeOd = Math.round(ex.reduce((s, l) => s + od(l), 0) * 100) / 100;
    const T = G3.totals(G3.lines(fy), G3.funding(fy));
    const join = G3.data.sofJoin || {};
    const dps = G3.dpcRollup(fy);
    const sumO = G3.sum(dps, 'oblig'), sumD = G3.sum(dps, 'disb'), sumC = G3.sum(dps, 'commit');
    const exO = G3.sum(ex, 'oblig'), exD = G3.sum(ex, 'disb');
    const cmC = G3.sum(G3.data.dpcLines.filter(x => x.type === 'commit'), 'amt');
    const cmO = G3.sum(G3.data.dpcLines.filter(x => x.type === 'oblig'), 'amt');
    const tree = G3.unitRollup(fy);
    const state = tree.find(n => n.id === '__state__' || n.level === 'State');
    const msc = tree.find(n => n.uic === 'W8AMAA');
    const bn = msc && msc.kids.find(n => n.uic === 'W8AQAA');
    const co = bn && bn.kids.find(n => n.uic === 'W8AQ0B' || (n.kids && n.kids.length));
    const hasCo = !!(bn && bn.kids && bn.kids.some(k => k.level === 'UIC'));
    const hasHq = !!(bn && bn._own && bn._own.total);
    const hasDpc = !!(bn && bn.kids && bn.kids.some(k => k.dpcs && k.dpcs.length));
    const stUic = (G3.data.lines.filter(l => l.src === 'export' && (l.uicKey === 'W8AAAA' || G3.util.uk(l.uic) === 'W8AAAA')));
    const unmappedHasState = (G3.data.topUnmappedUic || []).some(u => /W8AAAA/i.test(u.uic));
    G3.renderDrawer();
    const um = ((document.getElementById('dUnmapped') || {}).textContent || '') + ' ' + ((document.getElementById('tFiles') || {}).textContent || '');
    const panel = !!document.getElementById('unitPanel'), xd = !!document.getElementById('uicDpcPanel');
    const dpcSel = !!document.querySelector('#page-sof select[data-st="order"]');
    const expBtn = !!document.getElementById('unitExpand');
    const ng = (G3.data.unmapped.dpc || {});
    const commitHasExcl = (G3.data.sets.commit.rows || []).some(r => G3.excludedDpc(r.dpc));
    const uloHasExcl = (G3.data.ulo || []).some(u => /NGDFHDOU/i.test(u.order || '') || /NGDFHDOU/i.test(u.orderRaw || ''));
    const uloLabel = (G3.data.ulo || []).filter(u => u.orderExcluded).length;
    return {
      beforeOd, execOd: Math.round(T.od * 100) / 100, joinMatched: join.matched, joinUnmatched: join.unmatched,
      matchRate: join.matchRate, lineRate: join.lineRate, conflicts: join.conflictDocs || 0, base: (join.how && join.how.base) || 0, exact: (join.how && join.how.exact) || 0,
      excluded: join.excluded || 0, excludedAmt: join.excludedAmt || 0,
      sumO, sumD, sumC, exO, exD, cmC, cmO,
      hasState: !!state, stateKids: state ? state.kids.length : 0, stateTotal: state ? state.total : 0,
      stN: stUic.length, stAmt: stUic.reduce((s, l) => s + od(l), 0), unmappedHasState,
      hasAM: !!msc, has133: !!bn, hasCo, hasHq, hasDpc,
      levels: (tree[0] && tree[0].kids && tree[0].kids[0] && tree[0].kids[0].kids) ? 3 : 0,
      panel, xd, dpcSel, expBtn,
      umJoin: /SOF .* FMZ3 Order join/i.test(um) || /Earmarked Funds = contract_doc_no/i.test(um),
      umState: /State \/ JFHQ/i.test(um) || /state-level root/i.test(um),
      umExcl: /Excluded DPCs/i.test(um) && /NGDFHDOU/i.test(um),
      ngInUnmapped: !!ng.NGDFHDOU,
      commitHasExcl, uloLabel,
      dpcNames: dps.map(d => d.name).join('|'),
      totalsUnchanged: Math.abs(beforeOd - T.od) < 0.05,
      fmzRows: G3.data.sets.fmz3.rows.length, uloN: G3.data.ulo.length
    };
  });
  console.log(JSON.stringify(jn, null, 1));
  ok(jn.joinMatched > 0 && jn.matchRate > 0.5 && jn.base > 0, 'SOF x FMZ3 join matches most dollars (rate ' + Math.round((jn.matchRate || 0) * 100) + '%, exact ' + jn.exact + ', base/suffix ' + jn.base + ', unmatched ' + jn.joinUnmatched + ')');
  ok(Math.abs(jn.sumO - jn.exO) < 0.05 && Math.abs(jn.sumD - jn.exD) < 0.05 && jn.totalsUnchanged, 'join does not change execution totals; DPC actuals add back to SOF obligations + disbursements');
  ok(Math.abs(jn.sumC - jn.cmC) < 0.05 && Math.abs(jn.sumO - jn.cmO) > 1, 'DPC commitments come from the commitments report; SOF actuals replace obligation entries (no double count)');
  ok(jn.conflicts > 0 && jn.umJoin, 'multi-Order earmarked documents are split by Amount Total share and listed in Data details (' + jn.conflicts + ')');
  ok(jn.joinUnmatched > 0, 'unmatched SOF docs go to No order (no FMZ3 match) with dollars in Data details');
  ok(jn.hasAM && jn.has133 && jn.hasCo && jn.levels >= 3, 'Spending by Unit tree is 3 levels: MSC expands to battalions/units, units expand to companies');
  ok(jn.hasState && jn.stateKids > 0 && jn.stN > 0 && !jn.unmappedHasState && jn.umState, 'State-level root UIC W8AAAA is under State / JFHQ (root), not Unmapped UIC (' + jn.stN + ' SOF rows, $' + Math.round(jn.stAmt) + ')');
  ok(jn.hasDpc && jn.panel && jn.xd && jn.dpcSel && jn.expBtn, 'Company -> DPC drill, DPC/order filter, Company x DPC table, and Expand all are on the page');
  ok(!jn.ngInUnmapped && !jn.commitHasExcl && jn.umExcl && (jn.excluded > 0 || jn.uloLabel >= 0), 'NGDFHDOU is excluded from commitments and unmapped DPC list; SOF dollars on that Order are kept as No order (excluded DPC)');
  ok(jn.fmzRows > jn.uloN, 'zero-open FMZ3 rows are kept for the Order lookup but left out of Unliquidated (' + jn.uloN + ' open / ' + jn.fmzRows + ' loaded)');

  // ---- Status of Funds accounts table fits without a horizontal scroll bar at 1920 and 1600 ----
  const fit = [];
  for (const w of [1920, 1600]) { const pw = await ctx.newPage(); await pw.setViewportSize({ width: w, height: 1000 }); await pw.goto('file://' + __dirname + '/g3-dashboard.html#/sof'); await pw.waitForTimeout(600);
    for (const v of ['tdp', 'afp', 'allot']) fit.push(await pw.evaluate(([v, w]) => { G3.state.view = v; G3.refresh(); const t = document.querySelector('#page-sof table.acct').closest('.tablewrap'); return w + v + ':' + (t.scrollWidth <= t.clientWidth ? 'fits' : t.scrollWidth + '>' + t.clientWidth); }, [v, w]));
    await pw.close(); }
  ok(fit.every(x => /fits$/.test(x)), 'Status of Funds accounts table has no horizontal scroll at 1920 / 1600 (' + fit.join(' ') + ')');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
  await b.close();
})();
