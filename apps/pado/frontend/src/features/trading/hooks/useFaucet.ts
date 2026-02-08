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
      showToast(`Faucet error: ${error instanceof Error ? error.message : "Unknown"}`, "error");
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
        showToast(`NBTC faucet error: ${result.error}`, "error");
      }
    } catch (error) {
      showToast(
        `NBTC faucet error: ${error instanceof Error ? error.message : "Unknown"}`,
        "error"
      );
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
        showToast(`NUSDC faucet error: ${result.error}`, "error");
      }
    } catch (error) {
      showToast(
        `NUSDC faucet error: ${error instanceof Error ? error.message : "Unknown"}`,
        "error"
      );
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
        const errorMsg = result.error || "Unknown error";
        if (errorMsg.includes('MoveAbort') && errorMsg.includes(', 1)')) {
          showToast("NETH faucet: 24h cooldown active. Try again later.", "warning");
        } else {
          showToast(`NETH faucet error: ${errorMsg}`, "error");
        }
      }
    } catch (error) {
      showToast(
        `NETH faucet error: ${error instanceof Error ? error.message : "Unknown"}`,
        "error"
      );
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
        const errorMsg = result.error || "Unknown error";
        if (errorMsg.includes('MoveAbort') && errorMsg.includes(', 1)')) {
          showToast("NSOL faucet: 24h cooldown active. Try again later.", "warning");
        } else {
          showToast(`NSOL faucet error: ${errorMsg}`, "error");
        }
      }
    } catch (error) {
      showToast(
        `NSOL faucet error: ${error instanceof Error ? error.message : "Unknown"}`,
        "error"
      );
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
