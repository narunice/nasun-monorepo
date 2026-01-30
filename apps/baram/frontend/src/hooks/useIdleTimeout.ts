import { useEffect, useRef, useCallback } from 'react';

const IDLE_EVENTS: Array<keyof DocumentEventMap> = [
  'mousemove',
  'keydown',
  'click',
  'touchstart',
  'scroll',
];

// Throttle activity detection to avoid excessive timer resets
const THROTTLE_MS = 30_000; // 30 seconds

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Idle timeout hook — calls onIdle after timeoutMs of user inactivity.
 * Tracks DOM events (mousemove, keydown, click, touchstart, scroll).
 *
 * Used in Baram to lock password wallets and disconnect zkLogin sessions
 * after extended inactivity (financial dApp security requirement).
 */
export function useIdleTimeout(
  onIdle: () => void,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const onIdleRef = useRef(onIdle);

  // Keep callback ref fresh without re-registering listeners
  onIdleRef.current = onIdle;

  const resetTimer = useCallback(() => {
    const now = Date.now();

    // Throttle: skip if last activity was within THROTTLE_MS
    if (now - lastActivityRef.current < THROTTLE_MS) {
      return;
    }
    lastActivityRef.current = now;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      console.log('[IdleTimeout] User idle, triggering timeout');
      onIdleRef.current();
    }, timeoutMs);
  }, [timeoutMs]);

  useEffect(() => {
    // Start initial timer
    timerRef.current = setTimeout(() => {
      console.log('[IdleTimeout] User idle, triggering timeout');
      onIdleRef.current();
    }, timeoutMs);

    // Register DOM event listeners
    for (const event of IDLE_EVENTS) {
      document.addEventListener(event, resetTimer, { passive: true });
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      for (const event of IDLE_EVENTS) {
        document.removeEventListener(event, resetTimer);
      }
    };
  }, [resetTimer, timeoutMs]);
}
