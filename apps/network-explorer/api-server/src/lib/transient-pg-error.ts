/**
 * Transient postgres connection failures, told apart from real defects.
 *
 * postgres.js recycles pooled connections on idle_timeout and max_lifetime
 * (both set in db.ts). A connection can be handed to a query after its
 * terminate() has already run, and the query is then rejected before anything
 * reaches the server: connection.js checks a `terminated` flag in execute()
 * and never writes to the socket.
 *
 * Measured on box: one occurrence in eight days of retained logs. On
 * 2026-10-23 04:41:12 CEST a GET /ecosystem/score failed this way in 6ms while
 * the request beside it, for a different user, succeeded in 5ms. Postgres
 * logged nothing but routine checkpoints, the server has no
 * idle_session_timeout, and no maintenance job ran near that minute, so the
 * termination was the client's own pool doing its job.
 *
 * The retry gets a fresh connection, which is why callers should see a
 * retryable status rather than a 500 that reads as a bug.
 */

export const TRANSIENT_PG_CODES = new Set([
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  'CONNECTION_CLOSED',
]);

/** The postgres.js error code, when the value carries one. */
export function pgErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * True when the failure is a recycled-connection artifact that the next
 * attempt will not hit. Deliberately narrow: it matches the pool's own codes
 * and nothing else, so a query error, a timeout or a constraint violation
 * still surfaces as the defect it is.
 */
export function isTransientPgError(err: unknown): boolean {
  const code = pgErrorCode(err);
  return code !== undefined && TRANSIENT_PG_CODES.has(code);
}
