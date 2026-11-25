/* Generate boss-ready sample PDFs (US Letter landscape) for Home, Status of Funds, and IDT. */
const { chromium } = require("playwright-core");
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const SHOTS = path.join(ROOT, "shots");
const HTML = "file://" + path.join(ROOT, "g3-dashboard.html");

function ppm(pdf, dest) {
  const r = spawnSync("pdftoppm", ["-png", "-f", "1", "-l", "1", "-singlefile", "-r", "140", pdf, dest], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    throw new Error("pdftoppm failed for " + pdf);
  }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await p.goto(HTML, { waitUntil: "load" });
  await p.waitForTimeout(900);

  async function printTab(hash, name, setup) {
    await p.evaluate((h) => { location.hash = h; }, hash);
    await p.waitForTimeout(700);
    if (setup) await p.evaluate(setup);
    await p.waitForTimeout(250);
    await p.emulateMedia({ media: "print" });
    await p.evaluate(() => G3.preparePrint());
    await p.waitForTimeout(300);
    const pdf = path.join(SHOTS, "print-" + name + ".pdf");
    await p.pdf({
      path: pdf,
      landscape: true,
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true
    });
    await p.evaluate(() => G3.restorePrint());
    await p.emulateMedia({ media: "screen" });
    ppm(pdf, path.join(SHOTS, "print-" + name));
    const info = spawnSync("pdfinfo", [pdf], { encoding: "utf8" });
    const pages = /Pages:\s+(\d+)/.exec(info.stdout || "");
    console.log("wrote", path.relative(ROOT, pdf), pages ? pages[1] + " pages" : "");
  }

  await printTab("#/home", "home");

  await printTab("#/sof", "sof", () => {
    const fy = G3.state.fy, tree = G3.unitRollup(fy);
    const msc = tree.find((n) => n.uic === "W8AMAA") || tree[0];
    const bn = msc && (msc.kids.find((n) => n.uic === "W8AQAA") || msc.kids[0]);
    const ui = G3.mods.sof.ui; ui.openUnit = ui.openUnit || {};
    if (msc) ui.openUnit[msc.id] = true;
    if (bn) ui.openUnit[bn.id] = true;
    G3.mods.sof.render();
  });

  await printTab("#/idt", "idt", () => {
    const fy = G3.state.fy, accts = (G3.data.accounts || []).filter((a) => a.program === "idt").map((a) => a.id);
    const tree = G3.unitRollup(fy, (l) => accts.indexOf(l.account) >= 0, { withTdc: true });
    const msc = tree.find((n) => n.uic === "W8AMAA") || tree[0];
    const ui = G3.mods.idt.ui; ui.unitView = "msc"; ui.openUnit = {};
    if (msc) {
      ui.openUnit[msc.id] = true;
      (msc.tdcs || []).slice(0, 2).forEach((t) => { ui.openUnit[t.id] = true; });
    }
    G3.mods.idt.render();
  });

  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
