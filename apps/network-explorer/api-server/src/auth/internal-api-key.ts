import type { MiddlewareHandler } from 'hono';
import { timingSafeEqual } from 'crypto';

/**
 * Internal API key middleware factory.
 *
 * Returns a Hono middleware that requires a matching `x-api-key` header. The
 * comparison is constant-time to avoid timing-based key leakage.
 *
 * Usage: `app.get('/internal/foo', requireInternalApiKey('FOO_API_KEY'), handler)`.
 */
export function requireInternalApiKey(envVarName: string): MiddlewareHandler {
  return async (c, next) => {
    const expected = process.env[envVarName];
    const got = c.req.header('x-api-key');
    if (!expected || !got) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const a = Buffer.from(expected);
    const b = Buffer.from(got);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    await next();
  };
}
