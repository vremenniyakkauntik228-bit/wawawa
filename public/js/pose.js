const MP_WASM='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm';
const MP_MODULE='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs';
const MODEL='https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
let landmarker=null,running=false,facing='user';
export async function initPose(){if(landmarker)return landmarker;const {PoseLandmarker,FilesetResolver}=await import(MP_MODULE);const vision=await FilesetResolver.forVisionTasks(MP_WASM);landmarker=await PoseLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:MODEL,delegate:'GPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5});return landmarker}
export async function openCamera(video){stopTracking();const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720}},audio:false});video.srcObject=stream;await video.play();return stream}
export async function flipCamera(video){facing=facing==='user'?'environment':'user';return openCamera(video)}
export async function track(video,onPose){await initPose();running=true;let last=-1;const loop=()=>{if(!running)return;if(video.readyState>=2&&video.currentTime!==last){last=video.currentTime;try{const r=landmarker.detectForVideo(video,performance.now());if(r?.landmarks?.[0])onPose(r.landmarks[0],r.worldLandmarks?.[0]||null)}catch(e){console.warn('pose',e)}}requestAnimationFrame(loop)};loop()}
export function stopTracking(){running=false}
export function stopStream(stream){stream?.getTracks?.().forEach(t=>t.stop())}
