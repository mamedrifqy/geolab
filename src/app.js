// GeoLab · frontend app
// NOTEBOOKS, BUILD_DATE, and LANGUAGES are injected by build.py

// ── LANGUAGE HELPERS ─────────────────────────────────────────────────────────

// Map a notebook's language id to its thumb gradient CSS class
function thumbClass(nb) {
  if (nb.lang === 'gee')    return 'thumb-blue';
  if (nb.lang === 'r')      return 'thumb-purple';
  const c = nb.category.toLowerCase();
  if (c.includes('raster') || c.includes('ortho')) return 'thumb-teal';
  if (c.includes('buffer') || c.includes('heat'))  return 'thumb-amber';
  if (c.includes('gdal')   || c.includes('dem'))   return 'thumb-red';
  return 'thumb-green';
}

// Progress bar metadata for the notebook card
function barValues(nb) {
  const codeCells = nb.cells.filter(c => c.type === 'code').length;
  const total     = Math.max(nb.cells.length, 1);
  const complete  = Math.min(100, Math.round((codeCells / total) * 100));
  const coverage  = Math.min(100, Math.round((nb.tags.length / 8) * 100));
  return {
    bar1: { label: 'CODE COVERAGE', val: complete + '%', pct: complete, warn: complete < 20 },
    bar2: { label: 'LIBRARIES',     val: nb.tags.length + ' pkgs', pct: coverage, warn: false },
  };
}

// Render a small language badge pill for a notebook card
function langBadge(nb) {
  return (
    '<span class="lang-badge" style="background:' + nb.lang_bg +
    ';color:' + nb.lang_accent +
    ';border-color:' + nb.lang_accent + '44">' +
    nb.lang_icon + ' ' + nb.lang_label +
    '</span>'
  );
}


// ── SIDEBAR ───────────────────────────────────────────────────────────────────
// The sidebar HTML is pre-rendered by build.py (server-side), so we only
// need to wire up the active-state highlighting here on the client.
function highlightSidebar(id) {
  document.querySelectorAll('.nb-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('nav-' + id);
  if (navEl) { navEl.classList.add('active'); navEl.scrollIntoView({ block: 'nearest' }); }
}


// ── LANDING PAGE ──────────────────────────────────────────────────────────────

// Active filter — 'all' or a language id ('python', 'gee', 'r')
let activeFilter = 'all';

function setFilter(langId) {
  activeFilter = langId;
  // Update filter button styles
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === langId);
  });
  // Re-render only the card grid, not the whole landing
  document.getElementById('cardGrid').innerHTML = buildCardGrid();
}

function buildFilterBar() {
  const allCount = NOTEBOOKS.length;
  let html = '<div class="filter-bar">';
  html += '<button class="filter-btn active" data-lang="all" onclick="setFilter(\'all\')">'
        + '📋 All <span class="filter-count">' + allCount + '</span></button>';
  LANGUAGES.forEach(lang => {
    const n = NOTEBOOKS.filter(nb => nb.lang === lang.id).length;
    if (!n) return;
    html += '<button class="filter-btn" data-lang="' + lang.id + '" onclick="setFilter(\'' + lang.id + '\')">'
          + lang.icon + ' ' + lang.label + ' <span class="filter-count">' + n + '</span></button>';
  });
  html += '</div>';
  return html;
}

function buildCardGrid() {
  const visible = activeFilter === 'all'
    ? NOTEBOOKS
    : NOTEBOOKS.filter(nb => nb.lang === activeFilter);

  if (!visible.length) {
    return '<div style="padding:3rem 0;color:var(--muted);font-size:.88rem;text-align:center">No notebooks in this category yet.</div>';
  }

  return '<div class="nb-grid">' + visible.map(nb => {
    const bars  = barValues(nb);
    const tc    = thumbClass(nb);
    const badge = nb.tags.length >= 5
      ? '<div class="card-badge badge-green">COMPREHENSIVE</div>'
      : '<div class="card-badge badge-amber">FOCUSED</div>';

    return (
      '<div class="nb-card" onclick="showNotebook(\'' + nb.id + '\')">' +
        '<div class="card-thumb ' + tc + '">' +
          badge +
          '<span>' + nb.icon + '</span>' +
          '<button class="card-menu" onclick="event.stopPropagation()">⋯</button>' +
        '</div>' +
        '<div class="card-body">' +
          langBadge(nb) +
          '<div class="card-title">' + nb.title + '</div>' +
          '<div class="card-subtitle">' + nb.category + '</div>' +
          '<div class="bar-row">' +
            '<div class="bar-header">' +
              '<span class="bar-label">' + bars.bar1.label + '</span>' +
              '<span class="bar-val' + (bars.bar1.warn ? ' warn' : '') + '">' + bars.bar1.val + '</span>' +
            '</div>' +
            '<div class="bar-track">' +
              '<div class="bar-fill' + (bars.bar1.warn ? ' warn' : '') + '" style="width:' + bars.bar1.pct + '%"></div>' +
            '</div>' +
          '</div>' +
          '<div class="bar-row">' +
            '<div class="bar-header">' +
              '<span class="bar-label">' + bars.bar2.label + '</span>' +
              '<span class="bar-val">' + bars.bar2.val + '</span>' +
            '</div>' +
            '<div class="bar-track">' +
              '<div class="bar-fill" style="width:' + bars.bar2.pct + '%;background:' + nb.lang_accent + '"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('') + '</div>';
}

function showLanding() {
  highlightSidebar('');
  document.getElementById('breadcrumbCurrent').textContent = 'Overview';
  document.getElementById('dlBtn').classList.remove('visible');
  document.getElementById('homeBtn').classList.remove('visible');
  activeFilter = 'all';

  const pkgSet    = new Set(NOTEBOOKS.flatMap(n => n.tags));
  const totalCode = NOTEBOOKS.reduce((s,n) => s + n.cells.filter(c => c.type==='code').length, 0);

  document.getElementById('nbContent').innerHTML =
    '<div class="landing">' +

    // Hero banner
    '<div class="landing-hero">' +
      '<div class="hero-eyebrow"><span class="hero-dot"></span>GEOLAB PORTFOLIO</div>' +
      '<h1 class="hero-title">Spatial data.<br><em>Three languages.</em></h1>' +
      '<p class="hero-desc">A living collection of geospatial notebooks in Python, Google Earth Engine JavaScript, and R — all in one place.</p>' +
      '<div class="vitality-row">' +
        '<div class="vitality-dot"></div>' +
        '<span class="vitality-text">COLLECTION: ' + NOTEBOOKS.length + ' ACTIVE &mdash; FLOURISHING</span>' +
      '</div>' +
    '</div>' +

    // Stats row
    '<div class="stats-row">' +
      '<div class="stat-card"><div class="stat-n">' + NOTEBOOKS.length + '</div><div class="stat-l">Notebooks</div></div>' +
      '<div class="stat-card"><div class="stat-n">' + LANGUAGES.filter(l => NOTEBOOKS.some(n => n.lang===l.id)).length + '</div><div class="stat-l">Languages</div></div>' +
      '<div class="stat-card"><div class="stat-n">' + pkgSet.size + '</div><div class="stat-l">Libraries</div></div>' +
      '<div class="stat-card"><div class="stat-n">' + totalCode + '</div><div class="stat-l">Code Cells</div></div>' +
    '</div>' +

    // Collection + filter
    '<div class="collection-header">' +
      '<div>' +
        '<div class="collection-title">Active Collection</div>' +
        '<div class="collection-sub">' + NOTEBOOKS.length + ' specimens across ' + LANGUAGES.length + ' languages</div>' +
      '</div>' +
    '</div>' +

    buildFilterBar() +
    '<div id="cardGrid">' + buildCardGrid() + '</div>' +
    '</div>';

  document.getElementById('tocList').innerHTML = '';
  updateBottomNav('home');
  const dlTab = document.getElementById('dlTabBtn');
  if (dlTab) dlTab.style.display = 'none';
}


// ── MARKDOWN RENDERER ─────────────────────────────────────────────────────────
function renderMD(md) {
  let h = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  h = h.replace(/```[\w]*\n([\s\S]*?)```/g, (_, c) => '<pre><code>' + c + '</code></pre>');
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm,   '<h1>$1</h1>');
  h = h.replace(/^---$/gm, '<hr>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g,     '<em>$1</em>');
  h = h.replace(/`([^`\n]+)`/g,   '<code>$1</code>');
  h = h.replace(/^[-*] (.+)$/gm,  '<li>$1</li>');
  h = h.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  h = h.split('\n\n').map(p => {
    if (/^<(h[1-6]|hr|pre|li)/.test(p.trim()))
      return p.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    if (!p.trim()) return '';
    return '<p>' + p.replace(/\n/g,' ') + '</p>';
  }).join('\n');
  return h;
}


// ── SYNTAX HIGHLIGHTERS ───────────────────────────────────────────────────────
// Each highlighter uses the same character-by-character tokenizer strategy
// so there are no placeholder/escaping bugs.

function highlightPython(code) {
  const KW = new Set([
    'import','from','def','class','return','for','in','if','elif','else',
    'try','except','with','as','and','or','not','True','False','None',
    'lambda','yield','pass','break','continue','raise','global',
    'nonlocal','assert','del','print','range','len','int','str',
    'float','list','dict','type','set','tuple','bool','open'
  ]);
  return tokenize(code, KW, '#');
}

function highlightJS(code) {
  // Google Earth Engine JavaScript keywords + GEE API globals
  const KW = new Set([
    'var','let','const','function','return','if','else','for','while',
    'new','this','true','false','null','undefined','typeof','instanceof',
    'class','extends','import','export','of','in','do','switch','case',
    'break','continue','throw','try','catch','finally','async','await',
    // GEE-specific globals
    'ee','Map','Export','Chart','ui','Geometry','Feature','Image',
    'ImageCollection','FeatureCollection','Dictionary','List','Number',
    'String','Date','Filter','Reducer','Kernel','Terrain','Classifier'
  ]);
  return tokenize(code, KW, '//');
}

function highlightR(code) {
  // R keywords + common base functions
  const KW = new Set([
    'function','if','else','for','while','repeat','return','next','break',
    'TRUE','FALSE','NULL','NA','Inf','NaN','T','F',
    // Common base R functions
    'library','require','c','list','data.frame','matrix','vector',
    'rbind','cbind','plot','print','cat','paste','paste0','sprintf',
    'apply','lapply','sapply','tapply','which','length','nrow','ncol',
    'dim','class','str','summary','head','tail','subset','merge',
    'read.csv','write.csv','read.table','setwd','getwd','source',
    'is.na','is.null','is.numeric','as.numeric','as.character','as.factor',
    'mean','sd','median','var','cor','lm','glm','ggplot','aes','geom_point',
    'geom_line','geom_histogram','geom_bar','theme','labs','scale_fill_manual',
    'st_read','st_write','st_transform','st_crs','st_buffer','st_join'
  ]);
  // R uses # for comments
  return tokenize(code, KW, '#');
}

// Core tokenizer — shared by all three highlighters.
// Walks the code character by character, emitting HTML spans.
function tokenize(code, keywords, commentPrefix) {
  function esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function tokenizeLine(line) {
    let out = '', i = 0;

    while (i < line.length) {
      // Single-line comment
      if (line.slice(i, i + commentPrefix.length) === commentPrefix) {
        out += '<span class="cm">' + esc(line.slice(i)) + '</span>';
        break;
      }

      // Triple-quoted strings (Python """...""" or '''...''')
      if (line[i] === '"' || line[i] === "'") {
        const q3 = line.slice(i, i+3);
        if (q3 === '"""' || q3 === "'''") {
          let j = i + 3;
          while (j < line.length && line.slice(j, j+3) !== q3) j++;
          j += 3;
          out += '<span class="st">' + esc(line.slice(i, j)) + '</span>';
          i = j; continue;
        }
        // Single/double quoted string
        const q = line[i]; let j = i + 1;
        while (j < line.length && line[j] !== q) { if (line[j]==='\\') j++; j++; }
        j++;
        out += '<span class="st">' + esc(line.slice(i, j)) + '</span>';
        i = j; continue;
      }

      // Template literals (JS)
      if (line[i] === '`') {
        let j = i + 1;
        while (j < line.length && line[j] !== '`') { if (line[j]==='\\') j++; j++; }
        j++;
        out += '<span class="st">' + esc(line.slice(i, j)) + '</span>';
        i = j; continue;
      }

      // Identifier / keyword
      if (/[a-zA-Z_.]/.test(line[i])) {
        let j = i;
        while (j < line.length && /[\w.]/.test(line[j])) j++;
        const word = line.slice(i, j);
        if (keywords.has(word)) {
          out += '<span class="kw">' + word + '</span>';
        } else if (/\s*\(/.test(line.slice(j))) {
          out += '<span class="fn">' + word + '</span>';
        } else {
          out += word;
        }
        i = j; continue;
      }

      // Number
      if (/\d/.test(line[i])) {
        let j = i;
        while (j < line.length && /[\d.eE+\-]/.test(line[j])) j++;
        out += '<span class="nu">' + line.slice(i, j) + '</span>';
        i = j; continue;
      }

      out += esc(line[i]);
      i++;
    }
    return out;
  }

  return code.split('\n').map(tokenizeLine).join('\n');
}

// Route to the correct highlighter based on the notebook's language
function highlight(code, lang) {
  if (lang === 'gee') return highlightJS(code);
  if (lang === 'r')   return highlightR(code);
  return highlightPython(code);
}


// ── COPY TO CLIPBOARD ──────────────────────────────────────────────────────
function copyCode(btn, idx) {
  navigator.clipboard.writeText(window._cellSources[idx]).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 1500);
  });
}


// ── SHOW NOTEBOOK ──────────────────────────────────────────────────────────
function showNotebook(id) {
  const nb = NOTEBOOKS.find(n => n.id === id);
  if (!nb) return;

  highlightSidebar(id);
  document.getElementById('breadcrumbCurrent').textContent = nb.short;
  document.getElementById('homeBtn').classList.add('visible');

  // Download button
  const dlBtn = document.getElementById('dlBtn');
  dlBtn.classList.add('visible');
  if (window._lastBlobUrl) URL.revokeObjectURL(window._lastBlobUrl);
  const blob = b64toBlob(nb.b64, 'application/octet-stream');
  window._lastBlobUrl = URL.createObjectURL(blob);
  dlBtn.href     = window._lastBlobUrl;
  dlBtn.download = nb.filename;

  // Render cells
  window._cellSources = [];
  let cellsHTML = '';
  const tocSections = [];

  nb.cells.forEach((cell, i) => {
    if (!cell.source.trim()) return;
    const secId = 'sec-' + id + '-' + i;

    if (cell.type === 'markdown') {
      const hMatch = cell.source.match(/^#{1,3}\s+(.+)$/m);
      if (hMatch) {
        const label = hMatch[1].replace(/[*_`#]/g,'').replace(/[^\w\s\-\.,: ]/g,'').trim();
        if (label && label.length < 65) tocSections.push({ id: secId, label });
      }
      cellsHTML += '<div class="nb-section md-cell" id="' + secId + '">' + renderMD(cell.source) + '</div>';
    } else {
      const idx = window._cellSources.length;
      window._cellSources.push(cell.source);
      // Language label shown in the code cell header
      const langLabel = nb.lang === 'gee' ? 'JavaScript (GEE)' : nb.lang === 'r' ? 'R' : 'Python';
      cellsHTML +=
        '<div class="nb-section code-cell" id="' + secId + '" style="--cell-accent:' + nb.lang_accent + '">' +
        '<div class="code-cell-header">' +
        '<span class="code-cell-label" style="color:' + nb.lang_accent + '88">' + langLabel + '</span>' +
        '<button class="code-cell-copy" onclick="copyCode(this,' + idx + ')">Copy</button>' +
        '</div>' +
        '<pre class="code-pre">' + highlight(cell.source, nb.lang) + '</pre>' +
        '</div>';
    }
  });

  const pills = nb.tags.map(t =>
    '<span class="pkg-pill">' + t + '</span>'
  ).join('');

  const content = document.getElementById('nbContent');
  content.innerHTML =
    '<div class="nb-hero" style="background:' + nb.lang_accent + '">' +
      '<div class="nb-hero-tag">' + nb.lang_icon + ' ' + nb.lang_label + '</div>' +
      '<h1 class="nb-hero-title">' + nb.title + '</h1>' +
      '<p class="nb-hero-desc">' + nb.desc + '</p>' +
      '<div class="nb-hero-pills">' + pills + '</div>' +
    '</div>' +
    cellsHTML;

  content.scrollTop = 0;
  buildTOC(tocSections, content);
  history.replaceState(null, '', '#' + id);
  closeDrawer();
  updateBottomNav('nb');
  const dlTab = document.getElementById('dlTabBtn');
  if (dlTab) dlTab.style.display = '';
}


// ── TOC ────────────────────────────────────────────────────────────────────
function buildTOC(items, scrollEl) {
  const list  = document.getElementById('tocList');
  const panel = document.getElementById('tocPanel');
  list.innerHTML = '';
  if (!items.length) { panel.style.opacity = '0.4'; return; }
  panel.style.opacity = '1';
  items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'toc-item';
    li.dataset.id = item.id;
    li.innerHTML =
      '<a href="#" onclick="event.preventDefault();' +
      'document.getElementById(\'' + item.id + '\').scrollIntoView({behavior:\'smooth\'});' +
      'return false;">' + item.label + '</a>';
    list.appendChild(li);
  });
  if (!scrollEl) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        document.querySelectorAll('.toc-item').forEach(el => el.classList.remove('active'));
        const li = list.querySelector('[data-id="' + e.target.id + '"]');
        if (li) li.classList.add('active');
      }
    });
  }, { root: scrollEl, rootMargin: '-15% 0px -75% 0px' });
  items.forEach(item => { const el = document.getElementById(item.id); if (el) io.observe(el); });
}


// ── MOBILE DRAWER ──────────────────────────────────────────────────────────
function openDrawer() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('drawerOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function updateBottomNav(active) {
  document.querySelectorAll('.bn-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === active);
  });
}


// ── UTILITIES ───────────────────────────────────────────────────────────────
function b64toBlob(b64, mime) {
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}


// ── INIT ────────────────────────────────────────────────────────────────────
const hash = location.hash.slice(1);
if (hash && NOTEBOOKS.find(n => n.id === hash)) {
  showNotebook(hash);
} else {
  showLanding();
}
