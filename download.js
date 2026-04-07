// download.js — download photos as individual JPG files sequentially

const Downloader = (() => {

  function downloadOne(photo) {
    const link = document.createElement('a');
    const dt = photo.takenAt ? photo.takenAt.replace(/[:.]/g, '-').replace('T', '_').split('Z')[0] : Date.now();
    link.download = `DITZCAM_${dt}.jpg`;
    link.href = photo.dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Download multiple photos one by one with a small delay between each
  async function downloadMultiple(photos, onProgress) {
    for (let i = 0; i < photos.length; i++) {
      downloadOne(photos[i]);
      if (onProgress) onProgress(i + 1, photos.length);
      if (i < photos.length - 1) {
        await new Promise(res => setTimeout(res, 600));
      }
    }
  }

  async function downloadSelected(ids, onProgress) {
    const all = Storage.getPhotos();
    const selected = ids.map(id => all.find(p => p.id === id)).filter(Boolean);
    if (selected.length === 0) return;
    if (selected.length === 1) {
      downloadOne(selected[0]);
    } else {
      await downloadMultiple(selected, onProgress);
    }
  }

  async function downloadAll(onProgress) {
    const all = Storage.getPhotos();
    if (all.length === 0) return;
    await downloadMultiple(all, onProgress);
  }

  return {
    downloadOne,
    downloadMultiple,
    downloadSelected,
    downloadAll,
  };
})();
