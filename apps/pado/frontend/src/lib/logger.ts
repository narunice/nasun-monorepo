/**
 * Centralized Logger
 *
 * Prevents console spam from polling-based services (oracle, deepbook, prices)
 * by deduplicating repeated messages.
 *
 * - logOnce: Logs a message only once per key (until page reload)
 * - logThrottled: Logs at most once per interval per key
 */

const loggedKeys = new Set<string>();
const throttleTimestamps = new Map<string, number>();

/**
 * Log a message only once per session (keyed by unique identifier).
 * Subsequent calls with the same key are silently ignored.
 */
export function logOnce(
  key: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  ...args: unknown[]
): void {
  if (loggedKeys.has(key)) return;
  loggedKeys.add(key);
  console[level](message, ...args);
}

/**
 * Log a message at most once per `intervalMs` (keyed by unique identifier).
 * Intermediate calls within the interval are silently dropped.
 */
export function logThrottled(
  key: string,
  level: 'info' | 'warn' | 'error',
  intervalMs: number,
  message: string,
  ...args: unknown[]
): void {
  const now = Date.now();
  const lastTime = throttleTimestamps.get(key) ?? 0;
  if (now - lastTime < intervalMs) return;
  throttleTimestamps.set(key, now);
  console[level](message, ...args);
}
