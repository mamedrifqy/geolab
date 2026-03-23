// GeoLab · app.js
// Injected globals: NOTEBOOKS (array), BUILD_DATE (string), LANGUAGES (array)

'use strict';

// ── STATE ──────────────────────────────────────────────────────────────────
let activeFilter   = 'all';
let currentNbId    = null;
window._cellSrcs   = [];      // raw source strings for Copy buttons
window._lastBlobUrl = null;   // previous download URL to revoke

// ── HELPERS ────────────────────────────────────────────────────────────────

/** Escape HTML entities so raw source is safe to inject. */
function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/** Turn a base64 string into a downloadable Blob URL. */
function blobUrl(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const blob = new Blob([arr], { type: 'application/octet-stream' });
  return URL.createObjectURL(blob);
}

/** CSS class for the accent stripe on each card, keyed to language. */
function stripeColor(nb) {
  if (nb.lang === 'gee') return '#1d4ed8';
  if (nb.lang === 'r')   return '#6d28d9';
  return '#2d5a3d';
}

/** Background + text colours for the language tag pill on a card. */
function langColors(nb) {
  const map = {
    python: { bg: '#eaf3ed', color: '#2d5a3d', border: '#c0ddc8' },
    gee:    { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    r:      { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
  };
  return map[nb.lang] || map.python;
}

// ── SIDEBAR ────────────────────────────────────────────────────────────────
// The sidebar HTML is pre-rendered by build.py.
// We just wire up active-state highlighting here.

function setSidebarActive(id) {
  document.querySelectorAll('.nb-item').forEach(el =>
    el.classList.toggle('active', el.dataset.id === id)
  );
  if (id) {
    const el = document.querySelector('.nb-item[data-id="' + id + '"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }
}

// ── DRAWER (mobile) ────────────────────────────────────────────────────────

function openDrawer() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ── BOTTOM NAV ─────────────────────────────────────────────────────────────

function setBnavActive(tab) {
  document.querySelectorAll('.bnav-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === tab)
  );
}

// ── MARKDOWN RENDERER ──────────────────────────────────────────────────────
// A simple but solid renderer that handles all the patterns that appear
// in Jupyter, R Markdown, and GEE comment blocks.

function renderMD(raw) {
  let h = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Fenced code blocks  ```lang\n...\n```
  h = h.replace(/```[\w]*\n([\s\S]*?)```/g,
    (_, code) => '<pre><code>' + code + '</code></pre>');

  // Headings
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm,   '<h1>$1</h1>');

  // Horizontal rule
  h = h.replace(/^---$/gm, '<hr>');

  // Inline bold/italic/code
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g,     '<em>$1</em>');
  h = h.replace(/`([^`\n]+)`/g,   '<code>$1</code>');

  // Blockquote
  h = h.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Lists — collect consecutive <li> and wrap them
  h = h.replace(/^[-*] (.+)$/gm,  '<li>$1</li>');
  h = h.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Paragraphs — split on blank lines
  h = h.split('\n\n').map(block => {
    const t = block.trim();
    if (!t) return '';
    // Already a block element — just wrap consecutive <li>
    if (/^<(h[1-6]|hr|pre|li|blockquote)/.test(t))
      return t.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    // Plain text paragraph
    return '<p>' + t.replace(/\n/g, ' ') + '</p>';
  }).join('\n');

  return h;
}

// ── SYNTAX HIGHLIGHTER ─────────────────────────────────────────────────────
// Character-by-character tokeniser — no regex replacement chains,
// so there are never any escaping or placeholder-number bugs.

function tokenize(code, keywords, commentChar) {
  function doLine(line) {
    let out = '', i = 0;

    while (i < line.length) {
      // ── Comment ──────────────────────────────────────────────
      if (line.slice(i, i + commentChar.length) === commentChar) {
        out += '<span class="t-cm">' + esc(line.slice(i)) + '</span>';
        break;
      }

      // ── Triple-quoted string (Python """...""" / '''...''') ──
      const q3 = line.slice(i, i + 3);
      if (q3 === '"""' || q3 === "'''") {
        let j = i + 3;
        while (j < line.length && line.slice(j, j+3) !== q3) j++;
        j += 3;
        out += '<span class="t-st">' + esc(line.slice(i, j)) + '</span>';
        i = j; continue;
      }

      // ── Regular string (single/double quotes) ────────────────
      if (line[i] === '"' || line[i] === "'") {
        const q = line[i]; let j = i + 1;
        while (j < line.length && line[j] !== q) {
          if (line[j] === '\\') j++; // skip escaped char
          j++;
        }
        j++;
        out += '<span class="t-st">' + esc(line.slice(i, j)) + '</span>';
        i = j; continue;
      }

      // ── Template literal (JavaScript) ────────────────────────
      if (line[i] === '`') {
        let j = i + 1;
        while (j < line.length && line[j] !== '`') {
          if (line[j] === '\\') j++;
          j++;
        }
        j++;
        out += '<span class="t-st">' + esc(line.slice(i, j)) + '</span>';
        i = j; continue;
      }

      // ── Identifier or keyword ─────────────────────────────────
      if (/[a-zA-Z_$]/.test(line[i])) {
        let j = i;
        while (j < line.length && /[\w$]/.test(line[j])) j++;
        const word = line.slice(i, j);
        if (keywords.has(word)) {
          out += '<span class="t-kw">' + word + '</span>';
        } else if (j < line.length && /\s*\(/.test(line.slice(j))) {
          out += '<span class="t-fn">' + word + '</span>';
        } else {
          out += esc(word);
        }
        i = j; continue;
      }

      // ── Number ───────────────────────────────────────────────
      if (/\d/.test(line[i])) {
        let j = i;
        while (j < line.length && /[\d.eE+\-x]/.test(line[j])) j++;
        out += '<span class="t-nu">' + esc(line.slice(i, j)) + '</span>';
        i = j; continue;
      }

      // ── Anything else ─────────────────────────────────────────
      out += esc(line[i]);
      i++;
    }
    return out;
  }

  return code.split('\n').map(doLine).join('\n');
}

// ── Language-specific keyword sets ───────────────────────────────────────

const PY_KW = new Set([
  'import','from','def','class','return','for','in','if','elif','else',
  'try','except','finally','with','as','and','or','not','is','True',
  'False','None','lambda','yield','yield from','pass','break','continue',
  'raise','global','nonlocal','assert','del','async','await',
  // common builtins
  'print','range','len','type','int','str','float','list','dict','set',
  'tuple','bool','open','zip','map','filter','enumerate','sorted',
  'reversed','any','all','max','min','sum','abs','round',
]);

const JS_KW = new Set([
  'var','let','const','function','return','if','else','for','while',
  'do','switch','case','break','continue','new','this','typeof',
  'instanceof','class','extends','import','export','default','of','in',
  'try','catch','finally','throw','async','await','true','false','null',
  'undefined','void','delete',
  // GEE globals
  'ee','Map','Export','Chart','ui','Geometry','Feature','FeatureCollection',
  'Image','ImageCollection','Dictionary','List','Filter','Reducer',
  'Kernel','Terrain','Classifier','Number','String','Date',
]);

const R_KW = new Set([
  'function','if','else','for','while','repeat','return','next','break',
  'TRUE','FALSE','NULL','NA','Inf','NaN','T','F','in',
  // base R
  'library','require','c','list','data.frame','matrix','vector','factor',
  'rbind','cbind','apply','lapply','sapply','vapply','tapply','which',
  'length','nrow','ncol','ncol','dim','class','str','summary','head',
  'tail','print','cat','paste','paste0','sprintf','format','toupper',
  'tolower','nchar','substr','gsub','sub','grep','grepl','strsplit',
  'is.na','is.null','is.numeric','is.character','as.numeric',
  'as.character','as.factor','as.integer','as.logical',
  'mean','sd','median','var','cor','table','prop.table','setdiff',
  'union','intersect','seq','rep','rev','sort','order','unique',
  'duplicated','merge','reshape','melt','dcast','read.csv','write.csv',
  'read.table','write.table','readRDS','saveRDS','source','setwd','getwd',
  // ggplot2
  'ggplot','aes','geom_point','geom_line','geom_bar','geom_histogram',
  'geom_boxplot','geom_smooth','geom_col','geom_tile','geom_sf',
  'facet_wrap','facet_grid','theme','labs','scale_fill_manual',
  'scale_color_manual','scale_x_continuous','scale_y_continuous',
  'coord_flip','theme_minimal','theme_classic','theme_bw',
  // dplyr
  'filter','select','mutate','summarise','summarize','group_by',
  'arrange','left_join','right_join','inner_join','full_join',
  'bind_rows','bind_cols','rename','distinct','count','slice',
  'pivot_longer','pivot_wider',
  // sf
  'st_read','st_write','st_transform','st_crs','st_buffer','st_join',
  'st_intersection','st_union','st_area','st_length','st_centroid',
  'st_bbox','st_as_sf',
]);

function highlight(code, lang) {
  if (lang === 'gee') return tokenize(code, JS_KW, '//');
  if (lang === 'r')   return tokenize(code, R_KW, '#');
  return tokenize(code, PY_KW, '#');
}

// ── COPY TO CLIPBOARD ──────────────────────────────────────────────────────

function copyCode(btn, idx) {
  navigator.clipboard.writeText(window._cellSrcs[idx] || '').then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
  });
}

// ── LANDING PAGE ───────────────────────────────────────────────────────────

function showLanding() {
  currentNbId = null;
  setSidebarActive(null);
  setBnavActive('home');
  closeDrawer();

  document.getElementById('bc-current').textContent = 'Overview';
  document.getElementById('btn-back').classList.remove('show');
  document.getElementById('btn-dl').classList.remove('show');

  const pkgSet  = new Set(NOTEBOOKS.flatMap(n => n.tags));
  const codeCnt = NOTEBOOKS.reduce((s, n) =>
    s + n.cells.filter(c => c.type === 'code').length, 0);
  const activeLangs = LANGUAGES.filter(l =>
    NOTEBOOKS.some(n => n.lang === l.id)).length;

  // Build filter tabs
  const tabs = ['<button class="filter-tab active" data-lang="all" onclick="setFilter(\'all\',this)">📋 All <span class="tab-count">' + NOTEBOOKS.length + '</span></button>'];
  LANGUAGES.forEach(lang => {
    const cnt = NOTEBOOKS.filter(n => n.lang === lang.id).length;
    if (!cnt) return;
    tabs.push(
      '<button class="filter-tab" data-lang="' + lang.id +
      '" onclick="setFilter(\'' + lang.id + '\',this)">' +
      lang.icon + ' ' + lang.label +
      ' <span class="tab-count">' + cnt + '</span></button>'
    );
  });

  const scroll = document.getElementById('main-scroll');
  scroll.innerHTML =
    '<div class="landing">' +

    // Hero
    '<div class="hero">' +
      '<div class="hero-eyebrow"><span class="hero-pulse"></span>GEOLAB PORTFOLIO</div>' +
      '<h1 class="hero-title">Spatial data.<br><em>Three languages.</em></h1>' +
      '<p class="hero-desc">A curated collection of Python, Google Earth Engine, and R notebooks for geospatial analysis and remote sensing.</p>' +
      '<div class="hero-status">' +
        '<div class="hero-status-dot"></div>' +
        '<span class="hero-status-text">' + NOTEBOOKS.length + ' notebooks active — flourishing</span>' +
      '</div>' +
    '</div>' +

    // Stats
    '<div class="stats">' +
      '<div class="stat"><div class="stat-n">' + NOTEBOOKS.length + '</div><div class="stat-l">Notebooks</div></div>' +
      '<div class="stat"><div class="stat-n">' + activeLangs + '</div><div class="stat-l">Languages</div></div>' +
      '<div class="stat"><div class="stat-n">' + pkgSet.size + '</div><div class="stat-l">Libraries</div></div>' +
      '<div class="stat"><div class="stat-n">' + codeCnt + '</div><div class="stat-l">Code Cells</div></div>' +
    '</div>' +

    // Collection
    '<div class="section-header">' +
      '<div>' +
        '<div class="section-title">Collection</div>' +
        '<div class="section-sub">' + NOTEBOOKS.length + ' specimens · built ' + BUILD_DATE + '</div>' +
      '</div>' +
    '</div>' +

    // Filter tabs
    '<div class="filter-tabs" id="filter-tabs">' + tabs.join('') + '</div>' +

    // Card grid placeholder — filled by renderGrid()
    '<div id="card-grid"></div>' +

    '</div>';

  document.getElementById('toc-list').innerHTML = '';
  renderGrid();
}

function setFilter(lang, btn) {
  activeFilter = lang;
  document.querySelectorAll('.filter-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.lang === lang)
  );
  renderGrid();
}

function renderGrid() {
  const visible = activeFilter === 'all'
    ? NOTEBOOKS
    : NOTEBOOKS.filter(n => n.lang === activeFilter);

  const grid = document.getElementById('card-grid');
  if (!grid) return;

  if (!visible.length) {
    grid.innerHTML =
      '<div class="empty-state">' +
      '<div class="empty-state-icon">📭</div>' +
      'No notebooks in this category yet.' +
      '</div>';
    return;
  }

  grid.innerHTML = '<div class="card-grid">' +
    visible.map(nb => {
      const c  = langColors(nb);
      const sc = stripeColor(nb);
      const tagPills = nb.tags.slice(0, 5)
        .map(t => '<span class="card-tag">' + t + '</span>').join('');

      return (
        '<div class="nb-card" onclick="showNotebook(\'' + nb.id + '\')">' +
          '<div class="card-stripe" style="background:' + sc + '"></div>' +
          '<div class="card-body">' +
            '<div class="lang-tag" style="background:' + c.bg + ';color:' + c.color + ';border-color:' + c.border + '">' +
              nb.lang_icon + ' ' + nb.lang_label +
            '</div>' +
            '<div class="card-title">' + nb.title + '</div>' +
            '<div class="card-category">' + nb.category + '</div>' +
            '<div class="card-spacer"></div>' +
            (tagPills ? '<div class="card-tags">' + tagPills + '</div>' : '') +
          '</div>' +
        '</div>'
      );
    }).join('') +
  '</div>';
}

// ── NOTEBOOK READER ────────────────────────────────────────────────────────

function showNotebook(id) {
  const nb = NOTEBOOKS.find(n => n.id === id);
  if (!nb) return;

  currentNbId = id;
  closeDrawer();
  setSidebarActive(id);
  setBnavActive('read');

  // Topbar
  document.getElementById('bc-current').textContent = nb.short;
  document.getElementById('btn-back').classList.add('show');

  // Download button
  const dlBtn = document.getElementById('btn-dl');
  dlBtn.classList.add('show');
  if (window._lastBlobUrl) URL.revokeObjectURL(window._lastBlobUrl);
  window._lastBlobUrl = blobUrl(nb.b64);
  dlBtn.href     = window._lastBlobUrl;
  dlBtn.download = nb.filename;

  // Render cells
  window._cellSrcs = [];
  const tocItems   = [];
  let cellsHTML    = '';

  nb.cells.forEach((cell, i) => {
    if (!cell.source.trim()) return;
    const sid = 's' + i;

    if (cell.type === 'markdown') {
      // Extract heading for TOC
      const hMatch = cell.source.match(/^#{1,3}\s+(.+)$/m);
      if (hMatch) {
        const label = hMatch[1]
          .replace(/[*_`#]/g, '')
          .replace(/[^\w\s\-.,: ]/g, '')
          .trim();
        if (label && label.length < 64)
          tocItems.push({ id: sid, label });
      }
      cellsHTML +=
        '<div class="nb-section md-cell" id="' + sid + '">' +
        renderMD(cell.source) + '</div>';

    } else {
      const idx  = window._cellSrcs.length;
      window._cellSrcs.push(cell.source);

      const langLabel = nb.lang === 'gee' ? 'JavaScript · GEE'
                      : nb.lang === 'r'   ? 'R'
                      :                     'Python';
      const cellColor = nb.lang === 'gee' ? '#5b8aff'
                      : nb.lang === 'r'   ? '#a07af0'
                      :                     '#4e9966';

      cellsHTML +=
        '<div class="nb-section code-cell" id="' + sid + '" style="--cell-color:' + cellColor + '">' +
          '<div class="code-cell-bar">' +
            '<span class="code-cell-lang">' + langLabel + '</span>' +
            '<button class="btn-copy" onclick="copyCode(this,' + idx + ')">Copy</button>' +
          '</div>' +
          '<pre class="code-pre">' + highlight(cell.source, nb.lang) + '</pre>' +
        '</div>';
    }
  });

  const heroBg = nb.lang === 'gee' ? '#1e3a8a'
               : nb.lang === 'r'   ? '#4c1d95'
               :                     '#1f4430';

  const pills = nb.tags
    .map(t => '<span class="hero-pill">' + t + '</span>')
    .join('');

  const scroll = document.getElementById('main-scroll');
  scroll.innerHTML =
    '<div class="reader">' +
      '<div class="nb-hero" style="background:' + heroBg + '">' +
        '<div class="nb-hero-badge">' + nb.lang_icon + ' ' + nb.lang_label + '</div>' +
        '<h1 class="nb-hero-title">' + nb.title + '</h1>' +
        '<p class="nb-hero-desc">' + nb.desc + '</p>' +
        (pills ? '<div class="nb-hero-pills">' + pills + '</div>' : '') +
      '</div>' +
      cellsHTML +
    '</div>';

  scroll.scrollTop = 0;
  history.replaceState(null, '', '#' + id);
  buildTOC(tocItems, scroll);
}

// ── TABLE OF CONTENTS ──────────────────────────────────────────────────────

function buildTOC(items, scrollEl) {
  const list  = document.getElementById('toc-list');
  const panel = document.getElementById('toc-panel');
  list.innerHTML = '';

  if (!items.length) {
    if (panel) panel.style.opacity = '.35';
    return;
  }
  if (panel) panel.style.opacity = '1';

  items.forEach(item => {
    const li  = document.createElement('li');
    li.className  = 'toc-item';
    li.dataset.id = item.id;
    li.innerHTML  =
      '<a href="#" onclick="event.preventDefault();' +
      'document.getElementById(\'' + item.id + '\')' +
      '.scrollIntoView({behavior:\'smooth\'});return false;">' +
      item.label + '</a>';
    list.appendChild(li);
  });

  // Intersection observer for active highlight
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      list.querySelectorAll('.toc-item').forEach(li =>
        li.classList.toggle('active', li.dataset.id === e.target.id)
      );
    });
  }, { root: scrollEl, rootMargin: '-12% 0px -72% 0px' });

  items.forEach(({ id }) => {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  });
}

// ── INIT ───────────────────────────────────────────────────────────────────

// Restore from URL hash (allows direct linking to a notebook)
const hash = location.hash.slice(1);
if (hash && NOTEBOOKS.find(n => n.id === hash)) {
  showNotebook(hash);
} else {
  showLanding();
}
