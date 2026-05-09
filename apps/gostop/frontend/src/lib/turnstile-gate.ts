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
const STORAGE_KEY = 'gostop_turnstile_pass_v1';
const PASS_AWAIT_TIMEOUT_MS = 12_000;

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
      console.warn('[turnstile-gate] exchange failed:', res.status);
      return false;
    }
    const data = (await res.json()) as { pass?: string; expiresAt?: number };
    if (!data?.pass || typeof data.expiresAt !== 'number') {
      console.warn('[turnstile-gate] malformed exchange response');
      return false;
    }
    writeStoredPass({ pass: data.pass, expiresAt: data.expiresAt });
    return true;
  } catch (err) {
    console.warn('[turnstile-gate] exchange error:', (err as Error).message);
    return false;
  }
}

/**
 * Called by the widget at App root when Turnstile auto-execute completes.
 * Exchanges the Turnstile token for a server-signed pass and resolves any
 * waiters. Idempotent — concurrent calls coalesce.
 */
export function onTurnstileSuccess(turnstileToken: string): void {
  if (exchangeInFlight) return;
  exchangeInFlight = exchangeTokenForPass(turnstileToken).then((ok) => {
    exchangeInFlight = null;
    const waiters = pendingPassResolvers;
    pendingPassResolvers = [];
    for (const r of waiters) r(ok);
    notify();
    return ok;
  });
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

  // No fresh pass — wait for the next widget success (or trigger a re-run if
  // the widget has already fired and was discarded).
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      const idx = pendingPassResolvers.indexOf(wrapped);
      if (idx >= 0) pendingPassResolvers.splice(idx, 1);
      resolve(false);
    }, PASS_AWAIT_TIMEOUT_MS);

    const wrapped = (ok: boolean) => {
      clearTimeout(timeout);
      resolve(ok);
    };
    pendingPassResolvers.push(wrapped);
    refreshTurnstileWidget();
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
