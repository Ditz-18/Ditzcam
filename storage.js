// storage.js — all localStorage operations for DITZ CAM

const Storage = (() => {
  const KEYS = {
    PHOTOS: 'ditz_photos',
    SETTINGS: 'ditz_settings',
  };

  const DEFAULT_SETTINGS = {
    theme: 'dark',
    language: 'id',
    timestampPosition: 'bottom-right',
    timestampFontSize: 'medium',
    timestampColor: '#ffffff',
    gridOverlay: false,
    shutterSound: true,
    preventSleep: true,
    autoRequestGPS: true,
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
  };

  // --- Photos ---

  function getPhotos() {
    try {
      const raw = localStorage.getItem(KEYS.PHOTOS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function savePhoto(photoObj) {
    // photoObj: { id, dataUrl, timestamp, gps, address, position, takenAt }
    const photos = getPhotos();
    photos.unshift(photoObj);
    try {
      localStorage.setItem(KEYS.PHOTOS, JSON.stringify(photos));
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        return 'quota';
      }
      return false;
    }
  }

  function deletePhoto(id) {
    const photos = getPhotos().filter(p => p.id !== id);
    localStorage.setItem(KEYS.PHOTOS, JSON.stringify(photos));
  }

  function deletePhotos(ids) {
    const set = new Set(ids);
    const photos = getPhotos().filter(p => !set.has(p.id));
    localStorage.setItem(KEYS.PHOTOS, JSON.stringify(photos));
  }

  function getPhoto(id) {
    return getPhotos().find(p => p.id === id) || null;
  }

  function getStorageUsage() {
    try {
      const raw = localStorage.getItem(KEYS.PHOTOS) || '';
      const bytes = new Blob([raw]).size;
      return bytes;
    } catch {
      return 0;
    }
  }

  // Max ~4.5MB safe limit for localStorage
  function getStorageLimit() {
    return 4.5 * 1024 * 1024;
  }

  function getStoragePercent() {
    return Math.min(100, Math.round((getStorageUsage() / getStorageLimit()) * 100));
  }

  // --- Settings ---

  function getSettings() {
    try {
      const raw = localStorage.getItem(KEYS.SETTINGS);
      const saved = raw ? JSON.parse(raw) : {};
      return { ...DEFAULT_SETTINGS, ...saved };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSetting(key, value) {
    const settings = getSettings();
    settings[key] = value;
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
  }

  function saveSettings(obj) {
    const settings = { ...getSettings(), ...obj };
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
  }

  function resetSettings() {
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
  }

  return {
    getPhotos,
    savePhoto,
    deletePhoto,
    deletePhotos,
    getPhoto,
    getStorageUsage,
    getStorageLimit,
    getStoragePercent,
    getSettings,
    saveSetting,
    saveSettings,
    resetSettings,
    DEFAULT_SETTINGS,
  };
})();
