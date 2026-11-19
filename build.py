#!/usr/bin/env python3
"""Inline src/ into one self-contained file: g3-dashboard.html (no network needed)."""
import pathlib
root = pathlib.Path(__file__).parent; src = root / "src"
css = (src / "base.css").read_text() + "\n" + (src / "g3.css").read_text()
order = ["vendor/chart.umd.min.js", "vendor/xlsx.full.min.js", "data.js","loaders.js","core.js", "sof.js", "spend.js", "ulo.js", "program.js", "home.js"]
LAZY = {"vendor/xlsx.full.min.js": "xlsxLazy"}   # Excel reader: kept as text, run on first upload (faster page load)
def js(p):
    t = (src / p).read_text()
    if p in LAZY: return '<script type="text/x-lazy" id="' + LAZY[p] + '">\n' + t.replace("</script", "<\\/script") + "\n</script>"
    return "<script>\n" + t.replace("</script", "<\\/script") + "\n</script>"
scripts = "\n".join(js(p) for p in order) + "\n<script>if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', G3.init); else G3.init();</script>"
html = (src / "index.html").read_text().replace("/*@@CSS@@*/", css).replace("<!--@@SCRIPTS@@-->", scripts)
(root / "g3-dashboard.html").write_text(html)
print("wrote", root / "g3-dashboard.html", len(html), "bytes")
