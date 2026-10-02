const assert = require('node:assert/strict');

(async () => {
  const { openCamera, flipCamera, getFacing, stopStream } = await import('../public/js/pose.js?camera-test=' + Date.now());
  const calls = [];
  let streamNo = 0;
  let videoForTest = null;
  let streamForTest = null;

  const makeStream = () => {
    const track = {
      stopped: false,
      stop() { this.stopped = true; },
      getCapabilities() { return { zoom: { min: 0.5, max: 4 } }; },
      getSettings() { return { width: 1280, height: 720, zoom: 0.5 }; },
      async applyConstraints(value) { calls.push({ type: 'apply', value, attached: videoForTest?.srcObject === streamForTest }); }
    };
    const stream = {
      id: `fake-${++streamNo}`,
      getTracks: () => [track],
      getVideoTracks: () => [track],
      track
    };
    streamForTest = stream;
    return stream;
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
  videoForTest = video;

  const first = await openCamera(video);
  assert.equal(video.srcObject, first);
  assert.equal(video.autoplay, true);
  assert.equal(video.playsInline, true);
  assert.equal(video.dataset.zoomApplied, 'true');
  assert.equal(getFacing(), 'user');
  assert.equal(calls[0].constraints.video.resizeMode.ideal, 'none');
  assert.equal(calls[0].constraints.video.facingMode.ideal, 'user');
  assert.ok(calls.some(x => x.type === 'apply' && x.value.advanced?.[0]?.zoom === 0.5));
  assert.ok(calls.some(x => x.type === 'apply' && x.attached === true));

  const previous = first;
  const second = await flipCamera(video);
  assert.equal(getFacing(), 'environment');
  assert.equal(video.dataset.facing, 'environment');
  assert.equal(video.srcObject, second);
  assert.equal(previous.track.stopped, true);
  assert.ok(calls.some(x => x.type === 'gum' && x.constraints.video.facingMode.ideal === 'environment'));

  stopStream(second);
  assert.equal(second.track.stopped, true);

  // Regression: a mobile driver may hang in applyConstraints(). The preview must
  // already be attached to <video>, and openCamera must still return promptly.
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
  navigator.mediaDevices.getUserMedia = async () => {
    const track = {
      stopped: false,
      stop() { this.stopped = true; },
      getCapabilities() { return { zoom: { min: 0.5, max: 4 } }; },
      getSettings() { return { width: 1280, height: 720, zoom: 1 }; },
      async applyConstraints() { await new Promise(() => {}); }
    };
    const stream = { getTracks: () => [track], getVideoTracks: () => [track], track };
    return stream;
  };
  video.srcObject = null;
  video.videoWidth = 1280;
  video.videoHeight = 720;
  const started = Date.now();
  const third = await openCamera(video);
  assert.equal(video.srcObject, third);
  assert.ok(Date.now() - started < 1800, 'hung camera constraints blocked preview startup');
  stopStream(third);
  navigator.mediaDevices.getUserMedia = originalGetUserMedia;

  console.log('CAMERA OPEN TEST PASSED');
})().catch(err => {
  console.error('CAMERA OPEN TEST FAILED', err);
  process.exitCode = 1;
});
