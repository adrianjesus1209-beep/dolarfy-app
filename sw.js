/* Service Worker Dolarfy - Cache en runtime (network-first con timeout y offline fallback) */
const VERSION = 'dolarfy-sw-v2.1.17';
const CACHE_NAME = VERSION;
const NETWORK_TIMEOUT_MS = 3000;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/styles.css',
  './assets/fonts/fonts.css',
  './assets/fonts/plus-jakarta-sans-latin.woff2',
  './assets/img/logo.webp',
  './assets/img/logo-sin-fondo.webp',
  './assets/img/logo-apk.webp',
  './assets/img/logo-mark.webp',
  './assets/icons/favicon-16.png',
  './assets/icons/favicon-32.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/vendor/tailwind.js',
  './assets/vendor/lucide.min.js',
  './assets/vendor/apexcharts.min.js',
  './js/app.bundle.js'
];

function fetchWithTimeout(request, timeoutMs = NETWORK_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sw-timeout')), timeoutMs);
    fetch(request)
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        // Caching resiliente: almacena cada recurso individualmente para evitar fallos globales
        await Promise.allSettled(
          APP_SHELL.map((url) =>
            fetch(url)
              .then((res) => {
                if (res.ok) return cache.put(url, res);
              })
              .catch(() => {})
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // No interceptar peticiones de backend/proxy PHP en runtime
  if (url.pathname.includes('/api/proxy.php')) return;

  // Solo cachear recursos del mismo origen
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetchWithTimeout(request)
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
  );
});
