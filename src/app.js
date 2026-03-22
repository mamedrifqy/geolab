// GeoLab – frontend app
// All notebook data is injected by build.py as `const NOTEBOOKS = [...]`

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
    el.addEventListener('click', () => showNotebook(nb.id));
    list.appendChild(el);
  });
}

function showLanding() {
  document.querySelectorAll('.nb-item').forEach(el => el.classList.remove('active'));
  document.getElementById('breadcrumbCurrent').textContent = 'Overview';
  document.getElementById('dlBtn').classList.remove('visible');
  document.getElementById('homeBtn').classList.remove('visible');

  const content = document.getElementById('nbContent');
  const cards = NOTEBOOKS.map(nb =>
    '<div class="landing-card" onclick="showNotebook(\'' + nb.id + '\')">' +
    '<div class="lc-accent" style="background:linear-gradient(90deg,' + nb.accent + ',transparent)"></div>' +
    '<div class="lc-icon">' + nb.icon + '</div>' +
    '<div class="lc-title">' + nb.title + '</div>' +
    '<div class="lc-desc">' + nb.desc.substring(0, 115) + '&hellip;</div>' +
    '<div class="lc-meta"><span>' + nb.category + '</span><span>&middot;</span><span>' + nb.tags.length + ' packages</span></div>' +
    '<div class="lc-arrow">&rarr;</div></div>'
  ).join('');

  const pkgSet = new Set(NOTEBOOKS.flatMap(n => n.tags));

  content.innerHTML =
    '<div class="landing">' +
    '<div style="margin-bottom:1.5rem">' +
    '<div style="font-family:var(--mono);font-size:.63rem;letter-spacing:.18em;text-transform:uppercase;color:var(--green);margin-bottom:.8rem">GeoLab &middot; Portfolio</div>' +
    '<h1 style="font-family:var(--serif);font-size:2.6rem;font-weight:700;line-height:1.1;letter-spacing:-.025em;margin-bottom:.8rem">Spatial Analysis<br><em style="color:var(--green)">Notebooks</em></h1>' +
    '<p style="font-size:.92rem;color:var(--muted);line-height:1.75;max-width:520px">A curated collection of geospatial and remote sensing workflows built with Python &mdash; from drone orthomosaic processing to Google Earth Engine mangrove analysis.</p>' +
    '</div>' +
    '<div class="lstat-row">' +
    '<div><div class="lstat-n">' + NOTEBOOKS.length + '</div><div class="lstat-l">Notebooks</div></div>' +
    '<div><div class="lstat-n">' + pkgSet.size + '+</div><div class="lstat-l">Libraries</div></div>' +
    '<div><div class="lstat-n">Built ' + BUILD_DATE + '</div><div class="lstat-l">Last Updated</div></div>' +
    '</div>' +
    '<div class="landing-grid">' + cards + '</div></div>';

  document.getElementById('tocList').innerHTML = '';
}

// ── Markdown renderer ──────────────────────────────────────────────────────
function renderMD(md) {
  let h = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // fenced code
  h = h.replace(/```[\w]*\n([\s\S]*?)```/g, (_, c) => '<pre><code>' + c + '</code></pre>');
  // headings
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  h = h.replace(/^---$/gm, '<hr>');
  // inline
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
  h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // lists
  h = h.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  h = h.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  // paragraphs
  h = h.split('\n\n').map(p => {
    if (/^<(h[1-6]|hr|pre|li)/.test(p.trim())) {
      return p.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    }
    if (!p.trim()) return '';
    return '<p>' + p.replace(/\n/g, ' ') + '</p>';
  }).join('\n');
  return h;
}

// ── Syntax highlighter ─────────────────────────────────────────────────────
function highlight(code) {
  // Tokenise line-by-line to avoid cross-token contamination
  const KW = new Set(['import','from','def','class','return','for','in','if','elif',
    'else','try','except','with','as','and','or','not','True','False','None',
    'lambda','yield','pass','break','continue','raise','global','nonlocal','assert','del']);

  function tokenizeLine(line) {
    // We'll walk the string character by character, emitting tokens
    let out = '';
    let i = 0;
    while (i < line.length) {
      // Comment
      if (line[i] === '#') {
        out += '<span class="cm">' + esc(line.slice(i)) + '</span>';
        break;
      }
      // Triple-quoted strings (rare in single lines but handle anyway)
      if ((line.slice(i,i+3) === '"""' || line.slice(i,i+3) === "'''")) {
        const q = line.slice(i,i+3);
        let j = i + 3;
        while (j < line.length && line.slice(j,j+3) !== q) j++;
        j += 3;
        out += '<span class="st">' + esc(line.slice(i,j)) + '</span>';
        i = j; continue;
      }
      // Single/double quoted string
      if (line[i] === '"' || line[i] === "'") {
        const q = line[i]; let j = i + 1;
        while (j < line.length && line[j] !== q) { if (line[j] === '\\') j++; j++; }
        j++;
        out += '<span class="st">' + esc(line.slice(i,j)) + '</span>';
        i = j; continue;
      }
      // Identifier or keyword
      if (/[a-zA-Z_]/.test(line[i])) {
        let j = i;
        while (j < line.length && /\w/.test(line[j])) j++;
        const word = line.slice(i,j);
        if (KW.has(word)) {
          out += '<span class="kw">' + word + '</span>';
        } else if (j < line.length && /\s*\(/.test(line.slice(j))) {
          out += '<span class="fn">' + word + '</span>';
        } else {
          out += word;
        }
        i = j; continue;
      }
      // Number
      if (/\d/.test(line[i])) {
        let j = i;
        while (j < line.length && /[\d.]/.test(line[j])) j++;
        out += '<span class="nu">' + line.slice(i,j) + '</span>';
        i = j; continue;
      }
      // Anything else — escape and emit
      out += esc(line[i]);
      i++;
    }
    return out;
  }

  function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return code.split('\n').map(tokenizeLine).join('\n');
}

// ── Copy to clipboard ──────────────────────────────────────────────────────
function copyCode(btn, idx) {
  navigator.clipboard.writeText(window._cellSources[idx]).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 1500);
  });
}

// ── Show notebook ──────────────────────────────────────────────────────────
function showNotebook(id) {
  const nb = NOTEBOOKS.find(n => n.id === id);
  if (!nb) return;

  document.querySelectorAll('.nb-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('nav-' + id);
  if (navEl) { navEl.classList.add('active'); navEl.scrollIntoView({ block: 'nearest' }); }

  document.getElementById('breadcrumbCurrent').textContent = nb.short;
  document.getElementById('homeBtn').classList.add('visible');

  // Download button
  const dlBtn = document.getElementById('dlBtn');
  dlBtn.classList.add('visible');
  if (window._lastBlobUrl) URL.revokeObjectURL(window._lastBlobUrl);
  const blob = b64toBlob(nb.b64, 'application/octet-stream');
  window._lastBlobUrl = URL.createObjectURL(blob);
  dlBtn.href = window._lastBlobUrl;
  dlBtn.download = nb.filename;

  // Build cells HTML
  window._cellSources = [];
  let cellsHTML = '';
  const tocSections = [];

  nb.cells.forEach((cell, i) => {
    if (!cell.source.trim()) return;
    const secId = 'sec-' + id + '-' + i;

    if (cell.type === 'markdown') {
      const hMatch = cell.source.match(/^#{1,3}\s+(.+)$/m);
      if (hMatch) {
        const label = hMatch[1].replace(/[*_`#]/g, '').replace(/[^\w\s\-\.,: ]/g, '').trim();
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
    '<div class="nb-hero-tag" style="color:' + nb.accent + ';border-color:' + nb.accent + '55">' +
    nb.icon + ' <span>' + nb.category + '</span></div>' +
    '<h1 class="nb-hero-title">' + nb.title + '</h1>' +
    '<p class="nb-hero-desc">' + nb.desc + '</p>' +
    '<div class="nb-hero-pills">' + pills + '</div></div>' +
    cellsHTML;

  content.scrollTop = 0;
  buildTOC(tocSections, content);

  // Update URL hash for bookmarking
  history.replaceState(null, '', '#' + id);
}

// ── TOC ────────────────────────────────────────────────────────────────────
function buildTOC(items, scrollEl) {
  const list = document.getElementById('tocList');
  list.innerHTML = '';
  const panel = document.getElementById('tocPanel');
  if (!items.length) { panel.style.opacity = '0.3'; return; }
  panel.style.opacity = '1';

  items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'toc-item';
    li.dataset.id = item.id;
    li.innerHTML =
      '<a href="#" onclick="event.preventDefault();' +
      'document.getElementById(\'' + item.id + '\')' +
      '.scrollIntoView({behavior:\'smooth\'});return false;">' +
      item.label + '</a>';
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

// ── Utilities ──────────────────────────────────────────────────────────────
function b64toBlob(b64, mime) {
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ── Init ───────────────────────────────────────────────────────────────────
buildSidebar();

// Restore from hash
const hash = location.hash.slice(1);
if (hash && NOTEBOOKS.find(n => n.id === hash)) {
  showNotebook(hash);
} else {
  showLanding();
}
