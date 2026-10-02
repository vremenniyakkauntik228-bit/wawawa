const MP_VERSION = '0.10.22';
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MP_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

let landmarker = null;
let initPromise = null;
let facing = 'user';
let generation = 0; // каждый новый track()/stopTracking() делает старый цикл недействительным

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
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    try { landmarker = await make('GPU'); } catch (e) {
      console.warn('GPU delegate недоступен, переключаюсь на CPU', e);
      landmarker = await make('CPU');
    }
    return landmarker;
  })().catch(e => { initPromise = null; throw e; });
  return initPromise;
}

export function stopStream(stream) {
  stream?.getTracks?.().forEach(t => t.stop());
}

// Не останавливает трекинг: после переворота камеры цикл продолжает читать тот же <video>.
export async function openCamera(video) {
  stopStream(video.srcObject);
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

export async function flipCamera(video) {
  const prev = facing;
  facing = facing === 'user' ? 'environment' : 'user';
  try { return await openCamera(video); } catch (e) { facing = prev; throw e; }
}

export async function track(video, onPose) {
  await initPose();
  const my = ++generation;
  let lastTime = -1, lastTs = 0;
  const loop = () => {
    if (my !== generation) return;
    const now = performance.now();
    if (video.readyState >= 2 && video.currentTime !== lastTime && now > lastTs) {
      lastTime = video.currentTime;
      lastTs = now;
      try {
        const r = landmarker.detectForVideo(video, now);
        if (r?.landmarks?.[0]) onPose(r.landmarks[0], r.worldLandmarks?.[0] || null);
      } catch (e) { console.warn('pose', e); }
    }
    requestAnimationFrame(loop);
  };
  loop();
}

export function stopTracking() { generation++; }
