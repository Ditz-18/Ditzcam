// sw.js — service worker for DITZ CAM PWA

const CACHE = 'ditz-cam-v1';
const ASSETS = [
  './',
  './index.html',
  './gallery.html',
  './settings.html',
  './manifest.json',
  './css/main.css',
  './css/camera.css',
  './css/gallery.css',
  './css/settings.css',
  './js/storage.js',
  './js/timestamp.js',
  './js/capture.js',
  './js/camera.js',
  './js/download.js',
  './js/gallery.js',
  './js/settings.js',
  './js/app.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Exo+2:wght@300;400;500;600&display=swap',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS.map(url => {
      return new Request(url, { mode: 'no-cors' });
    }))).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Don't cache Nominatim API calls (reverse geocoding, always need fresh)
  if (e.request.url.includes('nominatim.openstreetmap.org')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).catch(() => cached);
    })
  );
});
