// Built into dist/sw.js by the kids-cinema-sw plugin in vite.config.js, which fills in the version and file list.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL_CACHE = `kc-shell-${VERSION}`;
const RUNTIME_CACHE = 'kc-runtime-v1';
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('kc-shell-') && key !== SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);
  return hit || network;
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put('/index.html', response.clone());
    }
    return response;
  } catch (error) {
    const fallback = await caches.match('/index.html');
    if (fallback) return fallback;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    if (FONT_HOSTS.has(url.hostname)) event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Videos, thumbnails and the library list always come from the server.
  if (url.pathname.startsWith('/api/') || url.pathname === '/health' || request.headers.has('range')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(cacheFirst(request));
  }
});
