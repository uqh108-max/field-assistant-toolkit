/* Field Assistant service worker — offline-first, one atomic cache per release.
 *
 * Release rule: after changing ANY app file run
 *     node tests/release-stamp.js --write
 * which puts a hash of the files in CORE into BUILD below. That changes sw.js
 * (so phones see an update) and the cache name (so the new release installs
 * beside the running one). Install re-checks the hash, so files that don't
 * match (a deploy still in progress) are never cached. The pre-commit hook
 * (tests/pre-commit) and tests/rescue-tests.js refuse a stale BUILD.
 * The shell is served from the release cache only; a new release is fetched
 * whole (bypassing the HTTP cache) and replaces the old one in one step, so the
 * app never runs a mix of two versions.
 *
 * Only good responses are ever stored: an error page (e.g. GitHub Pages' 404
 * while the site is down) must never overwrite a working app file — v15 did
 * exactly that and left installed phones showing a 404 even offline.
 */
var BUILD = '1e541d36edd0';
var CACHE = 'field-assistant-v16-' + BUILD;
var PREFIX = 'field-assistant-';
var CORE = [
  './',
  'index.html',
  'data.js',
  'playbooks.js',
  'app.js',
  'render.js',
  'manifest.webmanifest',
  'icon.svg',
  'icon-maskable.svg',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png'
];
var CORE_URLS = CORE.map(function (p) { return new URL(p, self.location).href; });

function isGood(res) {
  return !!res && res.ok && res.type === 'basic' && !res.redirected;
}

// Install. Every shell file is fetched fresh (bypassing the HTTP cache) and
// must be a good response, and together they must hash to BUILD - so a
// half-finished deploy (new sw.js, old files) or a damaged entry can never
// become a release. Only then are they written to this release's cache; if
// anything fails, a cache this install created is removed and the running
// release is never touched. The browser retries on its next update check.
var STAMP_FILES = CORE.filter(function (p) { return p !== './' && p !== 'sw.js'; });

function asciiBytes(s) { var a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; }

// Same layout as tests/release-stamp.js: name, NUL, bytes, NUL for each file.
function verifyBuild(byPath) {
  var subtle = (typeof crypto !== 'undefined' && crypto && crypto.subtle) ? crypto.subtle : null;
  if (!subtle || !BUILD) return Promise.resolve(); // no WebCrypto (non-https): status checks only
  return Promise.all(STAMP_FILES.map(function (p) { return byPath[p].clone().arrayBuffer(); })).then(function (bufs) {
    var parts = [], total = 0, i;
    for (i = 0; i < STAMP_FILES.length; i++) {
      parts.push(asciiBytes(STAMP_FILES[i] + '\u0000'), new Uint8Array(bufs[i]), asciiBytes('\u0000'));
    }
    for (i = 0; i < parts.length; i++) total += parts[i].length;
    var all = new Uint8Array(total), off = 0;
    for (i = 0; i < parts.length; i++) { all.set(parts[i], off); off += parts[i].length; }
    return subtle.digest('SHA-256', all);
  }).then(function (d) {
    var b = new Uint8Array(d), hex = '';
    for (var i = 0; i < 6; i++) hex += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    if (hex !== BUILD) throw new Error('install: files hash to ' + hex + ', sw.js expects ' + BUILD + ' (deploy not finished?)');
  });
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.has(CACHE).then(function (existed) {
      var reqs = {}, byPath = {};
      // './' (the home-screen start URL) is not fetched: it is stored as the
      // verified index.html, so it can never hold a different page.
      return Promise.all(STAMP_FILES.map(function (p) {
        reqs[p] = new Request(p, { cache: 'reload' });
        return fetch(reqs[p]).then(function (res) {
          if (!isGood(res)) throw new Error('install: bad response for ' + p + ' (' + res.status + ')');
          byPath[p] = res;
          // Drain each network body as it arrives. Waiting for every response's
          // headers first can exhaust the browser's limited fetch slots when
          // an atomic release has many assets. Retain the original for caching.
          return res.clone().arrayBuffer();
        });
      })).then(function () {
        return verifyBuild(byPath);
      }).then(function () {
        return caches.open(CACHE).then(function (cache) {
          var puts = STAMP_FILES.map(function (p) {
            return cache.put(reqs[p], p === 'index.html' ? byPath[p].clone() : byPath[p]);
          });
          puts.push(cache.put(new Request('./'), byPath['index.html']));
          return Promise.all(puts);
        });
      }).then(function () {
        return self.skipWaiting();
      }).catch(function (err) {
        if (existed) throw err;
        return caches.delete(CACHE).then(function () { throw err; });
      });
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      // github.io is shared by every Pages site of this account: delete only our own old caches
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE && k.indexOf(PREFIX) === 0) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      // Opening the app (any URL in scope, with or without a query string):
      // the cached shell of this release.
      if (req.mode === 'navigate') {
        return cache.match(req).then(function (hit) {
          return hit || cache.match('index.html');
        }).then(function (hit) {
          return hit || fetch(req).catch(function () { return Response.error(); });
        });
      }
      return cache.match(req).then(function (hit) {
        if (hit) return hit;
        // Not in this release's cache (e.g. evicted, or a non-shell file):
        // network, keeping only good copies. Shell files are refilled only if
        // missing, never refreshed in place — updates arrive as a new release.
        return fetch(req).then(function (res) {
          if (isGood(res)) cache.put(req, res.clone()).catch(function () {});
          return res;
        }).catch(function () { return Response.error(); });
      });
    })
  );
});
