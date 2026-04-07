// settings.js — read/write settings, theme toggle, language

const SettingsManager = (() => {

  function init() {
    const s = Storage.getSettings();
    applyTheme(s.theme);
    applyLanguage(s.language);
    renderSettingsPage();
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme || 'dark');
    Storage.saveSetting('theme', theme);
  }

  function applyLanguage(lang) {
    document.documentElement.setAttribute('lang', lang || 'id');
  }

  function toggleTheme() {
    const s = Storage.getSettings();
    const next = s.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      btn.querySelector('i').className = next === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
  }

  function renderSettingsPage() {
    const page = document.getElementById('settings-page');
    if (!page) return;
    const s = Storage.getSettings();

    _bindToggle('setting-theme', s.theme === 'dark', v => applyTheme(v ? 'dark' : 'light'));
    _bindToggle('setting-grid', s.gridOverlay, v => Storage.saveSetting('gridOverlay', v));
    _bindToggle('setting-sound', s.shutterSound, v => Storage.saveSetting('shutterSound', v));
    _bindToggle('setting-sleep', s.preventSleep, v => Storage.saveSetting('preventSleep', v));
    _bindToggle('setting-gps', s.autoRequestGPS, v => Storage.saveSetting('autoRequestGPS', v));

    _bindSelect('setting-dateformat', s.dateFormat, v => Storage.saveSetting('dateFormat', v));
    _bindSelect('setting-timeformat', s.timeFormat, v => Storage.saveSetting('timeFormat', v));
    _bindSelect('setting-fontsize', s.timestampFontSize, v => Storage.saveSetting('timestampFontSize', v));
    _bindSelect('setting-tscolor', s.timestampColor, v => Storage.saveSetting('timestampColor', v));
    _bindSelect('setting-language', s.language, v => { Storage.saveSetting('language', v); applyLanguage(v); });
    _bindSelect('setting-quality', s.exportQuality || 'high', v => Storage.saveSetting('exportQuality', v));
    _bindSelect('setting-tsposition', s.timestampPosition, v => Storage.saveSetting('timestampPosition', v));

    const resetBtn = document.getElementById('setting-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Reset semua pengaturan ke default?')) {
          Storage.resetSettings();
          renderSettingsPage();
          applyTheme(Storage.getSettings().theme);
        }
      });
    }
  }

  function _bindToggle(id, val, onChange) {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = val;
    el.addEventListener('change', () => onChange(el.checked));
  }

  function _bindSelect(id, val, onChange) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = val;
    el.addEventListener('change', () => onChange(el.value));
  }

  return { init, applyTheme, toggleTheme, renderSettingsPage };
})();
