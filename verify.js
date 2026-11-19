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
    G3.state.pg = 'All'; const cf = G3.fyOf(G3.asOf());
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
    const rawC = raw.slice(1).filter(x => /commit/i.test(x[iE])), rawO = raw.slice(1).filter(x => /oblig/i.test(x[iE])), rawX = raw.slice(1).filter(x => !/commit|oblig/i.test(x[iE]));
    const cur = G3.fyOf(G3.asOf()); G3.state.pg = 'All';
    const commitLines = G3.data.lines.filter(l => l.src === 'commit');
    const planRaw = G3.makeTestFiles().find(f => /Spend Plan FY/.test(f.name)).sheets[0].aoa, key = G3.makeTestFiles()[0].sheets.find(s => s.name === 'Spend Plan').aoa;
    const prio2acct = {}; key.slice(1).forEach(x => prio2acct[x[0]] = x[1]);
    const ph = planRaw[0], oct = ph.indexOf('October');
    const idtRaw = planRaw.slice(1).filter(x => prio2acct[x[0]] === 'IDT');
    const idtRawSum = idtRaw.reduce((s, x) => s + x.slice(oct, oct + 12).reduce((a, v) => a + (+v || 0), 0), 0);
    const idtPlan = G3.data.plan.filter(x => x.account === 'IDT').reduce((s, x) => s + x.m.reduce((a, v) => a + v, 0), 0);
    const fz = G3.makeTestFiles().find(f => /FMZ3/.test(f.name)).sheets[0].aoa, fo = fz[0].indexOf('Amount Open (TC)');
    return {
      rawNeg: rawC.every(x => +x[iA] < 0), allPos: c.rows.every(x => x.amt > 0), nC: rawC.length, nO: rawO.length, nX: rawX.length,
      rowsC: c.rows.filter(x => x.type === 'commit').length, rowsO: c.rows.filter(x => x.type === 'oblig').length,
      commitInTotals: Math.round(G3.sum(G3.lines(cur), 'commit')), commitRows: Math.round(G3.sum(c.rows.filter(x => x.type === 'commit'), 'amt')),
      obligFromCommitInLines: commitLines.filter(l => l.oblig || l.disb).length, commitLineCount: commitLines.length,
      dpcOblig: Math.round(G3.sum(G3.dpcRollup(cur), 'oblig')), obligRows: Math.round(G3.sum(c.rows.filter(x => x.type === 'oblig'), 'amt')),
      notes: c.report.notes.concat(Object.keys(c.report.skipped).map(k => c.report.skipped[k] + ' ' + k)),
      zeroRaw: fz.slice(1).filter(x => Math.abs(+x[fo]) < 0.005).length, zeroSkipped: S.fmz3.report.skipped['zero-open rows excluded'], zeroLoaded: G3.data.ulo.filter(u => !(u.open > 0)).length,
      trav: [G3.traveler('traveler:smithjohn'), G3.traveler('TRAVELER: SMITH, JOHN'), G3.traveler('Traveler:JohnsonMaria')],
      dtsDesc: G3.data.ulo.filter(u => /^DTS – /.test(u.desc)).slice(0, 3).map(u => u.hdr + ' -> ' + u.desc),
      idtPrios: idtRaw.length, idtRawSum: Math.round(idtRawSum), idtPlan: Math.round(idtPlan), fmzSample: G3.data.ulo[0].fmz
    };
  });
  console.log(JSON.stringify(r, null, 1));
  ok(r.rawNeg && r.allPos, 'commitments sign flip (raw negative -> loaded positive)');
  ok(r.rowsC === r.nC && r.rowsO === r.nO && r.nO > 0, 'entry-type filter keeps commitment (' + r.rowsC + ') and obligation (' + r.rowsO + ') rows, ignores ' + r.nX + ' others');
  ok(r.commitInTotals === r.commitRows && r.obligFromCommitInLines === 0 && r.commitLineCount === r.rowsC, 'obligation rows NOT in execution totals');
  ok(r.dpcOblig === r.obligRows && r.obligRows > 0, 'obligation rows ARE in spending by DPC');
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
    G3.state.pg = 'All'; const allU = G3.mods.ulo.rows().length, all131 = G3.mods.ulo.rows().filter(u => u.pg === '').length;
    G3.state.pg = '10010'; const u10 = G3.mods.ulo.rows(), L10 = G3.lines(cur), F10 = G3.funding(cur); G3.state.pg = 'All';
    const sch = d.dpcLines.filter(x => x.account === 'SCHOOLS'), schRaw = G3.data.sets.commit.rows.filter(x => /1B3PSCH/.test(x.fa));
    return {
      pg: [t('100101B3PRAT'), t('131G48ASDF'), t('100701B3PIDT'), t(''), t('1234X')],
      expPg: d.lines.filter(l => l.src === 'export' && l.pg).length, exp131: d.lines.filter(l => l.src === 'export' && l.pg === '').length,
      uloPg: d.ulo.filter(u => u.pg).length, ulo131: d.ulo.filter(u => u.pg === '').length, allU, all131, u10n: u10.length, u10bad: u10.filter(u => u.pg !== '10010').length,
      L10bad: L10.filter(l => l.pg !== '10010').length, L10n: L10.length,
      fundPg: d.funding.filter(f => f.fy === cur).map(f => f.account + '=' + f.pg).join(' '), F10: F10.map(f => f.account).join(','),
      schBlankCol: schRaw.length && schRaw.every(x => x.pg === x.fa.slice(0, 5)),
      a1: f1 ? (f1.report || f1).hasAllot : 'nf', a1v: f1 ? (f1.rows || [])[0] && f1.rows[0].allot : null, a2: f2 ? (f2.rows || [])[0] && f2.rows[0].allot : null, a2note: f2 ? JSON.stringify((f2.report || {}).notes) : '',
      hasAllot: d.hasAllot, allotTot: Math.round(G3.sum(d.funding.filter(f => f.fy === cur), 'allot')),
      commitFm: d.lines.filter(l => l.src === 'commit' && l.fm != null).length, monthCommit: G3.spendByFm(G3.lines(cur)).reduce((a, b) => a + b, 0) === G3.spendByFm(G3.lines(cur, l => l.src === 'export')).reduce((a, b) => a + b, 0)
    };
  });
  console.log(JSON.stringify(q, null, 1));
  ok(q.pg.join() === '10010,,10070,,', 'pay group from Functional Area: 100101B3PRAT->10010, 131G48ASDF->none');
  ok(q.expPg > 0 && q.exp131 > 0 && q.uloPg > 0 && q.ulo131 > 0, 'export + FMZ3 rows get pay groups; 131G rows get none');
  ok(q.all131 > 0 && q.u10n > 0 && q.u10bad === 0 && q.L10bad === 0, 'pay group filter: 131G rows only under All; 10010 filter keeps only 10010 lines (Unliquidated too)');
  ok(q.fundPg === 'IDT=10010 AT=10070 SCHOOLS=10080 OSS OPS/TRAINING=10080 ADOS= TRAINING SUPPORT=10090' && q.F10 === 'IDT', 'funding pay group per account from its Functional Areas (' + q.fundPg + ')');
  const h = await p.evaluate(() => {
    const cur = G3.fyOf(G3.asOf()), out = {};
    G3.state.pg = 'All'; const all = G3.totals(G3.lines(cur), G3.funding(cur));
    let sum = 0;
    G3.PAYGROUPS.concat(['']).forEach(pg => { G3.state.pg = 'All'; const f = G3.funding(cur, x => x.pg === pg), l = G3.lines(cur, x => x.pg === pg); sum += G3.sum(f, 'tdp'); });
    G3.state.pg = '10080'; const T = G3.totals(G3.lines(cur), G3.funding(cur));
    const exp8 = G3.data.funding.filter(f => f.fy === cur && (f.account === 'SCHOOLS' || f.account === 'OSS OPS/TRAINING')).reduce((a, f) => a + f.tdp, 0);
    const ex8 = G3.data.lines.filter(l => l.fy === cur && l.pg === '10080').reduce((a, l) => a + l.commit + l.oblig + l.disb, 0);
    location.hash = '#/sof'; G3.refresh(); const kpi = document.querySelector('#page-sof .kpi .val').textContent;
    G3.state.pg = 'All'; G3.refresh(); const dtext = (G3.renderDrawer(), document.getElementById('dUnmapped').textContent);
    return { allTdp: all.tdp, sumByPg: sum, lvl: T.level, exp8, bal: Math.round(T.bal), expBal: Math.round(exp8 - ex8), kpi, money: G3.money(exp8), conflict: /Key conflicts:.*OSS OPS\/TRAINING.*counted under 10080/.test(dtext) };
  });
  console.log(JSON.stringify(h));
  ok(Math.round(h.allTdp) === Math.round(h.sumByPg), 'TDP by pay group (incl. no pay group) adds back to the All total');
  ok(h.lvl === h.exp8 && h.bal === h.expBal && h.kpi === h.money, 'pay group 10080: TDP = SCHOOLS + OSS OPS/TRAINING, balance = TDP - 10080 execution, card shows it (' + h.kpi + ')');
  ok(h.conflict, 'account with Functional Areas in two pay groups listed as a key conflict');
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
  ok(await p.evaluate(b => G3.data.sets.commit.at === b && Object.keys(G3.data.sets).length === 9, before), 'partial upload (FMZ3 only) left other datasets in place');
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
  const clean = await p3.evaluate(() => { const fy = '2027'; G3.state.pg = 'All'; const T = G3.totals(G3.lines(fy, l => l.src === 'export'), G3.funding(fy)); G3.state.pg = '10010'; const T1 = G3.totals(G3.lines(fy, l => l.src === 'export'), G3.funding(fy)); G3.state.pg = 'All';
    return { od: Math.round(T.od), tdp: T.tdp, od10: Math.round(T1.od), tdp10: T1.tdp, idt: Math.round(G3.programCalc('idt', fy).spent), rows: G3.data.sets.export.rows.length }; });
  const real = [path.join(__dirname, 'samples', 'realistic', 'G3 Master Key (realistic).xlsx'), path.join(__dirname, 'samples', 'realistic', 'Status of Funds export (realistic).xlsx')];
  await p3.setInputFiles('#fileInput', real); await p3.waitForFunction(() => G3.data.source === 'file', null, { timeout: 15000 }); await p3.waitForTimeout(800);
  const m = await p3.evaluate(() => { const fy = G3.state.fy; G3.state.pg = 'All'; const T = G3.totals(G3.lines(fy), G3.funding(fy)); G3.state.pg = '10010'; const T1 = G3.totals(G3.lines(fy), G3.funding(fy)); G3.state.pg = 'All';
    location.hash = '#/spend'; G3.refresh(); const sp = G3.mods.spend.calc ? null : null;
    location.hash = '#/sof'; G3.refresh(); const kOb = document.querySelector('#page-sof .kpi.obl .val').textContent;
    G3.renderDrawer(); const dr = document.getElementById('tFiles').textContent;
    return { fy, kinds: Object.keys(G3.data.sets), od: Math.round(T.od), tdp: T.tdp, od10: Math.round(T1.od), tdp10: T1.tdp, idt: Math.round(G3.programCalc('idt', fy).spent), rows: G3.data.sets.export.rows.length, unm: G3.data.diag.export.unmapped, kOb, dr: /obligations \+ disbursements loaded/.test(dr), notes: G3.data.sets.export.report };
  });
  console.log(JSON.stringify({ clean, m: Object.assign({}, m, { notes: undefined }) }));
  ok(m.kinds.indexOf('export') >= 0 && m.kinds.indexOf('acctkey') >= 0 && m.rows === clean.rows && m.unm === 0, 'realistic export (title row, header variants, text amounts, FY27/P02, messy FAs and account names) loads all ' + m.rows + ' rows, $0 unmapped');
  ok(m.od === clean.od && m.od > 0 && m.tdp === clean.tdp && m.kOb !== '$0', 'realistic export: actuals under All match the clean export (' + m.od + ')');
  ok(m.od10 === clean.od10 && m.od10 > 0 && m.tdp10 === clean.tdp10 && m.idt === clean.idt && m.idt > 0, 'realistic export: pay group 10010 and the IDT tab populate (' + m.od10 + ', IDT ' + m.idt + ')');
  ok(m.dr, 'data panel shows $ loaded / $ unmapped per dataset');
  // ---- Cole's full GFEBS export header (Aviation/G1 column rules) + Spend Plans ----
  const p4 = await ctx.newPage(); p4.on('pageerror', e => errs.push(e.message));
  await p4.goto('file://' + __dirname + '/g3-dashboard.html#/spend'); await p4.waitForTimeout(600);
  const sfp = async pg => pg.evaluate(() => { const fy = G3.state.fy; G3.state.pg = 'All'; const sp = G3.mods.spend.calc(fy, ''); const T = G3.totals(G3.lines(fy), G3.funding(fy));
    G3.state.pg = '10010'; const sp10 = G3.mods.spend.calc(fy, ''); G3.state.pg = 'All';
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
  ok(gx.rows === 637 && gx.unm === 0 && gx.noMonth === 0 && /"fiscal_month"/.test(gx.notes.join(' ')) && /"commitment_amt_cum"/.test(gx.notes.join(' ')), "Cole's full GFEBS header (111 columns): reads contract_doc_no, commitment_item_fipex, functional_area_farea, appropriation_type, fiscal_year, fiscal_month, commitment_amt_cum, disbursement_amt_cum; ignores " + gx.ign + ' others; 637 rows, $0 unmapped, every line has a month');
  ok(F1.od === F0.od && F1.tdp === F0.tdp && F1.prog === F0.prog && F1.ulo === F0.ulo && gx.sets === 9, 'GFEBS export: Status of Funds, program tabs and Unliquidated match the test data (look-alike columns fiscal_period / obligation_amt_cum / fiscal_year_gjahr not read)');
  ok(F1.pTD === F0.pTD && F1.aTD === F0.aTD && F1.pTD > 0 && F1.aTD > 0 && F1.aTD10 > 0 && F1.acts >= 4 && gx.kpis.every(v => v !== '$0'), 'Spend Plans populate from the GFEBS export: planned to date ' + F1.pTD + ', actual ' + F1.aTD + ' through month ' + F1.cur + ' (10010 actual ' + F1.aTD10 + ')');
  // Aviation/G1 spend plan layout (Account + date month headers) also loads
  await p4.setInputFiles('#fileInput', [path.join(gdir, 'Spend plan (Account layout).xlsx')]); await p4.waitForTimeout(1200);
  const F2 = await sfp(p4), pr = await p4.evaluate(() => G3.data.sets.plan.report);
  ok(pr.months === 12 && F2.fyPlan === F0.fyPlan && F2.pTD === F0.pTD, 'spend plan with Account + date month headers (Aviation/G1 layout) loads: 12 months, year plan ' + F2.fyPlan);
  const fmv = await p4.evaluate(() => ['2027002', 2027002, '002.2027', 'P02', '02 - Nov', 'Nov', 2, '002'].map(v => G3.util.fmNum(v)));
  ok(fmv.every(x => x === 2), 'fiscal month formats (2027002, 002.2027, P02, 02 - Nov, Nov, 2, 002) all read as month 2');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
  await b.close();
})();
