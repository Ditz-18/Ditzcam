// timestamp.js — GPS, reverse geocoding, time formatting

const TimestampEngine = (() => {
  let currentGPS = null;
  let currentAddress = null;
  let gpsWatcher = null;
  let geocodeCache = {};

  // ---- Time Formatting ----

  function pad(n) { return String(n).padStart(2, '0'); }

  function formatDateTime(date, settings) {
    const d = date || new Date();
    const df = settings?.dateFormat || 'DD/MM/YYYY';
    const tf = settings?.timeFormat || '24h';

    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    const hours24 = d.getHours();
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());

    let datePart;
    if (df === 'MM/DD/YYYY') datePart = `${month}/${day}/${year}`;
    else if (df === 'YYYY-MM-DD') datePart = `${year}-${month}-${day}`;
    else datePart = `${day}/${month}/${year}`;

    let timePart;
    if (tf === '12h') {
      const ampm = hours24 >= 12 ? 'PM' : 'AM';
      const h12 = hours24 % 12 || 12;
      timePart = `${pad(h12)}:${minutes}:${seconds} ${ampm}`;
    } else {
      timePart = `${pad(hours24)}:${minutes}:${seconds}`;
    }

    return { datePart, timePart, full: `${datePart} ${timePart}` };
  }

  // ---- GPS ----

  function startGPS(onUpdate, onError) {
    if (!navigator.geolocation) {
      if (onError) onError('GPS tidak didukung browser ini');
      return;
    }
    if (gpsWatcher !== null) stopGPS();

    gpsWatcher = navigator.geolocation.watchPosition(
      (pos) => {
        currentGPS = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        if (onUpdate) onUpdate(currentGPS);
        reverseGeocode(currentGPS.lat, currentGPS.lng, (addr) => {
          currentAddress = addr;
        });
      },
      (err) => {
        currentGPS = null;
        if (onError) onError(err.message);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }

  function stopGPS() {
    if (gpsWatcher !== null) {
      navigator.geolocation.clearWatch(gpsWatcher);
      gpsWatcher = null;
    }
  }

  function requestOnce(callback) {
    if (!navigator.geolocation) { callback(null, 'Tidak didukung'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const gps = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        currentGPS = gps;
        callback(gps, null);
      },
      (err) => callback(null, err.message),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  // ---- Reverse Geocoding (OpenStreetMap Nominatim) ----

  async function reverseGeocode(lat, lng, callback) {
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (geocodeCache[key]) { if (callback) callback(geocodeCache[key]); return geocodeCache[key]; }

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
        { headers: { 'Accept-Language': 'id,en' } }
      );
      const data = await res.json();
      const a = data.address || {};

      const road = a.road || a.pedestrian || a.path || '';
      const suburb = a.suburb || a.village || a.hamlet || '';
      const district = a.city_district || a.district || a.county || '';
      const city = a.city || a.town || a.municipality || '';
      const state = a.state || '';

      const parts = [road, suburb, district, city, state].filter(Boolean);
      const address = {
        short: [road || suburb, city || state].filter(Boolean).join(', '),
        full: parts.join(', '),
        raw: data.display_name || '',
      };

      geocodeCache[key] = address;
      currentAddress = address;
      if (callback) callback(address);
      return address;
    } catch {
      const fallback = { short: 'Lokasi tidak tersedia', full: 'Lokasi tidak tersedia', raw: '' };
      if (callback) callback(fallback);
      return fallback;
    }
  }

  // ---- Snapshot of current state ----

  function getSnapshot(settings) {
    const now = new Date();
    return {
      takenAt: now.toISOString(),
      dateTime: formatDateTime(now, settings),
      gps: currentGPS ? { ...currentGPS } : null,
      address: currentAddress ? { ...currentAddress } : null,
    };
  }

  // ---- Live overlay lines for canvas/preview ----

  function getOverlayLines(snapshot, settings) {
    const lines = [];
    const dt = snapshot.dateTime || formatDateTime(new Date(), settings);
    lines.push(dt.datePart);
    lines.push(dt.timePart);
    if (snapshot.gps) {
      lines.push(`${snapshot.gps.lat.toFixed(6)}, ${snapshot.gps.lng.toFixed(6)}`);
    } else {
      lines.push('GPS: Tidak tersedia');
    }
    if (snapshot.address) {
      // Split address into two lines if too long
      const full = snapshot.address.full || snapshot.address.short;
      if (full.length > 40) {
        const mid = full.lastIndexOf(',', 40);
        if (mid > 0) {
          lines.push(full.substring(0, mid).trim());
          lines.push(full.substring(mid + 1).trim());
        } else {
          lines.push(full);
        }
      } else {
        lines.push(full);
      }
    } else {
      lines.push('Alamat tidak tersedia');
    }
    return lines;
  }

  function getCurrentGPS() { return currentGPS; }
  function getCurrentAddress() { return currentAddress; }

  return {
    formatDateTime,
    startGPS,
    stopGPS,
    requestOnce,
    reverseGeocode,
    getSnapshot,
    getOverlayLines,
    getCurrentGPS,
    getCurrentAddress,
  };
})();
