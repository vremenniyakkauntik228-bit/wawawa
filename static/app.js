const state = { catalog: [], manifest: null, poll: null };

async function api(url, options = {}) {
  const r = await fetch(url, options);
  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { detail: text }; }
  if (!r.ok) throw new Error(data.detail || `Request failed (${r.status})`);
  return data;
}

function esc(s) { return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;'}[c])); }
function engineCard(e) {
  return `<article class="panel engine-card">
    <div class="engine-head">
      <div class="engine-icon">▦</div>
      <div class="engine-title"><h3>${esc(e.name)}</h3><div class="meta">${esc(e.engineId)} · v${esc(e.version)}</div></div>
      <button class="book" title="Community versions" data-community="${esc(e.engineId)}">▱</button>
    </div>
    <div><span class="badge official">● ${esc(e.status)}</span></div>
    <div class="engine-desc">${esc(e.shortDescription)}</div>
    <div class="engine-tags">${e.formats.map(f=>`<span class="tag">${esc(f)}</span>`).join('')}</div>
    <div class="card-actions"><span class="meta">${esc(e.author)}</span><a class="small-btn" href="#/engine/${encodeURIComponent(e.engineId)}">Open</a></div>
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
  document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('active'));
  document.querySelector('a[href="#/home"]').classList.add('active');
  document.getElementById('app').innerHTML = `
    <section class="hero">
      <div class="hero-main">
        <div class="eyebrow">NemlleA Engine Platform</div>
        <h1>Build with engines.<br>Not from scratch.</h1>
        <p class="hero-copy">A serious developer platform for installing reusable engines into real projects. Start with the official Document Processing Engine, then expand into community extensions and new NemlleA modules.</p>
        <div class="hero-actions">
          <a class="primary-btn" href="#/engines">Explore Engines</a>
          <a class="ghost-btn" href="#/engine/DOC-ENAKS-272">Open Document Engine</a>
        </div>
      </div>
      <div class="hero-stats">
        <div class="panel stat"><small>Official Engines</small><strong>${engines.length}</strong></div>
        <div class="panel stat"><small>Platform Contract</small><strong>v1</strong></div>
        <div class="panel stat"><small>Community</small><strong>Ready</strong></div>
      </div>
    </section>
    <div class="section-head"><div><h2>Official Engines</h2><p>Built by NemlleA, designed to plug into other products.</p></div><a class="small-btn" href="#/community">Community ↗</a></div>
    <section class="engine-grid">${engines.map(engineCard).join('')}</section>
  `;
  wireCommunityButtons();
}

async function renderEngines() {
  const engines = await loadCatalog();
  document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('active'));
  document.querySelector('a[href="#/engines"]').classList.add('active');
  document.getElementById('app').innerHTML = `<div class="section-head"><div><h2>Engines</h2><p>Official NemlleA releases. Each has a stable Engine ID and serial family.</p></div></div><section class="engine-grid">${engines.map(engineCard).join('')}</section>`;
  wireCommunityButtons();
}

async function renderEngine(id) {
  const engines = await loadCatalog();
  const e = engines.find(x => x.engineId === id) || engines[0];
  document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('active'));
  document.querySelector('a[href="#/engines"]').classList.add('active');
  document.getElementById('app').innerHTML = `
    <section class="detail">
      <div class="panel detail-main">
        <div class="eyebrow">Official NemlleA Engine</div>
        <h1>${esc(e.name)}</h1>
        <p class="hero-copy">${esc(e.shortDescription)}</p>
        <div class="hero-actions"><a class="primary-btn" href="#/try/${encodeURIComponent(e.engineId)}">Try Engine</a><a class="ghost-btn" href="#/community">📖 Community</a></div>
        <div class="section-head"><div><h2>Identity</h2><p>Permanent model identity stays stable across future versions.</p></div></div>
        <div class="kv"><div class="k">Engine ID</div><div class="code">${esc(e.engineId)}</div></div>
        <div class="kv"><div class="k">Serial</div><div class="code">${esc(e.serial)}</div></div>
        <div class="kv"><div class="k">Version</div><div>${esc(e.version)}</div></div>
        <div class="kv"><div class="k">Author</div><div>${esc(e.author)}</div></div>
      </div>
      <aside class="panel detail-side">
        <h3>Compatibility</h3>
        <div class="kv"><div class="k">Runtime</div><div>${esc(e.runtime)}</div></div>
        <div class="kv"><div class="k">Min RAM</div><div>${esc(e.minimumRam)}</div></div>
        <div class="kv"><div class="k">Recommended</div><div>${esc(e.recommendedRam)}</div></div>
        <div class="kv"><div class="k">Hosting</div><div>${e.hosting.map(x=>esc(x)).join(', ')}</div></div>
        <div class="notice success" style="margin-top:16px">Official status · Ready for platform integration.</div>
      </aside>
    </section>
  `;
}

async function renderTry() {
  document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('active'));
  document.querySelector('a[href="#/engines"]').classList.add('active');
  document.getElementById('app').innerHTML = `
    <section class="panel" style="padding:28px">
      <div class="eyebrow">Document Processing Engine</div>
      <h2 style="font-size:34px;margin:10px 0">Try the real Engine</h2>
      <p class="hero-copy">Upload a small document, choose an operation, and the NemlleA web interface will call the standalone Engine through the server connector.</p>
      <div class="install">
        <input id="docFile" type="file" accept=".pdf,.docx,.txt,.md,.markdown,.json" />
        <select id="operation"><option value="analyze">Analyze</option><option value="validate">Validate</option><option value="extract_text">Extract text</option><option value="correct_text">Correct text</option><option value="convert">Convert</option></select>
        <select id="format"><option value="">Use default format</option><option value="txt">TXT</option><option value="md">Markdown</option><option value="json">JSON</option><option value="docx">DOCX</option><option value="pdf">PDF</option></select>
        <button class="primary-btn" id="runEngine">Run Engine</button>
      </div>
      <div id="runArea" style="margin-top:20px"></div>
    </section>`;
  document.getElementById('runEngine').onclick = runDocumentEngine;
}

async function runDocumentEngine() {
  const area = document.getElementById('runArea');
  const fileInput = document.getElementById('docFile');
  if (!fileInput.files[0]) { area.innerHTML = '<div class="notice">Choose a document first.</div>'; return; }
  area.innerHTML = '<div class="notice">Uploading to Engine…</div>';
  try {
    const fd = new FormData(); fd.append('file', fileInput.files[0]);
    const uploaded = await api('/api/engine/document/files', { method:'POST', body:fd });
    const operation = document.getElementById('operation').value;
    const format = document.getElementById('format').value;
    const payload = { file_id: uploaded.id, operation };
    if (format && operation === 'convert') payload.output_format = format;
    if (format && operation !== 'analyze' && operation !== 'validate') payload.output_format = format;
    const job = await api('/api/engine/document/jobs', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    area.innerHTML = `<div class="notice success">Job ${esc(job.id)} created.<div class="progress-wrap"><div class="progress"><span id="bar"></span></div></div><div id="statusText">Queued</div></div>`;
    clearInterval(state.poll);
    state.poll = setInterval(async () => {
      try {
        const s = await api('/api/engine/document/jobs/' + encodeURIComponent(job.id));
        const bar = document.getElementById('bar'); if (bar) bar.style.width = `${s.progress}%`;
        const st = document.getElementById('statusText'); if (st) st.textContent = `${s.status} · ${s.progress}%`;
        if (['completed','failed','cancelled','timed_out'].includes(s.status)) {
          clearInterval(state.poll);
          if (s.status === 'completed') {
            area.innerHTML += `<div style="margin-top:14px"><a class="primary-btn" href="/api/engine/document/jobs/${encodeURIComponent(job.id)}/download">Download result</a></div>`;
          } else if (s.status !== 'cancelled') {
            area.innerHTML += `<div class="notice" style="margin-top:14px">${esc(s.error_message || s.status)}</div>`;
          }
        }
      } catch (err) {
        clearInterval(state.poll); area.innerHTML += `<div class="notice" style="margin-top:14px">${esc(err.message)}</div>`;
      }
    }, 700);
  } catch (err) {
    area.innerHTML = `<div class="notice">${esc(err.message)}</div>`;
  }
}

function renderCommunity() {
  document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('active'));
  document.querySelector('a[href="#/community"]').classList.add('active');
  document.getElementById('app').innerHTML = `<section class="panel" style="padding:30px"><div class="eyebrow">Community</div><h2 style="font-size:34px">Extensions & forks</h2><p class="hero-copy">This is the catalog layer for derivative Engine builds. Official NemlleA Engines remain clearly separated from Community releases.</p><div class="notice" style="margin-top:18px">Community publishing is intentionally visible but not enabled yet. The first official Engine is being integrated before opening public submissions.</div></section>`;
}
function renderDocs() {
  document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('active'));
  document.querySelector('a[href="#/docs"]').classList.add('active');
  document.getElementById('app').innerHTML = `<section class="panel" style="padding:30px"><div class="eyebrow">Documentation</div><h2 style="font-size:34px">Build on NemlleA</h2><p class="hero-copy">Every official Engine ships with a manifest, API contract, extension points and deployment guidance. The Document Engine is API-first and frontend-independent.</p><div class="section-head"><div><h2>Core concepts</h2><p>Engine ID · Serial · Version · API · Jobs · Webhooks · Adapters</p></div></div><div class="code">NEMLLEA_ENGINE.json\nengine.json\n/api/v1/manifest\n/api/v1/jobs\n/api/v1/files</div></section>`;
}
function renderPrivacy() {
  document.getElementById('app').innerHTML = `<section class="panel" style="padding:30px"><div class="eyebrow">NemlleA</div><h2>Privacy</h2><p class="hero-copy">The public interface is designed to keep Engine API keys server-side. A full legal privacy policy will be finalized before public launch. Do not upload sensitive documents to an early deployment unless you trust its storage and retention configuration.</p></section>`;
}
function renderDeveloper() {
  document.getElementById('app').innerHTML = `<section class="panel" style="padding:30px"><div class="eyebrow">Developer rules</div><h2>Engine authorship</h2><p class="hero-copy">Every Engine release must contain NEMLLEA_ENGINE.json with permanent identity, version, provenance and integration information. Community forks must identify their parent Engine and must not present themselves as official NemlleA releases.</p></section>`;
}
function wireCommunityButtons() { document.querySelectorAll('[data-community]').forEach(b => b.onclick = () => location.hash = '/community'); }
function showModal(title, body) { const wrap = document.createElement('div'); wrap.className='modal-backdrop'; wrap.innerHTML=`<div class="modal"><button class="modal-close">×</button><h3>${esc(title)}</h3><div class="hero-copy">${body}</div></div>`; document.body.appendChild(wrap); wrap.querySelector('.modal-close').onclick=()=>wrap.remove(); wrap.onclick=e=>{ if(e.target===wrap) wrap.remove(); }; }
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

document.getElementById('privacyBtn').onclick = () => showModal('Privacy', 'Full legal privacy terms are being prepared for the public launch. The Engine connector keeps API credentials on the server rather than in browser code.');
document.getElementById('developerBtn').onclick = () => location.hash='/developer';
window.addEventListener('hashchange', route);
route();
