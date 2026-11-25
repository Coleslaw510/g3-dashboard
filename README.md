# G3 Dashboard (design draft, fictional test data)

- `g3-dashboard.html`: single self-contained file. Works offline; Chart.js 4.4.4 and SheetJS are inlined from the aviation repo's vendor folder.
- `src/`: the source. `base.css` is the Aviation Dashboard's command.css unchanged, and `g3.css` holds the G3 additions. `data.js` is the test-data generator and documents the data shape. `core.js` has state, the TDP/AFP/Allotment math, the loaders, and Save with data. Each page has its own file.
- Build: `python3 build.py`. Screenshots: `node shoot.js` (1440px, into shots/). Math check: `node verify.js`.
- Live: [G3 Dashboard](https://coleslaw510.github.io/g3-dashboard/) · [Download latest](https://coleslaw510.github.io/g3-dashboard/download/) (`g3-dashboard.html`, always the current build).
- Publish: `./publish.sh --push` rebuilds, copies the file to both `index.html` and `g3-dashboard.html` in the GitHub Pages repo, and refreshes `/download/` (date in Central Time, short commit, file size via `version.json`).
- Real report schemas go in `G3.loaders` in core.js. Each loader only has to output the shapes listed at the top of data.js.

## Real report files (Nov 2026)
One **Upload data** button takes any mix of files; each is recognised by its header row (not its name) and replaces only the dataset(s) it feeds:

| File | Recognised by headers | Used columns |
|---|---|---|
| Status of Funds export | Aviation export columns (Contract Doc No, Commitment Item FIPEX, Functional Area FAREA, Fiscal Year/Month, Commitment Amt Cum, Disbursement Amt Cum) | same math as Aviation |
| Master Key – Funding | Account + TDP/AFP | Account, TDP, AFP, Allotment (column right of AFP), SAG, MDEP (optional Fiscal Year) |
| Master Key – Accounts | Functional Area + Account | |
| Master Key – DPC | DPC/Internal Order + Description (+ TDC) | DPC, Description, Account, TDC |
| Master Key – Spend Plan | Prioritization + Account (no months) | |
| Master Key – Commitment Item | Commitment Item + Description (no DPC/Account) | descriptions shown wherever commitment items appear |
| Master Key – Units | UIC, Unit Name, MSC, Battalion/Unit | unit names and the MSC → battalion → UIC tree |
| Master Key – Hierarchy Level | Hierarchy Level and/or UIC + Parent UIC, optional Order | level order (MSC highest, then Battalion/Unit, then UIC); UIC-to-parent rows build the tree when present |
| Status of Funds export (UIC) | `unit_identification_code_|_uic` (or any UIC header; not OUID) | spending by unit on Status of Funds |
| Commitments (checkbook drill down) | Entry Type + Amount + Internal Order | Pay Group, Internal Order, Entry Type, Amount (sign flipped). Commitment rows count in TDP execution; Obligation rows feed spending-by-DPC only |
| FMZ3 | Earmarked Funds + Amount Open (TC) | open/total, Posting Date, Earmarked Funds (FMZ #), Functional Area, Commitment item, Document Header Text (traveler cleanup); zero-open rows dropped |
| Spend plan | Prioritization + month columns | Prioritization, October–September |

`samples/` holds sample files of every type (fictional); `node tools/make-samples.js` regenerates them; `node verify.js` checks the math and the upload round trip.

Pay group = first 5 characters of a Functional Area when all digits (100101B3PRAT → 10010); each account takes its Functional Areas' pay group, so TDP/AFP/Allotment add up per pay group. Spending maps by account first (Functional Area → Account); pay group is only a filter. Pace uses obligations + disbursements only. `samples/gfebs/` has the export with Cole's full 111-column GFEBS header (only the 8 Aviation/G1 columns are read) and an Account-layout spend plan with date month headers; `samples/realistic/` has a messy export (title row, header variants, text amounts) that verify.js proves loads identically. `node perf.js` times common interactions (SCALE=20 THROTTLE=4 for a heavy-data / slow-laptop run).
