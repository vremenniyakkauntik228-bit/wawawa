const state = { catalog: [], poll: null };

async function api(url, options = {}) {
  const r = await fetch(url, options);
  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { detail: text }; }
  if (!r.ok) throw new Error(data.detail || `Request failed (${r.status})`);
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;' }[c]));
}

function setActive(href) {
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === href));
  document.querySelectorAll('.side-link[href]').forEach(a => a.classList.toggle('active', a.getAttribute('href') === href));
}

function engineGlyph() {
  return `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M14 34V15.7L19.4 10.3H34L28.4 15.9H20.8V27L14 34Z" stroke="currentColor" stroke-width="2.4"/>
    <path d="M34 14V32.3L28.6 37.7H14L19.6 32.1H27.2V21L34 14Z" stroke="currentColor" stroke-width="2.4"/>
  </svg>`;
}

function rotateLogo(el) {
  if (!el) return;
  let rx = -8, ry = 12;
  let dragging = false;
  let lastX = 0, lastY = 0;
  let moved = false;

  const apply = () => { el.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`; };
  apply();

  el.addEventListener('pointerdown', e => {
    dragging = true;
    moved = false;
    lastX = e.clientX;
    lastY = e.clientY;
    el.classList.add('dragging');
    el.setPointerCapture?.(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
    ry += dx * .42;
    rx -= dy * .42;
    rx = Math.max(-72, Math.min(72, rx));
    apply();
    lastX = e.clientX;
    lastY = e.clientY;
  });
  const end = e => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    try { el.releasePointerCapture?.(e.pointerId); } catch {}
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('dblclick', () => { rx = -8; ry = 12; apply(); });
}

function searchEngineInput() {
  const input = document.getElementById('engineSearch');
  if (!input) return;
  input.addEventListener('input', () => {
    const term = input.value.trim().toLowerCase();
    document.querySelectorAll('[data-engine-card]').forEach(card => {
      card.hidden = term && !card.dataset.search.includes(term);
    });
  });
}

function engineCard(e) {
  const search = [e.name, e.engineId, e.version, e.status, ...(e.formats || [])].join(' ').toLowerCase();
  const storage = e.storage || '500 MB Storage';
  return `<article class="engine-card" data-engine-card data-search="${esc(search)}">
    <div class="engine-main">
      <div class="engine-main-top">
        <div class="engine-icon">${engineGlyph()}</div>
        <div class="engine-title">
          <h3>${esc(e.name)}</h3>
          <p>${esc('Анализ, проверка, извлечение, исправление и конвертация документов.')}</p>
        </div>
      </div>
      <div class="tag-row">${(e.formats || []).map(f => `<span class="tag">${esc(f === 'Markdown' ? 'MD' : f)}</span>`).join('')}</div>
    </div>
    <div class="engine-divider"></div>
    <div class="engine-meta">
      <div><div class="meta-label">NemllеA Engine ID</div><div class="meta-value">${esc(e.engineId)}</div></div>
      <div><div class="meta-label">Serial Number</div><div class="meta-value">${esc(e.serial)}</div></div>
      <div><div class="meta-label">Version</div><div class="meta-value meta-big">${esc(e.version)} <span style="color:#4bd3be; margin-left:6px;">● Official</span></div></div>
    </div>
    <div class="engine-specs">
      <div class="spec"><span class="spec-icon">⌘</span><span>${esc(e.runtime || 'Python')}</span></div>
      <div class="spec"><span class="spec-icon">▥</span><span>${esc(e.minimumRam || '512 MB')} + RAM</span></div>
      <div class="spec"><span class="spec-icon">▦</span><span>1 vCPU+</span></div>
      <div class="spec"><span class="spec-icon">▱</span><span>${esc(storage)}</span></div>
      <a class="open-engine" href="#/engine/${encodeURIComponent(e.engineId)}"><span>Open Engine</span><span class="arrow">→</span></a>
    </div>
  </article>`;
}

async function loadCatalog() {
  if (state.catalog.length) return state.catalog;
  const data = await api('/api/catalog');
  state.catalog = data.engines || [];
  return state.catalog;
}

async function renderEngines() {
  const engines = await loadCatalog();
  setActive('#/engines');
  document.getElementById('app').innerHTML = `
    <section class="page-head">
      <div class="page-copy">
        <div class="eyebrow">Powered by NemlleA</div>
        <h1>Engines for Your Projects</h1>
        <p>Готовые решения для разработки. Выбирайте, подключайте и расширяйте возможности своих проектов.</p>
        <div class="searchbox">
          <span class="search-icon">⌕</span>
          <input id="engineSearch" type="search" autocomplete="off" placeholder="Поиск Engine..." aria-label="Поиск Engine" />
        </div>
      </div>
      <div class="logo-side">
        <div class="logo-stage">
          <div class="logo-lines" aria-hidden="true"></div>
          <div class="logo-orbit" id="interactiveLogo" role="img" aria-label="Интерактивный 3D логотип NemlleA, потяните мышкой для вращения">
            <div class="logo-under" aria-hidden="true"></div>
            <div class="logo-layer depth logo-depth-4"><img src="/logo.svg" alt="" /></div>
            <div class="logo-layer depth logo-depth-3"><img src="/logo.svg" alt="" /></div>
            <div class="logo-layer depth logo-depth-2"><img src="/logo.svg" alt="" /></div>
            <div class="logo-layer depth logo-depth-1"><img src="/logo.svg" alt="" /></div>
            <div class="logo-layer logo-core"><img src="/logo.svg" alt="" /></div>
          </div>
          <div class="logo-caption">Simple solutions for complex ideas</div>
          <div class="logo-hint">Зажмите мышь и потяните, чтобы вращать</div>
        </div>
      </div>
    </section>

    <div class="section-head">
      <h2>Official Engines <span class="count">${engines.length}</span></h2>
      <a href="#/engines">Все Engines&nbsp; →</a>
    </div>
    <section class="engine-grid">${engines.map(engineCard).join('')}</section>

    <div class="section-head" style="margin-top:34px;">
      <h2>Community Engines <span class="count">0</span></h2>
    </div>
    <section class="community-card">
      <div class="community-left">
        <div class="community-icon">♧</div>
        <div class="community-copy">
          <h3>Пока нет Community версий</h3>
          <p>Когда появятся модификации, они будут отображаться здесь.</p>
        </div>
      </div>
      <button class="disabled-btn" type="button" id="learnMoreCommunity">Узнать больше&nbsp; →</button>
    </section>
  `;
  rotateLogo(document.getElementById('interactiveLogo'));
  searchEngineInput();
  document.getElementById('learnMoreCommunity').onclick = () => location.hash = '/community';
}

async function renderHome() {
  return renderEngines();
}

async function renderEngine(id) {
  const engines = await loadCatalog();
  const e = engines.find(x => x.engineId === id) || engines[0];
  setActive('#/engines');
  document.getElementById('app').innerHTML = `
    <section class="detail">
      <div class="panel detail-main">
        <div class="eyebrow">Official NemlleA Engine</div>
        <h1>${esc(e.name)}</h1>
        <p class="hero-copy">${esc(e.shortDescription)}</p>
        <div style="margin:22px 0; display:flex; gap:10px; flex-wrap:wrap"><a class="open-engine" style="width:auto" href="#/try/${encodeURIComponent(e.engineId)}">Try Engine <span class="arrow">→</span></a><a class="open-engine" style="width:auto" href="#/community">Community <span class="arrow">→</span></a></div>
        <div class="section-head"><h2>Identity</h2></div>
        <div class="kv"><div class="k">Engine ID</div><div class="code">${esc(e.engineId)}</div></div>
        <div class="kv"><div class="k">Serial</div><div class="code">${esc(e.serial)}</div></div>
        <div class="kv"><div class="k">Version</div><div>${esc(e.version)}</div></div>
        <div class="kv"><div class="k">Author</div><div>${esc(e.author)}</div></div>
      </div>
      <aside class="panel detail-side">
        <h3 style="margin-top:0">Compatibility</h3>
        <div class="kv"><div class="k">Runtime</div><div>${esc(e.runtime)}</div></div>
        <div class="kv"><div class="k">Minimum RAM</div><div>${esc(e.minimumRam)}</div></div>
        <div class="kv"><div class="k">Recommended RAM</div><div>${esc(e.recommendedRam)}</div></div>
        <div class="kv"><div class="k">Hosting</div><div>${(e.hosting || []).map(x=>esc(x)).join(', ')}</div></div>
        <div class="notice success" style="margin-top:20px">Official · Ready for platform integration.</div>
      </aside>
    </section>`;
}

async function renderTry() {
  setActive('#/engines');
  document.getElementById('app').innerHTML = `
    <section class="panel detail-main">
      <div class="eyebrow">Document Processing Engine</div>
      <h1>Run a real Engine job.</h1>
      <p class="hero-copy">Upload a document, choose an operation and call the standalone Engine through the NemlleA server connector.</p>
      <div class="install">
        <input id="docFile" type="file" accept=".pdf,.docx,.txt,.md,.markdown,.json" />
        <select id="operation"><option value="analyze">Analyze</option><option value="validate">Validate</option><option value="extract_text">Extract text</option><option value="correct_text">Correct text</option><option value="convert">Convert</option></select>
        <select id="format"><option value="">Use default format</option><option value="txt">TXT</option><option value="md">Markdown</option><option value="json">JSON</option><option value="docx">DOCX</option><option value="pdf">PDF</option></select>
        <button class="open-engine" id="runEngine"><span>Run Engine</span><span class="arrow">→</span></button>
      </div>
      <div id="runArea" style="margin-top:26px"></div>
    </section>`;
  document.getElementById('runEngine').onclick = runDocumentEngine;
}

async function runDocumentEngine() {
  const area = document.getElementById('runArea');
  const fileInput = document.getElementById('docFile');
  if (!fileInput.files[0]) { area.innerHTML = '<div class="notice">Choose a document first.</div>'; return; }
  area.innerHTML = '<div class="notice">Uploading to Engine…</div>';
  try {
    const fd = new FormData();
    fd.append('file', fileInput.files[0]);
    const uploaded = await api('/api/engine/document/files', { method:'POST', body:fd });
    const operation = document.getElementById('operation').value;
    const format = document.getElementById('format').value;
    const payload = { file_id: uploaded.id, operation };
    if (format && operation === 'convert') payload.output_format = format;
    const job = await api('/api/engine/document/jobs', { method:'POST', headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()}, body:JSON.stringify(payload) });
    area.innerHTML = `<div class="notice success">Job ${esc(job.id)} created.<div class="progress-wrap"><div class="progress"><span id="bar"></span></div></div><div id="statusText">Queued</div></div>`;
    clearInterval(state.poll);
    state.poll = setInterval(async () => {
      try {
        const s = await api('/api/engine/document/jobs/' + encodeURIComponent(job.id));
        const bar = document.getElementById('bar'); if (bar) bar.style.width = `${s.progress}%`;
        const st = document.getElementById('statusText'); if (st) st.textContent = `${s.status} · ${s.progress}%`;
        if (['completed','failed','cancelled','timed_out'].includes(s.status)) {
          clearInterval(state.poll);
          if (s.status === 'completed') area.innerHTML += `<div style="margin-top:18px"><a class="open-engine" style="width:auto;display:inline-flex" href="/api/engine/document/jobs/${encodeURIComponent(job.id)}/download"><span>Download result</span><span class="arrow">→</span></a></div>`;
          else if (s.status !== 'cancelled') area.innerHTML += `<div class="notice" style="margin-top:18px">${esc(s.error_message || s.status)}</div>`;
        }
      } catch (err) {
        clearInterval(state.poll);
        area.innerHTML += `<div class="notice" style="margin-top:18px">${esc(err.message)}</div>`;
      }
    }, 700);
  } catch (err) {
    area.innerHTML = `<div class="notice">${esc(err.message)}</div>`;
  }
}

function renderCommunity() {
  setActive('#/community');
  document.getElementById('app').innerHTML = `<section class="panel detail-main"><div class="eyebrow">Community</div><h1>Extensions, forks, ideas.</h1><p class="hero-copy">Community editions will be listed separately from Official NemlleA releases. Every derivative must identify its parent Engine, version and author.</p><div class="notice" style="margin-top:24px">Public publishing is not enabled yet. The first official Engine is being integrated before community submissions open.</div></section>`;
}
function renderDocs() {
  setActive('#/docs');
  document.getElementById('app').innerHTML = `<section class="panel detail-main"><div class="eyebrow">Documentation</div><h1>Build on the contract.</h1><p class="hero-copy">Every official Engine ships with a mandatory identity file, versioning, API contract, extension points and deployment guidance.</p><div class="section-head"><h2>Core identifiers</h2></div><div class="code">NEMLLEA_ENGINE.json\nengine.json\n/api/v1/manifest\n/api/v1/files\n/api/v1/jobs</div></section>`;
}
function renderPrivacy() {
  document.getElementById('app').innerHTML = `<section class="panel detail-main"><div class="eyebrow">NemlleA</div><h1>Privacy</h1><p class="hero-copy">The current MVP keeps Engine API credentials server-side. A full legal Privacy Policy should be finalized before public launch.</p></section>`;
}
function renderDeveloper() {
  document.getElementById('app').innerHTML = `<section class="panel detail-main"><div class="eyebrow">Developer rules</div><h1>Engine authorship</h1><p class="hero-copy">Every Engine release must include NEMLLEA_ENGINE.json with permanent identity, version, provenance and integration information.</p></section>`;
}
function showModal(title, body) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal"><button class="modal-close" aria-label="Закрыть">×</button><h3>${esc(title)}</h3><div class="hero-copy">${body}</div></div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('.modal-close').onclick = () => wrap.remove();
  wrap.onclick = e => { if (e.target === wrap) wrap.remove(); };
}

function route() {
  const parts = decodeURIComponent(location.hash.replace(/^#\//,'')).split('/');
  const page = parts[0] || 'engines';
  if (page === 'home') return renderHome();
  if (page === 'engines') return renderEngines();
  if (page === 'engine') return renderEngine(parts[1]);
  if (page === 'try') return renderTry();
  if (page === 'community') return renderCommunity();
  if (page === 'docs') return renderDocs();
  if (page === 'privacy') return renderPrivacy();
  if (page === 'developer') return renderDeveloper();
  return renderEngines();
}

document.getElementById('searchBtn').onclick = () => {
  if (!location.hash || location.hash === '#/engines' || location.hash === '#/home') {
    const input = document.getElementById('engineSearch');
    input?.focus();
    input?.scrollIntoView({behavior:'smooth', block:'center'});
  } else {
    location.hash = '/engines';
  }
};
document.getElementById('notifyBtn').onclick = () => showModal('Уведомления', 'Сейчас новых уведомлений нет.');
document.getElementById('profileBtn').onclick = () => showModal('Профиль', 'Профильный раздел пока находится в режиме MVP.');
document.getElementById('settingsBtn').onclick = () => showModal('Settings', 'Настройки интерфейса будут подключены на следующем этапе.');
document.getElementById('helpBtn').onclick = () => showModal('Help', 'Перетащите мышью 3D-логотип в верхней части страницы, чтобы его вращать. Двойной клик вернёт начальный угол.');
window.addEventListener('hashchange', route);
route();
