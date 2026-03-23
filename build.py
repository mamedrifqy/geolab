#!/usr/bin/env python3
"""
GeoLab Site Builder
-------------------
Scans the ./notebooks/ directory, reads all .ipynb files,
and generates index.html in ./docs/ (for GitHub Pages).

Run locally : python build.py
Auto-run    : GitHub Actions triggers this on every push
"""

import json
import base64
import os
import re
import sys
from pathlib import Path
from datetime import datetime

# ── CONFIG ────────────────────────────────────────────────────────────────────
NOTEBOOKS_DIR = Path("notebooks")
OUTPUT_DIR    = Path("docs")         # GitHub Pages serves from /docs
OWNER_NAME    = "Mamed Rifqy"
OWNER_URL     = "https://mamedrifqy.github.io/resume"
SITE_TITLE    = "GeoLab · Notebook Portfolio"

# ── CATEGORY & ICON INFERENCE ─────────────────────────────────────────────────
KEYWORD_MAP = {
    "earthengine": ("Remote Sensing · GEE",   "🌿", "#52d68a"),
    "mangrove":    ("Remote Sensing · GEE",   "🌿", "#52d68a"),
    "rasterio":    ("Raster · Vector",        "🛰️", "#5eead4"),
    "orthomosaic": ("Raster · Vector",        "🛰️", "#5eead4"),
    "ecw":         ("Raster · Vector",        "🛰️", "#5eead4"),
    "buffer":      ("Spatial Analysis",       "📍", "#fbbf24"),
    "heatmap":     ("Spatial Analysis",       "📍", "#fbbf24"),
    "minimarket":  ("Spatial Analysis",       "📍", "#fbbf24"),
    "gdal":        ("Raster Processing",      "📐", "#f87171"),
    "dem":         ("Raster Processing",      "📐", "#f87171"),
    "tif":         ("Raster Processing",      "📐", "#f87171"),
    "dms":         ("Utility · Coordinate",   "🧭", "#c084fc"),
    "decimal":     ("Utility · Coordinate",   "🧭", "#c084fc"),
    "degree":      ("Utility · Coordinate",   "🧭", "#c084fc"),
    "geopandas":   ("Vector Analysis",        "🗺️", "#38bdf8"),
    "shapely":     ("Vector Analysis",        "🗺️", "#38bdf8"),
}
DEFAULT_CATEGORY = ("Python · Geospatial", "📓", "#94a3b8")


def infer_meta(filename: str, all_source: str):
    """Guess icon, accent colour, and category from file name + cell source."""
    combined = (filename + " " + all_source).lower()
    for kw, meta in KEYWORD_MAP.items():
        if kw in combined:
            return meta
    return DEFAULT_CATEGORY


def extract_packages(source: str) -> list[str]:
    """Pull imported package names from cell source."""
    pkgs = set()
    for line in source.split("\n"):
        line = line.strip()
        if line.startswith("import "):
            name = line.split()[1].split(".")[0]
            pkgs.add(name)
        elif line.startswith("from "):
            name = line.split()[1].split(".")[0]
            pkgs.add(name)
        elif "pip install" in line:
            parts = line.split()
            for p in parts:
                if not p.startswith("-") and p not in ("pip", "install", "!pip"):
                    pkgs.add(p.split("==")[0].split(">=")[0])
    ignore = {"__future__", "os", "sys", "re", "json", "math", "glob",
               "pathlib", "typing", "dataclasses", "logging", "argparse",
               "warnings", "datetime", "collections", "itertools", "functools"}
    return sorted(pkgs - ignore)


def title_from_filename(fname: str) -> str:
    """Convert filename to readable title."""
    stem = Path(fname).stem
    stem = stem.replace("_FINAL_FIXED", "").replace("_FINAL", "")
    stem = re.sub(r"[-_]", " ", stem)
    stem = re.sub(r"\s+", " ", stem).strip()
    return stem.title()


def first_heading(cells: list) -> str | None:
    """Extract first markdown heading as notebook title."""
    for cell in cells:
        if cell.get("cell_type") == "markdown":
            src = "".join(cell.get("source", []))
            m = re.match(r"^#{1,2}\s+(.+)$", src, re.MULTILINE)
            if m:
                title = m.group(1).strip()
                title = re.sub(r"[*_`#]", "", title)
                title = re.sub(r"FIXED VERSION.*", "", title, flags=re.IGNORECASE)
                return title.strip(" -–").strip()
    return None


def first_description(cells: list) -> str:
    """Extract first meaningful prose paragraph from markdown cells."""
    for cell in cells:
        if cell.get("cell_type") == "markdown":
            src = "".join(cell.get("source", []))
            lines = [l.strip() for l in src.split("\n") if l.strip()]
            for line in lines:
                if not line.startswith("#") and not line.startswith("!") \
                   and not line.startswith("-") and len(line) > 40:
                    return line[:220]
    return "A Python geospatial notebook."


def parse_notebook(path: Path) -> dict:
    """Parse a single .ipynb and return structured metadata + cells."""
    with open(path, encoding="utf-8") as f:
        nb = json.load(f)

    cells_raw = nb.get("cells", [])
    all_source = "\n".join("".join(c.get("source", [])) for c in cells_raw)

    category, icon, accent = infer_meta(path.name, all_source)
    title = first_heading(cells_raw) or title_from_filename(path.name)
    short = title[:40] + ("…" if len(title) > 40 else "")
    desc  = first_description(cells_raw)
    tags  = extract_packages(all_source)[:8]

    cells_out = []
    for cell in cells_raw:
        src = "".join(cell.get("source", []))
        if src.strip():
            cells_out.append({"type": cell["cell_type"], "source": src})

    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()

    nb_id = re.sub(r"[^a-z0-9]", "_", path.stem.lower())[:30]

    return {
        "id":       nb_id,
        "filename": path.name,
        "title":    title,
        "short":    short,
        "icon":     icon,
        "accent":   accent,
        "category": category,
        "desc":     desc,
        "tags":     tags,
        "cells":    cells_out,
        "b64":      b64,
        "mtime":    os.path.getmtime(path),
    }


def build_site(notebooks: list[dict]) -> str:
    """Render the full HTML site as a string."""
    notebooks  = sorted(notebooks, key=lambda n: n["mtime"], reverse=True)
    nb_json    = json.dumps(notebooks, ensure_ascii=False)
    build_ts   = datetime.now().strftime("%d %b %Y, %H:%M")
    count      = len(notebooks)
    total_pkgs = len(set(t for nb in notebooks for t in nb["tags"]))

    src_dir = Path(__file__).parent / "src"
    css = (src_dir / "style.css").read_text(encoding="utf-8") if (src_dir / "style.css").exists() else ""
    js  = (src_dir / "app.js").read_text(encoding="utf-8")   if (src_dir / "app.js").exists()   else ""

    nb_plural = "s" if count != 1 else ""

    lines = [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
        '<meta name="theme-color" content="#2d5a3d">',
        f'<title>{SITE_TITLE}</title>',
        '<link rel="apple-touch-icon" href="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><text y=\'.9em\' font-size=\'90\'>🌿</text></svg>">',
        '<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">',
        f'<style>{css}</style>',
        '</head>',
        '<body>',
        '',
        '<!-- Drawer overlay (mobile) -->',
        '<div class="sidebar-overlay"></div>',
        '',
        '<!-- SIDEBAR -->',
        '<nav class="sidebar">',
        '  <div class="sidebar-header">',
        '    <div>',
        '      <div class="logo">Geo<span>Lab</span></div>',
        '      <div class="logo-sub">The Spatial Editorial</div>',
        '    </div>',
        '    <button class="sidebar-close" aria-label="Close menu">&#10005;</button>',
        '  </div>',
        '  <div class="care-outlook">',
        '    <div class="care-label">Collection Outlook</div>',
        '    <div class="care-row">',
        '      <div class="care-icon green">\U0001f4d3</div>',
        f'      <div><div class="care-text">Notebooks</div><div class="care-sub">{count} active specimen{nb_plural}</div></div>',
        '    </div>',
        '    <div class="care-row">',
        '      <div class="care-icon amber">\U0001f4e6</div>',
        f'      <div><div class="care-text">Libraries</div><div class="care-sub">{total_pkgs} unique packages</div></div>',
        '    </div>',
        '    <button class="btn-primary" onclick="showLanding()">View Collection</button>',
        '  </div>',
        '  <div class="sidebar-section-label">Notebooks</div>',
        '  <div class="sidebar-list" id="sidebarList"></div>',
        '  <div class="sidebar-footer">',
        f'    <a href="{OWNER_URL}" target="_blank" class="sf-link"><span class="sf-icon">\U0001f464</span>{OWNER_NAME}</a>',
        '  </div>',
        '</nav>',
        '',
        '<!-- MAIN -->',
        '<div class="layout">',
        '  <div class="content-wrap">',
        '    <div class="topbar">',
        '      <div style="display:flex;align-items:center;gap:.5rem;min-width:0">',
        '        <button class="menu-toggle" aria-label="Open menu">',
        '          <span></span><span></span><span></span>',
        '        </button>',
        '        <div class="breadcrumb">',
        '          <span class="bc-home" onclick="showLanding()">GeoLab</span>',
        '          <span class="sep">/</span>',
        '          <span class="current" id="breadcrumbCurrent">Overview</span>',
        '        </div>',
        '      </div>',
        '      <div class="topbar-actions">',
        '        <button class="btn-home" id="homeBtn" onclick="showLanding()">&#8592; All</button>',
        '        <a class="btn-dl" id="dlBtn" href="#" download>',
        '          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v8M5 7l3 3 3-3M2 13h12"/></svg>',
        '          Download .ipynb',
        '        </a>',
        '      </div>',
        '    </div>',
        '    <div class="page-area">',
        '      <div class="nb-content" id="nbContent"></div>',
        '      <div class="toc-panel" id="tocPanel">',
        '        <div class="toc-label">On this page</div>',
        '        <ul class="toc-list" id="tocList"></ul>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>',
        '',
        '<!-- DESKTOP FOOTER -->',
        '<footer class="site-footer">',
        '  <div class="footer-inner">',
        '    <div class="footer-left">',
        '      <span class="footer-logo">Geo<span>Lab</span></span>',
        '      <span class="footer-dot">&middot;</span>',
        '      <span class="footer-tag">Geospatial Python Notebooks</span>',
        '    </div>',
        f'    <div class="footer-center">Built &amp; maintained by <a href="{OWNER_URL}" target="_blank" rel="noopener">{OWNER_NAME}</a></div>',
        '    <div class="footer-right">',
        f'      <span>Last built: {build_ts}</span><span class="footer-dot">&middot;</span><span>{count} notebook{nb_plural}</span>',
        '    </div>',
        '  </div>',
        '</footer>',
        '',
        '<!-- MOBILE BOTTOM NAV -->',
        '<nav class="mobile-nav">',
        '  <button class="mob-nav-btn active" id="mob-home" onclick="showLanding()">',
        '    <span class="mob-icon">&#127968;</span>',
        '    <span class="mob-label">Home</span>',
        '  </button>',
        '  <button class="mob-nav-btn" id="mob-notebooks" onclick="openDrawer()">',
        '    <span class="mob-icon">&#128218;</span>',
        '    <span class="mob-label">Notebooks</span>',
        '  </button>',
        f'  <a class="mob-nav-btn" href="{OWNER_URL}" target="_blank">',
        '    <span class="mob-icon">&#128100;</span>',
        '    <span class="mob-label">Author</span>',
        '  </a>',
        '</nav>',
        '',
        '<!-- MOBILE FLOATING DOWNLOAD -->',
        '<a class="mob-dl-btn" id="mobDlBtn" href="#" download>',
        '  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v8M5 7l3 3 3-3M2 13h12"/></svg>',
        '  Download',
        '</a>',
        '',
        '<script>',
        f'const NOTEBOOKS = {nb_json};',
        f'const BUILD_DATE = "{build_ts}";',
        js,
        '</script>',
        '</body>',
        '</html>',
    ]

    return '\n'.join(lines)



def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    ipynb_files = sorted(NOTEBOOKS_DIR.glob("*.ipynb"))
    if not ipynb_files:
        print("⚠  No .ipynb files found in notebooks/")
        sys.exit(1)

    print(f"📓 Found {len(ipynb_files)} notebook(s):")
    notebooks = []
    for p in ipynb_files:
        print(f"   • {p.name}")
        nb = parse_notebook(p)
        notebooks.append(nb)

    html = build_site(notebooks)

    out_path = OUTPUT_DIR / "index.html"
    out_path.write_text(html, encoding="utf-8")
    size_kb = out_path.stat().st_size // 1024
    print(f"\n✅ Built: {out_path}  ({size_kb} KB)")
    print(f"   Notebooks : {len(notebooks)}")
    print(f"   Timestamp : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    main()
