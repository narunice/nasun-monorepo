/**
 * Wallet Activity Tracker
 *
 * Auto-lock timers (useWallet, passkeyStore) count idle time from a
 * lastActivityAt timestamp. Previously that timestamp was only updated at
 * unlock/sign time, so a user actively browsing the app would still get
 * auto-locked once the timer elapsed since their last signature, with no
 * popup or warning. This module wires real DOM input events into both
 * stores so idle truly means idle.
 *
 * Throttled to one update per THROTTLE_MS — the auto-lock check runs every
 * 30s so finer resolution would only churn localStorage.
 */

import { useWallet } from '../hooks/useWallet';
import { usePasskeyStore } from '../stores/passkeyStore';

const THROTTLE_MS = 15_000;
const WINDOW_EVENTS: ReadonlyArray<keyof WindowEventMap> = [
  'pointerdown',
  'keydown',
  'touchstart',
];

let installed = false;
let lastTick = 0;

function onActivity(): void {
  const now = Date.now();
  if (now - lastTick < THROTTLE_MS) return;
  lastTick = now;

  // Only update for visibilitychange when the page is becoming visible.
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

  try {
    const w = useWallet.getState();
    if (w.status === 'unlocked') w.updateLastActivity();
  } catch {
    // Wallet store may not be initialized yet.
  }

  try {
    const p = usePasskeyStore.getState();
    if (p.isUnlocked) p.updateActivity();
  } catch {
    // Passkey store may not be initialized yet.
  }
}

export function installWalletActivityTracker(): void {
  if (installed) return;
  if (typeof window === 'undefined') return;
  installed = true;

  for (const evt of WINDOW_EVENTS) {
    window.addEventListener(evt, onActivity, { passive: true, capture: true });
  }
  document.addEventListener('visibilitychange', onActivity, { passive: true, capture: true });
}

// Auto-install on import in browser environments. Apps that do not want this
// (e.g. SSR-only consumers) can avoid importing this module directly.
installWalletActivityTracker();
