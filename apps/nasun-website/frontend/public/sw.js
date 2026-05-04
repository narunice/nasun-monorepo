// Kill-switch service worker (v2).
//
// Origin nasun.io briefly served pado's index.html on 2026-05-03, which
// registered pado's PWA service worker under nasun.io. Once registered, the
// orphaned worker intercepts every navigation on nasun.io and returns cached
// pado content from CacheStorage even after the origin is restored.
//
// v1 of this kill-switch (deployed 2026-05-03) only called skipWaiting +
// unregister, which left the old pado SW controlling existing tabs because
// unregister doesn't free clients still bound to a worker. v2 adds
// clients.claim() so we take over every controlled tab, force a navigation
// reload (now backed by an empty CacheStorage and a network-pass-through
// fetch handler), and only THEN unregister so the next navigation lands on
// the network with no SW in the picture.
//
// Keep this file in place indefinitely; it is the only thing healing
// returning users from the 5/3 incident.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 1. Take control of every client currently bound to the old worker.
    try { await self.clients.claim(); } catch (_) {}

    // 2. Wipe every cache the old SW (or anything else) populated.
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) {}

    // 3. Reload every controlled window. We now control them (claim above)
    //    and our fetch handler passes through to the network, so the reload
    //    lands on the live origin (nasun) instead of cached pado HTML.
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        try { client.navigate(client.url); } catch (_) {}
      }
    } catch (_) {}

    // 4. Unregister last so future navigations skip the SW entirely.
    try { await self.registration.unregister(); } catch (_) {}
  })());
});

self.addEventListener('fetch', (event) => {
  // Always go to network; never serve cached responses.
  event.respondWith(fetch(event.request));
});
