import { useState, useEffect, useRef } from 'react';

/**
 * Extends a boolean state to stay true for a minimum duration.
 * Useful for showing "updating" indicators that would otherwise flash too briefly.
 *
 * @param value - The actual boolean state (e.g., isFetching from react-query)
 * @param minDurationMs - Minimum time to stay true (default: 600ms)
 * @returns Boolean that stays true for at least minDurationMs after value becomes true
 */
export function useMinDuration(value: boolean, minDurationMs = 600): boolean {
  const [extended, setExtended] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (value) {
      // Value became true - record start time and set extended to true
      startTimeRef.current = Date.now();
      setExtended(true);

      // Clear any pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } else if (extended && startTimeRef.current) {
      // Value became false - calculate remaining time
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, minDurationMs - elapsed);

      if (remaining > 0) {
        // Wait for remaining time before setting extended to false
        timeoutRef.current = setTimeout(() => {
          setExtended(false);
          startTimeRef.current = null;
        }, remaining);
      } else {
        // Minimum duration already passed
        setExtended(false);
        startTimeRef.current = null;
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, minDurationMs, extended]);

  return extended;
}
