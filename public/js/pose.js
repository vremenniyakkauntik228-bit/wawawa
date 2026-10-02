const MP_VERSION = '0.10.22';
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MP_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

let landmarker = null;
let initPromise = null;
let facing = 'user';
let generation = 0;

export const getFacing = () => facing;

export function initPose() {
  if (landmarker) return Promise.resolve(landmarker);
  initPromise ??= (async () => {
    const { PoseLandmarker, FilesetResolver } = await import(MP_MODULE);
    const vision = await FilesetResolver.forVisionTasks(MP_WASM);
    const make = delegate => PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.4,
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4
    });
    try {
      landmarker = await make('GPU');
    } catch (e) {
      console.warn('GPU delegate недоступен, переключаюсь на CPU', e);
      landmarker = await make('CPU');
    }
    return landmarker;
  })().catch(e => {
    initPromise = null;
    throw e;
  });
  return initPromise;
}

export function stopStream(stream) {
  stream?.getTracks?.().forEach(t => t.stop());
}

function widestCameraConstraints() {
  return {
    video: {
      facingMode: { ideal: facing },
      width: { min: 640, ideal: 1280, max: 1920 },
      height: { min: 360, ideal: 720, max: 1080 },
      frameRate: { ideal: 30, max: 30 },
      // Prefer the camera/driver's native framing and avoid browser-side crop-and-scale.
      resizeMode: { ideal: 'none' }
    },
    audio: false
  };
}

async function forceWidestView(stream) {
  const track = stream?.getVideoTracks?.()[0];
  if (!track) return { zoomSupported: false, zoomApplied: false };
  const caps = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
  let zoomSupported = false;
  let zoomApplied = false;
  let zoom = null;
  if (caps.zoom && Number.isFinite(caps.zoom.min)) {
    zoomSupported = true;
    zoom = Number(caps.zoom.min);
    try {
      await track.applyConstraints({ advanced: [{ zoom }] });
      zoomApplied = true;
    } catch (e) {
      console.info('Не удалось применить минимальный zoom камеры:', e);
    }
  }
  return { zoomSupported, zoomApplied, zoom, capabilities: caps, settings: track.getSettings?.() || {} };
}

export async function openCamera(video) {
  // The caller stops inference when starting from scratch. During a camera flip we keep
  // the existing inference loop alive so the green skeleton does not disappear.
  const previous = video?.srcObject;
  stopStream(previous);
  const stream = await navigator.mediaDevices.getUserMedia(widestCameraConstraints());
  try {
    const diagnostics = await forceWidestView(stream);
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    await video.play();
    if (!video.videoWidth) await new Promise(resolve => video.addEventListener('loadedmetadata', resolve, { once: true }));
    video.dataset.facing = facing;
    video.dataset.zoomSupported = String(diagnostics.zoomSupported);
    video.dataset.zoomApplied = String(diagnostics.zoomApplied);
    video.dataset.cameraWidth = String(diagnostics.settings.width || '');
    video.dataset.cameraHeight = String(diagnostics.settings.height || '');
    return stream;
  } catch (e) {
    stopStream(stream);
    throw e;
  }
}

export async function flipCamera(video) {
  const prev = facing;
  facing = facing === 'user' ? 'environment' : 'user';
  try {
    return await openCamera(video);
  } catch (e) {
    facing = prev;
    // Try to leave the user with a working camera instead of a blank screen.
    try { return await openCamera(video); } catch { stopTracking(); throw e; }
  }
}

export async function track(video, onPose) {
  await initPose();
  const my = ++generation;
  let lastInference = 0;
  const loop = () => {
    if (my !== generation) return;
    const now = performance.now();
    // Mobile devices benefit from a stable ~30 FPS inference cadence instead of running
    // as fast as requestAnimationFrame allows.
    if (video.readyState >= 2 && now - lastInference >= 30) {
      lastInference = now;
      try {
        const r = landmarker.detectForVideo(video, now);
        const landmarks = r?.landmarks?.[0] || null;
        onPose(landmarks, r?.worldLandmarks?.[0] || null);
      } catch (e) {
        console.warn('pose', e);
      }
    }
    requestAnimationFrame(loop);
  };
  loop();
}

export function stopTracking() {
  generation++;
}
