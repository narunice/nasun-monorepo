import type { ErrorHandler } from 'hono';

import { isTransientPgError, pgErrorCode } from './transient-pg-error.js';

// The pool replaces the dead connection as soon as it notices, so the next
// attempt succeeds; a second is slack for that replacement, not a backoff.
// Header and body are derived from this one value so they cannot drift, the
// way routes/stats.ts derives both from STATS_NEGATIVE_TTL_MS.
const TRANSIENT_RETRY_AFTER_MS = 1_000;

/**
 * The app's error handler, in a module so it can be exercised without booting
 * the server.
 *
 * A connection the pool recycled can be handed to a query after postgres.js
 * has terminated it, and the query is rejected before it reaches the server.
 * The next attempt gets a fresh connection, so that failure is a retry rather
 * than a defect: it answers 503 with Retry-After and leaves 500 to mean
 * something is actually wrong. See lib/transient-pg-error.ts for the one
 * occurrence on record, which cost a user nothing (the frontend retries once)
 * but read as a server error in the logs.
 */
export const handleHttpError: ErrorHandler = (err, c) => {
  if (isTransientPgError(err)) {
    // c.req.url, not c.req.path: Hono percent-decodes path, so the client
    // decides what lands in the log. Its router does 404 a target containing
    // %0A or %0D, which rules out forging a whole line, but %00 and friends
    // decode and pass through. The raw URL keeps the client's escaping.
    console.warn(
      `[WARN] Transient postgres connection error on ${c.req.method} ${c.req.url}:`,
      pgErrorCode(err),
    );
    // Readable in a browser only because index.ts exposes it via CORS.
    c.header('Retry-After', String(Math.ceil(TRANSIENT_RETRY_AFTER_MS / 1000)));
    return c.json(
      { error: 'service_unavailable', retryAfterMs: TRANSIENT_RETRY_AFTER_MS },
      503,
    );
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'internal_server_error' }, 500);
};
