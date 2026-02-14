/**
 * useFaucet Hook
 * NASUN and test token faucet logic.
 * Keeps loading spinner active until balance is actually refreshed.
 */

import { useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { requestFaucet } from "../../../lib/sui-client";
import { waitForTxIndexing } from "../../../lib/tx-helpers";
import { useTrading } from "../useTrading";
import { useToast } from "@/components/common";
import {
  useWalletAccount,
  useZkLogin,
  getCooldownRemaining,
  setCooldownTimestamp,
  formatCooldownRemaining,
} from "@nasun/wallet";

// Must match the query key in @nasun/wallet useMultiBalance
const MULTI_BALANCE_QUERY_KEY = "wallet-multi-balance";

const NASUN_POLL_INTERVAL_MS = 800;
const NASUN_POLL_MAX_ATTEMPTS = 10;
const COOLDOWN_POLL_INTERVAL_MS = 60_000;

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
  isCooldown: (token: string) => boolean;
  getCooldownFormatted: (token: string) => string;
  handleNasunFaucet: () => Promise<void>;
  handleNbtcFaucet: () => Promise<void>;
  handleNusdcFaucet: () => Promise<void>;
  handleNethFaucet: () => Promise<void>;
  handleNsolFaucet: () => Promise<void>;
}

export function useFaucet(): UseFaucetResult {
  const walletAccount = useWalletAccount();
  const { state: zkState } = useZkLogin();
  const address = walletAccount?.address || zkState?.address;
  const { showToast } = useToast();
  const { requestNbtc, requestNusdc, requestNeth, requestNsol } = useTrading();
  const queryClient = useQueryClient();

  const [isNasunLoading, setIsNasunLoading] = useState(false);
  const [isNbtcLoading, setIsNbtcLoading] = useState(false);
  const [isNusdcLoading, setIsNusdcLoading] = useState(false);
  const [isNethLoading, setIsNethLoading] = useState(false);
  const [isNsolLoading, setIsNsolLoading] = useState(false);

  // localStorage-based 24h cooldown (persists across page refresh)
  const [, setTick] = useState(0);

  // Poll cooldown state every 60s to update UI
  useEffect(() => {
    if (!address) return;
    const id = setInterval(() => setTick(t => t + 1), COOLDOWN_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [address]);

  const isCooldown = useCallback((token: string) => {
    if (!address) return false;
    return getCooldownRemaining(address, token) > 0;
  }, [address]);

  const getCooldownFormattedCb = useCallback((token: string) => {
    if (!address) return '';
    return formatCooldownRemaining(getCooldownRemaining(address, token));
  }, [address]);

  /**
   * Wait for RPC indexing (Move tx with digest), then invalidate balance cache.
   */
  const waitAndRefresh = useCallback(async (digest: string) => {
    await waitForTxIndexing(digest);
    await queryClient.invalidateQueries({ queryKey: [MULTI_BALANCE_QUERY_KEY] });
  }, [queryClient]);

  /**
   * For NASUN HTTP faucet (no digest): poll balance until it changes or max attempts.
   * Captures a snapshot before polling and breaks early once the balance differs.
   */
  const pollAndRefresh = useCallback(async () => {
    type BalanceData = { native?: { balance?: bigint } };
    const filter = { queryKey: [MULTI_BALANCE_QUERY_KEY] };

    // Snapshot: get current native balance from the first matching query
    const entries = queryClient.getQueriesData<BalanceData>(filter);
    const prevBalance = entries[0]?.[1]?.native?.balance;

    for (let i = 0; i < NASUN_POLL_MAX_ATTEMPTS; i++) {
      await new Promise(r => setTimeout(r, NASUN_POLL_INTERVAL_MS));
      await queryClient.invalidateQueries(filter);
      // Allow refetch to settle
      await new Promise(r => setTimeout(r, 200));
      const updated = queryClient.getQueriesData<BalanceData>(filter);
      const newBalance = updated[0]?.[1]?.native?.balance;
      if (newBalance !== undefined && newBalance !== prevBalance) {
        break;
      }
    }
  }, [queryClient]);

  // NASUN Faucet (HTTP API — no digest available)
  const handleNasunFaucet = useCallback(async () => {
    if (!address) return;

    // Check 24h localStorage cooldown
    const remaining = getCooldownRemaining(address, 'NSN');
    if (remaining > 0) {
      const formatted = formatCooldownRemaining(remaining);
      showToast(`NASUN faucet: cooldown active. Try again in ${formatted}.`, "warning");
      return;
    }

    setIsNasunLoading(true);
    try {
      const success = await requestFaucet(address);
      if (success) {
        setCooldownTimestamp(address, 'NSN');
        await pollAndRefresh();
        showToast("NASUN received!", "success");
      } else {
        showToast("NASUN faucet failed. Check your connection and try again.", "error");
      }
    } catch (error) {
      showToast(formatFaucetError(error, "NASUN"), "error");
    } finally {
      setIsNasunLoading(false);
    }
  }, [address, showToast, pollAndRefresh]);

  // NBTC Faucet (Move contract — 24h per-token cooldown)
  const handleNbtcFaucet = useCallback(async () => {
    if (!address) return;

    const remaining = getCooldownRemaining(address, 'NBTC');
    if (remaining > 0) {
      const formatted = formatCooldownRemaining(remaining);
      showToast(`NBTC faucet: cooldown active. Try again in ${formatted}.`, "warning");
      return;
    }

    setIsNbtcLoading(true);
    try {
      const result = await requestNbtc();
      if (result.success) {
        setCooldownTimestamp(address, 'NBTC');
        if (result.digest) await waitAndRefresh(result.digest);
        showToast("0.1 NBTC received!", "success");
      } else {
        const formatted = formatFaucetError(result.error, "NBTC");
        if (formatted.includes('cooldown')) setCooldownTimestamp(address, 'NBTC');
        showToast(formatted, formatted.includes('cooldown') ? "warning" : "error");
      }
    } catch (error) {
      const formatted = formatFaucetError(error, "NBTC");
      if (formatted.includes('cooldown')) setCooldownTimestamp(address, 'NBTC');
      showToast(formatted, formatted.includes('cooldown') ? "warning" : "error");
    } finally {
      setIsNbtcLoading(false);
    }
  }, [address, requestNbtc, showToast, waitAndRefresh]);

  // NUSDC Faucet (Move contract — 24h per-token cooldown)
  const handleNusdcFaucet = useCallback(async () => {
    if (!address) return;

    const remaining = getCooldownRemaining(address, 'NUSDC');
    if (remaining > 0) {
      const formatted = formatCooldownRemaining(remaining);
      showToast(`NUSDC faucet: cooldown active. Try again in ${formatted}.`, "warning");
      return;
    }

    setIsNusdcLoading(true);
    try {
      const result = await requestNusdc();
      if (result.success) {
        setCooldownTimestamp(address, 'NUSDC');
        if (result.digest) await waitAndRefresh(result.digest);
        showToast("10,000 NUSDC received!", "success");
      } else {
        const formatted = formatFaucetError(result.error, "NUSDC");
        if (formatted.includes('cooldown')) setCooldownTimestamp(address, 'NUSDC');
        showToast(formatted, formatted.includes('cooldown') ? "warning" : "error");
      }
    } catch (error) {
      const formatted = formatFaucetError(error, "NUSDC");
      if (formatted.includes('cooldown')) setCooldownTimestamp(address, 'NUSDC');
      showToast(formatted, formatted.includes('cooldown') ? "warning" : "error");
    } finally {
      setIsNusdcLoading(false);
    }
  }, [address, requestNusdc, showToast, waitAndRefresh]);

  // NETH Faucet (V2 Move contract — 24h cooldown)
  const handleNethFaucet = useCallback(async () => {
    if (!address) return;

    const remaining = getCooldownRemaining(address, 'NETH');
    if (remaining > 0) {
      const formatted = formatCooldownRemaining(remaining);
      showToast(`NETH faucet: cooldown active. Try again in ${formatted}.`, "warning");
      return;
    }

    setIsNethLoading(true);
    try {
      const result = await requestNeth();
      if (result.success) {
        setCooldownTimestamp(address, 'NETH');
        if (result.digest) await waitAndRefresh(result.digest);
        showToast("2.5 NETH received!", "success");
      } else {
        const formatted = formatFaucetError(result.error, "NETH");
        if (formatted.includes('cooldown')) setCooldownTimestamp(address, 'NETH');
        showToast(formatted, formatted.includes('cooldown') ? "warning" : "error");
      }
    } catch (error) {
      const formatted = formatFaucetError(error, "NETH");
      if (formatted.includes('cooldown')) setCooldownTimestamp(address, 'NETH');
      showToast(formatted, formatted.includes('cooldown') ? "warning" : "error");
    } finally {
      setIsNethLoading(false);
    }
  }, [address, requestNeth, showToast, waitAndRefresh]);

  // NSOL Faucet (V2 Move contract — 24h cooldown)
  const handleNsolFaucet = useCallback(async () => {
    if (!address) return;

    const remaining = getCooldownRemaining(address, 'NSOL');
    if (remaining > 0) {
      const formatted = formatCooldownRemaining(remaining);
      showToast(`NSOL faucet: cooldown active. Try again in ${formatted}.`, "warning");
      return;
    }

    setIsNsolLoading(true);
    try {
      const result = await requestNsol();
      if (result.success) {
        setCooldownTimestamp(address, 'NSOL');
        if (result.digest) await waitAndRefresh(result.digest);
        showToast("50 NSOL received!", "success");
      } else {
        const formatted = formatFaucetError(result.error, "NSOL");
        if (formatted.includes('cooldown')) setCooldownTimestamp(address, 'NSOL');
        showToast(formatted, formatted.includes('cooldown') ? "warning" : "error");
      }
    } catch (error) {
      const formatted = formatFaucetError(error, "NSOL");
      if (formatted.includes('cooldown')) setCooldownTimestamp(address, 'NSOL');
      showToast(formatted, formatted.includes('cooldown') ? "warning" : "error");
    } finally {
      setIsNsolLoading(false);
    }
  }, [address, requestNsol, showToast, waitAndRefresh]);

  return {
    isNasunLoading,
    isNbtcLoading,
    isNusdcLoading,
    isNethLoading,
    isNsolLoading,
    isCooldown,
    getCooldownFormatted: getCooldownFormattedCb,
    handleNasunFaucet,
    handleNbtcFaucet,
    handleNusdcFaucet,
    handleNethFaucet,
    handleNsolFaucet,
  };
}
