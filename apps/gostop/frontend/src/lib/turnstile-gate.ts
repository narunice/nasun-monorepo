/**
 * Cloudflare Turnstile gate for gostop missions.
 *
 * Flow:
 *   1. App root mounts an invisible <Turnstile/> widget. Cloudflare auto-runs
 *      the challenge: silent pass for clean residential IPs, interactive
 *      challenge for suspicious IPs (datacenter, VPN, anti-detect browsers).
 *   2. On success, frontend POSTs the token to nasun-chat-server, which
 *      verifies it with Cloudflare and returns an HMAC-signed pass.
 *   3. Pass is cached in localStorage for the duration of its TTL (~4h).
 *   4. useGameTransaction calls ensureGostopPass() before every tx submit.
 *      If the pass is valid, proceed silently. If missing/expired, await
 *      a fresh challenge (refresh widget) before allowing submission.
 *
 * If VITE_TURNSTILE_SITE_KEY is empty (e.g. local dev without a key),
 * the gate auto-disables itself and ensureGostopPass() resolves immediately.
 */
import { useEffect, useState, useCallback } from 'react';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const VERIFY_URL = import.meta.env.VITE_TURNSTILE_PASS_VERIFY_URL as string | undefined;
// Bumped from v1 -> v2 (2026-05-10) to clear stale localStorage state from
// users trapped by the previous gate's display:none + appearance:'execute'
// misconfiguration. Old keys are simply ignored.
const STORAGE_KEY = 'gostop_turnstile_pass_v2';
// Long enough for an interactive Cloudflare challenge (user clicks the box,
// possibly after a visual delay). The previous 12s value was shorter than
// many real-world challenges and produced a guaranteed self-DOS.
const PASS_AWAIT_TIMEOUT_MS = 45_000;

interface StoredPass {
  pass: string;
  expiresAt: number; // unix seconds
}

export function isGateEnabled(): boolean {
  return Boolean(SITE_KEY && VERIFY_URL);
}

function readStoredPass(): StoredPass | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPass;
    if (typeof parsed?.pass !== 'string' || typeof parsed?.expiresAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredPass(pass: StoredPass): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pass));
  } catch {
    // localStorage unavailable (private mode, quota, etc). The pass is lost
    // on page reload and the gate will re-issue a challenge next time.
  }
}

function clearStoredPass(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function passIsFresh(p: StoredPass | null): boolean {
  if (!p) return false;
  // Use a 60-second safety margin so a pass that's about to expire doesn't
  // get accepted on the frontend just to be rejected server-side.
  const now = Math.floor(Date.now() / 1000);
  return p.expiresAt > now + 60;
}

// Module-level state shared across all hook consumers + the App-root widget.
let widgetKey = 0;
let pendingPassResolvers: Array<(ok: boolean) => void> = [];
let exchangeInFlight: Promise<boolean> | null = null;
// Latest-wins: if a fresh Turnstile token arrives while a verify is in-flight,
// stash it here so we can re-exchange immediately after the in-flight resolves.
// Turnstile tokens are single-use, so we drop older queued tokens (only keep
// the most recent) to avoid wasting siteverify quota on stale tokens.
let pendingToken: string | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const sub of subscribers) sub();
}

async function exchangeTokenForPass(turnstileToken: string): Promise<boolean> {
  if (!VERIFY_URL) return false;
  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnstileToken }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn('[metric] turnstile_exchange_fail', { status: res.status });
      return false;
    }
    const data = (await res.json()) as { pass?: string; expiresAt?: number };
    if (!data?.pass || typeof data.expiresAt !== 'number') {
      console.warn('[metric] turnstile_exchange_fail', { reason: 'malformed' });
      return false;
    }
    writeStoredPass({ pass: data.pass, expiresAt: data.expiresAt });
    console.log('[metric] turnstile_exchange_success');
    return true;
  } catch (err) {
    console.warn('[metric] turnstile_exchange_fail', { reason: (err as Error).message });
    return false;
  }
}

function startExchange(turnstileToken: string): void {
  exchangeInFlight = exchangeTokenForPass(turnstileToken).then((ok) => {
    exchangeInFlight = null;
    // Latest-wins: if a newer token arrived during this exchange, run it next
    // before resolving waiters. This avoids dropping fresh tokens that the
    // previous version silently discarded via `if (exchangeInFlight) return`.
    if (pendingToken && !ok) {
      const next = pendingToken;
      pendingToken = null;
      startExchange(next);
      return ok;
    }
    pendingToken = null;
    const waiters = pendingPassResolvers;
    pendingPassResolvers = [];
    for (const r of waiters) r(ok);
    notify();
    return ok;
  });
}

/**
 * Called by the widget at App root when Turnstile auto-execute completes.
 * Exchanges the Turnstile token for a server-signed pass and resolves any
 * waiters. If an exchange is already in-flight, the new token is stashed
 * (latest-wins) and consumed after the current exchange settles.
 */
export function onTurnstileSuccess(turnstileToken: string): void {
  if (exchangeInFlight) {
    pendingToken = turnstileToken;
    return;
  }
  startExchange(turnstileToken);
}

/**
 * Force the widget to re-execute. Bumps the React key so <Turnstile/>
 * remounts and runs a fresh challenge.
 */
export function refreshTurnstileWidget(): void {
  widgetKey++;
  notify();
}

/**
 * Awaitable check used by useGameTransaction. Resolves true if a fresh pass
 * is available (immediately or after the current challenge completes), false
 * if the challenge fails / times out. When the gate is disabled (no site key
 * configured), resolves true immediately.
 */
export function ensureGostopPass(): Promise<boolean> {
  if (!isGateEnabled()) return Promise.resolve(true);
  if (passIsFresh(readStoredPass())) return Promise.resolve(true);

  // No fresh pass — wait for the next widget success. Only force a remount
  // when there's clearly no challenge in progress; remounting mid-challenge
  // destroys whatever the user is solving (the previous version's self-DOS).
  return new Promise<boolean>((resolve) => {
    const wrapped = (ok: boolean) => {
      clearTimeout(timeout);
      resolve(ok);
    };
    const timeout = setTimeout(() => {
      const idx = pendingPassResolvers.indexOf(wrapped);
      if (idx >= 0) pendingPassResolvers.splice(idx, 1);
      console.warn('[metric] turnstile_pass_timeout');
      resolve(false);
    }, PASS_AWAIT_TIMEOUT_MS);

    pendingPassResolvers.push(wrapped);
    // Only kick a fresh challenge if nothing is already in motion. Multiple
    // concurrent ensureGostopPass calls coalesce onto the same widget run.
    const hasInFlight = exchangeInFlight !== null || pendingToken !== null;
    const hasOtherWaiters = pendingPassResolvers.length > 1;
    if (!hasInFlight && !hasOtherWaiters) {
      refreshTurnstileWidget();
    }
  });
}

export function getStoredPassToken(): string | null {
  const p = readStoredPass();
  return passIsFresh(p) ? (p as StoredPass).pass : null;
}

export function clearGostopPass(): void {
  clearStoredPass();
  notify();
}

/**
 * Called by the widget on Cloudflare error/expire callbacks. Bumps the key so
 * the next render starts a fresh challenge. Bounded by the natural cadence of
 * CF error events, so this can't loop tightly the way the old per-call
 * remount did.
 */
export function onTurnstileError(): void {
  console.warn('[metric] turnstile_widget_error');
  refreshTurnstileWidget();
}

// Re-warm a fresh challenge when the user returns to the tab if the cached
// pass is gone or about to expire. This avoids the cold first-click latency
// the previous version always paid every 4h after pass TTL.
if (typeof document !== 'undefined' && isGateEnabled()) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const stored = readStoredPass();
    if (passIsFresh(stored)) return;
    if (exchangeInFlight !== null) return;
    refreshTurnstileWidget();
  });
}

/**
 * React hook used by the App-root <Turnstile/> mount to get the current key
 * and a stable success handler. Re-renders whenever the widget needs to
 * remount (refresh).
 */
export function useTurnstileWidget(): { siteKey: string | undefined; widgetKey: number; onSuccess: (token: string) => void } {
  const [, setTick] = useState(widgetKey);
  useEffect(() => {
    const sub = () => setTick(widgetKey);
    subscribers.add(sub);
    return () => {
      subscribers.delete(sub);
    };
  }, []);

  const onSuccess = useCallback((token: string) => {
    onTurnstileSuccess(token);
  }, []);

  return { siteKey: SITE_KEY, widgetKey, onSuccess };
}
