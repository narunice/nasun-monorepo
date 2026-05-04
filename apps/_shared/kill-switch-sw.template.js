// Canonical kill-switch service worker template.
//
// Use case. An app's origin briefly served another app's HTML (cross-app
// misdeploy) and that other app's PWA service worker registered itself under
// the wrong origin. The orphaned worker now intercepts every navigation and
// serves cached foreign content from CacheStorage even after the origin is
// restored. The hard refresh works (bypasses SW) but normal navigation does
// not. This file is the canonical neutralizer.
//
// How to deploy.
//   1. Copy this file to <app>/public/sw.js (the URL the orphaned worker is
//      registered at -- the browser checks this exact path for SW updates).
//   2. Also ship a no-op <app>/public/registerSW.js (one-line empty file)
//      so any cached HTML from the original misdeploy that references
//      /registerSW.js does not 404.
//   3. Deploy via the canonical pnpm deploy script. Verify served content
//      matches this template byte-for-byte.
//   4. Keep this file in place INDEFINITELY. Returning incident victims
//      may visit weeks later; removing the kill-switch leaves them stuck.
//
// Lifecycle order (DO NOT REORDER -- this is the order proven correct).
//   install:   skipWaiting()
//   activate:  waitUntil(
//                clients.claim()                    // 1. take over existing tabs
//                clear all caches                   // 2. wipe stale storage
//                client.navigate(client.url)        // 3. force reload under us
//                self.registration.unregister()     // 4. remove SW last
//              )
//   fetch:     respondWith(fetch(request))          // pure pass-through
//
// Why each step matters.
//   * skipWaiting     -- new SW activates immediately instead of waiting for
//                        the old SW's clients to close (which may never happen).
//   * clients.claim   -- without this, the new SW does NOT control existing
//                        tabs. unregister() does not detach controlled clients.
//                        v1 of nasun's kill-switch missed this and partially
//                        failed; v2 added it. See feedback memory entry.
//   * cache wipe      -- the orphaned SW populated CacheStorage with foreign
//                        content; clearing it ensures the forced reload hits
//                        the network instead of stale cache.
//   * client.navigate -- explicit reload of every controlled tab so the user
//                        sees recovery without a manual refresh.
//   * unregister LAST -- once unregistered, future navigations skip the SW
//                        entirely. Doing it before navigate would race with
//                        the reload chain.
//   * fetch passthrough -- our SW must never serve from cache; we are a
//                          neutralizer, not a cache layer.
//
// Reference incident: 2026-05-03 nasun.io served pado's index.html for ~4
// hours after a raw rsync source/dest typo. See the project's
// feedback_no_raw_rsync_to_prod.md memory for the deploy-time fix and
// feedback_kill_switch_sw_lifecycle.md for the SW-side checklist.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try { await self.clients.claim(); } catch (_) {}

    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) {}

    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        try { client.navigate(client.url); } catch (_) {}
      }
    } catch (_) {}

    try { await self.registration.unregister(); } catch (_) {}
  })());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
