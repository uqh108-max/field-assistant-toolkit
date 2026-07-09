/* Field Assistant service worker — offline-first for the app shell. */
var CACHE = 'field-assistant-v2';
var CORE = [
  './',
  'index.html',
  'data.js',
  'app.js',
  'render.js',
  'manifest.webmanifest',
  'icon.svg',
  'icon-maskable.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Google Fonts: stale-while-revalidate so they work offline after first load.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(CACHE).then(function (cache) {
        return cache.match(req).then(function (cached) {
          var net = fetch(req).then(function (res) { try { cache.put(req, res.clone()); } catch (x) {} return res; }).catch(function () { return cached; });
          return cached || net;
        });
      })
    );
    return;
  }

  // Same-origin: cache-first, fall back to network, then to cached index for navigations.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(function (cached) {
        if (cached) return cached;
        return fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { try { c.put(req, copy); } catch (x) {} });
          return res;
        }).catch(function () {
          if (req.mode === 'navigate') return caches.match('index.html');
        });
      })
    );
  }
});
