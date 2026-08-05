// DCS TM Builder service worker
// Fixes for static hosts (Cloudflare Pages/Workers, GitHub Pages) that redirect
// requests for "/index.html" to "/". Key rules:
//   1. Never cache "/index.html" directly — it may answer with a redirect.
//   2. Navigations are network-first, and ALWAYS fall back to a real Response.
//   3. Never pass a redirected response to cache.put (it throws a TypeError).
const CACHE = "dcs-tmbuilder-v1";
const SHELL = [
  "./",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./school-logo.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Cache items one by one: a single failure must not abort the install.
      Promise.all(
        SHELL.map((url) =>
          fetch(url, { cache: "no-cache" })
            .then((res) => (res.ok && !res.redirected ? cache.put(url, res) : null))
            .catch(() => null)
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let CDN/model requests pass through

  // --- Navigations (launching the app, reloading, etc.) ---
  // Always try the network first, then fall back to the cached shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("./", copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match("./").then(
            (cached) =>
              cached ||
              new Response(
                "<h1>Offline</h1><p>Connect to the internet and open DCS TM Builder again.</p>",
                { headers: { "Content-Type": "text/html; charset=utf-8" } }
              )
          )
        )
    );
    return;
  }

  // --- Everything else: cache first, then network ---
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => new Response("", { status: 504, statusText: "Offline" }));
    })
  );
});
