// camera.js — getUserMedia, zoom, flash, grid, timer, shutter

const Camera = (() => {
  let stream = null;
  let videoEl = null;
  let overlayCanvas = null;
  let overlayCtx = null;
  let currentFacingMode = 'environment';
  let zoomLevel = 1;
  let maxZoom = 5;
  let torchOn = false;
  let timerInterval = null;
  let overlayInterval = null;
  let isCameraActive = false;
  let wakeLock = null;
  let onCaptureCallback = null;
  let settings = {};
  let touchStartDist = null;
  let zoomAtTouchStart = 1;

  const SHUTTER_AUDIO = (() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      return ctx;
    } catch { return null; }
  })();

  function playShutter() {
    if (!SHUTTER_AUDIO) return;
    const o = SHUTTER_AUDIO.createOscillator();
    const g = SHUTTER_AUDIO.createGain();
    o.connect(g); g.connect(SHUTTER_AUDIO.destination);
    o.type = 'sine'; o.frequency.setValueAtTime(1200, SHUTTER_AUDIO.currentTime);
    g.gain.setValueAtTime(0.3, SHUTTER_AUDIO.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, SHUTTER_AUDIO.currentTime + 0.12);
    o.start(); o.stop(SHUTTER_AUDIO.currentTime + 0.12);
  }

  async function start(video, overlay, cfg) {
    videoEl = video;
    overlayCanvas = overlay;
    overlayCtx = overlay.getContext('2d');
    settings = cfg || Storage.getSettings();

    await _startStream();
    _attachZoomEvents();
    isCameraActive = true;
    _startOverlayLoop();
    if (settings.preventSleep) _requestWakeLock();
  }

  async function _startStream() {
    if (stream) _stopStream();
    const constraints = {
      video: {
        facingMode: currentFacingMode,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = stream;
    await new Promise(res => { videoEl.onloadedmetadata = res; });
    await videoEl.play();

    // Check zoom capability
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (caps.zoom) {
      maxZoom = caps.zoom.max || 5;
    }
    zoomLevel = 1;
    settings._isFrontCamera = (currentFacingMode === 'user');
  }

  function _stopStream() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
  }

  function stop() {
    isCameraActive = false;
    _stopStream();
    if (overlayInterval) { clearInterval(overlayInterval); overlayInterval = null; }
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }

  async function switchCamera() {
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    await _startStream();
  }

  // ---- Torch ----
  async function toggleTorch() {
    if (!stream) return false;
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (!caps.torch) return false;
    torchOn = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: torchOn }] });
      return torchOn;
    } catch { torchOn = false; return false; }
  }

  function isTorchOn() { return torchOn; }

  // ---- Zoom ----
  function setZoom(val) {
    zoomLevel = Math.max(1, Math.min(maxZoom, val));
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (caps.zoom) {
      track.applyConstraints({ advanced: [{ zoom: zoomLevel }] }).catch(() => {});
    } else {
      // CSS zoom fallback on video element
      videoEl.style.transform = `scale(${zoomLevel})`;
    }
  }

  function getZoom() { return zoomLevel; }
  function getMaxZoom() { return maxZoom; }

  function _attachZoomEvents() {
    // Pinch zoom (touch)
    overlayCanvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        touchStartDist = _getTouchDist(e.touches);
        zoomAtTouchStart = zoomLevel;
      }
    }, { passive: true });
    overlayCanvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && touchStartDist) {
        const d = _getTouchDist(e.touches);
        const ratio = d / touchStartDist;
        setZoom(zoomAtTouchStart * ratio);
      }
    }, { passive: true });
    overlayCanvas.addEventListener('touchend', () => { touchStartDist = null; });

    // Scroll zoom (desktop)
    overlayCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      setZoom(zoomLevel + delta);
    }, { passive: false });
  }

  function _getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ---- Overlay loop (live timestamp on canvas) ----
  function _startOverlayLoop() {
    if (overlayInterval) clearInterval(overlayInterval);
    overlayInterval = setInterval(() => {
      if (!isCameraActive || !videoEl || !overlayCanvas) return;
      overlayCanvas.width = videoEl.clientWidth;
      overlayCanvas.height = videoEl.clientHeight;
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

      const s = Storage.getSettings();
      const now = new Date();
      const snap = {
        takenAt: now.toISOString(),
        dateTime: TimestampEngine.formatDateTime(now, s),
        gps: TimestampEngine.getCurrentGPS(),
        address: TimestampEngine.getCurrentAddress(),
      };
      const lines = TimestampEngine.getOverlayLines(snap, s);
      Capture.drawPreviewOverlay(overlayCtx, lines, s.timestampPosition, s, overlayCanvas.width, overlayCanvas.height);

      if (s.gridOverlay) _drawGrid(overlayCtx, overlayCanvas.width, overlayCanvas.height);
    }, 1000);
  }

  function _drawGrid(ctx, w, h) {
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    [1/3, 2/3].forEach(f => {
      ctx.beginPath(); ctx.moveTo(w * f, 0); ctx.lineTo(w * f, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, h * f); ctx.lineTo(w, h * f); ctx.stroke();
    });
  }

  // ---- Timer ----
  function takePhotoWithTimer(seconds, onTick, onShoot) {
    let count = seconds;
    if (timerInterval) clearInterval(timerInterval);
    if (onTick) onTick(count);
    if (count === 0) { _shoot(onShoot); return; }
    timerInterval = setInterval(() => {
      count--;
      if (onTick) onTick(count);
      if (count <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        _shoot(onShoot);
      }
    }, 1000);
  }

  async function _shoot(cb) {
    const s = Storage.getSettings();
    if (s.shutterSound) playShutter();

    // Flash effect
    _flashScreen();

    const snap = TimestampEngine.getSnapshot(s);
    const photo = await Capture.capturePhoto(videoEl, snap, s);
    const result = Storage.savePhoto(photo);

    if (cb) cb(photo, result);
  }

  function _flashScreen() {
    const flash = document.getElementById('shutter-flash');
    if (!flash) return;
    flash.style.opacity = '1';
    setTimeout(() => { flash.style.opacity = '0'; }, 120);
  }

  // ---- Wake Lock ----
  async function _requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch { wakeLock = null; }
  }

  function updateSettings(s) { settings = s; }
  function isActive() { return isCameraActive; }
  function hasStream() { return !!stream; }

  return {
    start,
    stop,
    switchCamera,
    toggleTorch,
    isTorchOn,
    setZoom,
    getZoom,
    getMaxZoom,
    takePhotoWithTimer,
    updateSettings,
    isActive,
    hasStream,
  };
})();
