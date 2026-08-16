/* ============================================================
   Gesture-controlled experience
   - Hand tracking via MediaPipe Tasks Vision (HandLandmarker)
   - Core interaction: 👌 play music / 👊 stop music / ✌️ blur foto / 🤚 halo
   ============================================================ */

import {
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

/* ----------------------------- DOM ----------------------------- */

const el = {
  landing: document.getElementById("landing"),
  loading: document.getElementById("loading"),
  errorScreen: document.getElementById("error-screen"),
  errorTitle: document.getElementById("error-title"),
  errorDetail: document.getElementById("error-detail"),
  retryBtn: document.getElementById("retry-btn"),
  startBtn: document.getElementById("start-btn"),
  experience: document.getElementById("experience"),
  statusText: document.getElementById("status-text"),
  photoFrame: document.querySelector(".photo-frame"),
  photo: document.getElementById("photo"),
  halo: document.getElementById("hero-halo"),
  feedback: document.getElementById("feedback"),
  hints: {
    peace: document.querySelector('[data-hint="peace"]'),
    palm: document.querySelector('[data-hint="palm"]'),
    ok: document.querySelector('[data-hint="ok"]'),
    thumbsUp: document.querySelector('[data-hint="thumbsUp"]'),
  },
  video: document.getElementById("camera-video"),
  canvas: document.getElementById("camera-canvas"),
  muteBtn: document.getElementById("mute-btn"),
  enableSoundBtn: document.getElementById("enable-sound-btn"),
  audioBlur: document.getElementById("audio-blur"),
};

/* ----------------------------- State ----------------------------- */

const state = {
  handLandmarker: null,
  stream: null,
  rafId: null,
  muted: false,
  soundBlocked: false,
  currentGesture: null, // 'peace' | 'palm' | 'ok' | 'thumbsUp' | null
  gestureStableFrames: 0,
  lastFiredGesture: null, // gesture that last triggered an action (reset when gesture clears)
  isMusicPlaying: false,
  haloTimeout: null,
  lastVideoTime: -1,
};

const STABLE_FRAMES_NEEDED = 4; // debounce: gesture must hold for N frames
const HALO_VISIBLE_MS = 2200;

/* ----------------------------- Audio helpers ----------------------------- */

function playMusic() {
  if (state.isMusicPlaying) return;
  state.isMusicPlaying = true;
  attemptPlay(el.audioBlur);
}

function stopMusic() {
  state.isMusicPlaying = false;
  el.audioBlur.pause();
  el.audioBlur.currentTime = 0;
}

function attemptPlay(audioEl) {
  if (state.muted) return;
  const p = audioEl.play();
  if (p && typeof p.catch === "function") {
    p.catch(() => {
      // autoplay blocked or file missing — offer manual enable, don't crash
      state.soundBlocked = true;
      el.enableSoundBtn.classList.remove("hidden");
    });
  }
}

el.muteBtn.addEventListener("click", () => {
  state.muted = !state.muted;
  el.muteBtn.setAttribute("aria-pressed", String(state.muted));
  el.muteBtn.style.color = state.muted ? "var(--rose)" : "";
});

el.enableSoundBtn.addEventListener("click", () => {
  state.soundBlocked = false;
  el.enableSoundBtn.classList.add("hidden");
  // a user gesture (tap) is happening right now, so this unlocks autoplay
  el.audioBlur.play().then(() => el.audioBlur.pause()).catch(() => {});
});

/* ----------------------------- UI actions per gesture ----------------------------- */

function showFeedback(text) {
  el.feedback.textContent = text;
  el.feedback.classList.add("is-visible");
  clearTimeout(showFeedback._t);
  showFeedback._t = setTimeout(() => el.feedback.classList.remove("is-visible"), 1800);
}

function setActiveHint(name) {
  Object.entries(el.hints).forEach(([key, node]) => {
    if (!node) return;
    node.classList.toggle("is-active", key === name);
  });
}

function onPeaceDetected() {
  // peace only blurs the photo, no audio tied to it anymore
  el.photo.classList.add("is-blurred");
  el.photoFrame.classList.add("is-active");
  showFeedback("✌️ Foto jadi blur");
}

function onPalmDetected() {
  el.halo.classList.add("is-visible");
  clearTimeout(state.haloTimeout);
  state.haloTimeout = setTimeout(() => el.halo.classList.remove("is-visible"), HALO_VISIBLE_MS);
  showFeedback("🤚 Halo");
}

function onOkDetected() {
  playMusic();
  showFeedback("👌 Musik diputar");
}

function onThumbsUpDetected() {
  stopMusic();
  showFeedback("👍 Musik berhenti");
}

function onGestureCleared() {
  // peace releasing un-blurs the photo again
  el.photo.classList.remove("is-blurred");
  el.photoFrame.classList.remove("is-active");
  setActiveHint(null);
}

/* ----------------------------- Gesture math ----------------------------- */

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isExtended(landmarks, tipIdx, pipIdx, wristIdx = 0, margin = 1.12) {
  const wrist = landmarks[wristIdx];
  return dist(landmarks[tipIdx], wrist) > dist(landmarks[pipIdx], wrist) * margin;
}

// Classifies a single hand into 'peace' | 'palm' | 'ok' | 'thumbsUp' | null
function classifyHand(landmarks) {
  const thumb = isExtended(landmarks, 4, 2, 0, 1.05);
  const index = isExtended(landmarks, 8, 6);
  const middle = isExtended(landmarks, 12, 10);
  const ring = isExtended(landmarks, 16, 14);
  const pinky = isExtended(landmarks, 20, 18);

  // 👌 OK: thumb tip pinched against index tip, other three fingers extended
  const handScale = dist(landmarks[0], landmarks[9]) || 0.001; // wrist -> middle MCP, for scale
  const isPinching = dist(landmarks[4], landmarks[8]) < handScale * 0.55;
  if (isPinching && middle && ring && pinky) return "ok";

  // 👍 Thumbs up: only the thumb extended, the other four fingers folded,
  // and the thumb tip clearly above the wrist (pointing up, not sideways)
  const thumbPointsUp = landmarks[4].y < landmarks[0].y - Math.abs(landmarks[4].x - landmarks[0].x) * 0.4;
  if (thumb && !index && !middle && !ring && !pinky && thumbPointsUp) return "thumbsUp";

  // ✌️ Peace: index + middle only
  if (index && middle && !ring && !pinky) return "peace";

  // 🤚 Open palm: (roughly) everything extended
  if (thumb && index && middle && ring && pinky) return "palm";

  return null;
}

/* ----------------------------- Model setup ----------------------------- */

async function initModels() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  state.handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
  });
}

/* ----------------------------- Camera ----------------------------- */

async function initCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  state.stream = stream;
  el.video.srcObject = stream;
  await el.video.play();
  el.canvas.width = el.video.videoWidth || 320;
  el.canvas.height = el.video.videoHeight || 240;
}

/* ----------------------------- Main loop ----------------------------- */

function detectLoop() {
  state.rafId = requestAnimationFrame(detectLoop);

  if (!el.video.videoWidth) return;
  if (el.video.currentTime === state.lastVideoTime) return; // no new frame yet
  state.lastVideoTime = el.video.currentTime;

  const now = performance.now();
  const handResult = state.handLandmarker.detectForVideo(el.video, now);

  let gesture = null;

  if (handResult.landmarks && handResult.landmarks.length > 0) {
    const landmarks = handResult.landmarks[0];
    gesture = classifyHand(landmarks);
  }

  handleGesture(gesture);
}

function handleGesture(gesture) {
  if (gesture === state.currentGesture) {
    state.gestureStableFrames++;
  } else {
    state.currentGesture = gesture;
    state.gestureStableFrames = 1;
  }

  if (!gesture) {
    if (state.lastFiredGesture) onGestureCleared();
    state.lastFiredGesture = null;
    el.statusText.textContent = "Reading gesture…";
    return;
  }

  const labels = {
    peace: "✌️ Peace detected",
    palm: "🤚 Palm detected",
    ok: "👌 OK detected",
    thumbsUp: "👍 Thumbs up detected",
  };
  el.statusText.textContent = labels[gesture] || "Reading gesture…";
  setActiveHint(gesture);

  const isStable = state.gestureStableFrames >= STABLE_FRAMES_NEEDED;
  const isNewFire = state.lastFiredGesture !== gesture;

  if (isStable && isNewFire) {
    state.lastFiredGesture = gesture;
    if (gesture === "peace") onPeaceDetected();
    else if (gesture === "palm") onPalmDetected();
    else if (gesture === "ok") onOkDetected();
    else if (gesture === "thumbsUp") onThumbsUpDetected();
  }
}

/* ----------------------------- Flow control ----------------------------- */

function showScreen(name) {
  [el.landing, el.loading, el.errorScreen, el.experience].forEach((s) => s.classList.add("hidden"));
  el[name].classList.remove("hidden");
}

async function startExperience() {
  showScreen("loading");
  try {
    await initCamera();
    el.statusText.textContent = "Loading model…";
    await initModels();
    showScreen("experience");
    detectLoop();
  } catch (err) {
    handleStartupError(err);
  }
}

function handleStartupError(err) {
  console.error(err);
  let title = "Camera access is required for the gesture experience.";
  let detail = "";

  if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
    title = "Camera access is required for the gesture experience.";
    detail = "Izinkan akses kamera di pengaturan browser lalu coba lagi.";
  } else if (err && err.name === "NotFoundError") {
    title = "No camera was found on this device.";
  } else if (!navigator.mediaDevices || !window.isSecureContext) {
    title = "Your browser doesn't support this experience.";
    detail = "Buka halaman ini lewat HTTPS di browser modern.";
  } else {
    title = "Something interrupted the gesture experience.";
    detail = "Coba muat ulang halaman.";
  }

  el.errorTitle.textContent = title;
  el.errorDetail.textContent = detail;
  showScreen("error-screen");
}

el.startBtn.addEventListener("click", startExperience);
el.retryBtn.addEventListener("click", startExperience);

/* Handle orientation changes without breaking detection */
window.addEventListener("resize", () => {
  if (el.video.videoWidth) {
    el.canvas.width = el.video.videoWidth;
    el.canvas.height = el.video.videoHeight;
  }
});

window.addEventListener("beforeunload", () => {
  if (state.rafId) cancelAnimationFrame(state.rafId);
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
});
