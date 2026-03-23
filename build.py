#!/usr/bin/env python3
"""
GeoLab Site Builder — Multi-Language Edition
----------------------------------------------
Scans three notebook folders and generates docs/index.html:

  notebooks/python/  → .ipynb  (Jupyter / Python)
  notebooks/gee/     → .js     (Google Earth Engine)
  notebooks/r/       → .Rmd or .R  (R Notebooks)

Run locally : python build.py
Auto-run    : GitHub Actions triggers this on every push
"""

import json, base64, os, re, sys
from pathlib import Path
from datetime import datetime

# ── CONFIG ────────────────────────────────────────────────────────────────────
NOTEBOOKS_DIR = Path("notebooks")
OUTPUT_DIR    = Path("docs")
OWNER_NAME    = "Mamed Rifqy"
OWNER_URL     = "https://mamedrifqy.github.io/resume"
SITE_TITLE    = "GeoLab · Notebook Portfolio"

# ── LANGUAGE DEFINITIONS ──────────────────────────────────────────────────────
# Each language has an id, display name, colour accent, and folder path.
LANGUAGES = [
    {
        "id":      "python",
        "label":   "Python",
        "icon":    "🐍",
        "accent":  "#2d5a3d",       # forest green
        "bg":      "#e8f2ec",
        "folder":  NOTEBOOKS_DIR / "python",
        "exts":    [".ipynb"],
    },
    {
        "id":      "gee",
        "label":   "Google Earth Engine",
        "icon":    "🌍",
        "accent":  "#1d4ed8",       # GEE blue
        "bg":      "#eff6ff",
        "folder":  NOTEBOOKS_DIR / "gee",
        "exts":    [".js"],
    },
    {
        "id":      "r",
        "label":   "R Notebook",
        "icon":    "📊",
        "accent":  "#7c3aed",       # R purple
        "bg":      "#f5f3ff",
        "folder":  NOTEBOOKS_DIR / "r",
        "exts":    [".Rmd", ".R"],
    },
]

# ── CATEGORY INFERENCE (Python notebooks) ─────────────────────────────────────
KEYWORD_MAP = {
    "earthengine": ("Remote Sensing · GEE",  "🌿", "#2d5a3d"),
    "mangrove":    ("Remote Sensing · GEE",  "🌿", "#2d5a3d"),
    "rasterio":    ("Raster · Vector",       "🛰️", "#0f766e"),
    "orthomosaic": ("Raster · Vector",       "🛰️", "#0f766e"),
    "buffer":      ("Spatial Analysis",      "📍", "#b45309"),
    "heatmap":     ("Spatial Analysis",      "📍", "#b45309"),
    "gdal":        ("Raster Processing",     "📐", "#b91c1c"),
    "dem":         ("Raster Processing",     "📐", "#b91c1c"),
    "dms":         ("Utility · Coordinate",  "🧭", "#7c3aed"),
    "decimal":     ("Utility · Coordinate",  "🧭", "#7c3aed"),
    "geopandas":   ("Vector Analysis",       "🗺️", "#0369a1"),
}
DEFAULT_CATEGORY = ("Python · Geospatial", "📓", "#4a5568")


# ══════════════════════════════════════════════════════════════════════════════
#  PARSERS — one per notebook type
# ══════════════════════════════════════════════════════════════════════════════

def parse_ipynb(path: Path, lang: dict) -> dict:
    """Parse a Jupyter .ipynb file into the standard notebook dict."""
    with open(path, encoding="utf-8") as f:
        nb = json.load(f)

    cells_raw  = nb.get("cells", [])
    all_source = "\n".join("".join(c.get("source", [])) for c in cells_raw)

    # Infer category/icon/accent from keywords
    combined  = (path.name + " " + all_source).lower()
    cat, icon, accent = DEFAULT_CATEGORY
    for kw, meta in KEYWORD_MAP.items():
        if kw in combined:
            cat, icon, accent = meta
            break

    # Pull the first markdown heading as the title
    title = _first_heading_ipynb(cells_raw) or _title_from_filename(path.name)
    desc  = _first_desc_ipynb(cells_raw)
    tags  = _extract_packages(all_source)[:8]

    cells_out = [
        {"type": c["cell_type"], "source": "".join(c.get("source", []))}
        for c in cells_raw
        if "".join(c.get("source", [])).strip()
    ]

    return _notebook_dict(path, lang, title, cat, icon, accent, desc, tags, cells_out)


def parse_js(path: Path, lang: dict) -> dict:
    """
    Parse a GEE .js file.

    GEE scripts are single files with no cell structure, but
    authors typically use banner comments to mark sections:
      // ── SECTION: Name ──────
    We split on these to create pseudo-cells (markdown heading +
    code block pairs), giving the reader a nice table of contents.
    """
    source = path.read_text(encoding="utf-8")

    # Extract the file-level description from the top comment block
    desc  = _js_description(source)
    title = _js_title(source) or _title_from_filename(path.name)

    # Split into sections by detecting banner-style comment headers
    # Pattern: // ── SECTION: ... ── or // === ... === or // --- ... ---
    section_pattern = re.compile(
        r'^//\s*(?:──+|===+|---+)\s*(?:SECTION:\s*)?(.+?)\s*(?:──+|===+|---+)?\s*$',
        re.MULTILINE
    )

    parts   = section_pattern.split(source)
    cells   = []

    if len(parts) == 1:
        # No section headers found — emit as one big code cell
        cells.append({"type": "code", "source": source.strip()})
    else:
        # parts[0] is the preamble (top comment block)
        preamble = parts[0].strip()
        if preamble:
            cells.append({"type": "code", "source": preamble})

        # Remaining parts alternate: section_name, section_code, ...
        it = iter(parts[1:])
        for section_name, section_code in zip(it, it):
            section_name = section_name.strip()
            section_code = section_code.strip()
            if section_name:
                cells.append({"type": "markdown", "source": f"## {section_name}"})
            if section_code:
                cells.append({"type": "code", "source": section_code})

    # Count EE API calls as a rough "library" count
    ee_calls = set(re.findall(r'\bee\.\w+', source))
    tags     = sorted(["earthengine-api"] + list({
        m.group(1) for m in re.finditer(r'\b(Map|Export|Chart|ui|Geometry)\b', source)
    }))[:6]

    return _notebook_dict(
        path, lang, title,
        "Remote Sensing · GEE", "🌍", lang["accent"],
        desc, tags, cells
    )


def parse_rmd(path: Path, lang: dict) -> dict:
    """
    Parse an R Markdown (.Rmd) or pure R (.R) file.

    .Rmd files interleave markdown prose and fenced R code chunks:
        ```{r chunk-name}
        # R code
        ```
    We parse them into alternating markdown/code cell pairs,
    exactly like Jupyter notebooks but from a different source format.

    .R files are treated as a single code cell, split on
    section header comments (# ── Section ──).
    """
    source = path.read_text(encoding="utf-8")

    if path.suffix.lower() == ".rmd":
        cells = _parse_rmd_cells(source)
        title = _rmd_frontmatter(source, "title") or _title_from_filename(path.name)
        desc  = _rmd_frontmatter(source, "description") or _first_desc_rmd(source)
    else:
        # Pure .R script — split on section comments
        cells = _parse_r_script(source)
        title = _title_from_filename(path.name)
        desc  = _r_description(source)

    tags = _extract_r_packages(source)[:8]

    return _notebook_dict(
        path, lang, title,
        "Statistical Analysis · R", "📊", lang["accent"],
        desc, tags, cells
    )


# ── Rmd helpers ──────────────────────────────────────────────────────────────

def _rmd_frontmatter(source: str, field: str) -> str | None:
    """Extract a YAML frontmatter field from an .Rmd file."""
    fm = re.match(r'^---\n([\s\S]*?)\n---', source)
    if not fm:
        return None
    for line in fm.group(1).split("\n"):
        if line.lower().startswith(field + ":"):
            val = line.split(":", 1)[1].strip().strip('"').strip("'")
            return val or None
    return None


def _parse_rmd_cells(source: str) -> list[dict]:
    """
    Split an .Rmd document into alternating markdown and code cells.
    Code chunks are delimited by ```{r ...} ... ```.
    """
    # Remove YAML frontmatter first
    source = re.sub(r'^---\n[\s\S]*?\n---\n?', '', source)

    chunk_pattern = re.compile(r'```\{r[^}]*\}\n([\s\S]*?)```', re.MULTILINE)
    cells  = []
    cursor = 0

    for match in chunk_pattern.finditer(source):
        # Markdown text before this chunk
        md = source[cursor:match.start()].strip()
        if md:
            cells.append({"type": "markdown", "source": md})
        # The R code chunk itself
        code = match.group(1).strip()
        if code:
            cells.append({"type": "code", "source": code})
        cursor = match.end()

    # Any trailing markdown after the last chunk
    tail = source[cursor:].strip()
    if tail:
        cells.append({"type": "markdown", "source": tail})

    return cells


def _parse_r_script(source: str) -> list[dict]:
    """Split a pure .R script on section-header comments."""
    section_pattern = re.compile(
        r'^#+\s*(?:──+|===+|---+)\s*(.+?)\s*(?:──+|===+|---+)?\s*$',
        re.MULTILINE
    )
    parts = section_pattern.split(source)
    cells = []
    if len(parts) == 1:
        cells.append({"type": "code", "source": source.strip()})
    else:
        preamble = parts[0].strip()
        if preamble:
            cells.append({"type": "code", "source": preamble})
        it = iter(parts[1:])
        for name, code in zip(it, it):
            if name.strip():
                cells.append({"type": "markdown", "source": f"## {name.strip()}"})
            if code.strip():
                cells.append({"type": "code", "source": code.strip()})
    return cells


def _extract_r_packages(source: str) -> list[str]:
    """Find library() and require() calls in R source."""
    pkgs = set()
    for m in re.finditer(r'(?:library|require)\(\s*(["\']?)(\w+)\1\s*\)', source):
        pkgs.add(m.group(2))
    return sorted(pkgs)


def _first_desc_rmd(source: str) -> str:
    """Pull the first prose paragraph from an Rmd (after frontmatter)."""
    source = re.sub(r'^---\n[\s\S]*?\n---\n?', '', source)
    for para in source.split('\n\n'):
        para = para.strip()
        if para and not para.startswith('#') and not para.startswith('```') and len(para) > 40:
            return para[:200]
    return "An R Markdown notebook."


def _r_description(source: str) -> str:
    """Pull a description from the leading comment block of a .R script."""
    lines = []
    for line in source.split('\n'):
        line = line.strip()
        if line.startswith('#'):
            text = re.sub(r'^#+\s*', '', line).strip()
            if text and not re.match(r'^[=\-─]+$', text):
                lines.append(text)
        elif lines:
            break
    return ' '.join(lines)[:200] if lines else "An R script."


# ── JS helpers ───────────────────────────────────────────────────────────────

def _js_title(source: str) -> str | None:
    """Extract a title from the leading comment block of a .js file."""
    m = re.search(r'^//\s+(.+)', source, re.MULTILINE)
    if m:
        title = m.group(1).strip().strip('=─-').strip()
        if len(title) < 80:
            return title
    return None


def _js_description(source: str) -> str:
    """Extract a description from the leading block comment."""
    lines = []
    for line in source.split('\n'):
        stripped = line.strip()
        if stripped.startswith('//'):
            text = re.sub(r'^//\s*', '', stripped).strip()
            # Skip separator lines and single-word labels
            if text and not re.match(r'^[=─\-]+$', text) and len(text) > 5:
                lines.append(text)
        elif stripped == '':
            if lines:
                break
        else:
            break
    return ' '.join(lines[1:])[:220] if len(lines) > 1 else "A Google Earth Engine script."


# ── Shared helpers ────────────────────────────────────────────────────────────

def _title_from_filename(fname: str) -> str:
    stem = re.sub(r'(_FINAL_FIXED|_FINAL|_v\d+)', '', Path(fname).stem)
    stem = re.sub(r'[-_]', ' ', stem)
    return re.sub(r'\s+', ' ', stem).strip().title()


def _first_heading_ipynb(cells: list) -> str | None:
    for cell in cells:
        if cell.get("cell_type") == "markdown":
            src = "".join(cell.get("source", []))
            m = re.match(r'^#{1,2}\s+(.+)$', src, re.MULTILINE)
            if m:
                t = re.sub(r'[*_`#]', '', m.group(1))
                t = re.sub(r'FIXED VERSION.*', '', t, flags=re.I)
                return t.strip(' -–').strip()
    return None


def _first_desc_ipynb(cells: list) -> str:
    for cell in cells:
        if cell.get("cell_type") == "markdown":
            src = "".join(cell.get("source", []))
            for line in src.split('\n'):
                line = line.strip()
                if not line.startswith('#') and len(line) > 40:
                    return line[:220]
    return "A Python geospatial notebook."


def _extract_packages(source: str) -> list[str]:
    pkgs = set()
    ignore = {"os","sys","re","json","math","glob","pathlib","typing",
               "dataclasses","logging","argparse","warnings","datetime",
               "collections","itertools","functools","__future__"}
    for line in source.split('\n'):
        line = line.strip()
        if line.startswith('import '):
            pkgs.add(line.split()[1].split('.')[0])
        elif line.startswith('from '):
            pkgs.add(line.split()[1].split('.')[0])
        elif 'pip install' in line:
            for p in line.split():
                if not p.startswith('-') and p not in ('pip','install','!pip','-q'):
                    pkgs.add(p.split('==')[0].split('>=')[0])
    return sorted(pkgs - ignore)


def _notebook_dict(path, lang, title, category, icon, accent, desc, tags, cells):
    with open(path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode()
    nb_id = re.sub(r'[^a-z0-9]', '_', path.stem.lower())[:40]
    return {
        "id":         nb_id,
        "filename":   path.name,
        "title":      title,
        "short":      title[:42] + ('…' if len(title) > 42 else ''),
        "icon":       icon,
        "accent":     accent,
        "category":   category,
        "desc":       desc,
        "tags":       tags,
        "cells":      cells,
        "b64":        b64,
        "mtime":      os.path.getmtime(path),
        "lang":       lang["id"],
        "lang_label": lang["label"],
        "lang_icon":  lang["icon"],
        "lang_accent":lang["accent"],
        "lang_bg":    lang["bg"],
    }


# ══════════════════════════════════════════════════════════════════════════════
#  SITE BUILDER
# ══════════════════════════════════════════════════════════════════════════════

def build_site(all_notebooks: list[dict]) -> str:
    """Render the complete HTML site."""
    nb_json   = json.dumps(all_notebooks, ensure_ascii=False)
    build_ts  = datetime.now().strftime("%d %b %Y, %H:%M")
    count     = len(all_notebooks)
    by_lang   = {l["id"]: [n for n in all_notebooks if n["lang"] == l["id"]] for l in LANGUAGES}

    src_dir = Path(__file__).parent / "src"
    css = (src_dir / "style.css").read_text(encoding="utf-8") if (src_dir / "style.css").exists() else ""
    js  = (src_dir / "app.js").read_text(encoding="utf-8")   if (src_dir / "app.js").exists()   else ""

    # ── Sidebar nav items (pre-rendered, JS just highlights active) ──────────
    sidebar_nav = ""
    for lang in LANGUAGES:
        nbs = by_lang.get(lang["id"], [])
        if not nbs:
            continue
        dot_color = lang["accent"]
        sidebar_nav += (
            f'  <div class="sb-section">'
            f'<span class="sb-section-dot" style="background:{dot_color}"></span>'
            f'{lang["label"]}</div>\n'
        )
        for nb in sorted(nbs, key=lambda n: n["mtime"], reverse=True):
            sidebar_nav += (
                f'  <div class="nb-item" data-id="{nb["id"]}" '
                f'onclick="showNotebook(\'{nb["id"]}\')">'
                f'<span class="nb-icon">{nb["icon"]}</span>'
                f'<div>'
                f'<div class="nb-name">{nb["short"]}</div>'
                f'<div class="nb-cat">{nb["category"]}</div>'
                f'</div></div>\n'
            )

    nb_count_label = f"{count} notebook{'s' if count != 1 else ''}"
    langs_json = json.dumps([
        {"id": l["id"], "label": l["label"], "icon": l["icon"],
         "accent": l["accent"], "bg": l["bg"]}
        for l in LANGUAGES
    ])

    html = "\n".join([
        "<!DOCTYPE html>",
        '<html lang="en">',
        "<head>",
        '<meta charset="UTF-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        f'<title>{SITE_TITLE}</title>',
        '<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1'
        '&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400'
        '&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">',
        f"<style>{css}</style>",
        "</head>",
        "<body>",

        # Drawer overlay
        '<div class="overlay" id="overlay" onclick="closeDrawer()"></div>',

        # Sidebar
        '<aside class="sidebar" id="sidebar">',
        '  <div class="sidebar-header">',
        '    <div class="logo">Geo<em>Lab</em></div>',
        '    <div class="logo-sub">The Spatial Editorial</div>',
        '  </div>',
        '  <div class="sidebar-body">',
        sidebar_nav,
        '  </div>',
        '  <div class="sidebar-footer">',
        f'    <a href="{OWNER_URL}" target="_blank" class="sf-link">',
        f'      <span>👤</span> {OWNER_NAME}',
        '    </a>',
        '  </div>',
        '</aside>',

        # Main layout
        '<div class="layout">',

        # Topbar
        '  <header class="topbar">',
        '    <div class="topbar-left">',
        '      <button class="btn-menu" onclick="openDrawer()" aria-label="Open menu">',
        '        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor"'
        '             stroke-width="1.8" stroke-linecap="round">',
        '          <path d="M3 5h14M3 10h14M3 15h14"/>',
        '        </svg>',
        '      </button>',
        '      <nav class="breadcrumb">',
        '        <span class="bc-home" onclick="showLanding()">GeoLab</span>',
        '        <span class="bc-sep">/</span>',
        '        <span class="bc-current" id="bc-current">Overview</span>',
        '      </nav>',
        '    </div>',
        '    <div class="topbar-right">',
        '      <button class="btn-back" id="btn-back" onclick="showLanding()">← All</button>',
        '      <a class="btn-dl" id="btn-dl" href="#" download>',
        '        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">',
        '          <path d="M8 2v8M5 7l3 3 3-3M2 13h12"/>',
        '        </svg>',
        '        Download',
        '      </a>',
        '    </div>',
        '  </header>',

        # Page body
        '  <div class="page-body">',
        '    <div class="main-scroll" id="main-scroll"></div>',
        '    <aside class="toc-panel" id="toc-panel">',
        '      <div class="toc-title">On this page</div>',
        '      <ul class="toc-list" id="toc-list"></ul>',
        '    </aside>',
        '  </div>',

        '</div>',  # end .layout

        # Desktop footer
        '<footer class="site-footer">',
        '  <div class="footer-inner">',
        '    <span class="footer-logo">Geo<em>Lab</em></span>',
        f'    <div class="footer-center">Built by <a href="{OWNER_URL}" target="_blank" rel="noopener">{OWNER_NAME}</a></div>',
        '    <div class="footer-right">',
        f'      <span>Built {build_ts}</span>',
        '      <span class="footer-sep">&middot;</span>',
        f'      <span>{nb_count_label}</span>',
        '    </div>',
        '  </div>',
        '</footer>',

        # Mobile bottom nav
        '<nav class="bottom-nav">',
        '  <button class="bnav-btn active" data-tab="home" onclick="showLanding()">',
        '    <span class="bnav-icon">🏠</span>',
        '    <span class="bnav-label">Home</span>',
        '  </button>',
        '  <button class="bnav-btn" data-tab="browse" onclick="openDrawer()">',
        '    <span class="bnav-icon">📚</span>',
        '    <span class="bnav-label">Browse</span>',
        '  </button>',
        '  <button class="bnav-btn" data-tab="read">',
        '    <span class="bnav-icon">📖</span>',
        '    <span class="bnav-label">Reading</span>',
        '  </button>',
        f'  <a class="bnav-btn" data-tab="about" href="{OWNER_URL}"'
        '   target="_blank" style="text-decoration:none">',
        '    <span class="bnav-icon">👤</span>',
        '    <span class="bnav-label">About</span>',
        '  </a>',
        '</nav>',

        # Scripts
        "<script>",
        f"const NOTEBOOKS = {nb_json};",
        f'const BUILD_DATE = "{build_ts}";',
        f"const LANGUAGES = {langs_json};",
        js,
        "</script>",
        "</body>",
        "</html>",
    ])

    return html


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    all_notebooks = []

    for lang in LANGUAGES:
        folder = lang["folder"]
        if not folder.exists():
            folder.mkdir(parents=True, exist_ok=True)
            print(f"   Created folder: {folder}/")
            continue

        files = []
        for ext in lang["exts"]:
            files.extend(folder.glob(f"*{ext}"))
        files = sorted(files)

        if not files:
            print(f"   [{lang['label']}] — no files found in {folder}/")
            continue

        print(f"\n{lang['icon']}  {lang['label']} ({len(files)} file(s)):")
        for p in files:
            print(f"   • {p.name}")
            try:
                if lang["id"] == "python":
                    nb = parse_ipynb(p, lang)
                elif lang["id"] == "gee":
                    nb = parse_js(p, lang)
                else:
                    nb = parse_rmd(p, lang)
                all_notebooks.append(nb)
            except Exception as e:
                print(f"     ⚠  Skipped ({e})")

    if not all_notebooks:
        print("\n⚠  No notebooks found in any folder.")
        sys.exit(1)

    html     = build_site(all_notebooks)
    out_path = OUTPUT_DIR / "index.html"
    out_path.write_text(html, encoding="utf-8")
    size_kb  = out_path.stat().st_size // 1024

    print(f"\n✅ Built: {out_path}  ({size_kb} KB)")
    print(f"   Total notebooks : {len(all_notebooks)}")
    print(f"   Timestamp       : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    main()
