/*
  Service worker.

  A print shop with bad Wi-Fi should still be able to open this and make a
  code, so the whole app shell is cached and served from the cache first.

  Two rules govern everything here:

    1. Same-origin only. Any request to another origin is passed straight
       through untouched, and there are none, which is the point.
    2. The cache is versioned, and old versions are deleted on activate, so an
       update can never leave someone running half of one build and half of
       another.

  The asset list is not hard-coded, because Vite's filenames carry content
  hashes that change every build. Instead the shell is cached on install and
  everything else is cached the first time it is used.
*/

const VERSION = 'etch-v1';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

/** The minimum needed to open the app with no network at all. */
const SHELL_URLS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/fonts/ibm-plex-sans-latin-wght-normal.woff2',
  '/fonts/ibm-plex-sans-latin-ext-wght-normal.woff2',
  '/fonts/ibm-plex-mono-latin-500-normal.woff2',
  '/fonts/ibm-plex-mono-latin-400-normal.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // Individually, so one missing file cannot fail the whole install and
      // leave the app with no offline support at all.
      await Promise.all(
        SHELL_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined)),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Rule one: this worker has no opinion about other origins.
  if (url.origin !== self.location.origin) return;

  // Navigations: try the network so an update is picked up promptly, fall back
  // to the cached shell when there is no network. This is what makes the
  // "turn off your Wi-Fi and reload" invitation in the app actually true.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL);
          cache.put('/index.html', fresh.clone());
          return fresh;
        } catch {
          const cached = (await caches.match('/index.html')) ?? (await caches.match('/'));
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Everything else: cache first. Vite's hashed filenames mean a cached asset
  // is never stale; a changed file arrives under a new name.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const fresh = await fetch(request);
        if (fresh.ok && fresh.type === 'basic') {
          const cache = await caches.open(RUNTIME);
          cache.put(request, fresh.clone());
        }
        return fresh;
      } catch {
        return Response.error();
      }
    })(),
  );
});
