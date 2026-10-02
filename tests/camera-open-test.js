const assert = require('node:assert/strict');

(async () => {
  const { openCamera, flipCamera, getFacing, stopStream } = await import('../public/js/pose.js?camera-test=' + Date.now());
  const calls = [];
  let streamNo = 0;

  const makeStream = () => {
    const track = {
      stopped: false,
      stop() { this.stopped = true; },
      getCapabilities() { return { zoom: { min: 0.5, max: 4 } }; },
      getSettings() { return { width: 1280, height: 720, zoom: 0.5 }; },
      async applyConstraints(value) { calls.push({ type: 'apply', value }); }
    };
    return {
      id: `fake-${++streamNo}`,
      getTracks: () => [track],
      getVideoTracks: () => [track],
      track
    };
  };

  navigator.mediaDevices = {
    async getUserMedia(constraints) {
      calls.push({ type: 'gum', constraints });
      return makeStream();
    }
  };

  const video = {
    srcObject: null,
    autoplay: false,
    playsInline: false,
    dataset: Object.create(null),
    videoWidth: 1280,
    videoHeight: 720,
    async play() { this.played = true; }
  };

  const first = await openCamera(video);
  assert.equal(video.srcObject, first);
  assert.equal(video.autoplay, true);
  assert.equal(video.playsInline, true);
  assert.equal(video.dataset.zoomApplied, 'true');
  assert.equal(getFacing(), 'user');
  assert.equal(calls[0].constraints.video.resizeMode.ideal, 'none');
  assert.equal(calls[0].constraints.video.facingMode.ideal, 'user');
  assert.ok(calls.some(x => x.type === 'apply' && x.value.advanced?.[0]?.zoom === 0.5));

  const previous = first;
  const second = await flipCamera(video);
  assert.equal(getFacing(), 'environment');
  assert.equal(video.dataset.facing, 'environment');
  assert.equal(video.srcObject, second);
  assert.equal(previous.track.stopped, true);
  assert.ok(calls.some(x => x.type === 'gum' && x.constraints.video.facingMode.ideal === 'environment'));

  stopStream(second);
  assert.equal(second.track.stopped, true);
  console.log('CAMERA OPEN TEST PASSED');
})().catch(err => {
  console.error('CAMERA OPEN TEST FAILED', err);
  process.exitCode = 1;
});
