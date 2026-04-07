// gallery.js — load photos, preview, multi-select, delete, sort/filter

const Gallery = (() => {
  let selectedIds = new Set();
  let currentFilter = 'all';
  let currentSort = 'newest';
  let allPhotos = [];
  let lightboxPhoto = null;
  let onSelectionChange = null;

  // ---- Load & Render ----

  function loadPhotos() {
    allPhotos = Storage.getPhotos();
    render();
    updateStorageMeter();
  }

  function getFiltered() {
    let photos = [...allPhotos];

    if (currentFilter !== 'all') {
      const now = new Date();
      photos = photos.filter(p => {
        const d = new Date(p.takenAt);
        if (currentFilter === 'today') {
          return d.toDateString() === now.toDateString();
        }
        if (currentFilter === 'week') {
          const diff = (now - d) / (1000 * 60 * 60 * 24);
          return diff <= 7;
        }
        if (currentFilter === 'month') {
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
        return true;
      });
    }

    photos.sort((a, b) => {
      const da = new Date(a.takenAt), db = new Date(b.takenAt);
      return currentSort === 'newest' ? db - da : da - db;
    });

    return photos;
  }

  function render() {
    const grid = document.getElementById('gallery-grid');
    const empty = document.getElementById('gallery-empty');
    if (!grid) return;

    const photos = getFiltered();
    grid.innerHTML = '';

    if (photos.length === 0) {
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

    photos.forEach(photo => {
      const item = document.createElement('div');
      item.className = 'gallery-item' + (selectedIds.has(photo.id) ? ' selected' : '');
      item.dataset.id = photo.id;

      const img = document.createElement('img');
      img.src = photo.dataUrl;
      img.loading = 'lazy';
      img.alt = 'Foto';

      const check = document.createElement('div');
      check.className = 'gallery-check';
      check.innerHTML = '<i class="fas fa-check"></i>';

      const info = document.createElement('div');
      info.className = 'gallery-item-info';
      const dt = photo.dateTime ? `${photo.dateTime.datePart} ${photo.dateTime.timePart}` : '';
      info.textContent = dt;

      item.appendChild(img);
      item.appendChild(check);
      item.appendChild(info);

      item.addEventListener('click', (e) => handleItemClick(e, photo.id));
      item.addEventListener('contextmenu', (e) => { e.preventDefault(); toggleSelect(photo.id); });

      grid.appendChild(item);
    });

    updateSelectionUI();
  }

  // ---- Selection ----

  function handleItemClick(e, id) {
    if (selectedIds.size > 0) {
      toggleSelect(id);
    } else {
      openLightbox(id);
    }
  }

  function toggleSelect(id) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    updateSelectionUI();
    if (onSelectionChange) onSelectionChange(selectedIds.size);
  }

  function selectAll() {
    getFiltered().forEach(p => selectedIds.add(p.id));
    updateSelectionUI();
    if (onSelectionChange) onSelectionChange(selectedIds.size);
  }

  function clearSelection() {
    selectedIds.clear();
    updateSelectionUI();
    if (onSelectionChange) onSelectionChange(0);
  }

  function updateSelectionUI() {
    document.querySelectorAll('.gallery-item').forEach(item => {
      const id = item.dataset.id;
      item.classList.toggle('selected', selectedIds.has(id));
    });
    const count = selectedIds.size;
    const selBar = document.getElementById('selection-bar');
    const selCount = document.getElementById('selection-count');
    if (selBar) selBar.style.display = count > 0 ? 'flex' : 'none';
    if (selCount) selCount.textContent = `${count} dipilih`;
  }

  function getSelectedIds() { return [...selectedIds]; }
  function getSelectedCount() { return selectedIds.size; }

  // ---- Delete ----

  function deleteSelected() {
    if (selectedIds.size === 0) return;
    Storage.deletePhotos([...selectedIds]);
    selectedIds.clear();
    loadPhotos();
    if (onSelectionChange) onSelectionChange(0);
  }

  function deleteOne(id) {
    Storage.deletePhoto(id);
    selectedIds.delete(id);
    loadPhotos();
    if (onSelectionChange) onSelectionChange(selectedIds.size);
  }

  // ---- Lightbox ----

  function openLightbox(id) {
    const photo = allPhotos.find(p => p.id === id);
    if (!photo) return;
    lightboxPhoto = photo;

    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lightbox-img');
    const lbDate = document.getElementById('lightbox-date');
    const lbGps = document.getElementById('lightbox-gps');
    const lbAddr = document.getElementById('lightbox-addr');
    const lbSize = document.getElementById('lightbox-size');

    if (!lb) return;
    lbImg.src = photo.dataUrl;
    lbDate.textContent = photo.dateTime ? `${photo.dateTime.datePart} ${photo.dateTime.timePart}` : '-';
    lbGps.textContent = photo.gps ? `${photo.gps.lat.toFixed(6)}, ${photo.gps.lng.toFixed(6)}` : 'Tidak tersedia';
    lbAddr.textContent = photo.address ? (photo.address.full || photo.address.short) : 'Tidak tersedia';
    lbSize.textContent = photo.size ? `${(photo.size / 1024).toFixed(1)} KB` : '-';

    lb.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    const lb = document.getElementById('lightbox');
    if (lb) lb.classList.remove('active');
    document.body.style.overflow = '';
    lightboxPhoto = null;
  }

  function getLightboxPhoto() { return lightboxPhoto; }

  // ---- Filter & Sort ----

  function setFilter(f) { currentFilter = f; render(); }
  function setSort(s) { currentSort = s; render(); }

  // ---- Storage Meter ----

  function updateStorageMeter() {
    const pct = Storage.getStoragePercent();
    const bar = document.getElementById('storage-bar-fill');
    const label = document.getElementById('storage-label');
    if (bar) {
      bar.style.width = `${pct}%`;
      bar.style.background = pct > 85 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#22c55e';
    }
    const usedKB = (Storage.getStorageUsage() / 1024).toFixed(0);
    const limitKB = (Storage.getStorageLimit() / 1024).toFixed(0);
    if (label) label.textContent = `${usedKB} KB / ${limitKB} KB (${pct}%)`;
  }

  function setOnSelectionChange(fn) { onSelectionChange = fn; }

  return {
    loadPhotos,
    render,
    setFilter,
    setSort,
    toggleSelect,
    selectAll,
    clearSelection,
    getSelectedIds,
    getSelectedCount,
    deleteSelected,
    deleteOne,
    openLightbox,
    closeLightbox,
    getLightboxPhoto,
    updateStorageMeter,
    setOnSelectionChange,
  };
})();
