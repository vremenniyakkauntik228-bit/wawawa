import {
  openCamera, flipCamera, stopStream, stopTracking, startBodyTracking, startFaceTracking, getFacing
} from './pose.js';
import { BODY_CONNECTIONS, analyzePose, analyzeFace, poseToMotion } from './pose-utils.mjs';
import { World2D } from './world.js';

const $ = s => document.querySelector(s);
const screens = ['home','lobby','creator','connect','phoneCheck','vrCheck','room','mobile'];
const REST = 48;
const DEFAULT_SETTINGS = {
  bodyTracking: true, eyeTracking: true, headTracking: true, gestureMovement: true, jumpTracking: true,
  poseThreshold: .35, eyeSensitivity: 1, headSensitivity: 1, movementSensitivity: 1, smoothing: 8
};
const loadSettings = () => { try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('vrfield.settings') || '{}') }; } catch { return { ...DEFAULT_SETTINGS }; } };
const S = {
  room:null, player:null, token:null, retry:0, reconnectTimer:null, lastSent:0, skin:null, socket:null, mobileSocket:null, mode:null,
  cameraStream:null, latency:null, phoneStep:0, phonePhase:0, bodyReady:false, leftRaised:false, rightRaised:false, calibrated:false,
  readySince:0, lastPoseVisible:0, lastPoseAt:0, lastSentInvisible:false, baselineBodyY:null, jumpUntil:0,
  moveCandidate:0, moveSince:0, moveDirection:0, eyeData:null, headLive:null, headData:null, headCal:null, eyeNear:null, eyeFar:null, eyeColor:null, phaseWaitUntil:0,
  cameraPreviewStop:null, bodyStop:null, faceStop:null, vrSession:null, vrX:0, lastFaceAt:0, settings:loadSettings()
};
const world = new World2D($('#worldCanvas'));
const home = new World2D($('#homeCanvas'));
world.localId = null; world.canvas.style.pointerEvents = 'none';

const skins = [
  {id:'classic',name:'Original',shape:'classic',colors:['#f8fafc','#101318','#9af1d0']},
  {id:'soft',name:'Soft',shape:'soft',colors:['#e9edf4','#161a20','#7dd3fc']},
  {id:'sharp',name:'Sharp',shape:'sharp',colors:['#fff7d6','#17130c','#f7b955']},
  {id:'void',name:'Void',shape:'void',colors:['#dfe7ff','#050608','#c4b5fd']},
  {id:'bubble',name:'Bubble',shape:'bubble',colors:['#e6fff4','#17231f','#74ffb7']},
  {id:'rose',name:'Rose',shape:'rose',colors:['#ffe7f2','#211018','#f9a8d4']},
  {id:'side',name:'Side',shape:'side',colors:['#f5f6f8','#15171b','#9bc2ff']},
  {id:'minimal',name:'Minimal',shape:'minimal',colors:['#ffffff','#111111','#ffffff']}
];

function show(id){
  screens.forEach(x => $('#'+x)?.classList.toggle('active', x === id));
  window.scrollTo({top:0, behavior:'instant'});
}
function safeColor(c){ return /^#[0-9a-f]{3,8}$/i.test(String(c||'')) ? c : '#9af1d0'; }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function enc(s){ return encodeURIComponent(s); }
function setGlobal(text, ok=false){ $('#globalStatus').textContent=text; $('#globalStatusDot').classList.toggle('ok',ok); }
function wsUrl(){ return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`; }
async function api(url,opt={}){ const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);return j; }
function saveSettings(){ localStorage.setItem('vrfield.settings',JSON.stringify(S.settings)); }
function setSetting(key,value){ S.settings[key]=value; saveSettings(); world.trackingSettings=S.settings; }
function bindSettings(){
  for(const key of ['bodyTracking','eyeTracking','headTracking','gestureMovement','jumpTracking']){
    const el=$(`#set_${key}`); if(!el) continue; el.checked=Boolean(S.settings[key]); el.onchange=()=>setSetting(key,el.checked);
  }
  const ranges=[['poseThreshold',.2,.65,.01],['eyeSensitivity',.5,2,.05],['headSensitivity',.5,2,.05],['movementSensitivity',.5,2,.05],['smoothing',4,14,.5]];
  for(const [key,min,max,step] of ranges){const el=$(`#set_${key}`);const out=$(`#set_${key}_v`);if(!el)continue;el.value=S.settings[key];if(out)out.textContent=Number(S.settings[key]).toFixed(key==='poseThreshold'?2:1);el.oninput=()=>{setSetting(key,Number(el.value));if(out)out.textContent=Number(el.value).toFixed(key==='poseThreshold'?2:1)}}
}

function drawCharacterCanvas(cv, skin, state={}){
  const ctx=cv.getContext('2d'), w=cv.width, h=cv.height;
  const [body,ink,accent] = skin.colors.map(safeColor);
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#080b10';ctx.fillRect(0,0,w,h);
  const sx=w/260, sy=h/310; ctx.save(); ctx.translate(w/2,h*.5); ctx.scale(sx,sy);
  const yaw=Number(state.yaw||0), gX=Number(state.gazeX||0), gY=Number(state.gazeY||0), armL=Number(state.armL||0), armR=Number(state.armR||0);
  const side=Math.max(.48,1-Math.abs(yaw)*.52), headW=70*side;
  const oct=(cx,cy,ww,hh,cut)=>{ctx.beginPath();ctx.moveTo(cx-ww/2+cut,cy-hh/2);ctx.lineTo(cx+ww/2-cut,cy-hh/2);ctx.lineTo(cx+ww/2,cy-hh/2+cut);ctx.lineTo(cx+ww/2,cy+hh/2-cut);ctx.lineTo(cx+ww/2-cut,cy+hh/2);ctx.lineTo(cx-ww/2+cut,cy+hh/2);ctx.lineTo(cx-ww/2,cy+hh/2-cut);ctx.lineTo(cx-ww/2,cy-hh/2+cut);ctx.closePath();};
  ctx.strokeStyle=ink;ctx.lineWidth=19;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-16,78);ctx.lineTo(-22,143);ctx.moveTo(16,78);ctx.lineTo(22,143);ctx.stroke();
  ctx.fillStyle=body;ctx.beginPath();ctx.moveTo(-41*side,-76);ctx.lineTo(41*side,-76);ctx.lineTo(56*side,20);ctx.quadraticCurveTo(0,44,-56*side,20);ctx.closePath();ctx.fill();
  const arm=(sideX,baseAngle,delta)=>{const a=baseAngle+delta,ex=Math.cos(a)*72,ey=-22+Math.sin(a)*72;ctx.strokeStyle=body;ctx.lineWidth=18;ctx.beginPath();ctx.moveTo(sideX*37,-54);ctx.lineTo(ex+sideX*8,ey);ctx.stroke();};arm(-1,-2.22,armL);arm(1,-.92,armR);
  oct(0,-142,headW,70,12);ctx.fillStyle=body;ctx.fill();
  const eyeSep=19*side, ex0=Math.sin(yaw*.9)*7;
  const drawEye=(x,small=false)=>{ctx.fillStyle=ink;ctx.beginPath();ctx.ellipse(x,-111,small?8:10,small?6:13,small?0:0,0,Math.PI*2);ctx.fill();ctx.fillStyle=accent;ctx.beginPath();ctx.arc(x+gX*4,-111+gY*4,small?3:4,0,Math.PI*2);ctx.fill();};
  if(skin.shape==='minimal'){drawEye(ex0-eyeSep/2,true);drawEye(ex0+eyeSep/2,true);}else if(Math.abs(yaw)>.78){drawEye(ex0+(yaw>0?6:-6),true);}else{drawEye(ex0-eyeSep/2,false);drawEye(ex0+eyeSep/2,true);}
  ctx.strokeStyle=ink;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-7,-94);ctx.lineTo(7,-94);ctx.stroke();
  ctx.restore();
}
function drawSkin(cv,skin){drawCharacterCanvas(cv,skin);}
function renderSkins(){
  const g=$('#skinGrid'); if(!g)return;g.innerHTML='';
  for(const sk of skins){const b=document.createElement('button');b.className='skin-option'+(S.skin?.id===sk.id?' selected':'');b.innerHTML=`<div class="skin-thumb"><canvas width="120" height="142"></canvas></div><div class="skin-name">${esc(sk.name)}</div>`;b.onclick=()=>{S.skin=sk;drawSkin($('#skinPreview'),sk);$('#skinMeta').textContent=`Вариация: ${sk.name}`;renderSkins()};g.appendChild(b);drawSkin(b.querySelector('canvas'),sk)}
}

let drawCtx=$('#drawCanvas')?.getContext('2d'), tool='paint', drawing=false, joints={};
const jointDefs=[['head','Голова',.5,.19],['leftShoulder','Левое плечо',.42,.30],['rightShoulder','Правое плечо',.58,.30],['leftHand','Левая рука',.29,.36],['rightHand','Правая рука',.71,.36],['leftHip','Левое бедро',.44,.53],['rightHip','Правое бедро',.56,.53],['leftFoot','Левая стопа',.43,.81],['rightFoot','Правая стопа',.57,.81]];
function initCreator(){ if(!drawCtx)return;drawCtx.fillStyle='#080b10';drawCtx.fillRect(0,0,320,420);drawCtx.strokeStyle='#f8fafc';drawCtx.lineCap='round';drawCtx.lineWidth=12;drawCtx.beginPath();drawCtx.moveTo(126,160);drawCtx.lineTo(194,160);drawCtx.moveTo(144,174);drawCtx.lineTo(136,315);drawCtx.moveTo(176,174);drawCtx.lineTo(184,315);drawCtx.stroke();drawCtx.beginPath();drawCtx.arc(160,92,36,0,Math.PI*2);drawCtx.stroke();joints={};jointDefs.forEach(([k,,x,y])=>joints[k]={x,y});renderRig();renderBoneList();}
function renderRig(){const o=$('#rigOverlay');if(!o)return;o.innerHTML='';for(const [k,l,x,y] of jointDefs){const j=joints[k]||{x,y},e=document.createElement('div');e.className='joint';e.style.left=`${j.x*100}%`;e.style.top=`${j.y*100}%`;const lab=document.createElement('span');lab.className='joint-label';lab.textContent=l;e.appendChild(lab);let drag=false;const move=ev=>{if(!drag)return;const r=o.getBoundingClientRect();joints[k]={x:Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(ev.clientY-r.top)/r.height))};e.style.left=`${joints[k].x*100}%`;e.style.top=`${joints[k].y*100}%`;renderBoneList()};e.onpointerdown=ev=>{drag=true;e.setPointerCapture(ev.pointerId)};e.onpointermove=move;e.onpointerup=e.onpointercancel=()=>drag=false;o.appendChild(e)}}
function renderBoneList(){const l=$('#boneList');if(!l)return;l.innerHTML='';for(const [k,n] of jointDefs){const d=document.createElement('div');d.className='bone-item';d.innerHTML=`<span>${n}</span><span>${Math.round((joints[k]?.x||0)*100)}% / ${Math.round((joints[k]?.y||0)*100)}%</span>`;l.appendChild(d)}}
function setTool(v){tool=v;document.querySelectorAll('.tool').forEach(b=>b.classList.toggle('active',b.dataset.tool===v));$('#rigOverlay').style.pointerEvents=v==='rig'?'auto':'none';}
function canvasPos(e){const cv=$('#drawCanvas'),r=cv.getBoundingClientRect();return[(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height]}
$('#drawCanvas')?.addEventListener('pointerdown',e=>{if(tool!=='paint')return;drawing=true;drawCtx.beginPath();drawCtx.moveTo(...canvasPos(e));$('#drawCanvas').setPointerCapture(e.pointerId)});
$('#drawCanvas')?.addEventListener('pointermove',e=>{if(!drawing||tool!=='paint')return;drawCtx.strokeStyle=$('#drawColor').value;drawCtx.lineWidth=Number($('#brushSize').value);drawCtx.lineTo(...canvasPos(e));drawCtx.stroke()});
['pointerup','pointercancel'].forEach(x=>$('#drawCanvas')?.addEventListener(x,()=>drawing=false));

function ensureCanvas(cv){const r=cv.getBoundingClientRect(),d=devicePixelRatio||1,w=Math.max(2,Math.floor(r.width*d)),h=Math.max(2,Math.floor(r.height*d));if(cv.width!==w||cv.height!==h)cv.width=w,cv.height=h;const c=cv.getContext('2d');c.setTransform(d,0,0,d,0,0);return {c,w:r.width,h:r.height}}
function drawPreview(video,cv,mirror=true){
  const {c,w,h}=ensureCanvas(cv);c.clearRect(0,0,w,h);c.fillStyle='#05070a';c.fillRect(0,0,w,h);
  const vw=video.videoWidth||0,vh=video.videoHeight||0;if(!vw||!vh)return false;
  const k=Math.min(w/vw,h/vh),dw=vw*k,dh=vh*k,ox=(w-dw)/2,oy=(h-dh)/2;
  c.save();if(mirror){c.translate(w,0);c.scale(-1,1);}c.drawImage(video,ox,oy,dw,dh);c.restore();return true;
}
function startCameraPreview(video,canvas){
  S.cameraPreviewStop?.();let alive=true;const loop=()=>{if(!alive)return;drawPreview(video,canvas,getFacing()==='user');requestAnimationFrame(loop)};requestAnimationFrame(loop);S.cameraPreviewStop=()=>{alive=false;};
}
function drawPose(cv,lm,video,mirror=true){
  const {c,w,h}=ensureCanvas(cv);c.clearRect(0,0,w,h);if(!lm)return;
  const vw=video.videoWidth||w,vh=video.videoHeight||h,k=Math.min(w/vw,h/vh),dw=vw*k,dh=vh*k,ox=(w-dw)/2,oy=(h-dh)/2;
  const X=p=>(mirror? w-(ox+p.x*dw):ox+p.x*dw),Y=p=>oy+p.y*dh, vis=p=>(p?.visibility??p?.presence??1)>.18;
  c.strokeStyle='rgba(100,255,176,.96)';c.lineWidth=Math.max(2.2,w*.008);c.lineCap='round';c.shadowColor='rgba(100,255,176,.7)';c.shadowBlur=5;
  for(const [a,b] of BODY_CONNECTIONS){const p=lm[a],q=lm[b];if(!vis(p)||!vis(q))continue;c.beginPath();c.moveTo(X(p),Y(p));c.lineTo(X(q),Y(q));c.stroke()}
  c.shadowBlur=8;c.fillStyle='#74ffb7';for(const i of [0,7,8,11,12,13,14,15,16,23,24,25,26,27,28]){const p=lm[i];if(!vis(p))continue;c.beginPath();c.arc(X(p),Y(p),Math.max(3.5,w*.012),0,Math.PI*2);c.fill()}c.shadowBlur=0;
}
function drawFaceTracker(cv,face,video,mirror=true){
  if(!face?.iris)return;const {c,w,h}=ensureCanvas(cv);const vw=video.videoWidth||w,vh=video.videoHeight||h,k=Math.min(w/vw,h/vh),dw=vw*k,dh=vh*k,ox=(w-dw)/2,oy=(h-dh)/2;const X=x=>(mirror? w-(ox+x*dw):ox+x*dw),Y=y=>oy+y*dh;c.fillStyle='#fff';for(const key of ['left','right']){const p=face.iris[key];c.beginPath();c.arc(X(p.x),Y(p.y),Math.max(4,w*.012),0,Math.PI*2);c.fill();c.strokeStyle='#74ffb7';c.lineWidth=2;c.stroke();}}
function clearOverlay(cv){const {c,w,h}=ensureCanvas(cv);c.clearRect(0,0,w,h)}

function friendlyCameraError(e){const n=e?.name;return n==='NotAllowedError'?'Доступ к камере запрещён. Разреши камеру для сайта в настройках браузера.':n==='NotFoundError'?'Браузер не нашёл камеру.':n==='NotReadableError'?'Камера занята другим приложением. Закрой его и повтори.':n==='OverconstrainedError'?'Телефон не поддержал эти настройки камеры. Попробуй ещё раз.':e?.message||'Не удалось запустить камеру.';}
function setCameraRatio(frame,video){const w=Number(video.videoWidth),h=Number(video.videoHeight);if(w&&h)frame.style.setProperty('--camera-aspect',`${w}/${h}`);frame.classList.add('full-frame');}
function cameraUiStatus(text,kind='info'){const el=$('#cameraStatus');if(el){el.textContent=text;el.dataset.kind=kind;}}

async function leaveCurrent(){clearTimeout(S.reconnectTimer);const room=S.room,player=S.player,token=S.token,ws=S.socket;S.socket=null;S.player=null;S.token=null;S.retry=0;try{ws?.close()}catch{}world.clear();world.localId=null;if(room&&player){try{await api(`/api/room/${room}/leave`,{method:'POST',body:JSON.stringify({playerId:player.id,token})})}catch{}}}
async function createHostPlayer(){const name=$('#playerName').value.trim()||'Игрок';S.skin=S.skin||skins[0];const r=await api(`/api/room/${S.room}/join`,{method:'POST',body:JSON.stringify({role:'host',name,skin:S.skin})});S.player=r.player;S.token=r.token;world.localId=S.player.id;$('#roomCodeLabel').textContent=S.room;$('#roomTitle').textContent=`Поле / ${name}`;world.ensurePlayer(S.player.id,S.player)}
async function leaveRoom(){S.cameraPreviewStop?.();S.bodyStop?.();S.faceStop?.();stopTracking();stopStream(S.cameraStream);S.cameraStream=null;try{await S.vrSession?.end()}catch{}S.mobileSocket?.close();document.body.classList.remove('keep-camera');await leaveCurrent();S.room=null;S.mode=null;show('home');setGlobal('Готово')}
function connectSocket(){if(S.socket?.readyState===1)return Promise.resolve(S.socket);return new Promise((resolve,reject)=>{const ws=new WebSocket(`${wsUrl()}?room=${enc(S.room)}&player=${enc(S.player.id)}&token=${enc(S.token)}`);let opened=false;ws.onopen=()=>{opened=true;S.socket=ws;S.retry=0;setGlobal('Онлайн',true);$('#backendHealth').textContent='Онлайн';ping(ws);resolve(ws)};ws.onerror=()=>{if(!opened)reject(new Error('WebSocket не подключился'))};ws.onclose=e=>{if(!opened){reject(new Error('WebSocket не подключился'));return}if(S.socket!==ws)return;S.socket=null;if(e.code===1008){openModal('Связь','Комната закрыта или игрок удалён.');leaveRoom();return}setGlobal('Переподключение…');$('#backendHealth').textContent='Нет связи';scheduleReconnect()};ws.onmessage=e=>{try{handle(JSON.parse(e.data))}catch{}}})}
function scheduleReconnect(){if(!S.player)return;clearTimeout(S.reconnectTimer);const d=Math.min(10000,1000*2**S.retry++);S.reconnectTimer=setTimeout(()=>{if(S.player&&!S.socket)connectSocket().catch(scheduleReconnect)},d)}
function ping(ws=S.socket){if(ws?.readyState===1)ws.send(JSON.stringify({type:'ping',clientTs:performance.now()}))}
function handle(m){if(m.type==='state'){const ids=new Set(m.players.map(p=>p.id));[...world.players.keys()].forEach(id=>{if(!ids.has(id))world.removePlayer(id)});m.players.forEach(addPlayer);refreshList()}else if(m.type==='player-joined'){addPlayer(m.player);refreshList()}else if(m.type==='player-left'){world.removePlayer(m.id);refreshList()}else if(m.type==='skin'){const p=world.players.get(m.id);if(p)p.skin=m.skin;refreshList()}else if(m.type==='motion'){world.applyMotion(m.id,m.payload)}else if(m.type==='pong'){const ms=Math.round(performance.now()-Number(m.clientTs||0));S.latency=ms;$('#roomLatency').textContent=`${ms} ms`;$('#latencyNote').textContent=`Ответ от бэкенда: ${ms} ms`;$('#vrLatencyNote').textContent=`Ответ от бэкенда: ${ms} ms`}}
function addPlayer(p){world.ensurePlayer(p.id,p)}
function refreshList(){const l=$('#playersList');l.innerHTML='';for(const p of world.players.values()){const d=document.createElement('div');d.className='player-row';d.innerHTML=`<div class="player-avatar" style="background:${safeColor(p.skin?.colors?.[0])}"></div><div class="player-copy"><strong>${esc(p.name)}</strong><small>${p.id===world.localId?'ты · ':''}${p.role==='phone'?'телефон':p.role==='vr'?'VR':'хост'}</small></div>`;l.appendChild(d)}$('#playersCount').textContent=`${world.players.size} ${world.players.size===1?'игрок':'игроков'}`}

function resetCalibration(){S.phoneStep=1;S.phonePhase=0;S.bodyReady=false;S.leftRaised=false;S.rightRaised=false;S.calibrated=false;S.readySince=0;S.baselineBodyY=null;S.phaseWaitUntil=0;S.eyeNear=null;S.eyeFar=null;S.eyeColor=null;S.headData=null;updatePhone();}
function startPhoneCheck(){show('phoneCheck');S.mode='phone';resetCalibration();$('#continuePhoneBtn').disabled=true;$('#skipCalibrationBtn').disabled=false;$('#phonePoseState').textContent='Камера: ожидание';$('#phoneResult').textContent='Сначала включи камеру — изображение появится независимо от загрузки скелета.';bindSettings();connectSocket().catch(e=>openModal('Связь',e.message));}
function updatePhone(){
  const titles=['','Камера и изображение','Тело и скелет','Левая рука','Правая рука','Глаза: близкая калибровка','Глаза: дальняя проверка','Голова'];
  const tasks=['','Включи камеру. Ноги могут быть вне кадра. Главное — чтобы лицо, плечи и руки попадали в кадр.','Спокойно стой в центре. Зелёный скелет должен закрепиться на теле.','Подними левую руку и держи её прямо около секунды.','Подними правую руку и держи её прямо около секунды.','Поднеси лицо ближе к телефону. Смотри в центр, затем по команде влево и вправо.','Отойди дальше. Повтори центр, влево и вправо — система сравнит близкий и дальний трекинг.','Смотри прямо, потом медленно поверни голову влево, вправо, вверх и вниз.'];
  const i=S.phoneStep;$('#phoneStepTitle').textContent=titles[i];$('#phoneStepIndex').textContent=`${i} / 7`;$('#phoneProgressBar').style.width=`${Math.max(0,Math.min(100,i/7*100))}%`;
  $('#phoneTask').textContent=tasks[i];$('#phonePhase').textContent=S.phonePhase?`Фаза ${S.phonePhase}`:'';
  const b=$('#continuePhoneBtn');b.textContent=i===7?'Войти в мир':'Продолжить';
  if(i===1)b.disabled=true; else if(i===2)b.disabled=!S.bodyReady; else if(i===3)b.disabled=!S.leftRaised; else if(i===4)b.disabled=!S.rightRaised; else if(i>=5)b.disabled=false;
}
function setPoseStatus(status){
  const state=$('#phonePoseState'); if(!state)return;
  if(status.state==='loading'){state.textContent='Скелет: загружается…';state.dataset.kind='loading';$('#bodyStatusMini').textContent='Загрузка…';}
  else if(status.state==='ready'){state.textContent='Скелет: модуль готов';state.dataset.kind='ready';$('#bodyStatusMini').textContent='Готов ✓';}
  else {state.textContent='Камера работает · скелет недоступен';state.dataset.kind='bad';$('#bodyStatusMini').textContent='Ошибка';}
}
function updatePoseStatus(status){
  if(!status)return;
  $('#cameraPoints').textContent=`Точек: ${status.visible}/33`;$('#bodyStatusMini').textContent=status.bodyReady?'Готов ✓':`${status.visible}/33`;
  if(status.bodyReady){if(!S.readySince)S.readySince=performance.now();if(!S.baselineBodyY)S.baselineBodyY=status.centerY;}else S.readySince=0;
  S.bodyReady=status.bodyReady && performance.now()-S.readySince>500;
  S.leftRaised=status.leftRaised;S.rightRaised=status.rightRaised;
  if(S.phoneStep===2&&S.bodyReady) $('#phoneResult').textContent=`Тело найдено: ${status.essential}/7 ключевых точек. Ноги не обязательны.`;
  if(S.phoneStep===3) $('#phoneResult').textContent=S.leftRaised?'Левая рука ✓':'Подними левую руку выше плеча.';
  if(S.phoneStep===4) $('#phoneResult').textContent=S.rightRaised?'Правая рука ✓':'Подними правую руку выше плеча.';
  if(S.phoneStep===2&&S.bodyReady) $('#continuePhoneBtn').disabled=false;
  if(S.phoneStep===3) $('#continuePhoneBtn').disabled=!S.leftRaised;
  if(S.phoneStep===4) $('#continuePhoneBtn').disabled=!S.rightRaised;
}
function startOrResetGesture(motion){
  const intent=Number(motion.moveIntent||0);
  if(!S.settings.gestureMovement){S.moveCandidate=0;S.moveSince=0;S.moveDirection=0;return 0;}
  if(intent!==S.moveCandidate){S.moveCandidate=intent;S.moveSince=performance.now();S.moveDirection=0;return 0;}
  if(intent!==0 && performance.now()-S.moveSince>950)S.moveDirection=intent;
  if(intent===0){S.moveSince=0;S.moveDirection=0;}
  return S.moveDirection*S.settings.movementSensitivity;
}
function detectJump(motion){
  if(!S.settings.jumpTracking||S.baselineBodyY==null)return 0;
  const delta=S.baselineBodyY-Number(motion.bodyY??S.baselineBodyY);if(delta>.085&&performance.now()>S.jumpUntil){S.jumpUntil=performance.now()+320;return 1;}return performance.now()<S.jumpUntil?1:0;
}
function sendMotion(ws,lm,worldSpace){
  const m=poseToMotion(lm,{threshold:S.settings.poseThreshold,moveSensitivity:S.settings.movementSensitivity});if(!m)return null;
  const move=startOrResetGesture(m), jump=detectJump(m);
  const face=S.settings.eyeTracking ? S.eyeData : null, head=S.settings.headTracking ? S.headLive : null;
  const rawGX=face?.gaze?.x||0, rawGY=face?.gaze?.y||0;
  const gx=face?.calibrated ? Math.max(-1,Math.min(1,(rawGX-(face.center?.x||0))*Number(face.gainX||1))) : rawGX;
  const gy=face?.calibrated ? Math.max(-1,Math.min(1,(rawGY-(face.center?.y||0))*Number(face.gainY||1))) : rawGY;
  const rawHY=head?.yaw||0,rawHP=head?.pitch||0;
  const hy=head?.calibrated ? Math.max(-1,Math.min(1,(rawHY-(head.centerYaw||0))*Number(head.gainYaw||1))) : rawHY;
  const hp=head?.calibrated ? Math.max(-1,Math.min(1,(rawHP-(head.centerPitch||0))*Number(head.gainPitch||1))) : rawHP;
  const out={x:m.x,head:m.head,left:m.left,right:m.right,yaw:m.yaw,headYaw:hy*S.settings.headSensitivity,headPitch:hp*S.settings.headSensitivity,gaze:face?{x:gx*S.settings.eyeSensitivity,y:gy*S.settings.eyeSensitivity}:undefined,eyeColor:face?.eyeColor||undefined,jump,move,visible:true};
  world.applyMotion(world.localId,out);
  const now=performance.now();if(now-S.lastSent>=40){S.lastSent=now;if(ws?.readyState===1)ws.send(JSON.stringify({type:'pose',payload:out}));}
  return out;
}
function handleFaceCalibration(face){
  if(!face)return;
  S.eyeData={...face};
  S.headLive={...face};S.lastFaceAt=performance.now();
  drawFaceTracker($('#poseOverlay'),face,$('#camera'),getFacing()==='user');
  if(!S.calibrated) runCalibrationStep(face);
}
function avg(samples,key){if(!samples?.length)return null;const vals=samples.map(x=>Number(x[key])).filter(Number.isFinite);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;}
function collectPhase(getter,duration=850){const now=performance.now();if(!S._phaseStart)S._phaseStart=now;const arr=S._phaseSamples||(S._phaseSamples=[]);const v=getter();if(v)arr.push(v);if(now-S._phaseStart>=duration){const result=arr.slice();S._phaseStart=0;S._phaseSamples=[];return result;}return null;}
function runCalibrationStep(face){
  const step=S.phoneStep;
  if(step===5||step===6){
    const labels=['center','left','right'];const label=labels[S.phonePhase||0];
    if(step===5 && face.faceSize<.15){$('#eyeCalStatus').textContent='Поднеси лицо ближе';return;}
    if(step===6 && S.eyeNear?.length){const nearSize=Math.max(...S.eyeNear.map(s=>Number(s.size)||0));if(face.faceSize>nearSize*.78){$('#eyeCalStatus').textContent='Отойди дальше';return;}}
    if(step===6 && performance.now()<S.phaseWaitUntil){$('#eyeCalStatus').textContent='Отойди дальше…';return;}
    const result=collectPhase(()=>({...face.gaze,size:face.faceSize}),780);$('#eyeCalStatus').textContent=`${step===5?'Близко':'Далеко'} · ${label}`;if(!result)return;
    const sample={label,x:avg(result,'x'),y:avg(result,'y'),size:avg(result,'size')};const target=step===5?(S.eyeNear||(S.eyeNear=[])):(S.eyeFar||(S.eyeFar=[]));target.push(sample);
    if((S.phonePhase||0)<2){S.phonePhase=(S.phonePhase||0)+1;updatePhone();return;}
    S.phonePhase=0;if(step===5){S.phaseWaitUntil=performance.now()+1200;S.phoneStep=6;$('#phoneTask').textContent='Отойди дальше. Через секунду начнётся дальняя проверка.';}
    else{const near=S.eyeNear||[],far=S.eyeFar||[];const centers=[...near,...far].filter(s=>s.label==='center');const centersX=avg(centers,'x')??0,centersY=avg(centers,'y')??0;const leftX=near.find(s=>s.label==='left')?.x??-.4,rightX=near.find(s=>s.label==='right')?.x??.4;const leftY=near.find(s=>s.label==='left')?.y??0,rightY=near.find(s=>s.label==='right')?.y??0;S.eyeData={...S.eyeData,calibrated:true,center:{x:centersX,y:centersY},gainX:1/Math.max(.2,Math.abs(leftX-rightX)),gainY:1/Math.max(.15,Math.abs(leftY-rightY)),near,far,eyeColor:S.eyeColor};S.phoneStep=7;S.phonePhase=0;updatePhone();}}
  else if(step===7){const labels=['center','left','right','up','down'];const label=labels[S.phonePhase||0];$('#headCalStatus').textContent=`Голова · ${label}`;const r=collectPhase(()=>({yaw:face.yaw,pitch:face.pitch}),650);if(!r)return;const sample={label,yaw:avg(r,'yaw'),pitch:avg(r,'pitch')};(S.headData||(S.headData=[])).push(sample);if((S.phonePhase||0)<labels.length-1){S.phonePhase++;updatePhone();return;}const center=S.headData.find(v=>v.label==='center')||{yaw:0,pitch:0};const yawRange=Math.max(...S.headData.filter(v=>v.label==='left'||v.label==='right').map(v=>Math.abs((v.yaw||0)-center.yaw)),.25);const pitchRange=Math.max(...S.headData.filter(v=>v.label==='up'||v.label==='down').map(v=>Math.abs((v.pitch||0)-center.pitch)),.25);S.headCal={centerYaw:center.yaw||0,centerPitch:center.pitch||0,gainYaw:1/yawRange,gainPitch:1/pitchRange};S.headLive={...S.headLive,...S.headCal,calibrated:true};S.phoneStep=7;S.calibrated=true;S.phonePhase=0;$('#headCalStatus').textContent='Голова ✓';$('#phoneResult').textContent='Калибровка завершена. Можно входить в мир.';updatePhone();$('#continuePhoneBtn').disabled=false;}
}
async function startCamera(){
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){openModal('Камера недоступна','Для камеры нужен HTTPS.');return;}
  try{
    stopTracking();S.bodyStop?.();S.faceStop?.();S.cameraPreviewStop?.();S.bodyStop=S.faceStop=S.cameraPreviewStop=null;stopStream(S.cameraStream);S.cameraStream=null;
    const video=$('#camera');S.cameraStream=await openCamera(video);setCameraRatio($('#cameraFrame'),video);video.classList.add('ready');
    startCameraPreview(video,$('#cameraPreview'));$('#cameraPlaceholder').style.display='none';$('#cameraStatusMini').textContent='Готова ✓';cameraUiStatus('Камера показывает живой кадр','ok');$('#startCameraBtn').textContent='Камера включена ✓';$('#cameraHint').textContent=`${video.videoWidth||''}×${video.videoHeight||''} · preview не зависит от скелета`;
    S.phoneStep=2;S.phonePhase=0;updatePhone();
    if(S.settings.bodyTracking)S.bodyStop=startBodyTracking(video,{threshold:S.settings.poseThreshold,fps:22,onStatus:s=>{setPoseStatus(s);if(s.state==='ready')cameraUiStatus('Камера ✅ · скелет модуль готов','ok');if(s.state==='error')cameraUiStatus('Камера ✅ · скелет не загрузился','warn');},onPose:(lm,_world,status)=>{drawPose($('#poseOverlay'),lm,video,getFacing()==='user');updatePoseStatus(status);if(lm){S.lastPoseAt=performance.now();S.lastSentInvisible=false;sendMotion(S.socket,lm,_world);}}});
    else cameraUiStatus('Камера ✅ · скелет выключен в настройках','ok');
    if(S.settings.eyeTracking)S.faceStop=startFaceTracking(video,{fps:12,onStatus:s=>{if(s.state==='ready'){cameraUiStatus('Камера ✅ · тело + глаза готовы','ok');$('#eyeTrackingState').textContent='Глаза: готовы ✓';$('#eyeStatusMini').textContent='Готов ✓';}if(s.state==='loading'){$('#eyeTrackingState').textContent='Глаза: загружаются…';$('#eyeStatusMini').textContent='Загрузка…';}if(s.state==='error'){$('#eyeTrackingState').textContent='Глаза: недоступны';$('#eyeStatusMini').textContent='Ошибка';}},onFace:(lm,face)=>{if(face)handleFaceCalibration(face);}});
  }catch(e){S.bodyStop?.();S.faceStop?.();stopStream(S.cameraStream);S.cameraStream=null;$('#cameraStatusMini').textContent='Ошибка';$('#cameraPlaceholder').style.display='grid';cameraUiStatus('Камера не запущена','bad');openModal('Камера',friendlyCameraError(e));}
}
async function skipCalibration(){S.calibrated=true;$('#phoneResult').textContent='Калибровка пропущена. Трекинг продолжает работать, когда модули доступны.';if(!S.socket||S.socket.readyState!==1){try{await connectSocket()}catch(e){openModal('Связь',e.message);return;}}showRoom();}
async function continuePhone(){if(S.phoneStep===2&&S.bodyReady){S.phoneStep=3;updatePhone();return}if(S.phoneStep===3&&S.leftRaised){S.phoneStep=4;updatePhone();return}if(S.phoneStep===4&&S.rightRaised){S.phoneStep=5;S.phonePhase=0;S.eyeNear=[];updatePhone();return}if(S.phoneStep===5||S.phoneStep===6){return}if(S.phoneStep===7&&S.calibrated){if(!S.socket||S.socket.readyState!==1)await connectSocket();showRoom();}}

function setupPhoneCalibrationUi(){
  $('#calibrateEyesBtn')?.addEventListener('click',()=>{S.phoneStep=5;S.phonePhase=0;S.eyeNear=[];S.eyeFar=[];updatePhone();});
  $('#calibrateHeadBtn')?.addEventListener('click',()=>{S.phoneStep=7;S.phonePhase=0;S.headData=[];S.headCal=null;S.calibrated=false;updatePhone();});
}

async function startVrCheck(){show('vrCheck');S.mode='vr';try{if(!navigator.xr?.isSessionSupported)throw new Error('Этот браузер не предоставляет WebXR.');if(!await navigator.xr.isSessionSupported('immersive-vr'))throw new Error('immersive-vr недоступен на этом устройстве.');$('#vrDeviceState').textContent='WebXR найден ✓';await connectSocket();$('#continueVrBtn').disabled=false;setGlobal('Готово',true)}catch(e){$('#vrDeviceState').textContent='VR не найден';$('#vrResult').textContent=e.message}}
async function launchVr(){try{if(S.vrSession)return;if(!navigator.xr)throw new Error('WebXR недоступен.');const session=await navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor','bounded-floor']});S.vrSession=session;const cv=document.createElement('canvas'),gl=cv.getContext('webgl',{xrCompatible:true});await gl.makeXRCompatible?.();session.updateRenderState({baseLayer:new XRWebGLLayer(session,gl)});let ref;try{ref=await session.requestReferenceSpace('local-floor')}catch{ref=await session.requestReferenceSpace('local')}session.addEventListener('end',()=>S.vrSession=null);showRoom();let prev=0;const loop=(t,frame)=>{if(S.vrSession!==session)return;session.requestAnimationFrame(loop);const dt=Math.min(.05,(t-prev)/1000||0);prev=t;gl.bindFramebuffer(gl.FRAMEBUFFER,session.renderState.baseLayer.framebuffer);gl.clearColor(.03,.04,.06,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);const vp=frame.getViewerPose(ref);if(!vp)return;const hp=vp.transform.position;const hands={left:{x:-55,y:REST},right:{x:55,y:REST}};for(const src of session.inputSources){if(!src.gripSpace||!(src.handedness in hands))continue;const pose=frame.getPose(src.gripSpace,ref);if(pose){const q=pose.transform.position;const side=src.handedness==='left'?-1:1;let dx=(q.x-hp.x)*180,dy=7+(hp.y-.25-q.y)*160;const l=Math.hypot(dx-side*25,dy-7);if(l>95){dx=side*25+(dx-side*25)*95/l;dy=7+(dy-7)*95/l}hands[src.handedness]={x:dx,y:dy}}}const payload={x:S.vrX,left:hands.left,right:hands.right,head:{x:0,y:-68},yaw:0,headYaw:0,headPitch:0,gaze:{x:0,y:0},jump:0,visible:true};world.applyMotion(world.localId,payload);if(S.socket?.readyState===1&&performance.now()-S.lastSent>40){S.lastSent=performance.now();S.socket.send(JSON.stringify({type:'motion',payload}))}};session.requestAnimationFrame(loop)}catch(e){openModal('VR',e.message)}}

function showRoom(){show('room');document.body.classList.toggle('keep-camera',S.mode==='phone');world.ensurePlayer(S.player.id,S.player);world.localId=S.player.id;$('#myMode').textContent=S.mode==='vr'?'VR':'Телефон';$('#trackingHealth').textContent=S.mode==='vr'?'Готово':S.calibrated?'Скелет / глаза':'Работает без полной калибровки';$('#backendHealth').textContent=S.socket?'Онлайн':'Нет связи';refreshList()}
function openCreator(){show('creator');initCreator();setTool('paint')}
function saveCreator(){const t=document.createElement('canvas');t.width=128;t.height=168;t.getContext('2d').drawImage($('#drawCanvas'),0,0,128,168);S.skin={id:`custom-${Date.now()}`,name:'Custom',shape:'custom',colors:['#f5f7fb',$('#drawColor').value,'#9af1d0'],joints:{...joints},drawn:t.toDataURL('image/png')};$('#skinMeta').textContent='Свой скин сохранён · кости привязаны';renderSkins();show('lobby')}
function openModal(title,text){$('#modalContent').innerHTML=`<p class="eyebrow">VR Field</p><h3>${esc(title)}</h3><p>${esc(text)}</p>`;$('#modal').classList.remove('hidden')}
function invite(){const url=`${location.origin}${location.pathname}?room=${encodeURIComponent(S.room)}`;$('#qrBox').innerHTML='';if(window.QRCode)QRCode.toCanvas(url,{width:230,margin:1},(e,cv)=>{if(!e)$('#qrBox').appendChild(cv)});$('#inviteUrl').textContent=url;$('#inviteSheet').classList.remove('hidden')}

function resetMobileUi(){clearOverlay($('#mobileOverlay'));$('#mobilePoints').textContent='0/33';$('#mobilePoseState').textContent='Камера: ожидание';$('#mobileStartBtn').disabled=false;$('#mobileSkipBtn').disabled=false;}
async function mobileBoot(){const room=(new URL(location.href).searchParams.get('room')||'').toUpperCase();if(!room)return;if(!/^[A-Z2-9]{6}$/.test(room)){show('home');openModal('Комната недоступна','Некорректный код комнаты.');return}S.room=room;S.mode='phone';show('mobile');resetMobileUi();try{const j=await api(`/api/room/${S.room}/join`,{method:'POST',body:JSON.stringify({role:'phone',name:'Телефон',skin:skins[0]})});S.player=j.player;S.token=j.token;mobileConnect()}catch(e){openModal('Комната недоступна',e.message)}}
function mobileConnect(){if(!S.player)return;const ws=new WebSocket(`${wsUrl()}?room=${enc(S.room)}&player=${enc(S.player.id)}&token=${enc(S.token)}`);S.mobileSocket=ws;ws.onopen=()=>{$('#mobileConnection').textContent='Онлайн';$('#mobileStartBtn').disabled=!!S.cameraStream;ping(ws)};ws.onclose=()=>{if(S.mobileSocket!==ws)return;$('#mobileConnection').textContent='Нет связи';clearTimeout(S.reconnectTimer);S.reconnectTimer=setTimeout(mobileConnect,Math.min(10000,1000*2**S.retry++))};ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='pong')$('#mobileLatency').textContent=`${Math.round(performance.now()-m.clientTs)} ms`}catch{}}}
async function mobileStart(){
  try{resetMobileUi();S.mode='phone';stopTracking();S.bodyStop?.();S.faceStop?.();S.bodyStop=S.faceStop=null;S.cameraPreviewStop?.();stopStream(S.cameraStream);const video=$('#mobileCamera');S.cameraStream=await openCamera(video);setCameraRatio($('#mobileCameraFrame'),video);startCameraPreview(video,$('#mobilePreview'));$('#mobileStartBtn').disabled=true;$('#mobileSkipBtn').disabled=false;$('#mobileCameraState').textContent='Камера ✅';
    if(S.settings.bodyTracking)S.bodyStop=startBodyTracking(video,{threshold:S.settings.poseThreshold,fps:20,onStatus:s=>{$('#mobileBodyState').textContent=s.state==='ready'?'Скелет ✅':s.state==='error'?'Скелет ⚠️':'Скелет ⏳';},onPose:(lm,_w,status)=>{drawPose($('#mobileOverlay'),lm,video,getFacing()==='user');$('#mobilePoints').textContent=`${status.visible}/33`;$('#mobilePoseState').textContent=status.bodyReady?'Скелет: работает ✓':'Скелет: ищу тебя…';pushMobile(lm);}});
    if(S.settings.eyeTracking)S.faceStop=startFaceTracking(video,{fps:10,onStatus:s=>{$('#mobileEyeState').textContent=s.state==='ready'?'Глаза ✅':s.state==='error'?'Глаза ⚠️':'Глаза ⏳';},onFace:(_lm,face)=>{if(face){if(!S.eyeColor)S.eyeColor=sampleIrisColor(video,face);S.eyeData={...face,eyeColor:S.eyeColor||undefined};drawFaceTracker($('#mobileOverlay'),face,video,getFacing()==='user');}}});
    $('#mobileTask').textContent='Камера запущена. Если скелет не загрузится, можно пропустить калибровку — видео продолжит работать.';
  }catch(e){stopStream(S.cameraStream);S.cameraStream=null;$('#mobileStartBtn').disabled=false;$('#mobileTask').textContent=friendlyCameraError(e)}}
function pushMobile(lm){sendMotion(S.mobileSocket,lm,null)}

$('#createRoomBtn').onclick=()=>{$('#joinRoomCode').value='';show('lobby');$('#playerName').focus()};
$('#joinRoomBtn').onclick=()=>{show('lobby');$('#joinRoomCode').focus()};
$('#continueSkinBtn').onclick=async()=>{const btn=$('#continueSkinBtn');const code=$('#joinRoomCode').value.trim().toUpperCase();if(code&&!/^[A-Z2-9]{6}$/.test(code)){openModal('Код комнаты','Код состоит из 6 символов.');return}btn.disabled=true;try{await leaveCurrent();S.room=code||(await api('/api/room',{method:'POST',body:'{}'})).code;await createHostPlayer();show('connect')}catch(e){S.room=null;openModal('Подключение',e.message)}finally{btn.disabled=false}};
$('#openCreatorBtn').onclick=openCreator;$('#cancelCreatorBtn').onclick=()=>show('lobby');$('#saveCreatorBtn').onclick=saveCreator;$('#clearDrawBtn').onclick=initCreator;document.querySelectorAll('.tool').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
$('#phoneModeBtn').onclick=startPhoneCheck;$('#vrModeBtn').onclick=startVrCheck;$('#startCameraBtn').onclick=startCamera;$('#continuePhoneBtn').onclick=continuePhone;$('#skipCalibrationBtn').onclick=skipCalibration;$('#startVrCheckBtn').onclick=launchVr;$('#continueVrBtn').onclick=launchVr;
$('#flipCameraBtn').onclick=async()=>{try{S.cameraStream=await flipCamera($('#camera'));setCameraRatio($('#cameraFrame'),$('#camera'));startCameraPreview($('#camera'),$('#cameraPreview'));$('#cameraHint').textContent='Камера перевёрнута. Превью идёт через защищённый canvas-слой.';}catch(e){openModal('Камера',friendlyCameraError(e))}};
$('#mobileFlipBtn').onclick=async()=>{try{S.cameraStream=await flipCamera($('#mobileCamera'));setCameraRatio($('#mobileCameraFrame'),$('#mobileCamera'));startCameraPreview($('#mobileCamera'),$('#mobilePreview'))}catch(e){$('#mobileTask').textContent=friendlyCameraError(e)}};
$('#mobileStartBtn').onclick=mobileStart;$('#mobileSkipBtn').onclick=async()=>{S.calibrated=true;if(!S.mobileSocket||S.mobileSocket.readyState!==1){try{mobileConnect()}catch{}}document.querySelector('#mobile')?.classList.add('skipped');$('#mobileTask').textContent='Калибровка пропущена. Можно продолжать с доступным трекингом.'};
$('#inviteBtn').onclick=invite;$('#closeInviteBtn').onclick=()=>$('#inviteSheet').classList.add('hidden');$('#copyInviteBtn').onclick=()=>navigator.clipboard?.writeText($('#inviteUrl').textContent);$('#copyRoomBtn').onclick=()=>navigator.clipboard?.writeText(S.room);$('#leaveRoomBtn').onclick=leaveRoom;$('#closeModalBtn').onclick=()=>$('#modal').classList.add('hidden');
document.querySelectorAll('[data-screen]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.screen)));setupPhoneCalibrationUi();bindSettings();
window.addEventListener('pagehide',()=>{S.cameraPreviewStop?.();S.bodyStop?.();S.faceStop?.();stopTracking();stopStream(S.cameraStream);if(S.room&&S.player)navigator.sendBeacon(`/api/room/${S.room}/leave`,new Blob([JSON.stringify({playerId:S.player.id,token:S.token})],{type:'application/json'}));});
S.skin=skins[0];renderSkins();drawSkin($('#skinPreview'),S.skin);initCreator();
const demo=home.ensurePlayer('demo',{name:'Ты',role:'phone',skin:skins[0]});home.localId='demo';let dt=0;(function demoLoop(){dt+=.018;home.applyMotion('demo',{x:Math.sin(dt)*150,head:{x:Math.sin(dt*1.5)*8,y:-72},left:{x:-55,y:Math.sin(dt*2)*20+35},right:{x:55,y:Math.cos(dt*2)*20+35},yaw:Math.sin(dt*.7)*.35,gaze:{x:Math.sin(dt)*.5,y:Math.cos(dt)*.25},visible:true});requestAnimationFrame(demoLoop)})();
mobileBoot();setInterval(()=>{if(S.socket?.readyState===1)ping();if(S.mobileSocket?.readyState===1)ping(S.mobileSocket)},3000);
