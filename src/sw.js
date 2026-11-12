// Service worker template: build.js fills in the version and the file list.
// Everything is static and local, so the whole app is precached and served cache-first.
const VERSION = "__VERSION__";
const FILES = __FILES__;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  // Video stays on the network: Safari needs HTTP range responses, which the cache can't serve.
  if (url.pathname.endsWith(".mp4")) return;
  // ignoreSearch: viewer.html?id=… is the same cached page for every painting.
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit ?? fetch(req)));
});
