import { useState, useRef, useEffect } from 'react';
import type { TPSDataPoint } from './types';
import { MAX_TPS_HISTORY } from './types';

/**
 * Hook to manage TPS history for charting
 * Accumulates TPS data points over time for trend visualization
 */
export function useTPSHistory(tps: number | null | undefined) {
  const [tpsHistory, setTpsHistory] = useState<TPSDataPoint[]>([]);
  const lastTpsRef = useRef<number | null>(null);

  useEffect(() => {
    if (tps === null || tps === undefined) return;

    lastTpsRef.current = tps;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    setTpsHistory((prev) => {
      const newHistory = [...prev, { time: timeStr, tps }];
      if (newHistory.length > MAX_TPS_HISTORY) {
        return newHistory.slice(-MAX_TPS_HISTORY);
      }
      return newHistory;
    });
  }, [tps]);

  return tpsHistory;
}
