/**
 * Offline shell.
 *
 * The whole game is a fixed list of small static files with no API behind it,
 * so the simplest correct strategy is also the best one here: precache the lot
 * on install, then serve from the cache first and never wait on the network.
 * A child on a tablet with no signal gets the same instant game as at home.
 *
 * Because it is cache-first, a new version only reaches a device when
 * CACHE_VERSION changes - that bump is the deploy step, and it is written down
 * in the README next to the publishing instructions.
 */

/* Bump this on every deploy. Nothing else invalidates a cached file. */
var CACHE_VERSION = 'v5';
var CACHE_NAME = 'kid-puzzle-' + CACHE_VERSION;

/* Relative paths so the same worker serves file-for-file under a project page
   (/kid-puzzle/) and at the root of a domain. */
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/i18n.js',
  './js/storage.js',
  './js/photos.js',
  './js/audio.js',
  './js/util.js',
  './js/drag.js',
  './js/art.js',
  './js/confetti.js',
  './js/games/jigsaw.js',
  './js/games/matching.js',
  './js/games/memory.js',
  './js/games/slide.js',
  './js/games/sequence.js',
  './js/app.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      /* Deliberately not cache.addAll: that rejects the whole install if a
         single file is missing, which would leave the game with no offline
         support at all because of one stale filename in the list above. */
      return Promise.all(SHELL.map(function (url) {
        return cache.add(url)['catch'](function () { return null; });
      }));
    })
  );
  /* Take over as soon as the new files are in, so the next launch is already
     the new version rather than the one after it. */
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        /* Only ever tidy up after this app: another project served from the
           same origin keeps its own caches. */
        if (name !== CACHE_NAME && name.indexOf('kid-puzzle-') === 0) {
          return caches['delete'](name);
        }
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;

  if (request.method !== 'GET') return;

  /* Same-origin only. The game makes no external request of any kind, and a
     worker that quietly cached a third-party URL would be exactly the kind of
     surprise this app promises not to spring. */
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (response) {
        /* Only a real, complete same-origin answer is worth keeping; an opaque
           or error response cached here would stick until the next version. */
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        return response;
      })['catch'](function () {
        /* Offline and not in the cache. A navigation still has somewhere to go:
           the shell it was precached with. Anything else simply fails, which is
           what the browser would do anyway. */
        if (request.mode === 'navigate') {
          /* Install tolerates a file that would not cache, so the shell itself
             may be missing; respondWith(undefined) would throw a TypeError
             instead of the network error the browser expects. */
          return caches.match('./index.html').then(function (shell) {
            return shell || Response.error();
          });
        }
        return Response.error();
      });
    })
  );
});
