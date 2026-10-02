const J = { head: 0, leftHand: 15, rightHand: 16, leftShoulder: 11, rightShoulder: 12, leftHip: 23, rightHip: 24 };
const DEFAULT_COLORS = ['#a7f3d0', '#7dd3fc', '#f8fafc'];
const REST_HAND = 45;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
const skinImages = new Map();

const pp = (lm, n) => {
  const p = lm?.[J[n]];
  return p ? { x: p.x, y: p.y, v: p.v ?? p.visibility ?? 1 } : { x: 0.5, y: 0.5, v: 0 };
};

/**
 * Переводит 33 точки MediaPipe в компактную позу для 2D-мира.
 * Камера «селфи»: изображение зеркальное, поэтому по X всё инвертируется,
 * а левая рука человека остаётся слева на экране.
 */
export function poseToMotion(lm) {
  const ls = pp(lm, 'leftShoulder'), rs = pp(lm, 'rightShoulder');
  if (ls.v < 0.4 || rs.v < 0.4) return null;
  const nose = pp(lm, 'head'), lh = pp(lm, 'leftHand'), rh = pp(lm, 'rightHand');
  const lhip = pp(lm, 'leftHip'), rhip = pp(lm, 'rightHip');
  const sx = (ls.x + rs.x) / 2, sy = (ls.y + rs.y) / 2;
  const sw = Math.max(0.08, Math.hypot(ls.x - rs.x, ls.y - rs.y));
  const tx = lhip.v > 0.4 && rhip.v > 0.4 ? (lhip.x + rhip.x) / 2 : sx;
  const K = 45, MAX = 95;

  const hand = (h, side) => {
    if (h.v < 0.4) return { x: side * 55, y: REST_HAND };
    let dx = (sx - h.x) / sw * K, dy = (h.y - sy) / sw * K;
    const len = Math.hypot(dx, dy);
    if (len > MAX) { dx *= MAX / len; dy *= MAX / len; }
    return { x: side * 25 + dx, y: 7 + dy };
  };
  const lean = nose.v > 0.4 ? clamp((0.9 - (sy - nose.y) / sw) * 30, -14, 14) : 0;
  return {
    x: clamp((0.5 - tx) * 1200, -430, 430),
    head: { x: nose.v > 0.4 ? clamp((sx - nose.x) / sw * 28, -24, 24) : 0, y: -68 + lean },
    left: hand(lh, -1),
    right: hand(rh, 1)
  };
}

export class World2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.players = new Map();
    this.localId = null;
    this.time = 0;
    this.keys = { left: false, right: false };
    this.w = 680; this.h = 367;
    this.resize();
    if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas);
    else window.addEventListener('resize', () => this.resize());

    const setKey = (e, down) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') this.keys.left = down;
      if (k === 'arrowright' || k === 'd') this.keys.right = down;
    };
    window.addEventListener('keydown', e => setKey(e, true));
    window.addEventListener('keyup', e => setKey(e, false));
    window.addEventListener('blur', () => { this.keys.left = this.keys.right = false; });

    this.last = performance.now();
    requestAnimationFrame(t => this.draw(t));
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return; // экран скрыт — размер определим, когда он появится
    const dpr = window.devicePixelRatio || 1;
    this.w = Math.max(680, r.width);
    this.h = Math.max(380, this.w * 0.54);
    this.canvas.width = Math.floor(this.w * dpr);
    this.canvas.height = Math.floor(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  ensurePlayer(id, info = {}) {
    const existing = this.players.get(id);
    if (existing) {
      if (info.name) existing.name = info.name;
      if (info.role) existing.role = info.role;
      if (info.skin) existing.skin = info.skin;
      return existing;
    }
    const x = (this.players.size % 4) * 130 - 195;
    const p = {
      id, x, targetX: x,
      name: info.name || 'Игрок',
      role: info.role || 'phone',
      skin: info.skin || { colors: DEFAULT_COLORS },
      head: { x: 0, y: -68 }, headT: { x: 0, y: -68 },
      hands: { left: { x: -52, y: REST_HAND }, right: { x: 52, y: REST_HAND } },
      handsT: { left: { x: -52, y: REST_HAND }, right: { x: 52, y: REST_HAND } }
    };
    this.players.set(id, p);
    return p;
  }

  removePlayer(id) { this.players.delete(id); }
  clear() { this.players.clear(); }

  applyMotion(id, payload) {
    const p = this.players.get(id);
    if (!p || !payload) return;
    const m = payload.landmarks ? poseToMotion(payload.landmarks) : payload;
    if (!m) return;
    if (m.x !== undefined) p.targetX = clamp(fin(m.x, p.targetX), -430, 430);
    const pt = (v, d) => (v && typeof v === 'object' ? { x: fin(v.x, d.x), y: fin(v.y, d.y) } : d);
    p.headT = pt(m.head, p.headT);
    p.handsT.left = pt(m.left, p.handsT.left);
    p.handsT.right = pt(m.right, p.handsT.right);
  }

  update(dt) {
    const k = Math.min(1, dt * 14), lim = this.w / 2 - 60;
    for (const p of this.players.values()) {
      if (p.id === this.localId) {
        if (this.keys.left) p.targetX -= dt * 170;
        if (this.keys.right) p.targetX += dt * 170;
      }
      p.targetX = clamp(p.targetX, -lim, lim);
      p.x += (p.targetX - p.x) * Math.min(1, dt * 7);
      p.head.x += (p.headT.x - p.head.x) * k;
      p.head.y += (p.headT.y - p.head.y) * k;
      for (const s of ['left', 'right']) {
        p.hands[s].x += (p.handsT[s].x - p.hands[s].x) * k;
        p.hands[s].y += (p.handsT[s].y - p.hands[s].y) * k;
      }
    }
  }

  draw(now) {
    requestAnimationFrame(t => this.draw(t));
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
    this.last = now;
    if (!this.canvas.offsetParent) return; // скрытый экран не рисуем
    this.time += dt;
    this.update(dt);
    const c = this.ctx, w = this.w, h = this.h;
    c.clearRect(0, 0, w, h);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0f141d'); g.addColorStop(1, '#090c12');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,.025)';
    for (let i = 0; i < 18; i++) {
      const x = ((i * 121 + this.time * 9) % (w + 80)) - 40, y = 45 + (i % 7) * 54;
      c.beginPath(); c.arc(x, y, 1.4, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = 'rgba(154,241,208,.09)';
    c.beginPath(); c.moveTo(0, h - 110); c.lineTo(w, h - 110); c.stroke();
    for (const p of this.players.values()) this.drawPlayer(p);
  }

  drawPlayer(p) {
    const c = this.ctx, h = this.h, cx = this.w / 2 + p.x, ground = h - 110, core = ground - 72;
    const colors = p.skin?.colors || DEFAULT_COLORS;
    const bob = Math.sin(this.time * 2 + p.x * 0.01) * 2;
    const head = { x: cx + p.head.x, y: core + p.head.y };
    const lh = { x: cx + p.hands.left.x, y: core + p.hands.left.y };
    const rh = { x: cx + p.hands.right.x, y: core + p.hands.right.y };

    c.fillStyle = 'rgba(154,241,208,.07)';
    c.beginPath(); c.ellipse(cx, ground + 10, 70, 8, 0, 0, Math.PI * 2); c.fill();

    c.strokeStyle = colors[1]; c.lineCap = 'round'; c.lineWidth = 15;
    c.beginPath();
    c.moveTo(cx - 25, core + 7 + bob); c.lineTo(lh.x, lh.y);
    c.moveTo(cx + 25, core + 7 + bob); c.lineTo(rh.x, rh.y);
    c.stroke();

    c.fillStyle = colors[0];
    c.beginPath(); c.arc(cx, core + bob, 30, 0, Math.PI * 2); c.fill();
    if (p.skin?.drawn) {
      let im = skinImages.get(p.skin.id);
      if (!im || im.src !== p.skin.drawn) { im = new Image(); im.src = p.skin.drawn; skinImages.set(p.skin.id, im); }
      if (im.complete && im.naturalWidth) c.drawImage(im, cx - 22, core + bob - 22, 44, 44);
    }

    c.fillStyle = colors[2];
    c.beginPath(); c.arc(head.x, head.y, 18, 0, Math.PI * 2); c.fill();
    c.fillStyle = colors[1];
    for (const pnt of [lh, rh]) { c.beginPath(); c.arc(pnt.x, pnt.y, 12, 0, Math.PI * 2); c.fill(); }
    c.lineWidth = 11;
    c.beginPath();
    c.moveTo(cx - 14, core + 25); c.lineTo(cx - 12, ground - 18);
    c.moveTo(cx + 14, core + 25); c.lineTo(cx + 12, ground - 18);
    c.stroke();

    c.fillStyle = '#9aa6b6'; c.font = '11px system-ui'; c.textAlign = 'center';
    c.fillText(p.name, cx, ground + 31);
    if (p.id === this.localId) {
      c.strokeStyle = 'rgba(154,241,208,.6)'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(cx, core, 47, 0, Math.PI * 2); c.stroke();
    }
  }
}
