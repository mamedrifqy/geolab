// GeoLab · frontend app — mobile-friendly build
// NOTEBOOKS and BUILD_DATE injected by build.py

// ── CATEGORY → THUMB ────────────────────────────────────────────────────
function thumbClass(cat) {
  const c = cat.toLowerCase();
  if (c.includes('gee') || c.includes('remote'))   return 'thumb-green';
  if (c.includes('raster') || c.includes('ortho')) return 'thumb-teal';
  if (c.includes('spatial') || c.includes('buffer')) return 'thumb-amber';
  if (c.includes('utility') || c.includes('coord')) return 'thumb-purple';
  if (c.includes('gdal') || c.includes('dem'))      return 'thumb-red';
  if (c.includes('vector'))                         return 'thumb-blue';
  return 'thumb-default';
}

function barValues(nb) {
  const codeCells = nb.cells.filter(c => c.type === 'code').length;
  const total     = Math.max(nb.cells.length, 1);
  const complete  = Math.min(100, Math.round(codeCells / total * 100));
  const coverage  = Math.min(100, Math.round(nb.tags.length / 8 * 100));
  return {
    bar1: { label: 'CODE COVERAGE', val: complete + '%',       pct: complete,  warn: complete < 20 },
    bar2: { label: 'LIBRARIES',     val: nb.tags.length + ' pkgs', pct: coverage, warn: false }
  };
}

// ── MOBILE DRAWER ────────────────────────────────────────────────────────
function openDrawer() {
  document.querySelector('.sidebar').classList.add('open');
  document.querySelector('.sidebar-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  document.querySelector('.sidebar').classList.remove('open');
  document.querySelector('.sidebar-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ── SIDEBAR ──────────────────────────────────────────────────────────────
function buildSidebar() {
  const list = document.getElementById('sidebarList');
  NOTEBOOKS.forEach(nb => {
    const el = document.createElement('div');
    el.className = 'nb-item';
    el.id = 'nav-' + nb.id;
    el.innerHTML =
      '<span class="nb-icon">' + nb.icon + '</span>' +
      '<div><div class="nb-name">' + nb.short + '</div>' +
      '<div class="nb-cat">' + nb.category + '</div></div>';
    el.addEventListener('click', () => { showNotebook(nb.id); closeDrawer(); });
    list.appendChild(el);
  });
}

// ── MOBILE NAV STATE ─────────────────────────────────────────────────────
function setMobNav(page) {
  document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('mob-' + page);
  if (btn) btn.classList.add('active');

  const dlBtn = document.getElementById('mobDlBtn');
  if (dlBtn) dlBtn.classList.toggle('visible', page === 'notebook');
}

// ── LANDING ──────────────────────────────────────────────────────────────
function showLanding() {
  document.querySelectorAll('.nb-item').forEach(el => el.classList.remove('active'));
  document.getElementById('breadcrumbCurrent').textContent = 'Overview';
  document.getElementById('dlBtn').classList.remove('visible');
  document.getElementById('homeBtn').classList.remove('visible');
  setMobNav('home');

  const pkgSet   = new Set(NOTEBOOKS.flatMap(n => n.tags));
  const featured = NOTEBOOKS[0];
  const totalCode = NOTEBOOKS.reduce((s,n) => s + n.cells.filter(c => c.type === 'code').length, 0);

  const cards = NOTEBOOKS.map(nb => {
    const bars = barValues(nb);
    const tc   = thumbClass(nb.category);
    const badge = nb.tags.length >= 5
      ? '<div class="card-badge badge-green">COMPREHENSIVE</div>'
      : '<div class="card-badge badge-amber">FOCUSED</div>';
    return (
      '<div class="nb-card" onclick="showNotebook(\'' + nb.id + '\')">' +
        '<div class="card-thumb ' + tc + '">' + badge +
          '<span>' + nb.icon + '</span>' +
          '<button class="card-menu" onclick="event.stopPropagation()">&#8943;</button>' +
        '</div>' +
        '<div class="card-body">' +
          '<div class="card-title">' + nb.title + '</div>' +
          '<div class="card-subtitle">' + nb.category + '</div>' +
          '<div class="bar-row">' +
            '<div class="bar-header"><span class="bar-label">' + bars.bar1.label + '</span>' +
            '<span class="bar-val' + (bars.bar1.warn ? ' warn' : '') + '">' + bars.bar1.val + '</span></div>' +
            '<div class="bar-track"><div class="bar-fill' + (bars.bar1.warn ? ' warn' : '') + '" style="width:' + bars.bar1.pct + '%"></div></div>' +
          '</div>' +
          '<div class="bar-row">' +
            '<div class="bar-header"><span class="bar-label">' + bars.bar2.label + '</span>' +
            '<span class="bar-val">' + bars.bar2.val + '</span></div>' +
            '<div class="bar-track"><div class="bar-fill" style="width:' + bars.bar2.pct + '%"></div></div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  document.getElementById('nbContent').innerHTML =
    '<div class="landing">' +
    '<div class="landing-hero">' +
      '<div class="hero-eyebrow"><span class="hero-dot"></span>GEOLAB PORTFOLIO</div>' +
      '<h1 class="hero-title">Spatial data.<br><em>Python workflows.</em></h1>' +
      '<p class="hero-desc">A living collection of geospatial notebooks — from drone orthomosaic processing to Google Earth Engine mangrove analysis.</p>' +
      '<div class="vitality-row"><div class="vitality-dot"></div>' +
        '<span class="vitality-text">COLLECTION VITALITY: ' + NOTEBOOKS.length + ' ACTIVE &mdash; FLOURISHING</span>' +
      '</div>' +
    '</div>' +
    '<div class="stats-row">' +
      '<div class="stat-card"><div class="stat-n">' + NOTEBOOKS.length + '</div><div class="stat-l">Notebooks</div></div>' +
      '<div class="stat-card"><div class="stat-n">' + pkgSet.size + '</div><div class="stat-l">Libraries</div></div>' +
      '<div class="stat-card"><div class="stat-n">' + totalCode + '</div><div class="stat-l">Code Cells</div></div>' +
      '<div class="stat-card"><div class="stat-n">' + BUILD_DATE.split(',')[0] + '</div><div class="stat-l">Last Built</div></div>' +
    '</div>' +
    '<div class="collection-header">' +
      '<div><div class="collection-title">Active Collection</div>' +
      '<div class="collection-sub">' + NOTEBOOKS.length + ' specimens</div></div>' +
      '<span class="expand-all" onclick="showNotebook(\'' + featured.id + '\')">Open Latest &#8599;</span>' +
    '</div>' +
    '<div class="nb-grid">' + cards + '</div></div>';

  document.getElementById('tocList').innerHTML = '';
  history.replaceState(null, '', '#');
}

// ── MARKDOWN ─────────────────────────────────────────────────────────────
function renderMD(md) {
  let h = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  h = h.replace(/```[\w]*\n([\s\S]*?)```/g, (_,c) => '<pre><code>' + c + '</code></pre>');
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

// ── SYNTAX HIGHLIGHT ─────────────────────────────────────────────────────
function highlight(code) {
  const KW = new Set(['import','from','def','class','return','for','in','if','elif','else',
    'try','except','with','as','and','or','not','True','False','None',
    'lambda','yield','pass','break','continue','raise','global','nonlocal',
    'assert','del','print','range','len','int','str','float','list','dict',
    'type','set','tuple','bool','open']);

  function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function tokenizeLine(line) {
    let out = '', i = 0;
    while (i < line.length) {
      if (line[i] === '#') { out += '<span class="cm">' + esc(line.slice(i)) + '</span>'; break; }
      if (line.slice(i,i+3) === '"""' || line.slice(i,i+3) === "'''") {
        const q = line.slice(i,i+3); let j = i+3;
        while (j < line.length && line.slice(j,j+3) !== q) j++; j+=3;
        out += '<span class="st">' + esc(line.slice(i,j)) + '</span>'; i=j; continue;
      }
      if (line[i] === '"' || line[i] === "'") {
        const q = line[i]; let j = i+1;
        while (j < line.length && line[j] !== q) { if (line[j]==='\\') j++; j++; } j++;
        out += '<span class="st">' + esc(line.slice(i,j)) + '</span>'; i=j; continue;
      }
      if (/[a-zA-Z_]/.test(line[i])) {
        let j = i; while (j < line.length && /\w/.test(line[j])) j++;
        const w = line.slice(i,j);
        if (KW.has(w))                          out += '<span class="kw">' + w + '</span>';
        else if (/\s*\(/.test(line.slice(j)))   out += '<span class="fn">' + w + '</span>';
        else                                    out += w;
        i=j; continue;
      }
      if (/\d/.test(line[i])) {
        let j = i; while (j < line.length && /[\d.]/.test(line[j])) j++;
        out += '<span class="nu">' + line.slice(i,j) + '</span>'; i=j; continue;
      }
      out += esc(line[i]); i++;
    }
    return out;
  }
  return code.split('\n').map(tokenizeLine).join('\n');
}

function copyCode(btn, idx) {
  navigator.clipboard.writeText(window._cellSources[idx]).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 1500);
  });
}

// ── SHOW NOTEBOOK ────────────────────────────────────────────────────────
function showNotebook(id) {
  const nb = NOTEBOOKS.find(n => n.id === id);
  if (!nb) return;

  document.querySelectorAll('.nb-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('nav-' + id);
  if (navEl) { navEl.classList.add('active'); navEl.scrollIntoView({ block: 'nearest' }); }

  document.getElementById('breadcrumbCurrent').textContent = nb.short;
  document.getElementById('homeBtn').classList.add('visible');
  setMobNav('notebook');

  // Desktop download
  const dlBtn = document.getElementById('dlBtn');
  dlBtn.classList.add('visible');

  // Mobile floating download
  const mobDl = document.getElementById('mobDlBtn');

  if (window._lastBlobUrl) URL.revokeObjectURL(window._lastBlobUrl);
  const blob = b64toBlob(nb.b64, 'application/octet-stream');
  window._lastBlobUrl = URL.createObjectURL(blob);
  dlBtn.href    = window._lastBlobUrl;
  dlBtn.download = nb.filename;
  if (mobDl) { mobDl.href = window._lastBlobUrl; mobDl.download = nb.filename; }

  // Build cells
  window._cellSources = [];
  let cellsHTML = '';
  const tocSections = [];

  nb.cells.forEach((cell, i) => {
    if (!cell.source.trim()) return;
    const secId = 'sec-' + id + '-' + i;
    if (cell.type === 'markdown') {
      const hm = cell.source.match(/^#{1,3}\s+(.+)$/m);
      if (hm) {
        const label = hm[1].replace(/[*_`#]/g,'').replace(/[^\w\s\-\.,: ]/g,'').trim();
        if (label && label.length < 65) tocSections.push({ id: secId, label });
      }
      cellsHTML += '<div class="nb-section md-cell" id="' + secId + '">' + renderMD(cell.source) + '</div>';
    } else {
      const idx = window._cellSources.length;
      window._cellSources.push(cell.source);
      cellsHTML +=
        '<div class="nb-section code-cell" id="' + secId + '">' +
        '<div class="code-cell-header">' +
        '<span class="code-cell-label">Python</span>' +
        '<button class="code-cell-copy" onclick="copyCode(this,' + idx + ')">Copy</button>' +
        '</div>' +
        '<pre class="code-pre">' + highlight(cell.source) + '</pre></div>';
    }
  });

  const pills = nb.tags.map(t => '<span class="pkg-pill">' + t + '</span>').join('');
  const content = document.getElementById('nbContent');
  content.innerHTML =
    '<div class="nb-hero">' +
      '<div class="nb-hero-tag">' + nb.icon + ' ' + nb.category + '</div>' +
      '<h1 class="nb-hero-title">' + nb.title + '</h1>' +
      '<p class="nb-hero-desc">' + nb.desc + '</p>' +
      '<div class="nb-hero-pills">' + pills + '</div>' +
    '</div>' + cellsHTML;

  content.scrollTop = 0;
  buildTOC(tocSections, content);
  history.replaceState(null, '', '#' + id);
}

// ── TOC ──────────────────────────────────────────────────────────────────
function buildTOC(items, scrollEl) {
  const list  = document.getElementById('tocList');
  const panel = document.getElementById('tocPanel');
  list.innerHTML = '';
  if (!items.length) { panel.style.opacity = '0.4'; return; }
  panel.style.opacity = '1';
  items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'toc-item'; li.dataset.id = item.id;
    li.innerHTML = '<a href="#" onclick="event.preventDefault();document.getElementById(\'' +
      item.id + '\').scrollIntoView({behavior:\'smooth\'});return false;">' + item.label + '</a>';
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

// ── UTILITIES ─────────────────────────────────────────────────────────────
function b64toBlob(b64, mime) {
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ── INIT ──────────────────────────────────────────────────────────────────
buildSidebar();

// Mobile drawer wiring
document.querySelector('.menu-toggle').addEventListener('click', openDrawer);
document.querySelector('.sidebar-close').addEventListener('click', closeDrawer);
document.querySelector('.sidebar-overlay').addEventListener('click', closeDrawer);

// Restore from hash
const hash = location.hash.slice(1);
if (hash && NOTEBOOKS.find(n => n.id === hash)) {
  showNotebook(hash);
} else {
  showLanding();
}
