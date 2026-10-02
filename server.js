const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const MAX_ROOMS = 500;
const MAX_PLAYERS = 24;
const EMPTY_ROOM_TTL = 30_000;
const DISCONNECT_TTL = 45_000;
const CODE_RE = /^[A-Z2-9]{6}$/;
const HEX_RE = /^#[0-9a-f]{3,8}$/i;
const JOINT_KEYS = ['head', 'leftShoulder', 'rightShoulder', 'leftHand', 'rightHand', 'leftHip', 'rightHip', 'leftFoot', 'rightFoot'];
const DEFAULT_COLORS = ['#a7f3d0', '#7dd3fc', '#f8fafc'];
const SHAPE_RE = /^(classic|soft|sharp|void|bubble|rose|side|minimal|custom)$/;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 120_000 });
const rooms = new Map();

// Render проксирует соединения: keep-alive сервера должен быть дольше, чем у прокси.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), xr-spatial-tracking=(self), microphone=()');
  next();
});
app.use(express.json({ limit: '120kb' }));
app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  setHeaders: res => res.setHeader('Cache-Control', 'no-cache')
}));

/* ---------- утилиты ---------- */

const num = (v, min, max, d = 0) => {
  v = Number(v);
  return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : d;
};
const normCode = v => String(v || '').trim().toUpperCase();
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += alphabet[crypto.randomInt(alphabet.length)];
    if (!rooms.has(code)) return code;
  }
  return null;
}

function safeName(value, fallback = 'Игрок') {
  const name = String(value || '').replace(/[<>]/g, '').trim();
  return name.slice(0, 24) || fallback;
}

function sanitizeSkin(skin) {
  if (!skin || typeof skin !== 'object') return { id: 'mint', name: 'Mint', colors: [...DEFAULT_COLORS], joints: {} };
  const colors = (Array.isArray(skin.colors) ? skin.colors : []).slice(0, 3)
    .map((v, i) => (HEX_RE.test(String(v)) ? String(v) : DEFAULT_COLORS[i]));
  while (colors.length < 3) colors.push(DEFAULT_COLORS[colors.length]);
  const joints = {};
  if (skin.joints && typeof skin.joints === 'object') {
    for (const key of JOINT_KEYS) {
      const j = skin.joints[key];
      if (j && typeof j === 'object') joints[key] = { x: num(j.x, 0, 1, 0.5), y: num(j.y, 0, 1, 0.5) };
    }
  }
  const out = {
    id: String(skin.id || 'custom').replace(/[^\w-]/g, '').slice(0, 40) || 'custom',
    name: safeName(skin.name, 'Skin').slice(0, 24),
    shape: SHAPE_RE.test(String(skin.shape || '')) ? String(skin.shape) : 'classic',
    colors,
    joints
  };
  if (typeof skin.drawn === 'string' && skin.drawn.length <= 80_000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(skin.drawn)) {
    out.drawn = skin.drawn;
  }
  return out;
}

const point = (p, lim = 400) => (p && typeof p === 'object' ? { x: num(p.x, -lim, lim), y: num(p.y, -lim, lim) } : null);

function sanitizeMotion(message) {
  const src = message.payload && typeof message.payload === 'object' ? message.payload : message;
  const out = { t: Date.now() };
  if (Array.isArray(src.landmarks)) {
    out.landmarks = src.landmarks.slice(0, 33).map(p => (p && typeof p === 'object'
      ? { x: num(p.x, -2, 3), y: num(p.y, -2, 3), z: num(p.z, -5, 5), v: num(p.v ?? p.visibility ?? 1, 0, 1) }
      : { x: 0.5, y: 0.5, z: 0, v: 0 }));
  }
  if (src.x !== undefined) out.x = num(src.x, -1000, 1000);
  const head = point(src.head), left = point(src.left), right = point(src.right);
  if (head) out.head = head;
  if (left) out.left = left;
  if (right) out.right = right;
  if (src.yaw !== undefined) out.yaw = num(src.yaw, -1, 1);
  if (src.headYaw !== undefined) out.headYaw = num(src.headYaw, -1, 1);
  if (src.headPitch !== undefined) out.headPitch = num(src.headPitch, -1, 1);
  const gaze = point(src.gaze, 1);
  if (gaze) out.gaze = { x: num(gaze.x, -1, 1), y: num(gaze.y, -1, 1) };
  if (src.jump !== undefined) out.jump = num(src.jump, 0, 1);
  if (src.move !== undefined) out.move = num(src.move, -2, 2);
  if (typeof src.eyeColor === 'string' && HEX_RE.test(src.eyeColor)) out.eyeColor = src.eyeColor;
  if (src.visible !== undefined) out.visible = Boolean(src.visible);
  return out.landmarks || out.x !== undefined || head || left || right || gaze || src.visible !== undefined ? out : null;
}

const publicPlayer = ({ id, name, role, skin }) => ({ id, name, role, skin });
const roomState = room => [...room.players.values()].map(publicPlayer);

function broadcast(room, message, exceptId = null) {
  const payload = JSON.stringify(message);
  for (const player of room.players.values()) {
    if (player.id === exceptId) continue;
    if (player.socket?.readyState === 1) player.socket.send(payload);
  }
}

function touchRoom(room) {
  room.emptySince = room.players.size === 0 ? Date.now() : null;
}

/* ---------- HTTP API ---------- */

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'vr-field', rooms: rooms.size, time: Date.now() });
});

app.post('/api/room', (_req, res) => {
  if (rooms.size >= MAX_ROOMS) return res.status(503).json({ ok: false, error: 'Сервер перегружен, попробуй позже' });
  const code = makeCode();
  if (!code) return res.status(503).json({ ok: false, error: 'Не удалось создать код комнаты' });
  rooms.set(code, { code, createdAt: Date.now(), emptySince: Date.now(), players: new Map() });
  res.json({ ok: true, code });
});

app.get('/api/room/:code', (req, res) => {
  const code = normCode(req.params.code);
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ ok: false, error: 'Комната не найдена' });
  res.json({ ok: true, code, players: roomState(room) });
});

app.post('/api/room/:code/join', (req, res) => {
  const code = normCode(req.params.code);
  const room = CODE_RE.test(code) ? rooms.get(code) : null;
  if (!room) return res.status(404).json({ ok: false, error: 'Комната не найдена или уже закрыта' });
  if (room.players.size >= MAX_PLAYERS) return res.status(409).json({ ok: false, error: 'Комната заполнена' });
  const role = ['host', 'phone', 'vr'].includes(req.body?.role) ? req.body.role : 'phone';
  const player = {
    id: crypto.randomUUID(),
    token: crypto.randomBytes(16).toString('hex'),
    name: safeName(req.body?.name, role === 'host' ? 'Хост' : role === 'vr' ? 'VR-игрок' : 'Телефон'),
    role,
    skin: sanitizeSkin(req.body?.skin),
    socket: null,
    lastSeen: Date.now(),
    lastMotion: 0
  };
  room.players.set(player.id, player);
  touchRoom(room);
  res.json({ ok: true, code, player: publicPlayer(player), token: player.token, players: roomState(room) });
});

app.post('/api/room/:code/leave', (req, res) => {
  const room = rooms.get(normCode(req.params.code));
  const player = room?.players.get(String(req.body?.playerId || ''));
  if (room && player && safeEqual(player.token, req.body?.token)) {
    room.players.delete(player.id);
    player.socket?.close(1000, 'Left');
    broadcast(room, { type: 'player-left', id: player.id });
    touchRoom(room);
  }
  res.json({ ok: true });
});

app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'Не найдено' }));

// SPA-fallback (Express 5: путь задаётся регуляркой)
app.get(/^(?!\/api\/|\/health$|\/ws$).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  const error = status === 413 ? 'Слишком большой запрос' : status < 500 ? 'Некорректный запрос' : 'Ошибка сервера';
  if (status >= 500) console.error(err);
  res.status(status).json({ ok: false, error });
});

/* ---------- WebSocket ---------- */

server.on('upgrade', (req, socket, head) => {
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); } catch { socket.destroy(); return; }
  if (url.pathname !== '/ws') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, url));
});

wss.on('connection', (socket, url) => {
  const room = rooms.get(normCode(url.searchParams.get('room')));
  const player = room?.players.get(String(url.searchParams.get('player') || ''));
  if (!room || !player || !safeEqual(player.token, url.searchParams.get('token'))) {
    socket.close(1008, 'Комната или игрок не найдены');
    return;
  }
  if (player.socket && player.socket.readyState === 1) player.socket.close(4000, 'Reconnected');
  player.socket = socket;
  player.lastSeen = Date.now();
  socket.isAlive = true;

  socket.send(JSON.stringify({ type: 'state', players: roomState(room), serverTime: Date.now() }));
  broadcast(room, { type: 'player-joined', player: publicPlayer(player) }, player.id);

  socket.on('pong', () => { socket.isAlive = true; player.lastSeen = Date.now(); });
  socket.on('error', () => {});

  socket.on('message', raw => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (!message || typeof message !== 'object') return;
    player.lastSeen = Date.now();

    switch (message.type) {
      case 'ping':
        socket.send(JSON.stringify({ type: 'pong', clientTs: Number(message.clientTs) || 0, serverTs: Date.now() }));
        break;
      case 'skin':
        player.skin = sanitizeSkin(message.skin);
        broadcast(room, { type: 'skin', id: player.id, skin: player.skin }, player.id);
        break;
      case 'pose':
      case 'motion': {
        const now = Date.now();
        if (now - player.lastMotion < 15) return; // ограничение частоты (~60 к/с)
        player.lastMotion = now;
        const payload = sanitizeMotion(message);
        if (payload) broadcast(room, { type: 'motion', id: player.id, payload }, player.id);
        break;
      }
    }
  });

  socket.on('close', () => {
    if (player.socket === socket) player.socket = null;
    player.lastSeen = Date.now();
  });
});

/* ---------- обслуживание ---------- */

const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    if (client.isAlive === false) { client.terminate(); continue; }
    client.isAlive = false;
    try { client.ping(); } catch { /* сокет уже закрывается */ }
  }
}, 30_000);

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      const socketGone = !player.socket || player.socket.readyState !== 1;
      if (socketGone && now - player.lastSeen > DISCONNECT_TTL) {
        room.players.delete(player.id);
        broadcast(room, { type: 'player-left', id: player.id });
      }
    }
    if (room.players.size === 0) {
      room.emptySince ??= now;
      if (now - room.emptySince > EMPTY_ROOM_TTL) rooms.delete(room.code);
    } else {
      room.emptySince = null;
    }
  }
}, 10_000);
heartbeat.unref();
sweeper.unref();

function shutdown() {
  for (const client of wss.clients) client.close(1001, 'Server restarting');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', err => console.error('unhandledRejection', err));

server.listen(PORT, HOST, () => console.log(`VR Field running on :${PORT}`));
