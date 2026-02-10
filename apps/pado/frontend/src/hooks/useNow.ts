import { useState, useEffect } from 'react';

/**
 * Returns the current timestamp, updating at the specified interval.
 * Avoids Date.now() calls during render which violate React purity rules.
 */
export function useNow(intervalMs = 10_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
