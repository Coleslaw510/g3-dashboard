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
  const files = fs.readdirSync(path.join(__dirname, 'samples')).map(f => path.join(__dirname, 'samples', f));
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
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
  await b.close();
})();
