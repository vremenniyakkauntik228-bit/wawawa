// Pure pose helpers shared by the browser UI and tests.
export const BODY_CONNECTIONS = [
  [0, 11], [0, 12], [11, 12],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31],
  [24, 26], [26, 28], [28, 30], [30, 32]
];

export const pointVisible = (p, threshold = 0.4) => Boolean(p && (p.visibility ?? 1) >= threshold);

export function analyzePose(landmarks, threshold = 0.4) {
  if (!Array.isArray(landmarks) || landmarks.length < 17) {
    return { visible: 0, essential: 0, bodyReady: false, leftRaised: false, rightRaised: false };
  }

  const visible = landmarks.reduce((n, p) => n + (pointVisible(p, threshold) ? 1 : 0), 0);
  // The 2D avatar only needs head + shoulders + arms. Hips/legs are useful when visible,
  // but should not make the phone calibration impossible in a small room.
  const essentialIndices = [0, 11, 12, 13, 14, 15, 16];
  const essential = essentialIndices.reduce((n, i) => n + (pointVisible(landmarks[i], threshold) ? 1 : 0), 0);
  const nose = landmarks[0], ls = landmarks[11], rs = landmarks[12];
  const lWrist = landmarks[15], rWrist = landmarks[16];
  const leftRaised = pointVisible(lWrist, threshold) && pointVisible(ls, threshold) && lWrist.y < ls.y - 0.05;
  const rightRaised = pointVisible(rWrist, threshold) && pointVisible(rs, threshold) && rWrist.y < rs.y - 0.05;
  const shouldersReady = pointVisible(nose, threshold) && pointVisible(ls, threshold) && pointVisible(rs, threshold);
  const armsReady = [13, 14, 15, 16].filter(i => pointVisible(landmarks[i], threshold)).length >= 2;
  return { visible, essential, bodyReady: shouldersReady && armsReady, leftRaised, rightRaised };
}
