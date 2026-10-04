const state = { catalog: [], poll: null, raf: null };
const $ = (s, r = document) => r.querySelector(s);
const app = () => $('#app');

/* ---------- icons ---------- */
const I = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
  engines: '<path d="M12 2.5 20 7v10l-8 4.5L4 17V7z"/><path d="M12 8l4 2.3v4.4L12 17l-4-2.3v-4.4z"/>',
  python: '<path d="M12 3c-3.5 0-4 1.5-4 3v2h4v1H6c-2 0-3 1.5-3 4s1 4 3 4h2v-2.5c0-1.5 1.2-2.5 3-2.5h3c1.5 0 2-1 2-2V6c0-1.5-1.5-3-4-3z"/><path d="M12 21c3.5 0 4-1.5 4-3v-2h-4v-1h6c2 0 3-1.5 3-4s-1-4-3-4h-2"/>',
  ram: '<rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M7 11v2M11 11v2M15 11v2M7 17v3M12 17v3M17 17v3"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  storage: '<rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/><path d="M8 7.5h.01M8 16.5h.01"/>'
};
const ico = (n, c = '') => `<svg class="ic ${c}" viewBox="0 0 24 24">${I[n]}</svg>`;
document.querySelectorAll('svg.ic[data-i]').forEach(s => { s.setAttribute('viewBox', '0 0 24 24'); s.innerHTML = I[s.dataset.i]; });

/* ---------- helpers ---------- */
async function api(url, o = {}) {
  const r = await fetch(url, o), t = await r.text();
  let d = {}; try { d = t ? JSON.parse(t) : {}; } catch { d = { detail: t }; }
  if (!r.ok) throw new Error(d.detail || `Ошибка запроса (${r.status})`);
  return d;
}
const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const settings = (() => { try { return { autoRotate: false, ...JSON.parse(localStorage.getItem('nem.settings') || '{}') }; } catch { return { autoRotate: false }; } })();
const saveSettings = () => { try { localStorage.setItem('nem.settings', JSON.stringify(settings)); } catch {} };

function setActive(h) {
  document.querySelectorAll('.nav a,.sidebar a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === h));
}
async function loadCatalog() {
  if (!state.catalog.length) state.catalog = (await api('/api/catalog')).engines || [];
  return state.catalog;
}
const page = (eyebrow, title, lead, body = '') => `<div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}${body}`;

/* ---------- 3D logo: drag to rotate ---------- */
function mountLogo(stage) {
  if (!stage) return;
  const orbit = $('.logo-orbit', stage), hint = $('.logo-hint', stage);
  const N = 20, GAP = 1.5;
  orbit.innerHTML = Array.from({ length: N }, (_, i) => {
    const k = i / (N - 1), front = i === N - 1;
    return `<img src="/logo.svg" alt="" draggable="false" class="${front ? 'front' : ''}" style="transform:translateZ(${((k - .5) * N * GAP).toFixed(1)}px);filter:brightness(${(.3 + .7 * k).toFixed(2)})${front ? ' drop-shadow(0 0 22px rgba(50,130,220,.35))' : ''}">`;
  }).join('');
  const HOME = { x: -8, y: -24 };
  let rx = HOME.x, ry = HOME.y, vx = 0, vy = 0, drag = false, px = 0, py = 0;
  const draw = () => { orbit.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`; };
  draw();

  stage.addEventListener('pointerdown', e => {
    drag = true; px = e.clientX; py = e.clientY; vx = vy = 0;
    stage.classList.add('dragging'); stage.setPointerCapture(e.pointerId);
    if (hint) hint.style.opacity = 0;
  });
  stage.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - px, dy = e.clientY - py; px = e.clientX; py = e.clientY;
    vy = dx * .45; vx = -dy * .45;
    ry += vy; rx = Math.max(-80, Math.min(80, rx + vx)); draw();
  });
  const end = e => { if (!drag) return; drag = false; stage.classList.remove('dragging'); try { stage.releasePointerCapture(e.pointerId); } catch {} };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('dblclick', () => { rx = HOME.x; ry = HOME.y; vx = vy = 0; draw(); });

  cancelAnimationFrame(state.raf);
  const tick = () => {
    if (!stage.isConnected) return;
    if (!drag) {
      if (Math.abs(vx) > .01 || Math.abs(vy) > .01) { ry += vy; rx = Math.max(-80, Math.min(80, rx + vx)); vx *= .94; vy *= .94; draw(); }
      else if (settings.autoRotate) { ry += .25; draw(); }
    }
    state.raf = requestAnimationFrame(tick);
  };
  tick();
}

/* ---------- Engines (main) ---------- */
function engineCard(e) {
  const search = [e.name, e.engineId, e.version, e.status, ...(e.formats || [])].join(' ').toLowerCase();
  return `<article class="engine-card" data-card data-search="${esc(search)}">
    <div class="engine-main">
      <div class="engine-icon">${ico('file')}</div>
      <div class="engine-title"><h3>${esc(e.name)}</h3>
        <p>Анализ, проверка, извлечение, исправление и конвертация документов.</p>
        <div class="tag-row">${(e.formats || []).map(f => `<span class="tag">${esc(f === 'Markdown' ? 'MD' : f)}</span>`).join('')}</div></div>
    </div>
    <div class="engine-meta">
      <div><div class="meta-label">NemlleA Engine ID</div><div class="meta-value">${esc(e.engineId)}</div></div>
      <div><div class="meta-label">Serial Number</div><div class="meta-value">${esc(e.serial)}</div></div>
      <div><div class="meta-label">Version</div><div class="ver"><span class="meta-value">${esc(e.version)}</span><span class="pill">${esc(e.status || 'Official')}</span></div></div>
    </div>
    <div class="engine-specs">
      <div class="spec">${ico('python')}${esc((e.runtime || 'Python').split(' ')[0])}</div>
      <div class="spec">${ico('ram')}${esc(e.minimumRam || '512 MB')} + RAM</div>
      <div class="spec">${ico('cpu')}1 vCPU</div>
      <div class="spec">${ico('storage')}${esc(e.storage || '500 MB Storage')}</div>
      <a class="btn" href="#/engine/${encodeURIComponent(e.engineId)}"><span>Open Engine</span>${ico('arrow')}</a>
    </div>
  </article>`;
}

async function renderEngines() {
  const list = await loadCatalog();
  setActive('#/engines');
  app().innerHTML = `
  <section class="page-head">
    <div class="page-copy">
      <div class="eyebrow">Powered by NemlleA</div>
      <h1>Engines for Your Projects</h1>
      <p class="lead">Готовые решения для разработки. Выбирайте, подключайте и расширяйте возможности своих проектов.</p>
      <div class="searchbox">${ico('search')}<input id="engineSearch" type="search" autocomplete="off" placeholder="Поиск Engine..." aria-label="Поиск Engine"></div>
    </div>
    <div class="logo-side">
      <div class="logo-stage" id="logoStage" role="img" aria-label="3D логотип NemlleA. Зажмите мышь и потяните, чтобы вращать">
        <svg class="logo-frame" viewBox="0 0 560 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs><linearGradient id="lf1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b8fe0" stop-opacity="0"/><stop offset=".4" stop-color="#3b8fe0" stop-opacity=".8"/><stop offset="1" stop-color="#3b8fe0" stop-opacity="0"/></linearGradient>
          <linearGradient id="lf2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e0a033" stop-opacity="0"/><stop offset=".45" stop-color="#e0a033" stop-opacity=".8"/><stop offset="1" stop-color="#e0a033" stop-opacity="0"/></linearGradient>
          <radialGradient id="lg"><stop offset="0" stop-color="#1a6fd0" stop-opacity=".28"/><stop offset="1" stop-color="#1a6fd0" stop-opacity="0"/></radialGradient></defs>
          <circle cx="280" cy="175" r="170" fill="url(#lg)"/>
          <path d="M280 10 530 175 280 340 30 175Z" fill="none" stroke="rgba(100,140,180,.12)"/>
          <path d="M60 60 280 10M280 10 L530 175" stroke="url(#lf1)" fill="none"/>
          <path d="M280 10 480 70M480 70 530 175 380 300" stroke="url(#lf2)" fill="none"/>
          <path d="M30 175 150 270M380 300 280 340 150 270" stroke="url(#lf1)" fill="none"/>
        </svg>
        <div class="logo-orbit" id="logoOrbit"></div>
        <div class="logo-tag">Simple solutions<br>for complex ideas</div>
        <div class="logo-hint">Зажмите и потяните, чтобы вращать · двойной клик — сброс</div>
      </div>
    </div>
  </section>
  <div class="section-head"><h2>Official Engines <span class="count">${list.length}</span></h2><a class="more" href="#/engines">Все Engines ${ico('arrow')}</a></div>
  <section class="grid">${list.map(engineCard).join('')}</section>
  <div class="section-head"><h2>Community Engines <span class="count">0</span></h2></div>
  <section class="empty-card">
    <div class="empty-left"><div class="empty-icon">${ico('users')}</div><div><h3>Пока нет Community версий</h3><p>Когда появятся модификации, они будут отображаться здесь.</p></div></div>
    <a class="btn ghost" href="#/community"><span>Узнать больше</span>${ico('arrow')}</a>
  </section>`;
  mountLogo($('#logoStage'));
  $('#engineSearch').addEventListener('input', e => {
    const t = e.target.value.trim().toLowerCase();
    document.querySelectorAll('[data-card]').forEach(c => c.hidden = !!t && !c.dataset.search.includes(t));
  });
}

/* ---------- Dashboard ---------- */
async function renderHome() {
  setActive('#/home');
  const list = await loadCatalog();
  app().innerHTML = page('Dashboard', 'Добро пожаловать в NemlleA', 'Обзор платформы: доступные Engine, статус сервера и быстрые действия.', `
    <div class="grid g3">
      <div class="panel stat"><span>Official Engines</span><b>${list.length}</b></div>
      <div class="panel stat"><span>Community Engines</span><b>0</b></div>
      <div class="panel stat"><span>Статус сервера</span><b id="srv">…</b></div>
    </div>
    <div class="section-head"><h2>Быстрые действия</h2></div>
    <div class="grid g3">
      <a class="panel card-link" href="#/try/${encodeURIComponent(list[0]?.engineId || '')}"><h3>Обработать документ</h3><p>Загрузите файл и запустите Document Processing Engine.</p></a>
      <a class="panel card-link" href="#/engines"><h3>Каталог Engine</h3><p>Посмотрите все официальные Engine и их требования.</p></a>
      <a class="panel card-link" href="#/docs"><h3>Документация</h3><p>API, идентификация Engine и варианты хостинга.</p></a>
    </div>
    <div class="section-head"><h2>Как подключить Engine</h2></div>
    <div class="grid g3">
      <div class="panel step"><i>1</i><div><h3>Выберите</h3><p>Найдите подходящий Engine в каталоге и проверьте требования.</p></div></div>
      <div class="panel step"><i>2</i><div><h3>Подключите</h3><p>Разверните Engine и передайте его адрес серверу NemlleA.</p></div></div>
      <div class="panel step"><i>3</i><div><h3>Расширяйте</h3><p>Добавляйте адаптеры и форматы по контракту Engine.</p></div></div>
    </div>`);
  api('/health').then(() => { $('#srv').textContent = 'Online'; $('#srv').className = 'ok'; }).catch(() => { $('#srv').textContent = 'Offline'; $('#srv').className = 'bad'; });
}

/* ---------- Engine detail / try ---------- */
async function renderEngine(id) {
  const e = (await loadCatalog()).find(x => x.engineId === id) || state.catalog[0];
  setActive('#/engines');
  app().innerHTML = `<div class="grid" style="grid-template-columns:minmax(0,1.3fr) minmax(0,.7fr)">
    <section class="panel">${page('Official NemlleA Engine', esc(e.name), esc(e.shortDescription))}
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 22px"><a class="btn primary inline" href="#/try/${encodeURIComponent(e.engineId)}"><span>Try Engine</span>${ico('arrow')}</a><a class="btn inline" href="#/docs"><span>Documentation</span>${ico('arrow')}</a></div>
      <div class="kv"><div class="k">Engine ID</div><div>${esc(e.engineId)}</div></div>
      <div class="kv"><div class="k">Serial</div><div>${esc(e.serial)}</div></div>
      <div class="kv"><div class="k">Version</div><div>${esc(e.version)}</div></div>
      <div class="kv"><div class="k">Author</div><div>${esc(e.author)}</div></div>
      <div class="kv"><div class="k">Capabilities</div><div>${(e.capabilities || []).map(esc).join(', ')}</div></div>
    </section>
    <aside class="panel"><h3>Compatibility</h3>
      <div class="kv"><div class="k">Runtime</div><div>${esc(e.runtime)}</div></div>
      <div class="kv"><div class="k">Min. RAM</div><div>${esc(e.minimumRam)}</div></div>
      <div class="kv"><div class="k">Rec. RAM</div><div>${esc(e.recommendedRam)}</div></div>
      <div class="kv"><div class="k">Hosting</div><div>${(e.hosting || []).map(esc).join(', ')}</div></div>
      <div class="notice success" style="margin-top:18px">Official · готов к интеграции с платформой.</div></aside></div>`;
}

function renderTry() {
  setActive('#/engines');
  app().innerHTML = `<section class="panel">${page('Document Processing Engine', 'Обработка документа', 'Загрузите файл, выберите операцию и запустите Engine через сервер NemlleA.', `
    <div class="install"><input id="docFile" type="file" accept=".pdf,.docx,.txt,.md,.markdown,.json">
    <select id="operation"><option value="analyze">Analyze</option><option value="validate">Validate</option><option value="extract_text">Extract text</option><option value="correct_text">Correct text</option><option value="convert">Convert</option></select>
    <select id="format"><option value="">Формат по умолчанию</option><option value="txt">TXT</option><option value="md">Markdown</option><option value="json">JSON</option><option value="docx">DOCX</option><option value="pdf">PDF</option></select>
    <button class="btn primary" id="runEngine"><span>Run Engine</span>${ico('arrow')}</button></div><div id="runArea" style="margin-top:24px"></div>`)}</section>`;
  $('#runEngine').onclick = runJob;
}
async function runJob() {
  const area = $('#runArea'), f = $('#docFile').files[0];
  if (!f) { area.innerHTML = '<div class="notice">Сначала выберите документ.</div>'; return; }
  area.innerHTML = '<div class="notice success">Загрузка в Engine…</div>';
  try {
    const fd = new FormData(); fd.append('file', f);
    const up = await api('/api/engine/document/files', { method: 'POST', body: fd });
    const op = $('#operation').value, fmt = $('#format').value, body = { file_id: up.id, operation: op };
    if (fmt && op === 'convert') body.output_format = fmt;
    const job = await api('/api/engine/document/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body) });
    area.innerHTML = `<div class="notice success">Задача ${esc(job.id)} создана.<div class="progress"><span id="bar"></span></div><div id="st">Queued</div></div>`;
    clearInterval(state.poll);
    state.poll = setInterval(async () => {
      try {
        const s = await api('/api/engine/document/jobs/' + encodeURIComponent(job.id));
        $('#bar') && ($('#bar').style.width = s.progress + '%'); $('#st') && ($('#st').textContent = `${s.status} · ${s.progress}%`);
        if (['completed', 'failed', 'cancelled', 'timed_out'].includes(s.status)) {
          clearInterval(state.poll);
          area.insertAdjacentHTML('beforeend', s.status === 'completed'
            ? `<p><a class="btn primary inline" href="/api/engine/document/jobs/${encodeURIComponent(job.id)}/download"><span>Скачать результат</span>${ico('arrow')}</a></p>`
            : `<div class="notice" style="margin-top:16px">${esc(s.error_message || s.status)}</div>`);
        }
      } catch (err) { clearInterval(state.poll); area.insertAdjacentHTML('beforeend', `<div class="notice" style="margin-top:16px">${esc(err.message)}</div>`); }
    }, 700);
  } catch (err) { area.innerHTML = `<div class="notice">${esc(err.message)}</div>`; }
}

/* ---------- Community ---------- */
function renderCommunity() {
  setActive('#/community');
  app().innerHTML = page('Community', 'Расширения, форки, идеи', 'Community-версии будут отображаться отдельно от Official-релизов NemlleA.', `
    <div class="grid g3">
      <div class="panel"><h3>Форки</h3><p>Любая модификация обязана указывать родительский Engine, версию и автора.</p></div>
      <div class="panel"><h3>Расширения</h3><p>Новые адаптеры форматов и хранилищ подключаются по контракту Engine.</p></div>
      <div class="panel"><h3>Идеи</h3><p>Предлагайте улучшения для Official Engine и обсуждайте их с командой.</p></div>
    </div>
    <div class="section-head"><h2>Публикации <span class="count">0</span></h2></div>
    <section class="empty-card"><div class="empty-left"><div class="empty-icon">${ico('users')}</div><div><h3>Публикация пока закрыта</h3><p>Сначала интегрируем первый Official Engine, затем откроем приём Community-версий.</p></div></div>
    <button class="btn ghost" disabled><span>Опубликовать Engine</span></button></section>`);
}

/* ---------- Docs ---------- */
function renderDocs() {
  setActive('#/docs');
  const ep = [['GET', '/api/catalog', 'Каталог Engine'], ['GET', '/api/engine/document/manifest', 'Манифест Engine'], ['POST', '/api/engine/document/files', 'Загрузка файла'], ['POST', '/api/engine/document/jobs', 'Создание задачи'], ['GET', '/api/engine/document/jobs/{id}', 'Статус задачи'], ['GET', '/api/engine/document/jobs/{id}/download', 'Скачивание результата'], ['GET', '/health', 'Проверка сервера']];
  app().innerHTML = `<div class="eyebrow">Documentation</div><h1>Документация</h1><p class="lead">Всё, что нужно, чтобы подключить Engine и работать с его API.</p>
  <div class="docs"><nav class="toc"><a href="#/docs" data-s="start">Быстрый старт</a><a href="#/docs" data-s="id">Идентификация</a><a href="#/docs" data-s="api">API</a><a href="#/docs" data-s="host">Хостинг</a></nav>
  <div class="doc">
    <h2 id="start">Быстрый старт</h2><p>Загрузите файл, создайте задачу и скачайте результат.</p>
    <pre>curl -F "file=@report.pdf" /api/engine/document/files
curl -X POST /api/engine/document/jobs \\
  -H "Content-Type: application/json" \\
  -d '{"file_id":"&lt;id&gt;","operation":"analyze"}'</pre>
    <h2 id="id">Идентификация Engine</h2><p>Каждый официальный Engine содержит файл с постоянной идентичностью, версией и сведениями о происхождении.</p><pre>NEMLLEA_ENGINE.json
engine.json</pre>
    <h2 id="api">API</h2><table><tr><th>Запрос</th><th>Описание</th></tr>${ep.map(r => `<tr><td><span class="m">${r[0]}</span>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</table>
    <h2 id="host">Хостинг</h2><p>Engine работает на Render, Railway, Docker, Linux VM и Kubernetes. Минимум: 512 MB RAM, 1 vCPU, Python 3.11+.</p>
  </div></div>`;
  document.querySelectorAll('.toc a').forEach(a => a.onclick = e => { e.preventDefault(); document.getElementById(a.dataset.s).scrollIntoView({ behavior: 'smooth' }); });
}

/* ---------- Legal ---------- */
const legal = {
  privacy: ['Privacy', 'Конфиденциальность', 'В текущей версии ключи доступа к Engine хранятся только на сервере. Загруженные файлы используются только для выполнения вашей задачи. Полная политика будет опубликована до публичного запуска.'],
  terms: ['Terms', 'Условия использования', 'Каждый релиз Engine должен содержать NEMLLEA_ENGINE.json с постоянной идентичностью, версией и происхождением. Производные версии указывают родительский Engine и автора.'],
  contact: ['Contact', 'Контакты', 'Вопросы по платформе и Engine присылайте команде NemlleA. Контактные данные появятся здесь после публичного запуска.']
};
function renderLegal(k) { setActive(''); const l = legal[k]; app().innerHTML = `<section class="panel">${page(l[0], l[1], l[2])}</section>`; }

/* ---------- modals ---------- */
function modal(title, html) {
  const w = document.createElement('div'); w.className = 'modal-bg';
  w.innerHTML = `<div class="modal" role="dialog" aria-label="${esc(title)}"><button class="modal-x" aria-label="Закрыть">×</button><h3>${esc(title)}</h3>${html}</div>`;
  document.body.appendChild(w);
  const close = () => { w.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  w.onclick = e => e.target === w && close(); $('.modal-x', w).onclick = close;
  return w;
}
$('#notifyBtn').onclick = () => modal('Уведомления', '<p>Новых уведомлений нет.</p>');
$('#profileBtn').onclick = () => modal('Профиль', '<p>Вход и профиль появятся в следующей версии.</p>');
$('#helpBtn').onclick = () => modal('Help', '<p>Зажмите 3D-логотип на странице Engines и потяните мышкой, чтобы повернуть его. Двойной клик возвращает исходный угол.</p>');
$('#settingsBtn').onclick = () => {
  const w = modal('Settings', `<label class="toggle"><span>Автовращение логотипа<small>Логотип медленно вращается сам</small></span><input type="checkbox" id="optRot" ${settings.autoRotate ? 'checked' : ''}></label>`);
  $('#optRot', w).onchange = e => { settings.autoRotate = e.target.checked; saveSettings(); };
};
$('#searchBtn').onclick = () => {
  if (location.hash && location.hash !== '#/engines') { location.hash = '/engines'; setTimeout(() => $('#engineSearch')?.focus(), 150); }
  else $('#engineSearch')?.focus();
};

/* ---------- router ---------- */
function route() {
  clearInterval(state.poll);
  const [p, arg] = decodeURIComponent(location.hash.replace(/^#\//, '')).split('/');
  const r = { home: renderHome, engines: renderEngines, engine: () => renderEngine(arg), try: renderTry, community: renderCommunity, docs: renderDocs }[p];
  window.scrollTo(0, 0);
  if (r) return r();
  if (legal[p]) return renderLegal(p);
  return renderEngines();
}
addEventListener('hashchange', route);
route();
