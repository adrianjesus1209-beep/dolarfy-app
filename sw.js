/* Service Worker Dolarfy - Cache en runtime (network-first) */
const VERSION = 'dolarfy-sw-v1.2.0';
const CACHE_NAME = VERSION;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/styles.css',
  './assets/fonts/fonts.css',
  './assets/fonts/plus-jakarta-sans-latin.woff2',
  './assets/img/logo.webp',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/vendor/tailwind.js',
  './assets/vendor/lucide.min.js',
  './assets/vendor/apexcharts.min.js',
  './js/app.js',
  './js/mockData.js',
  './js/apiService.js',
  './js/themeService.js',
  './js/notificationService.js',
  './js/countriesData.js',
  './js/calcHistoryService.js',
  './js/utils/formatters.js',
  './js/utils/mathEval.js',
  './js/components/dashboard.js',
  './js/components/calculator.js',
  './js/components/analytics.js',
  './js/components/settings.js',
  './js/components/notificationModal.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
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
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
  );
});