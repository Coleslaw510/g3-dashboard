# G3 Dashboard (design draft, fictional test data)

- `g3-dashboard.html`: single self-contained file. Works offline; Chart.js 4.4.4 and SheetJS are inlined from the aviation repo's vendor folder.
- `src/`: the source. `base.css` is the Aviation Dashboard's command.css unchanged, and `g3.css` holds the G3 additions. `data.js` is the test-data generator and documents the data shape. `core.js` has state, the TDP/AFP/Allotment math, the loaders, and Save with data. Each page has its own file.
- Build: `python3 build.py`. Screenshots: `node shoot.js` (1440px, into shots/). Math check: `node verify.js`.
- Real report schemas go in `G3.loaders` in core.js. Each loader only has to output the shapes listed at the top of data.js.
