// Writes the built-in test data as real .xlsx files under samples/ (node tools/make-samples.js)
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..'), src = path.join(root, 'src');
const ctx = { console, Date, Math, JSON, Uint8Array, ArrayBuffer }; ctx.window = ctx; vm.createContext(ctx);
['vendor/xlsx.full.min.js', 'data.js', 'loaders.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(src, f), 'utf8'), ctx, { filename: f }));
const XLSX = ctx.XLSX, out = path.join(root, 'samples'); fs.mkdirSync(out, { recursive: true });
const write = (f, dir) => {
  const wb = XLSX.utils.book_new();
  f.sheets.forEach(s => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.aoa), s.name.slice(0, 31)));
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, f.name), Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))); console.log('wrote ' + path.relative(root, path.join(dir, f.name)), f.sheets.map(s => s.name + ':' + s.aoa.length).join(' '));
};
ctx.G3.makeTestFiles().forEach(f => write(f, out));
ctx.G3.makeMessyFiles().forEach(f => write(f, path.join(out, 'realistic')));
write(ctx.G3.makeGfebsExport(), path.join(out, 'gfebs'));
write(ctx.G3.makeAcctPlan(), path.join(out, 'gfebs'));
ctx.G3.makeMilpayFiles().forEach(f => write(f, path.join(out, 'milpay')));
