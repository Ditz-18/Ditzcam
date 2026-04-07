// app.js — app initialization, routing, PWA install prompt

const App = (() => {
  let deferredInstallPrompt = null;
  let currentPage = '';
  let isNavigating = false; // guard against hashchange loop

  function init() {
    SettingsManager.init();
    _setupNavigation();
    _setupPWA();
    _setupInstallBanner();
    _navigateTo(_getInitialPage());
  }

  function _getInitialPage() {
    const hash = location.hash.replace('#', '');
    return ['camera', 'gallery', 'settings'].includes(hash) ? hash : 'camera';
  }

  function _setupNavigation() {
    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => _navigateTo(btn.dataset.nav));
    });
    // Only respond to hashchange when not triggered by us
    window.addEventListener('hashchange', () => {
      if (!isNavigating) _navigateTo(_getInitialPage());
    });
  }

  function _navigateTo(page) {
    if (currentPage === page) return;
    currentPage = page;

    // Set hash without triggering hashchange listener
    isNavigating = true;
    location.hash = page;
    setTimeout(() => { isNavigating = false; }, 0);

    // Deactivate all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('[data-nav]').forEach(b => b.classList.remove('active'));

    // Activate target page
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.classList.add('active');

    const navBtn = document.querySelector(`[data-nav="${page}"]`);
    if (navBtn) navBtn.classList.add('active');

    // Page lifecycle
    if (page === 'camera') {
      CameraPage.activate();
    } else {
      CameraPage.deactivate();
    }

    if (page === 'gallery') GalleryPage.activate();
    if (page === 'settings') SettingsManager.renderSettingsPage();
  }

  // ---- PWA ----
  function _setupPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      const banner = document.getElementById('install-banner');
      if (banner) banner.style.display = 'flex';
    });
    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      const banner = document.getElementById('install-banner');
      if (banner) banner.style.display = 'none';
    });
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  function _setupInstallBanner() {
    const installBtn = document.getElementById('install-btn');
    const dismissBtn = document.getElementById('install-dismiss');
    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        const banner = document.getElementById('install-banner');
        if (banner) banner.style.display = 'none';
      });
    }
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        const banner = document.getElementById('install-banner');
        if (banner) banner.style.display = 'none';
      });
    }
  }

  function showToast(msg, type = 'success', duration = 2500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'fa-check-circle'
               : type === 'error'   ? 'fa-exclamation-circle'
               : 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${msg}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return { init, showToast, navigateTo: _navigateTo };
})();

// ---- Camera Page Controller ----
const CameraPage = (() => {
  let cameraActive = false;
  let controlsReady = false;
  let timerValue = 0;

  function activate() {
    if (cameraActive) return;
    cameraActive = true;

    if (!controlsReady) { _setupControls(); controlsReady = true; }

    const videoEl = document.getElementById('camera-video');
    const overlayEl = document.getElementById('camera-overlay');
    const s = Storage.getSettings();

    Camera.start(videoEl, overlayEl, s)
      .then(() => {
        TimestampEngine.startGPS(() => {}, () => {});
      })
      .catch(() => {
        const noAccess = document.getElementById('camera-no-access');
        if (noAccess) noAccess.classList.add('visible');
        App.showToast('Izinkan akses kamera untuk melanjutkan', 'error');
      });
  }

  function deactivate() {
    if (!cameraActive) return;
    cameraActive = false;
    Camera.stop();
    TimestampEngine.stopGPS();
  }

  function _setupControls() {
    // Shutter
    const shutterBtn = document.getElementById('btn-shutter');
    if (shutterBtn) {
      shutterBtn.addEventListener('click', () => {
        if (!Camera.hasStream()) { App.showToast('Kamera belum siap', 'error'); return; }
        shutterBtn.disabled = true;
        Camera.takePhotoWithTimer(timerValue,
          (count) => _updateTimerDisplay(count),
          (photo, result) => {
            shutterBtn.disabled = false;
            _updateTimerDisplay(0);
            if (result === 'quota') App.showToast('Storage penuh! Hapus beberapa foto.', 'error');
            else if (result)        App.showToast('Foto tersimpan', 'success');
            else                    App.showToast('Gagal menyimpan foto', 'error');
          }
        );
      });
    }

    // Switch camera
    const switchBtn = document.getElementById('btn-switch');
    if (switchBtn) {
      switchBtn.addEventListener('click', async () => {
        try { await Camera.switchCamera(); App.showToast('Kamera diganti', 'info'); }
        catch { App.showToast('Gagal ganti kamera', 'error'); }
      });
    }

    // Torch
    const torchBtn = document.getElementById('btn-torch');
    if (torchBtn) {
      torchBtn.addEventListener('click', async () => {
        const on = await Camera.toggleTorch();
        if (on === false) { App.showToast('Flash tidak didukung', 'info'); return; }
        torchBtn.classList.toggle('active', on);
        torchBtn.querySelector('i').className = on ? 'fas fa-bolt' : 'fas fa-bolt-slash';
        App.showToast(on ? 'Flash aktif' : 'Flash mati', 'info');
      });
    }

    // Timer
    document.querySelectorAll('[data-timer]').forEach(btn => {
      btn.addEventListener('click', () => {
        timerValue = parseInt(btn.dataset.timer) || 0;
        document.querySelectorAll('[data-timer]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Grid
    const gridBtn = document.getElementById('btn-grid');
    if (gridBtn) {
      gridBtn.classList.toggle('active', Storage.getSettings().gridOverlay);
      gridBtn.addEventListener('click', () => {
        const cur = Storage.getSettings().gridOverlay;
        Storage.saveSetting('gridOverlay', !cur);
        gridBtn.classList.toggle('active', !cur);
      });
    }

    // Zoom slider
    const zoomSlider = document.getElementById('zoom-slider');
    const zoomLabel  = document.getElementById('zoom-label');
    if (zoomSlider) {
      zoomSlider.addEventListener('input', () => {
        const v = parseFloat(zoomSlider.value);
        Camera.setZoom(v);
        if (zoomLabel) zoomLabel.textContent = `${v.toFixed(1)}x`;
      });
    }
  }

  function _updateTimerDisplay(count) {
    const el = document.getElementById('timer-countdown');
    if (!el) return;
    if (count > 0) { el.textContent = count; el.style.display = 'flex'; }
    else { el.style.display = 'none'; }
  }

  return { activate, deactivate };
})();

// ---- Gallery Page Controller ----
const GalleryPage = (() => {
  let initialized = false;

  function activate() {
    Gallery.loadPhotos();
    if (!initialized) { initialized = true; _setupControls(); }
  }

  function _setupControls() {
    Gallery.setOnSelectionChange((count) => {
      const bar = document.getElementById('selection-bar');
      if (bar) bar.style.display = count > 0 ? 'flex' : 'none';
    });

    const selectAllBtn = document.getElementById('btn-select-all');
    if (selectAllBtn) selectAllBtn.addEventListener('click', () => Gallery.selectAll());

    const clearSelBtn = document.getElementById('btn-clear-sel');
    if (clearSelBtn) clearSelBtn.addEventListener('click', () => Gallery.clearSelection());

    const deleteSelBtn = document.getElementById('btn-delete-sel');
    if (deleteSelBtn) {
      deleteSelBtn.addEventListener('click', () => {
        const count = Gallery.getSelectedCount();
        if (count === 0) return;
        if (confirm(`Hapus ${count} foto yang dipilih?`)) {
          Gallery.deleteSelected();
          App.showToast(`${count} foto dihapus`, 'success');
        }
      });
    }

    const downloadSelBtn = document.getElementById('btn-download-sel');
    if (downloadSelBtn) {
      downloadSelBtn.addEventListener('click', async () => {
        const ids = Gallery.getSelectedIds();
        if (ids.length === 0) return;
        App.showToast(`Mengunduh ${ids.length} foto...`, 'info');
        await Downloader.downloadSelected(ids, (done, total) => {
          if (done === total) App.showToast('Semua foto terunduh', 'success');
        });
      });
    }

    document.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Gallery.setFilter(btn.dataset.filter);
      });
    });

    const sortEl = document.getElementById('gallery-sort');
    if (sortEl) sortEl.addEventListener('change', () => Gallery.setSort(sortEl.value));

    const lbClose = document.getElementById('lightbox-close');
    if (lbClose) lbClose.addEventListener('click', () => Gallery.closeLightbox());

    const lb = document.getElementById('lightbox');
    if (lb) lb.addEventListener('click', (e) => { if (e.target === lb) Gallery.closeLightbox(); });

    const lbDownload = document.getElementById('lightbox-download');
    if (lbDownload) {
      lbDownload.addEventListener('click', () => {
        const p = Gallery.getLightboxPhoto();
        if (p) Downloader.downloadOne(p);
      });
    }

    const lbDelete = document.getElementById('lightbox-delete');
    if (lbDelete) {
      lbDelete.addEventListener('click', () => {
        const p = Gallery.getLightboxPhoto();
        if (!p) return;
        if (confirm('Hapus foto ini?')) {
          Gallery.closeLightbox();
          Gallery.deleteOne(p.id);
          App.showToast('Foto dihapus', 'success');
        }
      });
    }
  }

  return { activate };
})();

document.addEventListener('DOMContentLoaded', () => App.init());