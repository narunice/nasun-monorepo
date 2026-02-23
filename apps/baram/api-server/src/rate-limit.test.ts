/**
 * Tests for IP-based rate limiting middleware.
 * Reproduces the rate limiter logic from index.ts in isolation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';

// Reproduce the rate limiter in isolation to avoid index.ts side effects
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

function createRateLimiter() {
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

  const middleware = async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      || c.req.header('x-real-ip')
      || 'unknown';

    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    } else if (entry.count >= RATE_LIMIT_MAX) {
      c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return c.json({ error: 'too_many_requests' }, 429);
    } else {
      entry.count++;
    }
    await next();
  };

  return { middleware, rateLimitMap };
}

describe('rate limiting middleware', () => {
  let app: Hono;
  let rateLimitMap: Map<string, { count: number; resetAt: number }>;

  beforeEach(() => {
    vi.useFakeTimers();
    app = new Hono();
    const limiter = createRateLimiter();
    rateLimitMap = limiter.rateLimitMap;
    app.use('*', limiter.middleware);
    app.get('/test', (c) => c.json({ ok: true }));
  });

  it('allows requests under the limit', async () => {
    const res = await app.request('/test', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
    expect(res.status).toBe(200);
  });

  it('returns 429 when rate limit exceeded', async () => {
    // Send RATE_LIMIT_MAX requests
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      const res = await app.request('/test', {
        headers: { 'x-forwarded-for': '10.0.0.1' },
      });
      expect(res.status).toBe(200);
    }

    // The next request should be rate limited
    const res = await app.request('/test', {
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    expect(res.status).toBe(429);
    const json = await res.json() as Record<string, unknown>;
    expect(json.error).toBe('too_many_requests');
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('tracks different IPs independently', async () => {
    // Exhaust limit for IP-A
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      await app.request('/test', {
        headers: { 'x-forwarded-for': '10.0.0.2' },
      });
    }

    // IP-A should be blocked
    const resA = await app.request('/test', {
      headers: { 'x-forwarded-for': '10.0.0.2' },
    });
    expect(resA.status).toBe(429);

    // IP-B should still work
    const resB = await app.request('/test', {
      headers: { 'x-forwarded-for': '10.0.0.3' },
    });
    expect(resB.status).toBe(200);
  });

  it('resets after the window expires', async () => {
    // Exhaust the limit
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      await app.request('/test', {
        headers: { 'x-forwarded-for': '10.0.0.4' },
      });
    }

    // Should be blocked
    const resBefore = await app.request('/test', {
      headers: { 'x-forwarded-for': '10.0.0.4' },
    });
    expect(resBefore.status).toBe(429);

    // Advance past the window
    vi.advanceTimersByTime(RATE_LIMIT_WINDOW_MS + 1);

    // Should be allowed again
    const resAfter = await app.request('/test', {
      headers: { 'x-forwarded-for': '10.0.0.4' },
    });
    expect(resAfter.status).toBe(200);
  });

  it('uses x-real-ip when x-forwarded-for is absent', async () => {
    const res = await app.request('/test', {
      headers: { 'x-real-ip': '192.168.1.1' },
    });
    expect(res.status).toBe(200);
    expect(rateLimitMap.has('192.168.1.1')).toBe(true);
  });

  it('uses first IP from x-forwarded-for chain', async () => {
    const res = await app.request('/test', {
      headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' },
    });
    expect(res.status).toBe(200);
    expect(rateLimitMap.has('1.1.1.1')).toBe(true);
  });

  it('Retry-After header contains correct seconds', async () => {
    // Exhaust limit
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      await app.request('/test', {
        headers: { 'x-forwarded-for': '10.0.0.5' },
      });
    }

    // Advance 30 seconds (half the window)
    vi.advanceTimersByTime(30_000);

    const res = await app.request('/test', {
      headers: { 'x-forwarded-for': '10.0.0.5' },
    });
    expect(res.status).toBe(429);

    const retryAfter = Number(res.headers.get('Retry-After'));
    // Should be approximately 30 seconds (remaining window)
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(31);
  });
});
