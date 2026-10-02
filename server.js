const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 120_000 });
const rooms = new Map();

app.disable('x-powered-by');
app.use(express.json({ limit: '120kb' }));
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[crypto.randomInt(alphabet.length)];
  return rooms.has(code) ? makeCode() : code;
}

function safeName(value, fallback = 'Игрок') {
  const name = String(value || fallback).replace(/[<>]/g, '').trim();
  return name.slice(0, 24) || fallback;
}

function roomState(room) {
  return [...room.players.values()].map(({ id, name, role, skin }) => ({ id, name, role, skin }));
}

function broadcast(room, message, exceptId = null) {
  const payload = JSON.stringify(message);
  for (const player of room.players.values()) {
    if (player.id === exceptId) continue;
    if (player.socket?.readyState === 1) player.socket.send(payload);
  }
}

function createRoom(req, res) {
  const code = makeCode();
  rooms.set(code, { code, createdAt: Date.now(), players: new Map() });
  res.json({ ok: true, code });
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'vr-field', rooms: rooms.size, time: Date.now() });
});

app.get('/api/room/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ ok: false, error: 'Комната не найдена' });
  return res.json({ ok: true, code, players: roomState(room) });
});

app.post('/api/room', createRoom);

app.post('/api/room/:code/join', (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ ok: false, error: 'Комната не найдена или уже закрыта' });
  if (room.players.size >= 24) return res.status(409).json({ ok: false, error: 'Комната заполнена' });
  const role = ['host', 'phone', 'vr'].includes(req.body?.role) ? req.body.role : 'phone';
  const id = crypto.randomUUID();
  const player = {
    id,
    name: safeName(req.body?.name, role === 'host' ? 'Хост' : role === 'vr' ? 'VR-игрок' : 'Телефон'),
    role,
    skin: req.body?.skin || { id: 'mint', colors: ['#a7f3d0', '#7dd3fc', '#f8fafc'] },
    socket: null,
    lastSeen: Date.now()
  };
  room.players.set(id, player);
  return res.json({ ok: true, code, player: { id, name: player.name, role: player.role, skin: player.skin }, players: roomState(room) });
});

app.post('/api/room/:code/leave', (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const room = rooms.get(code);
  if (!room) return res.json({ ok: true });
  const id = String(req.body?.playerId || '');
  if (room.players.delete(id)) broadcast(room, { type: 'player-left', id });
  cleanupRoom(room);
  return res.json({ ok: true });
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, url));
});

wss.on('connection', (socket, url) => {
  const code = String(url.searchParams.get('room') || '').toUpperCase();
  const id = String(url.searchParams.get('player') || '');
  const room = rooms.get(code);
  const player = room?.players.get(id);
  if (!room || !player) {
    socket.close(1008, 'Комната или игрок не найдены');
    return;
  }
  if (player.socket && player.socket.readyState === 1) player.socket.close(4000, 'Reconnected');
  player.socket = socket;
  player.lastSeen = Date.now();

  socket.send(JSON.stringify({ type: 'state', players: roomState(room), serverTime: Date.now() }));
  broadcast(room, { type: 'player-joined', player: { id: player.id, name: player.name, role: player.role, skin: player.skin } }, player.id);

  socket.on('message', raw => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    player.lastSeen = Date.now();

    if (message.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong', clientTs: Number(message.clientTs) || 0, serverTs: Date.now() }));
      return;
    }
    if (message.type === 'skin') {
      player.skin = sanitizeSkin(message.skin);
      broadcast(room, { type: 'skin', id: player.id, skin: player.skin }, player.id);
      return;
    }
    if (message.type === 'pose' || message.type === 'motion') {
      const payload = sanitizeMotion(message);
      if (!payload) return;
      broadcast(room, { type: 'motion', id: player.id, payload }, player.id);
    }
  });

  socket.on('close', () => {
    if (player.socket === socket) player.socket = null;
    player.lastSeen = Date.now();
  });
});

function sanitizeSkin(skin) {
  if (!skin || typeof skin !== 'object') return { id: 'mint', colors: ['#a7f3d0', '#7dd3fc', '#f8fafc'], joints: {} };
  const colors = Array.isArray(skin.colors) ? skin.colors.slice(0, 6).map(v => String(v).slice(0, 16)) : ['#a7f3d0'];
  const joints = skin.joints && typeof skin.joints === 'object' ? skin.joints : {};
  return { id: String(skin.id || 'custom').slice(0, 32), colors, joints };
}

function sanitizeMotion(message) {
  if (message.payload && typeof message.payload === 'object') {
    return { ...message.payload, t: Date.now() };
  }
  if (!Array.isArray(message.landmarks)) return null;
  const landmarks = message.landmarks.slice(0, 33).map(p => ({
    x: Number(p.x) || 0, y: Number(p.y) || 0, z: Number(p.z) || 0, v: Number(p.v ?? 1) || 0
  }));
  return { landmarks, x: 0, y: 0, head: { x: 0, y: 0 }, t: Date.now() };
}

function cleanupRoom(room) {
  if (room.players.size === 0) rooms.delete(room.code);
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      const idle = now - player.lastSeen > 90_000;
      const socketGone = !player.socket || player.socket.readyState !== 1;
      if (idle && socketGone) {
        room.players.delete(player.id);
        broadcast(room, { type: 'player-left', id: player.id });
      }
    }
    cleanupRoom(room);
  }
}, 20_000).unref();

app.get(/^(?!\/api\/|\/health$|\/ws$).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, HOST, () => {
  console.log(`VR Field running on :${PORT}`);
});
