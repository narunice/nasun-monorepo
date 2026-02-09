/**
 * useFaucet Hook
 * NASUN 및 테스트 토큰 Faucet 로직
 */

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { requestFaucet } from "../../../lib/sui-client";
import { useTrading } from "../useTrading";
import { useToast } from "@/components/common";
import { useWalletAccount, useZkLogin } from "@nasun/wallet";

// Must match the query key in @nasun/wallet useMultiBalance
const MULTI_BALANCE_QUERY_KEY = "wallet-multi-balance";

/**
 * Format faucet errors into user-friendly messages
 */
function formatFaucetError(error: unknown, symbol: string): string {
  const msg = error instanceof Error ? error.message : String(error ?? '');

  // MoveAbort code 1 = 24h cooldown
  if (msg.includes('MoveAbort') && msg.includes(', 1)')) {
    return `${symbol} faucet: 24h cooldown active. Try again later.`;
  }
  // Rate limiting
  if (msg.includes('429') || /rate.?limit/i.test(msg)) {
    return `${symbol} faucet rate limited. Wait a moment and try again.`;
  }
  // Gas error
  if (/InsufficientGas|No valid gas coins/i.test(msg)) {
    return 'Not enough NASUN for gas. Request NASUN first.';
  }
  // Network / fetch errors
  if (/fetch|network|ECONNREFUSED|timeout/i.test(msg)) {
    return `${symbol} faucet temporarily unavailable. Try again shortly.`;
  }
  // Generic
  return `${symbol} faucet failed. Try again.`;
}

export interface UseFaucetResult {
  isNasunLoading: boolean;
  isNbtcLoading: boolean;
  isNusdcLoading: boolean;
  isNethLoading: boolean;
  isNsolLoading: boolean;
  handleNasunFaucet: () => Promise<void>;
  handleNbtcFaucet: () => Promise<void>;
  handleNusdcFaucet: () => Promise<void>;
  handleNethFaucet: () => Promise<void>;
  handleNsolFaucet: () => Promise<void>;
}

export function useFaucet(): UseFaucetResult {
  const walletAccount = useWalletAccount();
  const { state: zkState } = useZkLogin();
  // Use wallet address or zkLogin address
  const address = walletAccount?.address || zkState?.address;
  const { showToast } = useToast();
  const { requestNbtc, requestNusdc, requestNeth, requestNsol } = useTrading();
  const queryClient = useQueryClient();

  const [isNasunLoading, setIsNasunLoading] = useState(false);
  const [isNbtcLoading, setIsNbtcLoading] = useState(false);
  const [isNusdcLoading, setIsNusdcLoading] = useState(false);
  const [isNethLoading, setIsNethLoading] = useState(false);
  const [isNsolLoading, setIsNsolLoading] = useState(false);

  const refreshBalances = useCallback(() => {
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: [MULTI_BALANCE_QUERY_KEY] });
    }, 2000);
  }, [queryClient]);

  // NASUN Faucet 요청
  const handleNasunFaucet = useCallback(async () => {
    if (!address) return;

    setIsNasunLoading(true);
    try {
      const success = await requestFaucet(address);
      if (success) {
        showToast("NASUN received!", "success");
        refreshBalances();
      } else {
        showToast("Faucet request failed", "error");
      }
    } catch (error) {
      showToast(formatFaucetError(error, "NASUN"), "error");
    } finally {
      setIsNasunLoading(false);
    }
  }, [address, showToast, refreshBalances]);

  // NBTC Faucet 요청
  const handleNbtcFaucet = useCallback(async () => {
    setIsNbtcLoading(true);
    try {
      const result = await requestNbtc();
      if (result.success) {
        showToast("1 NBTC received!", "success");
        refreshBalances();
      } else {
        showToast(formatFaucetError(result.error, "NBTC"), "error");
      }
    } catch (error) {
      showToast(formatFaucetError(error, "NBTC"), "error");
    } finally {
      setIsNbtcLoading(false);
    }
  }, [requestNbtc, showToast, refreshBalances]);

  // NUSDC Faucet 요청
  const handleNusdcFaucet = useCallback(async () => {
    setIsNusdcLoading(true);
    try {
      const result = await requestNusdc();
      if (result.success) {
        showToast("100,000 NUSDC received!", "success");
        refreshBalances();
      } else {
        showToast(formatFaucetError(result.error, "NUSDC"), "error");
      }
    } catch (error) {
      showToast(formatFaucetError(error, "NUSDC"), "error");
    } finally {
      setIsNusdcLoading(false);
    }
  }, [requestNusdc, showToast, refreshBalances]);

  // NETH Faucet 요청 (V2 - 24h cooldown)
  const handleNethFaucet = useCallback(async () => {
    setIsNethLoading(true);
    try {
      const result = await requestNeth();
      if (result.success) {
        showToast("10 NETH received!", "success");
        refreshBalances();
      } else {
        const formatted = formatFaucetError(result.error, "NETH");
        const isCooldown = formatted.includes('cooldown');
        showToast(formatted, isCooldown ? "warning" : "error");
      }
    } catch (error) {
      showToast(formatFaucetError(error, "NETH"), "error");
    } finally {
      setIsNethLoading(false);
    }
  }, [requestNeth, showToast, refreshBalances]);

  // NSOL Faucet 요청 (V2 - 24h cooldown)
  const handleNsolFaucet = useCallback(async () => {
    setIsNsolLoading(true);
    try {
      const result = await requestNsol();
      if (result.success) {
        showToast("100 NSOL received!", "success");
        refreshBalances();
      } else {
        const formatted = formatFaucetError(result.error, "NSOL");
        const isCooldown = formatted.includes('cooldown');
        showToast(formatted, isCooldown ? "warning" : "error");
      }
    } catch (error) {
      showToast(formatFaucetError(error, "NSOL"), "error");
    } finally {
      setIsNsolLoading(false);
    }
  }, [requestNsol, showToast, refreshBalances]);

  return {
    isNasunLoading,
    isNbtcLoading,
    isNusdcLoading,
    isNethLoading,
    isNsolLoading,
    handleNasunFaucet,
    handleNbtcFaucet,
    handleNusdcFaucet,
    handleNethFaucet,
    handleNsolFaucet,
  };
}
