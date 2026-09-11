/* ============================================================
   sw.js — offline support.

   The laboratory runs entirely in the browser, so once a page
   and its scripts are cached a student can work through a whole
   experiment with no network at all: the plate, the analysis and
   the PDF are all generated locally. Only submission needs a
   connection, and that is never cached.

   Bump CACHE when you deploy, or browsers will keep serving the
   files they already hold.
   ============================================================ */

var CACHE = "vlab-v6";

var CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./data/catalog.js",
  "./shared/css/base.css",
  "./shared/css/portal.css",
  "./shared/js/config.js",
  "./shared/js/portal.js",
  "./shared/js/lab-submit.js",
  "./shared/js/pdf.js",
  "./shared/js/report-doc.js",
  "./shared/js/pwa.js",
  "./shared/js/formula.js",
  "./shared/js/plot.js",
  "./shared/js/lab-engine.js",
  "./experiments/_generic/index.html",
  "./experiments/_generic/load.js",
  "./experiments/hall-effect/spec.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./experiments/alo-band-spectrum/index.html",
  "./experiments/alo-band-spectrum/css/experiment.css",
  "./experiments/alo-band-spectrum/js/meta.js",
  "./experiments/alo-band-spectrum/js/physics.js",
  "./experiments/alo-band-spectrum/js/spectrum.js",
  "./experiments/alo-band-spectrum/js/charts.js",
  "./experiments/alo-band-spectrum/js/report.js",
  "./experiments/alo-band-spectrum/js/app.js",
  "./admin/index.html",
  "./admin/css/admin.css",
  "./admin/js/admin.js",
  "./icons/apple-touch-icon.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return Promise.allSettled(CORE.map(function (u) { return c.add(u); })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // the submission endpoint, fonts: leave alone

  // Pages: try the network so an updated deployment is picked up, fall back to the cache.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) { return hit || caches.match("./index.html"); });
      })
    );
    return;
  }

  // Everything else: serve from the cache at once, refresh it in the background.
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});

self.addEventListener("message", function (e) {
  if (e.data === "skipWaiting") self.skipWaiting();
});
