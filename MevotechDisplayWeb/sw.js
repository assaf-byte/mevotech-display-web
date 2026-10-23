/* Keeps the menu itself available if the internet drops; videos and PDFs always come from the network. */
const SHELL = "mevotech-shell-v1";
const ASSETS = ["./", "index.html", "config.js", "web.js", "logo-white.png", "manifest.webmanifest",
  "lib/pdf.min.js", "lib/pdf.worker.min.js",
  "fonts/Barlow-Regular.ttf", "fonts/Barlow-Medium.ttf", "fonts/BarlowCondensed-Medium.ttf", "fonts/BarlowCondensed-SemiBold.ttf"];
self.addEventListener("install", e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (/\/(media|customers)\//.test(url.pathname)) return;
  // Network first, so edits on GitHub show up; the saved copy covers outages
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
