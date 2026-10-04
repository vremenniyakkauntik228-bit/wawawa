const state = { catalog: [], manifest: null, poll: null };

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
}

function engineCard(e) {
  return `<article class="panel engine-card">
    <div class="engine-head">
      <div class="engine-icon" aria-hidden="true">▣</div>
      <div class="engine-title">
        <h3>${esc(e.name)}</h3>
        <div class="meta">${esc(e.engineId)} · v${esc(e.version)}</div>
      </div>
      <button class="book" title="Open community versions" data-community="${esc(e.engineId)}" aria-label="Community versions">🖲️</button>
    </div>
    <div><span class="badge official">Official</span></div>
    <div class="engine-desc">${esc(e.shortDescription)}</div>
    <div class="engine-tags">${(e.formats || []).map(f=>`<span class="tag">${esc(f)}</span>`).join('')}</div>
    <div class="card-actions"><span class="meta">${esc(e.author)}</span><a class="small-btn" href="#/engine/${encodeURIComponent(e.engineId)}">Open ↗</a></div>
  </article>`;
}

async function loadCatalog() {
  if (state.catalog.length) return state.catalog;
  const data = await api('/api/catalog');
  state.catalog = data.engines;
  return state.catalog;
}

async function renderHome() {
  const engines = await loadCatalog();
  setActive('#/home');
  document.getElementById('app').innerHTML = `
    <section class="hero">
      <div class="hero-main">
        <div class="hero-badge">NEMLLEA · ENGINE PLATFORM</div>
        <h1>Build on<br><span>solid engines.</span></h1>
        <p class="hero-copy">A strict, modular catalog of backend engines designed to plug into real products. Install a ready capability, keep your own interface, and expand without rebuilding the core.</p>
        <div class="hero-actions">
          <a class="primary-btn" href="#/engines">Explore Engines</a>
          <a class="ghost-btn" href="#/engine/DOC-ENAKS-272">Open Document Engine</a>
        </div>
      </div>
      <div class="hero-stats" aria-label="Platform status">
        <div class="stat"><small>Official Engines</small><strong>${engines.length}</strong></div>
        <div class="stat"><small>Engine Contract</small><strong>v1</strong></div>
        <div class="stat"><small>Community</small><strong>Ready</strong></div>
      </div>
    </section>
    <div class="section-head"><div><h2>Official Engines</h2><p>Built by NemlleA. Designed for integration.</p></div><a class="small-btn" href="#/community">🖲️ Community ↗</a></div>
    <section class="engine-grid">${engines.map(engineCard).join('')}</section>
  `;
  wireCommunityButtons();
}

async function renderEngines() {
  const engines = await loadCatalog();
  setActive('#/engines');
  document.getElementById('app').innerHTML = `
    <div class="section-head"><div><h2>Engines</h2><p>Official NemlleA releases with stable identity, versioning and extension points.</p></div></div>
    <section class="engine-grid">${engines.map(engineCard).join('')}</section>`;
  wireCommunityButtons();
}

async function renderEngine(id) {
  const engines = await loadCatalog();
  const e = engines.find(x => x.engineId === id) || engines[0];
  setActive('#/engines');
  document.getElementById('app').innerHTML = `
    <section class="detail">
      <div class="panel detail-main">
        <div class="hero-badge">OFFICIAL NEMLLEA ENGINE</div>
        <h1>${esc(e.name)}</h1>
        <p class="hero-copy">${esc(e.shortDescription)}</p>
        <div class="hero-actions"><a class="primary-btn" href="#/try/${encodeURIComponent(e.engineId)}">Try Engine</a><a class="ghost-btn" href="#/community">🖲️ Community</a></div>
        <div class="section-head"><div><h2>Identity</h2><p>Permanent model identity stays stable across releases.</p></div></div>
        <div class="kv"><div class="k">Engine ID</div><div class="code">${esc(e.engineId)}</div></div>
        <div class="kv"><div class="k">Serial</div><div class="code">${esc(e.serial)}</div></div>
        <div class="kv"><div class="k">Version</div><div>${esc(e.version)}</div></div>
        <div class="kv"><div class="k">Author</div><div>${esc(e.author)}</div></div>
      </div>
      <aside class="panel detail-side">
        <h3>Compatibility</h3>
        <div class="kv"><div class="k">Runtime</div><div>${esc(e.runtime)}</div></div>
        <div class="kv"><div class="k">Minimum RAM</div><div>${esc(e.minimumRam)}</div></div>
        <div class="kv"><div class="k">Recommended RAM</div><div>${esc(e.recommendedRam)}</div></div>
        <div class="kv"><div class="k">Hosting</div><div>${(e.hosting || []).map(x=>esc(x)).join(', ')}</div></div>
        <div class="notice success" style="margin-top:22px">Official · Ready for platform integration.</div>
      </aside>
    </section>
  `;
}

async function renderTry() {
  setActive('#/engines');
  document.getElementById('app').innerHTML = `
    <section class="panel detail-main">
      <div class="hero-badge">DOCUMENT PROCESSING ENGINE</div>
      <h1>Run a real Engine job.</h1>
      <p class="hero-copy">Upload a small document, choose an operation and call the standalone Engine through the NemlleA server connector.</p>
      <div class="install">
        <input id="docFile" type="file" accept=".pdf,.docx,.txt,.md,.markdown,.json" />
        <select id="operation"><option value="analyze">Analyze</option><option value="validate">Validate</option><option value="extract_text">Extract text</option><option value="correct_text">Correct text</option><option value="convert">Convert</option></select>
        <select id="format"><option value="">Use default format</option><option value="txt">TXT</option><option value="md">Markdown</option><option value="json">JSON</option><option value="docx">DOCX</option><option value="pdf">PDF</option></select>
        <button class="primary-btn" id="runEngine">Run Engine</button>
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
          if (s.status === 'completed') area.innerHTML += `<div style="margin-top:18px"><a class="primary-btn" href="/api/engine/document/jobs/${encodeURIComponent(job.id)}/download">Download result</a></div>`;
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
  document.getElementById('app').innerHTML = `<section class="panel detail-main"><div class="hero-badge">🖲️ COMMUNITY</div><h1>Extensions, forks, ideas.</h1><p class="hero-copy">Community editions will be listed separately from Official NemlleA releases. Every derivative must identify its parent Engine, version and author.</p><div class="notice" style="margin-top:26px">Public publishing is not enabled yet. The first official Engine is being integrated before community submissions open.</div></section>`;
}
function renderDocs() {
  setActive('#/docs');
  document.getElementById('app').innerHTML = `<section class="panel detail-main"><div class="hero-badge">DOCUMENTATION</div><h1>Build on the contract.</h1><p class="hero-copy">Every official Engine ships with a mandatory identity file, versioning, API contract, extension points and deployment guidance.</p><div class="section-head"><div><h2>Core identifiers</h2><p>Engine ID · Serial · Version · SHA-256</p></div></div><div class="code">NEMLLEA_ENGINE.json\nengine.json\n/api/v1/manifest\n/api/v1/files\n/api/v1/jobs</div></section>`;
}
function renderPrivacy() {
  document.getElementById('app').innerHTML = `<section class="panel detail-main"><div class="hero-badge">NEMLLEA</div><h1>Privacy</h1><p class="hero-copy">The current MVP keeps Engine API credentials server-side. A full legal Privacy Policy should be finalized before public launch. Do not upload sensitive documents to an early deployment unless you trust its storage and retention settings.</p></section>`;
}
function renderDeveloper() {
  document.getElementById('app').innerHTML = `<section class="panel detail-main"><div class="hero-badge">DEVELOPER RULES</div><h1>Engine authorship</h1><p class="hero-copy">Every Engine release must include <span class="code">NEMLLEA_ENGINE.json</span> with permanent identity, version, provenance and integration information. Community forks must identify their parent Engine and must not present themselves as official NemlleA releases.</p></section>`;
}
function wireCommunityButtons() {
  document.querySelectorAll('[data-community]').forEach(b => b.onclick = () => location.hash = '/community');
}
function showModal(title, body) {
  const wrap = document.createElement('div');
  wrap.className='modal-backdrop';
  wrap.innerHTML=`<div class="modal"><button class="modal-close" aria-label="Close">×</button><h3>${esc(title)}</h3><div class="hero-copy">${body}</div></div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('.modal-close').onclick=()=>wrap.remove();
  wrap.onclick=e=>{ if(e.target===wrap) wrap.remove(); };
}
function route() {
  const parts = decodeURIComponent(location.hash.replace(/^#\//,'')).split('/');
  const page = parts[0] || 'home';
  if (page==='home') return renderHome();
  if (page==='engines') return renderEngines();
  if (page==='engine') return renderEngine(parts[1]);
  if (page==='try') return renderTry();
  if (page==='community') return renderCommunity();
  if (page==='docs') return renderDocs();
  if (page==='privacy') return renderPrivacy();
  if (page==='developer') return renderDeveloper();
  return renderHome();
}

document.getElementById('privacyBtn').onclick = () => showModal('Privacy', 'Full legal terms are being prepared for public launch. Engine API credentials stay on the server connector rather than in browser code.');
document.getElementById('developerBtn').onclick = () => location.hash='/developer';
window.addEventListener('hashchange', route);
route();
