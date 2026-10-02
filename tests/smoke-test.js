const assert = require('node:assert/strict');
const path = require('node:path');
const WebSocket = require('ws');
const { spawn } = require('node:child_process');

const port = Number(process.env.TEST_PORT || 37777);
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, PORT: String(port) }
});
let output = '';
child.stdout.on('data', d => (output += d.toString()));
child.stderr.on('data', d => (output += d.toString()));

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(url, method = 'GET', body) {
  const r = await fetch(`${base}${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  });
  return { r, j: await r.json().catch(() => ({})) };
}
const open = ws => new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
const closed = ws => new Promise(res => ws.on('close', code => res(code)));
const nextMessage = (ws, type, ms = 3000, test = () => true) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), ms);
  const on = raw => {
    const m = JSON.parse(raw.toString());
    if (m.type === type && test(m)) { clearTimeout(timer); ws.off('message', on); resolve(m); }
  };
  ws.on('message', on);
});
const wsUrl = (code, p) => `ws://127.0.0.1:${port}/ws?room=${code}&player=${p.player.id}&token=${p.token}`;

(async () => {
  try {
    for (let i = 0; i < 30; i++) {
      try { const { r } = await api('/health'); if (r.ok) break; } catch { /* сервер ещё стартует */ }
      await sleep(100);
    }
    assert.equal((await api('/health')).j.ok, true);

    const { j: room } = await api('/api/room', 'POST', {});
    assert.equal(room.ok, true);
    const code = room.code;
    assert.match(code, /^[A-Z2-9]{6}$/);

    const desktop = (await api(`/api/room/${code}/join`, 'POST', { role: 'vr', name: 'Desktop' })).j;
    const phone = (await api(`/api/room/${code}/join`, 'POST', {
      role: 'phone', name: 'Phone<script>',
      skin: { id: 'x', colors: ['red;background:url(//evil)', '#fff', 5], joints: { head: { x: 9, y: -3 } } }
    })).j;
    assert.ok(desktop.ok && phone.ok && desktop.token && phone.token);
    assert.ok(!phone.player.name.includes('<'), 'имя очищено');
    assert.deepEqual(phone.player.skin.colors.slice(0, 2), ['#a7f3d0', '#fff'], 'цвета проверяются по шаблону');
    assert.deepEqual(phone.player.skin.joints.head, { x: 1, y: 0 }, 'joints ограничены 0..1');

    // 404 для несуществующей комнаты и JSON-ошибка на кривом теле
    assert.equal((await api('/api/room/AAAAAA/join', 'POST', {})).r.status, 404);
    assert.equal((await api('/api/room', 'POST', '{bad json')).r.status, 400);

    // WebSocket без токена отклоняется
    const bad = new WebSocket(`ws://127.0.0.1:${port}/ws?room=${code}&player=${desktop.player.id}&token=nope`);
    assert.equal(await closed(bad), 1008);

    const dws = new WebSocket(wsUrl(code, desktop));
    const pws = new WebSocket(wsUrl(code, phone));
    const gotMotion = nextMessage(dws, 'motion', 3000, m => m.payload.x === 1000);
    await Promise.all([open(dws), open(pws)]);

    // мусор не должен ронять сервер
    for (const junk of ['null', '42', '"x"', '[]', '{"type":"pose","payload":{"landmarks":[null,5,{"x":"a"}]}}', '{not json']) pws.send(junk);
    await sleep(30);
    pws.send(JSON.stringify({ type: 'ping', clientTs: 123 }));
    assert.equal((await nextMessage(pws, 'pong')).clientTs, 123);

    await sleep(30);
    pws.send(JSON.stringify({ type: 'pose', payload: { landmarks: [{ x: 0.5, y: 0.5, v: 1 }], x: 99999, left: { x: -20, y: 0 }, evil: 'x' } }));
    const motion = await gotMotion;
    assert.ok(Array.isArray(motion.payload.landmarks));
    assert.equal(motion.payload.x, 1000, 'x ограничен');
    assert.equal(motion.payload.evil, undefined, 'лишние поля отброшены');

    // чужой игрок не может выгнать другого без токена
    await api(`/api/room/${code}/leave`, 'POST', { playerId: phone.player.id, token: 'wrong' });
    assert.equal((await api(`/api/room/${code}`)).j.players.length, 2);
    const gone = nextMessage(dws, 'player-left');
    await api(`/api/room/${code}/leave`, 'POST', { playerId: phone.player.id, token: phone.token });
    assert.equal((await gone).id, phone.player.id);

    dws.close();
    console.log('SMOKE TEST PASSED');
    process.exitCode = 0;
  } catch (err) {
    console.error('SMOKE TEST FAILED', err);
    console.error(output);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
  }
})();
