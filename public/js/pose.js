import { analyzeFace, analyzePose } from './pose-utils.mjs';

const MP_VERSION = '0.10.22';
const MP_WASM_URLS = [
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`,
  `https://unpkg.com/@mediapipe/tasks-vision@${MP_VERSION}/wasm`
];
const MP_MODULE_URLS = [
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`,
  `https://unpkg.com/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`
];
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let poseLandmarker = null, faceLandmarker = null;
let poseInit = null, faceInit = null, visionModulePromise = null;
let facing = 'user';
let poseGeneration = 0, faceGeneration = 0;

export const getFacing = () => facing;
export const getTrackingState = () => ({ pose: Boolean(poseLandmarker), face: Boolean(faceLandmarker) });

async function loadVisionModule() {
  if (visionModulePromise) return visionModulePromise;
  visionModulePromise = (async () => {
    let last;
    for (const url of MP_MODULE_URLS) {
      try { return await import(url); } catch (e) { last = e; }
    }
    throw new Error(`MediaPipe не загрузился. Проверь интернет/блокировщик CDN. ${last?.message || ''}`);
  })();
  try { return await visionModulePromise; } catch (e) { visionModulePromise = null; throw e; }
}

async function getVision() {
  const { FilesetResolver } = await loadVisionModule();
  let last;
  for (const base of MP_WASM_URLS) {
    try { return await FilesetResolver.forVisionTasks(base); } catch (e) { last = e; }
  }
  throw new Error(`WASM MediaPipe не загрузился. ${last?.message || ''}`);
}

export function initPose() {
  if (poseLandmarker) return Promise.resolve(poseLandmarker);
  poseInit ??= (async () => {
    const { PoseLandmarker } = await loadVisionModule();
    const vision = await getVision();
    const opts = delegate => PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate },
      runningMode: 'VIDEO', numPoses: 1,
      minPoseDetectionConfidence: .35, minPosePresenceConfidence: .35, minTrackingConfidence: .35
    });
    try { poseLandmarker = await opts('GPU'); }
    catch { poseLandmarker = await opts('CPU'); }
    return poseLandmarker;
  })().catch(e => { poseInit = null; throw e; });
  return poseInit;
}

export function initFace() {
  if (faceLandmarker) return Promise.resolve(faceLandmarker);
  faceInit ??= (async () => {
    const { FaceLandmarker } = await loadVisionModule();
    const vision = await getVision();
    const opts = delegate => FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate },
      runningMode: 'VIDEO', numFaces: 1,
      outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
      minFaceDetectionConfidence: .35, minFacePresenceConfidence: .35, minTrackingConfidence: .35
    });
    try { faceLandmarker = await opts('GPU'); }
    catch { faceLandmarker = await opts('CPU'); }
    return faceLandmarker;
  })().catch(e => { faceInit = null; throw e; });
  return faceInit;
}

export function stopStream(stream) { stream?.getTracks?.().forEach(t => { try { t.stop(); } catch {} }); }

function widestCameraConstraints() {
  return {
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 1280, min: 640 },
      height: { ideal: 720, min: 360 },
      frameRate: { ideal: 30, max: 30 },
      resizeMode: { ideal: 'none' }
    }, audio: false
  };
}

async function withTimeout(promise, ms, fallback) {
  let timer;
  try { return await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve(fallback), ms); })]); }
  finally { clearTimeout(timer); }
}

async function optionalCameraTuning(stream) {
  const track = stream?.getVideoTracks?.()[0];
  if (!track) return {};
  const caps = track.getCapabilities?.() || {};
  const settingsBefore = track.getSettings?.() || {};
  const out = { capabilities: caps, settings: settingsBefore, zoomSupported: false, zoomApplied: false };
  if (caps.zoom && Number.isFinite(caps.zoom.min)) {
    out.zoomSupported = true;
    out.zoom = caps.zoom.min;
    try { await withTimeout(track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] }), 700, null); out.zoomApplied = true; } catch {}
  }
  out.settings = track.getSettings?.() || settingsBefore;
  return out;
}

function waitVideoFrame(video, ms = 4500) {
  return new Promise((resolve, reject) => {
    const fail = setTimeout(() => reject(new Error('Камера включилась, но браузер не отдал видеокадр.')), ms);
    const done = () => { clearTimeout(fail); resolve(); };
    if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
      if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(done); else if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(done); else setTimeout(done, 0);
      return;
    }
    video.addEventListener('loadedmetadata', () => {
      if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(done); else video.addEventListener('canplay', done, { once: true });
    }, { once: true });
    video.addEventListener('error', () => { clearTimeout(fail); reject(new Error('Браузер не смог отобразить видеопоток камеры.')); }, { once: true });
  });
}

export async function openCamera(video) {
  if (!video) throw new Error('Элемент видео камеры не найден.');
  const previous = video.srcObject;
  if (previous) stopStream(previous);
  video.autoplay = true; video.playsInline = true; video.muted = true;

  const stream = await navigator.mediaDevices.getUserMedia(widestCameraConstraints());
  try {
    // The preview is attached immediately. No video.load() and no camera constraint wait here.
    video.srcObject = stream;
    await video.play().catch(() => {});
    await waitVideoFrame(video);
    const diagnostics = await withTimeout(optionalCameraTuning(stream), 800, {});
    const settings = diagnostics.settings || stream.getVideoTracks?.()[0]?.getSettings?.() || {};
    video.dataset.facing = facing;
    video.dataset.zoomSupported = String(Boolean(diagnostics.zoomSupported));
    video.dataset.zoomApplied = String(Boolean(diagnostics.zoomApplied));
    video.dataset.cameraWidth = String(settings.width || video.videoWidth || '');
    video.dataset.cameraHeight = String(settings.height || video.videoHeight || '');
    video.dataset.cameraLive = 'true';
    return stream;
  } catch (e) {
    stopStream(stream);
    try { video.pause(); video.srcObject = null; } catch {}
    throw e;
  }
}

export async function flipCamera(video) {
  const old = facing;
  facing = facing === 'user' ? 'environment' : 'user';
  try { return await openCamera(video); }
  catch (e) { facing = old; return openCamera(video); }
}

export function stopTracking() { poseGeneration++; faceGeneration++; }

export function startBodyTracking(video, { onPose, onStatus, threshold = .35, fps = 22 } = {}) {
  const my = ++poseGeneration;
  let stopped = false, last = 0, errorReported = false;
  const begin = async () => {
    try {
      onStatus?.({ state: 'loading' });
      const landmarker = await initPose();
      if (stopped || my !== poseGeneration) return;
      onStatus?.({ state: 'ready' });
      const minDelta = 1000 / Math.max(8, fps);
      const loop = now => {
        if (stopped || my !== poseGeneration) return;
        if (video.readyState >= 2 && now - last >= minDelta) {
          last = now;
          try {
            const result = landmarker.detectForVideo(video, now);
            onPose?.(result?.landmarks?.[0] || null, result?.worldLandmarks?.[0] || null, analyzePose(result?.landmarks?.[0] || null, threshold));
          } catch (e) {
            if (!errorReported) { errorReported = true; console.warn('Pose tracking error', e); onStatus?.({ state: 'error', error: e }); }
          }
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch (e) {
      if (!errorReported) { errorReported = true; console.warn('Pose model failed', e); onStatus?.({ state: 'error', error: e }); }
    }
  };
  begin();
  return () => { stopped = true; if (my === poseGeneration) poseGeneration++; };
}

export function startFaceTracking(video, { onFace, onStatus, fps = 12 } = {}) {
  const my = ++faceGeneration;
  let stopped = false, last = 0, errorReported = false;
  const begin = async () => {
    try {
      onStatus?.({ state: 'loading' });
      const landmarker = await initFace();
      if (stopped || my !== faceGeneration) return;
      onStatus?.({ state: 'ready' });
      const minDelta = 1000 / Math.max(6, fps);
      const loop = now => {
        if (stopped || my !== faceGeneration) return;
        if (video.readyState >= 2 && now - last >= minDelta) {
          last = now;
          try {
            const result = landmarker.detectForVideo(video, now);
            const lm = result?.faceLandmarks?.[0] || null;
            onFace?.(lm, analyzeFace(lm));
          } catch (e) {
            if (!errorReported) { errorReported = true; console.warn('Face tracking error', e); onStatus?.({ state: 'error', error: e }); }
          }
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch (e) {
      if (!errorReported) { errorReported = true; console.warn('Face model failed', e); onStatus?.({ state: 'error', error: e }); }
    }
  };
  begin();
  return () => { stopped = true; if (my === faceGeneration) faceGeneration++; };
}
