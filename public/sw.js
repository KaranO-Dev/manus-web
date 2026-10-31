/*
  The service worker: what lets the installed MANUS open and play without a connection, and nothing more.
  Registered by components/ServiceWorker.tsx in production builds as /sw.js?v=<version>, so each release is a
  new worker that starts with empty caches and deletes the last release's.

  - The page: the network first, always, so a deploy shows at once. A copy is kept, and offline the copy answers.
    The page and its scripts, styles and fonts are kept when the worker installs, so the first visit is enough.
  - Files that stay the same within a release (scripts and styles with a hash in their names, fonts, icons, the
    sound samples, the hand-tracking runtime and its model): from the device first, else the network, and kept once used. So the
    tracker is kept only after the camera has been on once, and a mouse or phone player never downloads it.
  - Passed through untouched: other origins, anything but GET, range requests, and every path not listed above.

  To retire it, replace this file with one that unregisters itself (self.registration.unregister()) and deploy:
  removing it would leave installed workers running.
*/

const VERSION = new URL(self.location.href).searchParams.get("v") || "0";
const PAGES = `manus-pages-${VERSION}`;
const FILES = `manus-files-${VERSION}`;
const KEPT =
  /^\/(?:_next\/static|fonts|icons|samples|wasm|models)\/|^\/(?:icon\.svg|apple-icon\.png|favicon\.ico|manifest\.webmanifest)$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const response = await fetch("/", { cache: "no-store" });
        if (response.ok) {
          await (await caches.open(PAGES)).put("/", response.clone());
          // The page's own scripts and styles, then the fonts its styles ask for
          const html = await response.text();
          const files = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) ?? [])];
          const kept = await caches.open(FILES);
          await Promise.all(files.map((url) => kept.add(url).catch(() => {})));
          for (const url of files.filter((f) => f.endsWith(".css"))) {
            const css = await (await kept.match(url))?.text();
            const fonts = [...new Set(css?.match(/\/fonts\/[^"'\s)]+/g) ?? [])];
            await Promise.all(fonts.map((font) => kept.add(font).catch(() => {})));
          }
        }
      } catch {
        // offline at install: the page is kept on the next visit instead
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("manus-") && name !== PAGES && name !== FILES) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.headers.has("range")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(page(event));
  } else if (KEPT.test(url.pathname)) {
    event.respondWith(file(event));
  }
});

async function page(event) {
  try {
    const response = await fetch(event.request);
    if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
      const copy = response.clone();
      event.waitUntil(caches.open(PAGES).then((cache) => cache.put("/", copy)).catch(() => {}));
    }
    return response;
  } catch {
    return (await caches.open(PAGES).then((cache) => cache.match("/"))) ?? Response.error();
  }
}

async function file(event) {
  const hit = await caches.match(event.request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(event.request);
  if (response.ok && response.type === "basic") {
    const copy = response.clone();
    event.waitUntil(caches.open(FILES).then((cache) => cache.put(event.request, copy)).catch(() => {}));
  }
  return response;
}
