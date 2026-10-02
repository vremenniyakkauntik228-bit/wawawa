const DEFAULT_COLORS = ['#f8fafc', '#111318', '#9af1d0'];
const REST_HAND = 48;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = (v, d) => Number.isFinite(Number(v)) ? Number(v) : d;
const skinImages = new Map();
const oct = (c,cx,cy,w,h,cut) => { c.beginPath(); c.moveTo(cx-w/2+cut,cy-h/2); c.lineTo(cx+w/2-cut,cy-h/2); c.lineTo(cx+w/2,cy-h/2+cut); c.lineTo(cx+w/2,cy+h/2-cut); c.lineTo(cx+w/2-cut,cy+h/2); c.lineTo(cx-w/2+cut,cy+h/2); c.lineTo(cx-w/2,cy+h/2-cut); c.lineTo(cx-w/2,cy-h/2+cut); c.closePath(); };

export class World2D {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.players = new Map(); this.localId = null;
    this.time = 0; this.last = performance.now(); this.w = 680; this.h = 380;
    this.keys = { left:false, right:false };
    this.resize();
    const ro = window.ResizeObserver ? new ResizeObserver(() => this.resize()) : null;
    ro?.observe(canvas); if (!ro) window.addEventListener('resize', () => this.resize());
    const key = (e, down) => { if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return; const k=e.key.toLowerCase(); if(k==='arrowleft'||k==='a')this.keys.left=down; if(k==='arrowright'||k==='d')this.keys.right=down; };
    window.addEventListener('keydown', e => key(e,true)); window.addEventListener('keyup', e => key(e,false)); window.addEventListener('blur',()=>this.keys.left=this.keys.right=false);
    requestAnimationFrame(t => this.draw(t));
  }
  resize(){const r=this.canvas.getBoundingClientRect();if(!r.width)return;const d=window.devicePixelRatio||1;this.w=Math.max(680,r.width);this.h=Math.max(380,this.w*.54);this.canvas.width=Math.floor(this.w*d);this.canvas.height=Math.floor(this.h*d);this.ctx.setTransform(d,0,0,d,0,0);}
  ensurePlayer(id, info={}){let p=this.players.get(id);if(p){Object.assign(p,{name:info.name||p.name,role:info.role||p.role,skin:info.skin||p.skin});return p;}const x=(this.players.size%4)*135-200;p={id,x,targetX:x,name:info.name||'Игрок',role:info.role||'phone',skin:info.skin||{colors:DEFAULT_COLORS},eyeColor:'#9af1d0',head:{x:0,y:-72},headT:{x:0,y:-72},hands:{left:{x:-55,y:REST_HAND},right:{x:55,y:REST_HAND}},handsT:{left:{x:-55,y:REST_HAND},right:{x:55,y:REST_HAND}},yaw:0,yawT:0,headYaw:0,headYawT:0,headPitch:0,headPitchT:0,gaze:{x:0,y:0},gazeT:{x:0,y:0},jump:0,jumpT:0,visible:true,lastSeen:performance.now(),rest:true,move:0};this.players.set(id,p);return p;}
  removePlayer(id){this.players.delete(id)} clear(){this.players.clear()}
  applyMotion(id,m){const p=this.players.get(id);if(!p||!m)return;if(m.visible===false){p.visible=false;p.lastSeen=performance.now();p.rest=true;return;}p.visible=true;p.lastSeen=performance.now();p.rest=false;if(m.x!==undefined)p.targetX=clamp(fin(m.x,p.targetX),-460,460);const pt=(v,d)=>v&&typeof v==='object'?{x:fin(v.x,d.x),y:fin(v.y,d.y)}:d;p.headT=pt(m.head,p.headT);p.handsT.left=pt(m.left,p.handsT.left);p.handsT.right=pt(m.right,p.handsT.right);p.yaw=fin(m.yaw,p.yaw);p.yawT=clamp(fin(m.yaw,p.yawT),-1,1);p.headYawT=clamp(fin(m.headYaw,p.headYawT),-1,1);p.headPitchT=clamp(fin(m.headPitch,p.headPitchT),-1,1);p.gazeT={x:clamp(fin(m.gaze?.x,p.gazeT.x),-1,1),y:clamp(fin(m.gaze?.y,p.gazeT.y),-1,1)};if(typeof m.eyeColor==='string')p.eyeColor=m.eyeColor;p.jumpT=clamp(fin(m.jump,p.jumpT),0,1);p.move=clamp(fin(m.move,p.move),-2,2);}
  update(dt){const k=Math.min(1,dt*8),lim=this.w/2-65;for(const p of this.players.values()){if(p.id===this.localId){if(this.keys.left)p.targetX-=dt*180;if(this.keys.right)p.targetX+=dt*180;if(!p.rest&&Math.abs(p.move)>.01)p.targetX+=p.move*dt*150;}if(performance.now()-p.lastSeen>900){p.rest=true;p.visible=false;p.targetX=p.x;}if(p.rest){p.headT={x:0,y:-72};p.handsT.left={x:-40,y:REST_HAND};p.handsT.right={x:40,y:REST_HAND};p.gazeT={x:0,y:0};p.jumpT=0;}p.targetX=clamp(p.targetX,-lim,lim);p.x+=(p.targetX-p.x)*Math.min(1,dt*6);p.head.x+=(p.headT.x-p.head.x)*k;p.head.y+=(p.headT.y-p.head.y)*k;p.yaw+=(p.yawT-p.yaw)*k;p.move+=(-p.move)*Math.min(1,dt*4);p.headYaw+=(p.headYawT-p.headYaw)*k;p.headPitch+=(p.headPitchT-p.headPitch)*k;p.jump+=(p.jumpT-p.jump)*Math.min(1,dt*10);p.gaze.x+=(p.gazeT.x-p.gaze.x)*Math.min(1,dt*12);p.gaze.y+=(p.gazeT.y-p.gaze.y)*Math.min(1,dt*12);for(const s of ['left','right']){p.hands[s].x+=(p.handsT[s].x-p.hands[s].x)*k;p.hands[s].y+=(p.handsT[s].y-p.hands[s].y)*k;}}}
  draw(now){requestAnimationFrame(t=>this.draw(t));const dt=Math.min(.05,(now-this.last)/1000||.016);this.last=now;if(!this.canvas.offsetParent)return;this.time+=dt;this.update(dt);const c=this.ctx,w=this.w,h=this.h;c.clearRect(0,0,w,h);const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#111722');g.addColorStop(1,'#090c12');c.fillStyle=g;c.fillRect(0,0,w,h);c.fillStyle='rgba(255,255,255,.025)';for(let i=0;i<22;i++){const x=((i*97+this.time*8)%(w+80))-40,y=35+(i%8)*52;c.beginPath();c.arc(x,y,1.3,0,Math.PI*2);c.fill();}c.strokeStyle='rgba(154,241,208,.12)';c.beginPath();c.moveTo(0,h-108);c.lineTo(w,h-108);c.stroke();for(const p of this.players.values())this.drawPlayer(p);}
  drawPlayer(p){const c=this.ctx,cx=this.w/2+p.x,ground=this.h-108,base=ground-72,depth=Math.max(.42,1-Math.abs(p.yaw)*.52),yaw=p.yaw, bob=p.rest?0:Math.sin(this.time*7+p.x*.01)*2, jump= p.jump*48; const colors=p.skin?.colors||DEFAULT_COLORS; const head={x:cx+p.head.x,y:base+p.head.y-jump}; const bodyY=base+bob-jump;
    // Ground shadow and movement indicator
    c.fillStyle='rgba(0,0,0,.3)';c.beginPath();c.ellipse(cx,ground+8,68*(1-p.jump*.35),8,0,0,Math.PI*2);c.fill();
    c.fillStyle='rgba(154,241,208,.16)';c.beginPath();c.ellipse(cx+p.targetX-p.x,ground+8,24,3,0,0,Math.PI*2);c.fill();
    // Pseudo-3D torso: a wider front plane plus a thin side plane.
    const torsoW=76*depth, torsoH=112;const sideShift=16*yaw;
    c.fillStyle='rgba(255,255,255,.18)';c.beginPath();c.moveTo(cx-torsoW/2,bodyY);c.lineTo(cx+torsoW/2,bodyY);c.lineTo(cx+torsoW/2-8,bodyY+torsoH);c.lineTo(cx-torsoW/2+8,bodyY+torsoH);c.closePath();c.fill();
    c.fillStyle=colors[0];c.beginPath();c.moveTo(cx-sideShift,bodyY);c.lineTo(cx+torsoW/2,bodyY+10);c.lineTo(cx+torsoW/2-10,bodyY+torsoH);c.lineTo(cx-torsoW/2+10,bodyY+torsoH);c.lineTo(cx-torsoW/2,bodyY+10);c.closePath();c.fill();
    // Arms track independently.
    const arm=(side,pt)=>{const sx=cx+side*torsoW*.43,sy=bodyY+24,ex=cx+pt.x,ey=bodyY+pt.y;const back = side===-1 ? yaw>0 : yaw<0;c.strokeStyle=colors[1];c.lineWidth=16;c.lineCap='round';if(back)c.globalAlpha=.72;c.beginPath();c.moveTo(sx,sy);c.lineTo(ex,ey);c.stroke();c.globalAlpha=1;c.fillStyle=colors[1];c.beginPath();c.arc(ex,ey,12,0,Math.PI*2);c.fill();};
    arm(-1,p.hands.left);arm(1,p.hands.right);
    // Legs are deliberately simple and physically constrained; they are not used for calibration.
    c.strokeStyle=colors[1];c.lineWidth=20;c.lineCap='round';c.beginPath();c.moveTo(cx-19,bodyY+torsoH-5);c.lineTo(cx-24,ground-12);c.moveTo(cx+19,bodyY+torsoH-5);c.lineTo(cx+24,ground-12);c.stroke();
    // Head volume.
    const hw=54*depth,hh=64;const hx=head.x+sideShift,hy=head.y;
    c.fillStyle='rgba(255,255,255,.22)';oct(c,hx+10,hy+4,hw,hh,10);c.fill();
    c.fillStyle=colors[0];oct(c,hx,hy,hw,hh,10);c.fill();
    // Eye positions follow head yaw; side views naturally hide the far eye.
    const facingRight=yaw>0;const visibleEyes=Math.abs(yaw)>.78?1:2;const eyeSep=18*depth;const eyeY=hy-3+p.headPitch*8; const eyeX=hx+Math.sin(yaw*.9)*8;
    const drawEye=(ex,far=false)=>{c.fillStyle=colors[1];c.beginPath();c.ellipse(ex,eyeY,far?6:8,far?5:7,0,0,Math.PI*2);c.fill();const px=ex+clamp(p.gaze.x*4,-4,4)*(facingRight?-1:1)+p.headYaw*3;const py=eyeY+clamp(p.gaze.y*3,-3,3);c.fillStyle=colors[2]||'#9af1d0';c.beginPath();c.arc(px,py,3.2,0,Math.PI*2);c.fill();};
    if(visibleEyes===1)drawEye(eyeX+(facingRight?5:-5)); else {drawEye(eyeX-eyeSep/2,true);drawEye(eyeX+eyeSep/2,false);}
    // Tiny mouth/indicator reacts to jump and tracking state.
    c.strokeStyle=colors[1];c.lineWidth=2;c.beginPath();c.moveTo(hx-7,hy+15);c.lineTo(hx+7,hy+15);c.stroke();
    c.fillStyle='#9aa6b6';c.font='11px system-ui';c.textAlign='center';c.fillText(p.name,cx,ground+30);
    if(p.id===this.localId){c.strokeStyle='rgba(154,241,208,.6)';c.lineWidth=1.5;c.beginPath();c.roundRect(hx-40,hy-47,80,95,18);c.stroke();}
  }
}
