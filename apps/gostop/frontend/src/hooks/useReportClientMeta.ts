/**
 * Reports client screen metadata once auth is ready (bot-traffic hygiene).
 * Mounted once at the app root. No-op until a wallet is connected and a token
 * exists; fire-and-forget so it never affects rendering or gameplay.
 */

import { useEffect } from 'react';
import { useGostopAuth } from './useGostopAuth';
import { reportClientMeta } from '../lib/api/clientMeta';

export function useReportClientMeta(): void {
  const { walletAddress, tokenReady } = useGostopAuth();
  useEffect(() => {
    if (walletAddress && tokenReady) {
      void reportClientMeta(walletAddress);
    }
  }, [walletAddress, tokenReady]);
}
