// No-op shim. Pado's index.html (briefly served from nasun.io on 2026-05-03)
// referenced /registerSW.js. Serving an empty file prevents 404s and ensures any
// stale HTML cached on a client does not error out while the kill-switch sw.js
// unregisters the orphaned service worker.
