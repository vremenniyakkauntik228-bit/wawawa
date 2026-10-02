const assert = require('node:assert/strict');
(async () => {
  const { analyzePose, poseToMotion, analyzeFace } = await import('../public/js/pose-utils.mjs');
  const p = Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
  p[0]={x:.5,y:.2,z:0,visibility:1};p[11]={x:.42,y:.32,z:-.04,visibility:1};p[12]={x:.58,y:.32,z:.04,visibility:1};
  p[13]={x:.32,y:.37,z:0,visibility:1};p[15]={x:.16,y:.34,z:0,visibility:1};p[14]={x:.68,y:.37,z:0,visibility:1};p[16]={x:.84,y:.34,z:0,visibility:1};
  p[23]={x:.45,y:.56,z:0,visibility:1};p[24]={x:.55,y:.56,z:0,visibility:1};
  const a=analyzePose(p);assert.equal(a.bodyReady,true);assert.equal(a.moveIntent,1);assert.ok(Math.abs(a.yaw)>0);
  const m=poseToMotion(p);assert.equal(m.moveIntent,1);assert.ok('yaw' in m && 'bodyY' in m);
  const f=Array.from({length:478},()=>({x:.5,y:.5}));f[33]={x:.4,y:.4};f[133]={x:.48,y:.4};f[362]={x:.52,y:.4};f[263]={x:.6,y:.4};f[1]={x:.51,y:.45};for(const i of [468,469,470,471,472])f[i]={x:.44,y:.4};for(const i of [473,474,475,476,477])f[i]={x:.56,y:.4};
  const face=analyzeFace(f);assert.ok(face);assert.ok(face.iris.left && face.iris.right);
  console.log('MOTION TEST PASSED');
})().catch(e=>{console.error('MOTION TEST FAILED',e);process.exitCode=1});
