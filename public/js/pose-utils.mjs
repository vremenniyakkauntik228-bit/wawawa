// Pure tracking helpers. No DOM dependency so this file is easy to test.
export const BODY_CONNECTIONS = [
  [0, 11], [0, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 29], [29, 31],
  [24, 26], [26, 28], [28, 30], [30, 32]
];

export const FACE_EYE = {
  leftCorners: [33, 133],
  rightCorners: [362, 263],
  leftIris: [468, 469, 470, 471, 472],
  rightIris: [473, 474, 475, 476, 477]
};

export const pointVisible = (p, threshold = 0.35) =>
  Boolean(p && (p.visibility ?? p.presence ?? 1) >= threshold);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const avgPoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

export function analyzePose(landmarks, threshold = 0.35) {
  if (!Array.isArray(landmarks) || landmarks.length < 17) {
    return { visible: 0, essential: 0, bodyReady: false, leftRaised: false, rightRaised: false, moveIntent: 0, centerY: 0.5, yaw: 0 };
  }
  const visible = landmarks.reduce((n, p) => n + (pointVisible(p, threshold) ? 1 : 0), 0);
  const essentialIndices = [0, 11, 12, 13, 14, 15, 16];
  const essential = essentialIndices.reduce((n, i) => n + (pointVisible(landmarks[i], threshold) ? 1 : 0), 0);
  const nose = landmarks[0], ls = landmarks[11], rs = landmarks[12], lw = landmarks[15], rw = landmarks[16];
  const shouldersReady = [nose, ls, rs].every(p => pointVisible(p, threshold));
  const armCount = [13, 14, 15, 16].filter(i => pointVisible(landmarks[i], threshold)).length;
  const armsReady = armCount >= 2;
  const leftRaised = pointVisible(lw, threshold) && pointVisible(ls, threshold) && lw.y < ls.y - 0.05;
  const rightRaised = pointVisible(rw, threshold) && pointVisible(rs, threshold) && rw.y < rs.y - 0.05;

  let moveIntent = 0;
  if (pointVisible(lw, threshold) && pointVisible(ls, threshold)) {
    const dy = Math.abs(lw.y - ls.y);
    const dx = lw.x - ls.x;
    if (Math.abs(dx) > 0.18 && dy < 0.18) moveIntent = -1;
  }
  if (pointVisible(rw, threshold) && pointVisible(rs, threshold)) {
    const dy = Math.abs(rw.y - rs.y);
    const dx = rw.x - rs.x;
    if (Math.abs(dx) > 0.18 && dy < 0.18) moveIntent = 1;
  }

  const center = shouldersReady ? avgPoint(ls, rs) : nose;
  const centerY = Number.isFinite(center?.y) ? center.y : 0.5;
  // World-space shoulder depth gives a much more useful pseudo-3D facing signal than X alone.
  let yaw = 0;
  if (ls?.z != null && rs?.z != null) {
    const span = Math.max(0.05, Math.abs(rs.x - ls.x));
    yaw = clamp((rs.z - ls.z) / span / 1.8, -1, 1);
  }
  return { visible, essential, bodyReady: shouldersReady && armsReady, leftRaised, rightRaised, moveIntent, centerY, yaw };
}

export function poseToMotion(landmarks, options = {}) {
  if (!Array.isArray(landmarks) || landmarks.length < 17) return null;
  const threshold = Number(options.threshold ?? 0.35);
  const ls = landmarks[11], rs = landmarks[12];
  if (!pointVisible(ls, threshold) || !pointVisible(rs, threshold)) return null;
  const nose = landmarks[0], lh = landmarks[15], rh = landmarks[16];
  const lhip = landmarks[23], rhip = landmarks[24];
  const sx = (ls.x + rs.x) / 2;
  const sy = (ls.y + rs.y) / 2;
  const sw = Math.max(0.08, Math.hypot(ls.x - rs.x, ls.y - rs.y));
  const tx = pointVisible(lhip, threshold) && pointVisible(rhip, threshold) ? (lhip.x + rhip.x) / 2 : sx;
  const moveSensitivity = Number(options.moveSensitivity ?? 1);
  const K = 48 * moveSensitivity;
  const MAX = 110 * moveSensitivity;
  const hand = (h, side) => {
    if (!pointVisible(h, threshold)) return { x: side * 55, y: 45 };
    let dx = (sx - h.x) / sw * K;
    let dy = (h.y - sy) / sw * K;
    const len = Math.hypot(dx, dy);
    if (len > MAX) { dx *= MAX / len; dy *= MAX / len; }
    return { x: side * 25 + dx, y: 7 + dy };
  };
  const headX = pointVisible(nose, threshold) ? clamp((sx - nose.x) / sw * 34, -30, 30) : 0;
  const lean = pointVisible(nose, threshold) ? clamp((sy - nose.y) / sw * 22, -18, 18) : 0;
  let yaw = 0;
  if (ls.z != null && rs.z != null) {
    const span = Math.max(0.05, Math.abs(rs.x - ls.x));
    yaw = clamp((rs.z - ls.z) / span / 1.8, -1, 1);
  }
  const left = hand(lh, -1), right = hand(rh, 1);
  const moveIntent = analyzePose(landmarks, threshold).moveIntent;
  return {
    x: clamp((0.5 - tx) * 1250, -460, 460),
    head: { x: headX, y: -72 + lean },
    left,
    right,
    yaw,
    bodyY: (sy + (pointVisible(lhip, threshold) && pointVisible(rhip, threshold) ? (lhip.y + rhip.y) / 2 : sy)) / 2,
    moveIntent
  };
}

function irisCenter(landmarks, indices) {
  const pts = indices.map(i => landmarks[i]).filter(Boolean);
  if (!pts.length) return null;
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
}

function normalizedIris(landmarks, corners, iris) {
  const a = landmarks[corners[0]], b = landmarks[corners[1]], c = irisCenter(landmarks, iris);
  if (!a || !b || !c) return null;
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x), minY = Math.min(a.y, b.y) - (maxX - minX) * .4, maxY = Math.max(a.y, b.y) + (maxX - minX) * .4;
  const w = Math.max(.01, maxX - minX), h = Math.max(.01, maxY - minY);
  return { x: clamp((c.x - minX) / w * 2 - 1, -1, 1), y: clamp((c.y - minY) / h * 2 - 1, -1, 1) };
}

export function analyzeFace(landmarks, threshold = 0.35) {
  if (!Array.isArray(landmarks) || landmarks.length < 478) return null;
  const left = normalizedIris(landmarks, FACE_EYE.leftCorners, FACE_EYE.leftIris);
  const right = normalizedIris(landmarks, FACE_EYE.rightCorners, FACE_EYE.rightIris);
  if (!left || !right) return null;
  const eye = { x: clamp((left.x + right.x) / 2, -1, 1), y: clamp((left.y + right.y) / 2, -1, 1) };
  const le = landmarks[33], re = landmarks[263], nose = landmarks[1];
  const faceWidth = le && re ? Math.max(.04, Math.abs(re.x - le.x)) : .2;
  const eyeCenter = { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2 };
  const yaw = nose ? clamp((nose.x - eyeCenter.x) / faceWidth * 2.2, -1, 1) : 0;
  const pitch = nose ? clamp((nose.y - eyeCenter.y) / faceWidth * 1.8, -1, 1) : 0;
  const roll = le && re ? clamp(Math.atan2(re.y - le.y, re.x - le.x) / (Math.PI / 4), -1, 1) : 0;
  const size = faceWidth;
  return { gaze: eye, yaw, pitch, roll, faceSize: size, iris: { left: irisCenter(landmarks, FACE_EYE.leftIris), right: irisCenter(landmarks, FACE_EYE.rightIris) } };
}
