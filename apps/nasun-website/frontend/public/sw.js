// Kill-switch service worker.
// Origin nasun.io briefly served pado's index.html on 2026-05-03, which registered
// pado's PWA service worker under nasun.io. This SW unregisters any prior worker,
// clears all CacheStorage entries, and reloads open clients to restore origin content.
// Keep this file in place indefinitely so any returning user is healed on next visit.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) {}
    try {
      await self.registration.unregister();
    } catch (_) {}
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        try { client.navigate(client.url); } catch (_) {}
      }
    } catch (_) {}
  })());
});

self.addEventListener('fetch', (event) => {
  // Pass through to network; never serve cached responses.
  event.respondWith(fetch(event.request));
});
