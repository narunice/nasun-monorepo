/**
 * useFaucet Hook
 * NASUN 및 테스트 토큰 Faucet 로직
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { requestFaucet } from '../../../lib/sui-client';
import { useTrading } from '../useTrading';
import { useToast } from '../../../components/common';
import { useWalletAccount } from '@nasun/wallet';

// Must match the query key in @nasun/wallet useMultiBalance
const MULTI_BALANCE_QUERY_KEY = 'wallet-multi-balance';

export interface UseFaucetResult {
  isNasunLoading: boolean;
  isNbtcLoading: boolean;
  isNusdcLoading: boolean;
  handleNasunFaucet: () => Promise<void>;
  handleNbtcFaucet: () => Promise<void>;
  handleNusdcFaucet: () => Promise<void>;
}

export function useFaucet(): UseFaucetResult {
  const account = useWalletAccount();
  const { showToast } = useToast();
  const { requestNbtc, requestNusdc, isLoading: isTradeLoading } = useTrading();
  const queryClient = useQueryClient();

  const [isNasunLoading, setIsNasunLoading] = useState(false);
  const [isNbtcLoading, setIsNbtcLoading] = useState(false);
  const [isNusdcLoading, setIsNusdcLoading] = useState(false);

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
          queryClient.invalidateQueries({ queryKey: [MULTI_BALANCE_QUERY_KEY] });
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

  // NBTC Faucet 요청
  const handleNbtcFaucet = useCallback(async () => {
    setIsNbtcLoading(true);
    try {
      const result = await requestNbtc();
      if (result.success) {
        showToast('1 NBTC received!', 'success');
        // 잔고 갱신 (2초 후)
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: [MULTI_BALANCE_QUERY_KEY] });
        }, 2000);
      } else {
        showToast(`NBTC faucet error: ${result.error}`, 'error');
      }
    } catch (error) {
      showToast(
        `NBTC faucet error: ${error instanceof Error ? error.message : 'Unknown'}`,
        'error',
      );
    } finally {
      setIsNbtcLoading(false);
    }
  }, [requestNbtc, showToast, queryClient]);

  // NUSDC Faucet 요청
  const handleNusdcFaucet = useCallback(async () => {
    setIsNusdcLoading(true);
    try {
      const result = await requestNusdc();
      if (result.success) {
        showToast('100,000 NUSDC received!', 'success');
        // 잔고 갱신 (2초 후)
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: [MULTI_BALANCE_QUERY_KEY] });
        }, 2000);
      } else {
        showToast(`NUSDC faucet error: ${result.error}`, 'error');
      }
    } catch (error) {
      showToast(
        `NUSDC faucet error: ${error instanceof Error ? error.message : 'Unknown'}`,
        'error',
      );
    } finally {
      setIsNusdcLoading(false);
    }
  }, [requestNusdc, showToast, queryClient]);

  return {
    isNasunLoading,
    isNbtcLoading: isNbtcLoading || isTradeLoading,
    isNusdcLoading: isNusdcLoading || isTradeLoading,
    handleNasunFaucet,
    handleNbtcFaucet,
    handleNusdcFaucet,
  };
}
