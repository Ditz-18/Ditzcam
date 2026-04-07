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
  let settings = {};
  let touchStartDist = null;
  let zoomAtTouchStart = 1;
  let audioCtx = null;

  function _getAudioCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { audioCtx = null; }
    }
    return audioCtx;
  }

  function playShutter() {
    const ctx = _getAudioCtx();
    if (!ctx) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(1200, ctx.currentTime);
      g.gain.setValueAtTime(0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      o.start(); o.stop(ctx.currentTime + 0.12);
    } catch { /* ignore */ }
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
      video: { facingMode: { ideal: currentFacingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = stream;

    // Never-stuck promise: resolves on loadedmetadata, loadeddata, or after 3s timeout
    await new Promise((resolve) => {
      if (videoEl.readyState >= 2) { resolve(); return; }
      const done = () => {
        videoEl.removeEventListener('loadedmetadata', done);
        videoEl.removeEventListener('loadeddata', done);
        resolve();
      };
      videoEl.addEventListener('loadedmetadata', done);
      videoEl.addEventListener('loadeddata', done);
      setTimeout(resolve, 3000);
    });

    try { await videoEl.play(); } catch { /* autoplay policy — ignore */ }

    const track = stream.getVideoTracks()[0];
    if (track) {
      try {
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.zoom) maxZoom = caps.zoom.max || 5;
      } catch { /* not supported */ }
    }
    zoomLevel = 1;
    settings._isFrontCamera = (currentFacingMode === 'user');
  }

  function _stopStream() {
    if (stream) { stream.getTracks().forEach(t => { try { t.stop(); } catch {} }); stream = null; }
    if (videoEl) { videoEl.srcObject = null; }
  }

  function stop() {
    isCameraActive = false;
    _stopStream();
    if (overlayInterval) { clearInterval(overlayInterval); overlayInterval = null; }
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (wakeLock) { try { wakeLock.release(); } catch {} wakeLock = null; }
    torchOn = false;
  }

  async function switchCamera() {
    const prev = currentFacingMode;
    currentFacingMode = prev === 'environment' ? 'user' : 'environment';
    try { await _startStream(); }
    catch { currentFacingMode = prev; await _startStream(); }
  }

  async function toggleTorch() {
    if (!stream) return false;
    const track = stream.getVideoTracks()[0];
    if (!track) return false;
    try {
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (!caps.torch) return false;
      torchOn = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: torchOn }] });
      return torchOn;
    } catch { torchOn = false; return false; }
  }

  function isTorchOn() { return torchOn; }

  function setZoom(val) {
    zoomLevel = Math.max(1, Math.min(maxZoom, parseFloat(parseFloat(val).toFixed(1))));
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) { _applyCSSZoom(zoomLevel); return; }
    try {
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps.zoom) {
        track.applyConstraints({ advanced: [{ zoom: zoomLevel }] }).catch(() => _applyCSSZoom(zoomLevel));
      } else { _applyCSSZoom(zoomLevel); }
    } catch { _applyCSSZoom(zoomLevel); }
  }

  function _applyCSSZoom(z) { if (videoEl) videoEl.style.transform = `scale(${z})`; }
  function getZoom() { return zoomLevel; }
  function getMaxZoom() { return maxZoom; }

  function _attachZoomEvents() {
    if (!overlayCanvas) return;
    overlayCanvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) { touchStartDist = _dist(e.touches); zoomAtTouchStart = zoomLevel; }
    }, { passive: true });
    overlayCanvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && touchStartDist) {
        const z = Math.max(1, Math.min(maxZoom, zoomAtTouchStart * (_dist(e.touches) / touchStartDist)));
        setZoom(z);
        _syncZoomUI(z);
      }
    }, { passive: true });
    overlayCanvas.addEventListener('touchend', () => { touchStartDist = null; });
    overlayCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const z = Math.max(1, Math.min(maxZoom, zoomLevel + (e.deltaY > 0 ? -0.2 : 0.2)));
      setZoom(z); _syncZoomUI(z);
    }, { passive: false });
  }

  function _dist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx*dx + dy*dy);
  }

  function _syncZoomUI(z) {
    const s = document.getElementById('zoom-slider');
    const l = document.getElementById('zoom-label');
    if (s) s.value = z;
    if (l) l.textContent = `${parseFloat(z).toFixed(1)}x`;
  }

  function _startOverlayLoop() {
    if (overlayInterval) clearInterval(overlayInterval);
    _drawOverlay();
    overlayInterval = setInterval(_drawOverlay, 1000);
  }

  function _drawOverlay() {
    if (!isCameraActive || !videoEl || !overlayCanvas || !overlayCtx) return;
    try {
      const w = videoEl.clientWidth || 360;
      const h = videoEl.clientHeight || 640;
      overlayCanvas.width = w;
      overlayCanvas.height = h;
      overlayCtx.clearRect(0, 0, w, h);
      const s = Storage.getSettings();
      const now = new Date();
      const snap = {
        takenAt: now.toISOString(),
        dateTime: TimestampEngine.formatDateTime(now, s),
        gps: TimestampEngine.getCurrentGPS(),
        address: TimestampEngine.getCurrentAddress(),
      };
      const lines = TimestampEngine.getOverlayLines(snap, s);
      Capture.drawPreviewOverlay(overlayCtx, lines, s.timestampPosition, s, w, h);
      if (s.gridOverlay) _drawGrid(overlayCtx, w, h);
    } catch { /* ignore render errors */ }
  }

  function _drawGrid(ctx, w, h) {
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    [1/3, 2/3].forEach(f => {
      ctx.beginPath(); ctx.moveTo(w*f, 0); ctx.lineTo(w*f, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, h*f); ctx.lineTo(w, h*f); ctx.stroke();
    });
  }

  function takePhotoWithTimer(seconds, onTick, onShoot) {
    let count = seconds;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (count === 0) { _shoot(onShoot); return; }
    if (onTick) onTick(count);
    timerInterval = setInterval(() => {
      count--;
      if (onTick) onTick(count);
      if (count <= 0) { clearInterval(timerInterval); timerInterval = null; _shoot(onShoot); }
    }, 1000);
  }

  async function _shoot(cb) {
    const s = Storage.getSettings();
    if (s.shutterSound) playShutter();
    _flashScreen();
    const snap = TimestampEngine.getSnapshot(s);
    try {
      const photo = await Capture.capturePhoto(videoEl, snap, s);
      const result = Storage.savePhoto(photo);
      if (cb) cb(photo, result);
    } catch (e) { if (cb) cb(null, false); }
  }

  function _flashScreen() {
    const f = document.getElementById('shutter-flash');
    if (!f) return;
    f.style.opacity = '1';
    setTimeout(() => { f.style.opacity = '0'; }, 120);
  }

  async function _requestWakeLock() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); }
    catch { wakeLock = null; }
  }

  function updateSettings(s) { settings = s; }
  function isActive() { return isCameraActive; }
  function hasStream() { return !!stream; }

  return { start, stop, switchCamera, toggleTorch, isTorchOn, setZoom, getZoom, getMaxZoom, takePhotoWithTimer, updateSettings, isActive, hasStream };
})();