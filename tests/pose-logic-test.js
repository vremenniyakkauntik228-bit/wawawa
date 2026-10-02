const assert = require('node:assert/strict');

(async () => {
  const { analyzePose, BODY_CONNECTIONS } = await import('../public/js/pose-utils.mjs');
  assert.ok(BODY_CONNECTIONS.length >= 15, 'skeleton should cover the core body');

  const full = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  full[0] = { x: 0.5, y: 0.20, visibility: 1 };
  full[11] = { x: 0.42, y: 0.32, visibility: 1 };
  full[12] = { x: 0.58, y: 0.32, visibility: 1 };
  full[13] = { x: 0.36, y: 0.38, visibility: 1 };
  full[14] = { x: 0.64, y: 0.38, visibility: 1 };
  full[15] = { x: 0.34, y: 0.22, visibility: 1 };
  full[16] = { x: 0.66, y: 0.22, visibility: 1 };

  // Legs can be completely unavailable in a small room and calibration must still pass.
  for (const i of [23, 24, 25, 26, 27, 28, 29, 30, 31, 32]) full[i] = { x: 0.5, y: 1.2, visibility: 0 };
  const ready = analyzePose(full);
  assert.equal(ready.bodyReady, true);
  assert.equal(ready.leftRaised, true);
  assert.equal(ready.rightRaised, true);
  assert.equal(ready.essential, 7);

  const noHead = full.map((p, i) => i === 0 ? { ...p, visibility: 0 } : p);
  assert.equal(analyzePose(noHead).bodyReady, false);

  const onlyOneArm = full.map((p, i) => [13, 14, 16].includes(i) ? { ...p, visibility: 0 } : p);
  assert.equal(analyzePose(onlyOneArm).bodyReady, false);

  assert.equal(analyzePose(null).bodyReady, false);
  console.log('POSE LOGIC TEST PASSED');
})().catch(err => {
  console.error('POSE LOGIC TEST FAILED', err);
  process.exitCode = 1;
});
