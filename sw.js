// Pixel Sprite Vibe — Service Worker
// Strategy: cache-first for app shell, network-first for dynamic content
// Bump CACHE_VERSION to force all clients to update

const CACHE_VERSION = 'pixel-sprite-vibe-v11';
const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/style.css?v=11',
  '/script.js',
  '/script.js?v=11',
  '/manifest.json',
  '/icon-32.png',
  '/icon-180.png',
  '/icon-192.png',
  '/icon-512.png',
];

// ── Install: pre-cache app shell ──────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ───────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first, fallback to network ───────────
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Only cache successful responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        // Clone — one goes to cache, one to browser
        const toCache = response.clone();
        caches.open(CACHE_VERSION).then(cache => {
          cache.put(event.request, toCache);
        });
        return response;
      }).catch(() => {
        // Offline fallback — serve app shell
        if (event.request.destination === 'document') {
          return caches.match('/');
        }
      });
    })
  );
});

// ── Background sync hook (future: save to cloud) ─────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-projects') {
    // Placeholder for future cloud save sync
    console.log('[SW] Background sync: sync-projects');
  }
});

// ── Push notifications hook (future: daily challenges) ─
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Pixel Sprite Vibe', {
      body: data.body || 'New challenge available!',
      icon: '/icon-192.png',
      badge: '/icon-96.png',
      tag: 'pixel-sprite-vibe-push',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});
