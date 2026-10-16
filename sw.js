/* SpeakEasy service worker: keeps the app working offline.
 * The app shell is precached. Same-origin GETs are served from the cache and refreshed
 * in the background (stale-while-revalidate); pages fall back to the cached index.html.
 * Bump VERSION whenever a shell file changes. Speech traffic (WebSockets) never goes
 * through here. */
var VERSION = "speakeasy-1.1.0";
var SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/fonts.css",
  "css/hark.css",
  "css/app.css",
  "js/hark-behaviors.js",
  "js/deck.js",
  "js/script.js",
  "js/voice.js",
  "js/sw-register.js",
  "js/recognizers/browser.js",
  "js/recognizers/grok-stt.js",
  "js/recognizers/pcm-worklet.js",
  "fonts/geist-latin.woff2",
  "fonts/geist-latin-ext.woff2",
  "fonts/geist-mono-latin.woff2",
  "fonts/geist-mono-latin-ext.woff2",
  "assets/hero.webp",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(function (cache) {
    var key = req.mode === "navigate" ? "index.html" : req;
    return cache.match(key, { ignoreSearch: req.mode === "navigate" }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok && res.type === "basic") cache.put(key, res.clone());
        return res;
      }).catch(function () { return hit || caches.match("index.html"); });
      return hit || net;
    });
  }));
});
