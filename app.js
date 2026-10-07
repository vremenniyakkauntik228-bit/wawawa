import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import WebGPURenderer from 'https://cdn.jsdelivr.net/npm/three@0.180.0/src/renderers/webgpu/WebGPURenderer.js';
import WebGPU from 'https://cdn.jsdelivr.net/npm/three@0.180.0/src/capabilities/WebGPU.js';
import * as RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.21.0/+esm';

const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const boot = $('#boot');
const bootProgress = $('#boot-progress');
const bootState = $('#boot-state');
const objects = new Map();
const meshes = new Set();
const ephemeral = new Set();
const history = { undo: [], redo: [], lock: false };

const state = {
  tool: 'select', selected: null, paused: false, timeScale: 1, gravity: 9.81,
  gravitySign: -1, rendererMode: 'WebGL2', dragging: false, orbiting: false,
  pointer: new THREE.Vector2(), lastPointer: new THREE.Vector2(), lastOrbit: new THREE.Vector2(),
  cameraYaw: 0.62, cameraPitch: 0.44, cameraDistance: 19, fps: 0, fpsAccum: 0, fpsFrames: 0,
  lastChallenge: 0,
};
const stats = { spawned: 0, booms: 0, cuts: 0, magnet: 0, rain: 0, flips: 0, frozen: 0, speedStart: 0, speedSpawned: 0 };
let physicsAccumulator = 0;


let renderer, scene, camera, world, clock;
let idCounter = 1;
let challengeIndex = 0;
let challengeCompleted = false;
let lastPhysicsTime = 0;
const raycaster = new THREE.Raycaster();
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const DEFAULT_GRAVITY = -9.81;
const SAVE_KEY = 'n-sandbox-scene-v02';

const TYPES = {
  cube:    { label:'Cube',      scale:{x:1.3,y:1.3,z:1.3}, color:0xd9dde3, mass:1 },
  sphere:  { label:'Sphere',    scale:{x:.78,y:.78,z:.78}, color:0xc8cdd3, mass:1.1 },
  cylinder:{ label:'Cylinder',  scale:{x:.7,y:1.8,z:.7},   color:0xbfc5cc, mass:1.5 },
  plank:   { label:'Plank',     scale:{x:2.8,y:.36,z:.58},  color:0xb6bdc5, mass:1.4 },
  wheel:   { label:'Wheel',     scale:{x:.78,y:.38,z:.78},  color:0xaab1b9, mass:1.2 },
  domino:  { label:'Domino',    scale:{x:.42,y:2.2,z:.22},  color:0xe0e3e7, mass:.8 },
  crate:   { label:'Crate',     scale:{x:1.35,y:1.35,z:1.35}, color:0x9098a2, mass:2.2 },
  bomb:    { label:'Pulse Orb', scale:{x:.58,y:.58,z:.58}, color:0xb0b5bd, mass:.7 },
};

const CHALLENGES = [
  { title:'Start with a mess', desc:'Spawn 10 objects, then trigger one Boom.', goal:'objects>=10;boom', target:10 },
  { title:'Build a tower', desc:'Get 8 objects above 5 units without deleting anything.', goal:'tower', target:8 },
  { title:'Domino day', desc:'Spawn 12 dominoes and knock at least 8 of them moving.', goal:'domino', target:12 },
  { title:'Low gravity', desc:'Flip gravity and keep 5 objects airborne at once.', goal:'gravity', target:5 },
  { title:'Tiny disaster', desc:'Cut 3 blocks, then finish with a Boom.', goal:'cutsboom', target:3 },
  { title:'Magnet storm', desc:'Use Magnet 5 times in a row.', goal:'magnet', target:5 },
  { title:'Rainmaker', desc:'Drop the random-object rain once and survive the chaos.', goal:'rain', target:24 },
  { title:'Speed build', desc:'Create 15 objects in 20 seconds.', goal:'speed', target:15 },
  { title:'Freeze frame', desc:'Freeze 5 bodies, then release them with an impulse.', goal:'freeze', target:5 },
  { title:'Pinball lab', desc:'Spawn 3 spheres, then flip gravity twice.', goal:'flip2', target:2 },
];

function bootSet(p, text){ bootProgress.style.width = `${p}%`; bootState.textContent = text; }
function toast(msg){ const node=document.createElement('div'); node.className='toast glass'; node.textContent=msg; $('#toast-stack').appendChild(node); setTimeout(()=>{node.classList.add('out'); setTimeout(()=>node.remove(),220)},1800); }

async function init(){
  bootSet(12,'Preparing scene');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0b0d);
  scene.fog = new THREE.Fog(0x0a0b0d, 15, 75);
  camera = new THREE.PerspectiveCamera(48, innerWidth/innerHeight, .08, 120);
  clock = new THREE.Clock();
  await initRenderer();
  bootSet(38,'Loading physics runtime');
  await RAPIER.init();
  world = new RAPIER.World({x:0,y:DEFAULT_GRAVITY,z:0});
  bootSet(58,'Building arena');
  buildEnvironment();
  createArenaWalls();
  buildDecor();
  seedScene();
  stats.spawned=0; stats.speedStart=0; stats.speedSpawned=0;
  bindUI();
  setTool('select');
  updateChallenge(true);
  updateCamera();
  syncMeshes();
  bootSet(100,'Ready');
  setTimeout(()=>boot.classList.add('hide'),260);
  requestAnimationFrame(animate);
}

async function initRenderer(){
  const common={canvas,antialias:true,powerPreference:'high-performance'};
  if(WebGPU.isAvailable()){
    try{
      renderer = new WebGPURenderer({...common,alpha:false});
      await renderer.init();
      state.rendererMode='WebGPU';
    }catch(e){
      console.warn('WebGPU failed; falling back to WebGL2',e);
      renderer = new THREE.WebGLRenderer(common);
      state.rendererMode='WebGL2';
    }
  }else{
    renderer = new THREE.WebGLRenderer(common);
    state.rendererMode='WebGL2';
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
  renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.08;
  if(renderer.shadowMap){ renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; }
  $('#renderer-status').textContent=state.rendererMode;
}

function buildEnvironment(){
  scene.add(new THREE.HemisphereLight(0xd6dbe2,0x111318,1.55));
  const key=new THREE.DirectionalLight(0xffffff,2.1); key.position.set(9,15,8); key.castShadow=true;
  if(key.shadow?.mapSize) key.shadow.mapSize.set(1536,1536);
  key.shadow.camera.left=-28;key.shadow.camera.right=28;key.shadow.camera.top=24;key.shadow.camera.bottom=-24;scene.add(key);
  const rim=new THREE.PointLight(0x8f9aa8,6,44,2); rim.position.set(-8,9,-12); scene.add(rim);
  const floorGeo=new THREE.BoxGeometry(32,.5,32), floorMat=new THREE.MeshStandardMaterial({color:0x161a1f,roughness:.93,metalness:.04});
  const floor=new THREE.Mesh(floorGeo,floorMat);floor.position.y=-.25;floor.receiveShadow=true;floor.userData.isArena=true;scene.add(floor);
  world.createCollider(RAPIER.ColliderDesc.cuboid(16,.25,16));
  const grid=new THREE.GridHelper(60,60,0x515861,0x23282f);grid.position.y=.01;scene.add(grid);
}

function createArenaWalls(){
  const wallMat=new THREE.MeshStandardMaterial({color:0x11151a,roughness:.9,metalness:.02,transparent:true,opacity:.38});
  const walls=[
    {p:[0,6,-16],s:[32,12,.25],c:RAPIER.ColliderDesc.cuboid(16,6,.125)},
    {p:[0,6,16],s:[32,12,.25],c:RAPIER.ColliderDesc.cuboid(16,6,.125)},
    {p:[-16,6,0],s:[.25,12,32],c:RAPIER.ColliderDesc.cuboid(.125,6,16)},
    {p:[16,6,0],s:[.25,12,32],c:RAPIER.ColliderDesc.cuboid(.125,6,16)},
  ];
  for(const w of walls){const m=new THREE.Mesh(new THREE.BoxGeometry(...w.s),wallMat);m.position.set(...w.p);m.receiveShadow=true;scene.add(m);world.createCollider(w.c.setTranslation(...w.p));}
}

function buildDecor(){
  const lineMat=new THREE.LineBasicMaterial({color:0x191e24,transparent:true,opacity:.55});
  for(let i=-12;i<=12;i+=4){ const pts=[new THREE.Vector3(i,.02,-14),new THREE.Vector3(i,.02,14)]; scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),lineMat)); }
  for(let i=-12;i<=12;i+=4){ const pts=[new THREE.Vector3(-14,.02,i),new THREE.Vector3(14,.02,i)]; scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),lineMat)); }
}

function makeGeometry(type,s){
  switch(type){
    case 'sphere': return new THREE.SphereGeometry(s.x,24,16);
    case 'cylinder': return new THREE.CylinderGeometry(s.x,s.x,s.y,24);
    case 'wheel': { const g=new THREE.CylinderGeometry(s.x,s.x,s.y,28);g.rotateZ(Math.PI/2);return g; }
    default: return new THREE.BoxGeometry(s.x,s.y,s.z);
  }
}
function colliderDesc(type,s){
  if(type==='sphere'||type==='bomb') return RAPIER.ColliderDesc.ball(s.x);
  if(type==='cylinder') return RAPIER.ColliderDesc.cylinder(s.y/2,s.x);
  if(type==='wheel') return RAPIER.ColliderDesc.cuboid(s.y/2,s.x,s.x);
  return RAPIER.ColliderDesc.cuboid(s.x/2,s.y/2,s.z/2);
}
function materialFor(type,overColor=null){
  const m=new THREE.MeshStandardMaterial({color:overColor??TYPES[type]?.color??0xd5d9df,roughness:.6,metalness:.08});
  if(type==='bomb'){m.roughness=.35;m.metalness=.25;}
  return m;
}

function createMesh(type,s){ const mesh=new THREE.Mesh(makeGeometry(type,s),materialFor(type)); mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.sandbox=true;return mesh; }

function recordHistory(){ if(history.lock)return; const snap=serializeScene(); history.undo.push(snap); if(history.undo.length>30)history.undo.shift(); history.redo.length=0; }
function spawn(type,pos={x:0,y:7,z:0},scale=null,opts={}){
  const def=TYPES[type]??TYPES.cube; const s=scale?{...scale}:{...def.scale};
  const id=`obj_${idCounter++}`; const mesh=createMesh(type,s); mesh.position.set(pos.x,pos.y,pos.z); scene.add(mesh);
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x,pos.y,pos.z).setLinearDamping(.035).setAngularDamping(.065));
  body.setAdditionalMass(def.mass??1,true);
  const collider=world.createCollider(colliderDesc(type,s).setRestitution(type==='sphere' ? .45 : .15).setFriction(.68),body);
  if(opts.rotation){body.setRotation(opts.rotation,true);mesh.quaternion.set(opts.rotation.x,opts.rotation.y,opts.rotation.z,opts.rotation.w)}
  const data={id,type,mesh,body,collider,scale:s,createdAt:performance.now(),temporary:!!opts.temporary,expireAt:opts.expireAt??0,frozen:false,materialColor:def.color};
  objects.set(id,data);meshes.add(mesh);
  stats.spawned++;
  if(!stats.speedStart || performance.now()-stats.speedStart>20000){stats.speedStart=performance.now();stats.speedSpawned=0;}
  stats.speedSpawned++;
  if(type==='bomb') scheduleBomb(data,2200);
  if(opts.select!==false) selectObject(id);
  return id;
}

function scheduleBomb(data,ms){ data.bombTimer=setTimeout(()=>{ if(objects.has(data.id)){ explodeAt(data.body.translation(),6.5,8.3,true); removeObject(data.id,false); toast('Pulse orb detonated'); ;} },ms); }
function removeObject(id,historyRecord=false){ const d=objects.get(id); if(!d)return; if(d.bombTimer)clearTimeout(d.bombTimer); scene.remove(d.mesh);d.mesh.geometry?.dispose();if(d.mesh.material?.dispose)d.mesh.material.dispose();world.removeRigidBody(d.body);objects.delete(id);meshes.delete(d.mesh);if(state.selected===id)state.selected=null;if(historyRecord)recordHistory();updateUI(); }
function clearObjects(){ for(const id of [...objects.keys()])removeObject(id,false); state.selected=null;updateUI(); }

function seedScene(){
  const seeds=[['cube',{x:0,y:5,z:0}],['cube',{x:2.3,y:2.1,z:.6}],['plank',{x:-2.2,y:2.9,z:0}],['sphere',{x:1.5,y:6.1,z:-1.3}],['domino',{x:-4,y:1.15,z:1.2}],['domino',{x:-3.2,y:1.15,z:1.2}]];
  for(const [t,p] of seeds)spawn(t,p,{...TYPES[t].scale},{select:false});
}

function selectObject(id){ state.selected=id; refreshSelection(); drawSelection(); }
function selected(){ return state.selected?objects.get(state.selected):null; }
function refreshSelection(){ const d=selected(); if(!d){$('#selection-name').textContent='Nothing selected';$('#selection-meta').textContent='Click a body in the scene.';$('#elastic-range').value=.15;$('#elastic-value').textContent='0.15';return;} const t=d.body.translation();$('#selection-name').textContent=`${TYPES[d.type]?.label??d.type} · ${d.id}`;$('#selection-meta').textContent=`x ${t.x.toFixed(2)} · y ${t.y.toFixed(2)} · z ${t.z.toFixed(2)} · ${d.frozen?'FROZEN':'DYNAMIC'}`; const rest=d.collider.restitution?.()??.15;$('#elastic-range').value=rest;$('#elastic-value').textContent=rest.toFixed(2); }
function drawSelection(){ for(const d of objects.values()){const on=d.id===state.selected;if(d.mesh.material){d.mesh.material.emissive?.set(on?0x3a3f47:0x000000);if('emissiveIntensity' in d.mesh.material)d.mesh.material.emissiveIntensity=on?.62:0;} } }
function updateUI(){ $('#object-count').textContent=`${objects.size} object${objects.size===1?'':'s'}`;refreshSelection();updateChallenge(); }

function duplicateSelected(){ const d=selected();if(!d)return;recordHistory();const t=d.body.translation(),q=d.body.rotation();spawn(d.type,{x:t.x+1.2,y:t.y+.5,z:t.z},d.scale,{rotation:q});toast('Duplicated'); }
function impulseSelected(force=5.5){const d=selected();if(!d)return;d.frozen=false;d.body.setEnabled(true);const dir=new THREE.Vector3((Math.random()-.5)*.5,.55,(Math.random()-.5)*.5).normalize();d.body.applyImpulse({x:dir.x*force,y:dir.y*force,z:dir.z*force},true);d.body.applyTorqueImpulse({x:(Math.random()-.5)*force,y:(Math.random()-.5)*force,z:(Math.random()-.5)*force},true);toast('Impulse applied');}

function explodeSelected(){const d=selected();if(!d)return;recordHistory();const p=d.body.translation();explodeAt(p,6.5,8.2,false);stats.booms++;toast('BOOM');;}
function explodeAt(center,radius,strength,spawnDebris=false){
  for(const other of objects.values()){const p=other.body.translation();const dx=p.x-center.x,dy=p.y-center.y,dz=p.z-center.z;const dist=Math.max(.35,Math.hypot(dx,dy,dz));if(dist>radius)continue;const power=(1-dist/radius)*strength;other.frozen=false;other.body.setEnabled(true);other.body.applyImpulse({x:dx/dist*power,y:(dy/dist+.20)*power,z:dz/dist*power},true);other.body.applyTorqueImpulse({x:(Math.random()-.5)*power,y:(Math.random()-.5)*power,z:(Math.random()-.5)*power},true);}
  spawnShockwave(center); if(spawnDebris)spawnDebrisBurst(center);
}
function spawnShockwave(c){const g=new THREE.RingGeometry(.4, .55, 40);const m=new THREE.MeshBasicMaterial({color:0xd8dce1,transparent:true,opacity:.45,side:THREE.DoubleSide});const mesh=new THREE.Mesh(g,m);mesh.rotation.x=-Math.PI/2;mesh.position.set(c.x,.05,c.z);scene.add(mesh);let life=0;const item={mesh,expireAt:performance.now()+700,update(){life+=.035;mesh.scale.setScalar(1+life*6);m.opacity=Math.max(0,.45-life*.65)}};ephemeral.add(item);}
function spawnDebrisBurst(c){for(let i=0;i<12;i++){const r=.08+Math.random()*.12;const id=spawn('cube',{x:c.x+(Math.random()-.5),y:c.y+(Math.random()-.5),z:c.z+(Math.random()-.5)},{x:r,y:r,z:r},{temporary:true,expireAt:performance.now()+7000,select:false});const d=objects.get(id);d.body.applyImpulse({x:(Math.random()-.5)*6,y:Math.random()*6+1,z:(Math.random()-.5)*6},true);ephemeral.add({kind:'object',id});}}

function cutSelected(){const d=selected();if(!d||!['cube','plank','crate'].includes(d.type)||Math.min(d.scale.x,d.scale.z)<.3)return;recordHistory();stats.cuts++;const t=d.body.translation(),q=d.body.rotation();const half=d.scale.x/4;const localOffset=new THREE.Vector3(half,0,0).applyQuaternion(new THREE.Quaternion(q.x,q.y,q.z,q.w));const ns={x:d.scale.x/2,y:d.scale.y,z:d.scale.z};removeObject(d.id,false);const a=spawn(d.type,{x:t.x-localOffset.x,y:t.y-localOffset.y,z:t.z-localOffset.z},ns,{rotation:q,select:false});const b=spawn(d.type,{x:t.x+localOffset.x,y:t.y+localOffset.y,z:t.z+localOffset.z},ns,{rotation:q,select:false});objects.get(a).body.applyImpulse({x:-.65,y:.25,z:0},true);objects.get(b).body.applyImpulse({x:.65,y:.25,z:0},true);selectObject(b);toast('Cut into two');;}
function applyBuildSnap(){const d=selected();if(!d)return;recordHistory();const p=d.body.translation();const snap=v=>Math.round(v*2)/2;d.body.setTranslation({x:snap(p.x),y:Math.max(.45,snap(p.y)),z:snap(p.z)},true);toast('Snapped to grid');}
function toggleFreeze(){const d=selected();if(!d)return;recordHistory();d.frozen=!d.frozen;if(d.frozen)stats.frozen++;else stats.frozen=Math.max(0,stats.frozen-1);d.body.setEnabled(!d.frozen);if(d.frozen){d.body.setLinvel({x:0,y:0,z:0},true);d.body.setAngvel({x:0,y:0,z:0},true);}toast(d.frozen?'Frozen':'Released');;}
function magnetSelected(){const d=selected();if(!d)return;recordHistory();stats.magnet++;const c=d.body.translation();for(const o of objects.values()){if(o.id===d.id)continue;const p=o.body.translation();const dx=c.x-p.x,dy=c.y-p.y,dz=c.z-p.z;const dist=Math.max(.45,Math.hypot(dx,dy,dz));if(dist>7)continue;const power=Math.min(5,(7-dist)/7*4.5);o.frozen=false;o.body.setEnabled(true);o.body.applyImpulse({x:dx/dist*power,y:dy/dist*power,z:dz/dist*power},true);}toast('Magnet pulse');;}
function windBurst(){recordHistory();for(const o of objects.values()){const p=o.body.translation();const strength=Math.max(0,7-Math.abs(p.x)*.15);o.frozen=false;o.body.setEnabled(true);o.body.applyImpulse({x:strength,y:.8,z:(Math.random()-.5)*2},true);}toast('Gust released');}

function setTool(tool){state.tool=tool;document.querySelectorAll('.tool[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));const map={select:'<b>Click</b> objects. Drag to push.',build:'<b>Click</b> a body to snap it to the half-unit grid.',cut:'<b>Click</b> a box/plank/crate to split it.',explode:'<b>Click</b> any object to pulse-blast the area.',magnet:'<b>Click</b> an object to attract nearby bodies.',wind:'<b>Click</b> anywhere for a gust.',freeze:'<b>Click</b> a body to freeze or release it.'};$('#hint').innerHTML=map[tool]??'';}
function setTimeScale(v){state.timeScale=v;$('#time-scale-value').textContent=`${v}×`;document.querySelectorAll('[data-timescale]').forEach(b=>b.classList.toggle('active',Number(b.dataset.timescale)===v));}
function togglePause(){state.paused=!state.paused;$('#pause-btn').textContent=state.paused?'Resume':'Pause';}
function setGravity(g){state.gravity=g;world.gravity={x:0,y:g*state.gravitySign,z:0};$('#gravity-value').textContent=g.toFixed(2);}
function flipGravity(){recordHistory();state.gravitySign*=-1;stats.flips++;world.gravity={x:0,y:state.gravity*state.gravitySign,z:0};toast(`Gravity ${state.gravitySign<0?'down':'up'}`);;}

function dropRain(){recordHistory();stats.rain++;for(let i=0;i<24;i++{const type=['cube','sphere','cylinder','plank','wheel','domino','crate'][Math.floor(Math.random()*7)];spawn(type,{x:(Math.random()-.5)*10,y:8+Math.random()*8,z:(Math.random()-.5)*10},null,{select:false});}toast('Object rain: 24 spawned');;}
function autoTower(){recordHistory();for(let y=0;y<8;y++)spawn(y%2?'plank':'crate',{x:0,y:1+y*1.35,z:0},y%2?{x:2.8,y:.36,z:.58}:{x:1.35,y:1.35,z:1.35},{select:false});toast('Tower deployed');;}

function serializeScene(){return JSON.stringify({gravity:state.gravity,gravitySign:state.gravitySign,timeScale:state.timeScale,objects:[...objects.values()].map(d=>{const t=d.body.translation(),q=d.body.rotation();return {type:d.type,scale:d.scale,p:{x:t.x,y:t.y,z:t.z},q:{x:q.x,y:q.y,z:q.z,w:q.w},frozen:d.frozen,restitution:d.collider.restitution?.()??.15}})});}
function restoreScene(text){let data;try{data=JSON.parse(text)}catch(e){toast('Save data invalid');return false;}history.lock=true;clearObjects();for(const o of data.objects??[]){const id=spawn(o.type,o.p,o.scale,{rotation:o.q,select:false});const d=objects.get(id);d.frozen=!!o.frozen;d.collider.setRestitution?.(o.restitution??.15);if(d.frozen)d.body.setEnabled(false);}history.lock=false;state.gravitySign=Number(data.gravitySign??-1)||-1;state.gravity=Number(data.gravity??9.81)||9.81;world.gravity={x:0,y:state.gravity*state.gravitySign,z:0};setTimeScale(Number(data.timeScale??1));updateUI();return true;}
function saveScene(){localStorage.setItem(SAVE_KEY,serializeScene());toast('Scene saved in this browser');}
function loadScene(){const t=localStorage.getItem(SAVE_KEY);if(!t){toast('No local save yet');return;}history.undo.push(serializeScene());restoreScene(t);toast('Scene loaded');}
function undo(){if(!history.undo.length)return;const current=serializeScene();const previous=history.undo.pop();history.redo.push(current);history.lock=true;restoreScene(previous);history.lock=false;toast('Undo');}
function redo(){if(!history.redo.length)return;const current=serializeScene();const next=history.redo.pop();history.undo.push(current);history.lock=true;restoreScene(next);history.lock=false;toast('Redo');}
function resetScene(){recordHistory();clearObjects();seedScene();stats.speedStart=0;stats.speedSpawned=0;state.gravity=9.81;state.gravitySign=-1;world.gravity={x:0,y:-9.81,z:0};setTimeScale(1);toast('Sandbox reset');updateChallenge(true);}

function updateChallenge(force=false){
  const c=CHALLENGES[challengeIndex];
  $('#challenge-name').textContent=c.title;
  $('#challenge-desc').textContent=c.desc;
  let progress=0, complete=false;
  const moving=([ ...objects.values() ]).filter(o=>{const v=o.body.linvel();return v.x*v.x+v.y*v.y+v.z*v.z>.5}).length;
  switch(c.goal){
    case'objects>=10;boom': progress=Math.min(10,objects.size); complete=objects.size>=10&&stats.booms>=1; break;
    case'tower': progress=Math.min(c.target,[...objects.values()].filter(o=>o.body.translation().y>5).length); complete=progress>=c.target; break;
    case'domino': progress=Math.min(c.target,[...objects.values()].filter(o=>o.type==='domino'&&(()=>{const v=o.body.linvel();return v.x*v.x+v.y*v.y+v.z*v.z>.5})()).length); complete=progress>=8; break;
    case'gravity': progress=Math.min(c.target,[...objects.values()].filter(o=>o.body.translation().y>6).length); complete=state.gravitySign>0&&progress>=c.target; break;
    case'cutsboom': progress=Math.min(c.target,stats.cuts); complete=stats.cuts>=3&&stats.booms>=1; break;
    case'magnet': progress=Math.min(c.target,stats.magnet); complete=stats.magnet>=5; break;
    case'rain': progress=Math.min(c.target,stats.rain*24); complete=stats.rain>=1; break;
    case'speed': progress=Math.min(c.target,stats.speedSpawned); complete=(performance.now()-stats.speedStart<=20000)&&stats.speedSpawned>=c.target; break;
    case'freeze': progress=Math.min(c.target,stats.frozen); complete=stats.frozen>=c.target; break;
    case'flip2': progress=Math.min(c.target,stats.flips); complete=stats.flips>=2&&objects.size>=3; break;
  }
  $('#challenge-progress').style.width=`${Math.round((progress/Math.max(1,c.target))*100)}%`;
  $('#challenge-count').textContent=`${Math.min(progress,c.target)} / ${c.target}`;
  if(complete&&!challengeDirty){toast('Challenge complete ✓');;}
  
}
function nextChallenge(){challengeIndex=(challengeIndex+1)%CHALLENGES.length;state.lastChallenge=0;;updateChallenge(true);toast(`Challenge ${challengeIndex+1}/${CHALLENGES.length}`);}

function getPointer(ev){const rect=canvas.getBoundingClientRect();state.pointer.x=((ev.clientX-rect.left)/rect.width)*2-1;state.pointer.y=-((ev.clientY-rect.top)/rect.height)*2+1;}
function pick(ev){getPointer(ev);raycaster.setFromCamera(state.pointer,camera);return raycaster.intersectObjects([...meshes],false)[0]??null;}
function onPointerDown(ev){canvas.setPointerCapture?.(ev.pointerId);if(ev.button===1){state.orbiting=true;state.lastOrbit.set(ev.clientX,ev.clientY);return;}if(ev.button!==0)return;const hit=pick(ev);if(!hit){if(state.tool==='wind')windBurst();else selectObject(null);return;}selectObject(hit.object.userData.id);state.dragging=true;state.lastPointer.set(ev.clientX,ev.clientY);if(state.tool==='explode')explodeSelected();else if(state.tool==='cut')cutSelected();else if(state.tool==='build')applyBuildSnap();else if(state.tool==='magnet'){magnetSelected();}else if(state.tool==='freeze')toggleFreeze();;}
function onPointerMove(ev){if(state.orbiting){const dx=ev.clientX-state.lastOrbit.x,dy=ev.clientY-state.lastOrbit.y;state.lastOrbit.set(ev.clientX,ev.clientY);state.cameraYaw-=dx*.008;state.cameraPitch=Math.max(.15,Math.min(1.15,state.cameraPitch-dy*.006));return;}if(!state.dragging||!state.selected)return;const dx=ev.clientX-state.lastPointer.x,dy=ev.clientY-state.lastPointer.y;state.lastPointer.set(ev.clientX,ev.clientY);if(Math.abs(dx)+Math.abs(dy)<1)return;const d=selected();if(!d)return;d.frozen=false;d.body.setEnabled(true);const gain=.025;d.body.applyImpulse({x:dx*gain,y:-dy*gain,z:dx*.006},true);}
function onPointerUp(ev){state.dragging=false;state.orbiting=false;if(canvas.hasPointerCapture?.(ev.pointerId))canvas.releasePointerCapture(ev.pointerId);}
function onWheel(ev){state.cameraDistance=Math.max(8,Math.min(35,state.cameraDistance+ev.deltaY*.012));updateCamera();}

function updateCamera(){const cp=Math.cos(state.cameraPitch),sp=Math.sin(state.cameraPitch),cy=Math.cos(state.cameraYaw),sy=Math.sin(state.cameraYaw);camera.position.set(sy*cp*state.cameraDistance,sp*state.cameraDistance+2.5,cy*cp*state.cameraDistance);camera.lookAt(0,2.2,0);}
function syncMeshes(){for(const d of objects.values()){const p=d.body.translation(),q=d.body.rotation();d.mesh.position.set(p.x,p.y,p.z);d.mesh.quaternion.set(q.x,q.y,q.z,q.w);}}
function updateEphemeral(now){for(const e of [...ephemeral]){if(e.update)e.update();if(now>(e.expireAt??0)){if(e.kind==='object'){if(objects.has(e.id))removeObject(e.id,false);}else{scene.remove(e.mesh);e.mesh.geometry?.dispose();e.mesh.material?.dispose?.();}ephemeral.delete(e);}}}
function cleanupLimit(){const MAX=220;if(objects.size<=MAX)return;const arr=[...objects.values()].sort((a,b)=>a.createdAt-b.createdAt);for(let i=0;i<objects.size-MAX;i++)removeObject(arr[i].id,false);toast('Object limit reached · oldest debris cleaned');}

function bindUI(){
  $('#spawn-toggle').addEventListener('click',()=>$('#spawn-menu').classList.toggle('open'));
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.spawn-anchor'))$('#spawn-menu').classList.remove('open')});
  document.querySelectorAll('[data-spawn]').forEach(btn=>btn.addEventListener('click',()=>{recordHistory();const type=btn.dataset.spawn;spawn(type,{x:(Math.random()-.5)*3,y:8,z:(Math.random()-.5)*3});$('#spawn-menu').classList.remove('open');;}));
  document.querySelectorAll('[data-tool]').forEach(btn=>btn.addEventListener('click',()=>setTool(btn.dataset.tool)));
  document.querySelectorAll('[data-timescale]').forEach(btn=>btn.addEventListener('click',()=>setTimeScale(Number(btn.dataset.timescale))));
  $('#duplicate-btn').addEventListener('click',duplicateSelected);$('#delete-btn').addEventListener('click',()=>{if(state.selected){recordHistory();removeObject(state.selected);}});$('#clear-btn').addEventListener('click',resetScene);
  $('#impulse-btn').addEventListener('click',()=>{recordHistory();impulseSelected();});$('#slice-btn').addEventListener('click',cutSelected);$('#boom-btn').addEventListener('click',explodeSelected);
  $('#pause-btn').addEventListener('click',togglePause);$('#gravity-flip').addEventListener('click',()=>{flipGravity();});
  $('#save-btn').addEventListener('click',saveScene);$('#load-btn').addEventListener('click',loadScene);$('#undo-btn').addEventListener('click',undo);$('#redo-btn').addEventListener('click',redo);
  $('#rain-btn').addEventListener('click',dropRain);$('#tower-btn').addEventListener('click',autoTower);$('#next-challenge-btn').addEventListener('click',nextChallenge);
  $('#gravity-range').addEventListener('input',e=>setGravity(Number(e.target.value)));$('#elastic-range').addEventListener('input',e=>{const d=selected();const r=Number(e.target.value);$('#elastic-value').textContent=r.toFixed(2);if(d)d.collider.setRestitution?.(r);});
  canvas.addEventListener('pointerdown',onPointerDown);canvas.addEventListener('pointermove',onPointerMove);canvas.addEventListener('pointerup',onPointerUp);canvas.addEventListener('pointercancel',onPointerUp);canvas.addEventListener('wheel',onWheel,{passive:true});
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
  addEventListener('keydown',e=>{if(e.repeat||e.target.closest('input'))return;const k=e.key.toLowerCase();if(e.key==='Delete'||e.key==='Backspace')return $('#delete-btn').click();if(k==='r')return resetScene();if(k==='b')return setTool('build');if(k==='c')return cutSelected();if(k==='e')return explodeSelected();if(k==='m')return setTool('magnet');if(k==='g')return setTool('wind');if(k==='f')return setTool('freeze');if(k==='d')return duplicateSelected();if(k===' ')return togglePause();if(k==='1')return setTool('select');const map={2:'cube',3:'sphere',4:'cylinder',5:'plank',6:'wheel',7:'domino',8:'crate',9:'bomb'};if(map[k]){recordHistory();spawn(map[k],{x:0,y:8,z:0});;}});
}

function animate(){requestAnimationFrame(animate);const realDt=Math.min(clock.getDelta(),.05);state.fpsAccum+=realDt;state.fpsFrames++;if(state.fpsAccum>=.5){state.fps=Math.round(state.fpsFrames/state.fpsAccum);$('#fps').textContent=`${state.fps} FPS`;state.fpsAccum=0;state.fpsFrames=0;}const now=performance.now();if(!state.paused){physicsAccumulator+=realDt*state.timeScale;let guard=0;while(physicsAccumulator>=1/60&&guard<8){world.step();physicsAccumulator-=1/60;guard++;}lastPhysicsTime=now;if(guard)syncMeshes();}updateEphemeral(now);cleanupLimit();drawSelection();refreshSelection();updateChallenge();updateCamera();renderer.render(scene,camera);}

init().catch(err=>{console.error(err);bootState.textContent=`Startup failed: ${err?.message??err}`;toast('Startup failed — open browser console');});
