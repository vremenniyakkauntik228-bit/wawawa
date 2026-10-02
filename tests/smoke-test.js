const assert = require('node:assert/strict');
const http = require('node:http');
const WebSocket = require('ws');
const { spawn } = require('node:child_process');

const port = 37777;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.js'], { cwd: require('node:path').resolve(__dirname, '..'), env: { ...process.env, PORT: String(port) } });
let output = '';
child.stdout.on('data', d => output += d.toString());
child.stderr.on('data', d => output += d.toString());

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
async function fetchJson(url, options){ const r = await fetch(url, options); const j = await r.json(); return { r, j }; }

(async()=>{
  try {
    for(let i=0;i<30;i++){
      try{ const {r}=await fetchJson(`${base}/health`); if(r.ok) break; }catch{}
      await sleep(100);
    }
    const health = await fetchJson(`${base}/health`);
    assert.equal(health.j.ok, true);

    const room = await fetchJson(`${base}/api/room`, { method:'POST', headers:{'content-type':'application/json'}, body:'{}' });
    assert.equal(room.j.ok, true);
    const code = room.j.code;

    const desktop = await fetchJson(`${base}/api/room/${code}/join`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({role:'vr',name:'Desktop'}) });
    const phone = await fetchJson(`${base}/api/room/${code}/join`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({role:'phone',name:'Phone'}) });
    assert.equal(desktop.j.ok, true); assert.equal(phone.j.ok, true);

    const dws = new WebSocket(`ws://127.0.0.1:${port}/ws?room=${code}&player=${desktop.j.player.id}`);
    const pws = new WebSocket(`ws://127.0.0.1:${port}/ws?room=${code}&player=${phone.j.player.id}`);
    const gotMotion = new Promise((resolve, reject) => {
      const timer = setTimeout(()=>reject(new Error('motion timeout')), 3000);
      dws.on('message', raw => { const m = JSON.parse(raw.toString()); if(m.type==='motion'){ clearTimeout(timer); resolve(m); } });
    });
    await Promise.all([new Promise(r=>dws.on('open',r)),new Promise(r=>pws.on('open',r))]);
    pws.send(JSON.stringify({type:'ping',clientTs:123}));
    pws.send(JSON.stringify({type:'pose',payload:{landmarks:[{x:.5,y:.5,v:1}],x:0,left:{x:-20,y:0},right:{x:20,y:0}}}));
    const motion = await gotMotion;
    assert.equal(motion.type, 'motion');
    assert.ok(Array.isArray(motion.payload.landmarks));
    dws.close(); pws.close();
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
