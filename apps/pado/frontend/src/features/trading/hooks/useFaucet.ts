/**
 * useFaucet Hook
 * NASUN 및 테스트 토큰 Faucet 로직
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { requestFaucet } from '../../../lib/sui-client';
import { useTrading } from '../useTrading';
import { useToast } from '../../../components/common';
import { useWalletAccount } from '../../../wallet';

export interface UseFaucetResult {
  isNasunLoading: boolean;
  isTokenLoading: boolean;
  handleNasunFaucet: () => Promise<void>;
  handleTokenFaucet: () => Promise<void>;
}

export function useFaucet(): UseFaucetResult {
  const account = useWalletAccount();
  const { showToast } = useToast();
  const { requestTokens, isLoading: isTradeLoading } = useTrading();
  const queryClient = useQueryClient();

  const [isNasunLoading, setIsNasunLoading] = useState(false);
  const [isTokenLoading, setIsTokenLoading] = useState(false);

  // NASUN Faucet 요청
  const handleNasunFaucet = useCallback(async () => {
    if (!account?.address) return;

    setIsNasunLoading(true);
    try {
      const success = await requestFaucet(account.address);
      if (success) {
        showToast('NASUN received!', 'success');
        // 잔고 갱신 (2초 후)
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['balances'] });
        }, 2000);
      } else {
        showToast('Faucet request failed', 'error');
      }
    } catch (error) {
      showToast(
        `Faucet error: ${error instanceof Error ? error.message : 'Unknown'}`,
        'error',
      );
    } finally {
      setIsNasunLoading(false);
    }
  }, [account?.address, showToast, queryClient]);

  // Token Faucet 요청 (NBTC + NUSDC)
  const handleTokenFaucet = useCallback(async () => {
    setIsTokenLoading(true);
    try {
      const result = await requestTokens();
      if (result.success) {
        showToast('Tokens received! 1 NBTC + 100,000 NUSDC', 'success');
        // 잔고 갱신 (2초 후)
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['balances'] });
        }, 2000);
      } else {
        showToast(`Token faucet error: ${result.error}`, 'error');
      }
    } catch (error) {
      showToast(
        `Token faucet error: ${error instanceof Error ? error.message : 'Unknown'}`,
        'error',
      );
    } finally {
      setIsTokenLoading(false);
    }
  }, [requestTokens, showToast, queryClient]);

  return {
    isNasunLoading,
    isTokenLoading: isTokenLoading || isTradeLoading,
    handleNasunFaucet,
    handleTokenFaucet,
  };
}
