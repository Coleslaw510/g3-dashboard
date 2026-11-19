// node perf.js [file]  -> median ms for common interactions (headless Chrome, 1600x1000)
const { chromium } = require('playwright-core');
const file = process.argv[2] || __dirname + '/g3-dashboard.html', RUNS = +(process.env.RUNS || 5), SCALE = +(process.env.SCALE || 1), THROTTLE = +(process.env.THROTTLE || 1);
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const res = {};
  const add = (k, v) => (res[k] = res[k] || []).push(v);
  for (let run = 0; run < RUNS; run++) {
    const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
    if (THROTTLE > 1) { const c = await p.context().newCDPSession(p); await c.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE }); }
    const t0 = Date.now();
    await p.goto('file://' + file + '#/home', { waitUntil: 'load' });
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    add('initial load (to first paint of Home)', Date.now() - t0);
    const nav = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { parse: n.domContentLoadedEventStart, dcl: n.domContentLoadedEventEnd - n.domContentLoadedEventStart }; });
    add('  HTML+script parse (DCL start)', nav.parse); add('  init + Home render (DCL handler)', nav.dcl);
    if (SCALE > 1) add('  rescale+derive (' + SCALE + 'x rows)', await p.evaluate(k => { const s = performance.now(); ['export', 'commit', 'fmz3'].forEach(n => { const S = G3.data.sets[n]; const r = S.rows, o = []; for (let i = 0; i < k; i++) r.forEach(x => o.push(Object.assign({}, x))); S.rows = o; }); G3.derive(); G3.refresh(); return performance.now() - s; }, SCALE));
    // time an action until two animation frames after it (layout + paint included)
    const act = (fn, arg) => p.evaluate(async ([src, a]) => { const f = eval(src); const s = performance.now(); await f(a); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - s; }, [fn.toString(), arg]);
    for (const t of ['sof', 'spend', 'ulo', 'idt', 'at', 'sch', 'mob', 'home']) add('tab switch: ' + t, await act(t => { location.hash = '#/' + t; return new Promise(r => setTimeout(r, 0)); }, t));
    // second visit to a tab (cache potential)
    await act(() => { location.hash = '#/home'; return new Promise(r => setTimeout(r, 0)); });
    add('tab switch: sof (2nd visit)', await act(() => { location.hash = '#/sof'; return new Promise(r => setTimeout(r, 0)); }));
    add('SOF pay group toggle', await act(() => document.querySelector('#page-sof [data-seg="pg"] button[data-v="10070"]').click()));
    add('SOF pay group back to All', await act(() => document.querySelector('#page-sof [data-seg="pg"] button[data-v="All"]').click()));
    add('SOF view toggle (AFP)', await act(() => document.querySelector('#page-sof [data-seg="view"] button[data-v="afp"]').click()));
    add('SOF view toggle (TDP)', await act(() => document.querySelector('#page-sof [data-seg="view"] button[data-v="tdp"]').click()));
    await act(() => { location.hash = '#/ulo'; return new Promise(r => setTimeout(r, 0)); });
    add('ULO type "smith" (5 keys; work only, waits removed)', -700 + await act(async () => {
      for (const ch of 'smith') { const i = document.querySelector('#page-ulo [data-ui="q"]'); i.value += ch; i.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 60)); }
      await new Promise(r => setTimeout(r, 400));
    }));
    await act(() => { document.getElementById('uloReset').click(); });
    add('ULO sort by Open', await act(() => document.querySelector('#page-ulo th[data-k="open"]').click()));
    add('ULO expand row', await act(() => document.querySelector('#page-ulo tr.ulr').click()));
    await act(() => { location.hash = '#/idt'; return new Promise(r => setTimeout(r, 0)); });
    add('IDT TDC drill click', await act(() => document.querySelector('#page-idt tr.tdcr').click()));
    add('IDT pay group toggle', await act(() => document.querySelector('#page-idt [data-seg="pg"] button[data-v="10010"]').click()));
    await p.close();
  }
  const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const out = {}; Object.keys(res).forEach(k => out[k] = Math.round(med(res[k])));
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
