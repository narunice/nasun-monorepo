/**
 * useTransactionSync - Manages post-transaction UI syncing state
 *
 * Replaces the repeated pattern:
 *   setIsSyncing(true);
 *   setTimeout(() => { setIsSyncing(false); onSuccess?.(); }, 1500);
 */

import { useState, useCallback } from 'react';
import { TX_SYNC_DELAY_MS } from '../lib/constants';

export function useTransactionSync(onComplete?: (digest?: string) => void) {
  const [isSyncing, setIsSyncing] = useState(false);

  const startSync = useCallback(
    (digest?: string) => {
      setIsSyncing(true);
      setTimeout(() => {
        setIsSyncing(false);
        onComplete?.(digest);
      }, TX_SYNC_DELAY_MS);
    },
    [onComplete],
  );

  return { isSyncing, startSync };
}
