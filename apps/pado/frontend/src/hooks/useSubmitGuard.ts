/**
 * useSubmitGuard - Prevents double-submission on financial operations
 *
 * Wraps async handlers with a guard that:
 * 1. Blocks concurrent calls while one is in-flight (uses ref for synchronous check)
 * 2. Enforces a cooldown period after completion to prevent rapid re-clicks
 * 3. Cleans up timer on unmount to prevent memory leaks
 */

import { useState, useCallback, useRef, useEffect } from 'react';

const DEFAULT_COOLDOWN_MS = 1000;

export function useSubmitGuard(cooldownMs: number = DEFAULT_COOLDOWN_MS) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownRef.current) {
        clearTimeout(cooldownRef.current);
      }
    };
  }, []);

  const guard = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
      // Use ref for synchronous mutual exclusion (state can be stale in closures)
      if (isSubmittingRef.current) return undefined;

      isSubmittingRef.current = true;
      setIsSubmitting(true);
      try {
        return await fn();
      } finally {
        cooldownRef.current = setTimeout(() => {
          isSubmittingRef.current = false;
          setIsSubmitting(false);
          cooldownRef.current = null;
        }, cooldownMs);
      }
    },
    [cooldownMs],
  );

  return { isSubmitting, guard };
}
