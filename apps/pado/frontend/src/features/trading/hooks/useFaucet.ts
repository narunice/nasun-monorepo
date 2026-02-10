/**
 * useFaucet Hook
 * NASUN and test token faucet logic.
 * Keeps loading spinner active until balance is actually refreshed.
 */

import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { requestFaucet } from "../../../lib/sui-client";
import { waitForTxIndexing } from "../../../lib/tx-helpers";
import { useTrading } from "../useTrading";
import { useToast } from "@/components/common";
import { useWalletAccount, useZkLogin } from "@nasun/wallet";

// Must match the query key in @nasun/wallet useMultiBalance
const MULTI_BALANCE_QUERY_KEY = "wallet-multi-balance";

const COOLDOWN_MS = 5_000;
const NASUN_POLL_INTERVAL_MS = 800;
const NASUN_POLL_MAX_ATTEMPTS = 10;

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

  // Per-token cooldown (prevents rapid re-clicks after success)
  const [cooldownTokens, setCooldownTokens] = useState<Set<string>>(new Set());
  const cooldownRef = useRef(cooldownTokens);
  cooldownRef.current = cooldownTokens;

  const startCooldown = useCallback((token: string) => {
    setCooldownTokens(prev => new Set(prev).add(token));
    setTimeout(() => {
      setCooldownTokens(prev => {
        const next = new Set(prev);
        next.delete(token);
        return next;
      });
    }, COOLDOWN_MS);
  }, []);

  const isCooldown = useCallback((token: string) => cooldownTokens.has(token), [cooldownTokens]);

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
    if (!address || cooldownRef.current.has('NASUN')) return;

    setIsNasunLoading(true);
    try {
      const success = await requestFaucet(address);
      if (success) {
        await pollAndRefresh();
        showToast("NASUN received!", "success");
        startCooldown('NASUN');
      } else {
        showToast("Faucet request failed", "error");
      }
    } catch (error) {
      showToast(formatFaucetError(error, "NASUN"), "error");
    } finally {
      setIsNasunLoading(false);
    }
  }, [address, showToast, pollAndRefresh, startCooldown]);

  // NBTC Faucet (Move contract)
  const handleNbtcFaucet = useCallback(async () => {
    if (cooldownRef.current.has('NBTC')) return;

    setIsNbtcLoading(true);
    try {
      const result = await requestNbtc();
      if (result.success) {
        if (result.digest) await waitAndRefresh(result.digest);
        showToast("1 NBTC received!", "success");
        startCooldown('NBTC');
      } else {
        showToast(formatFaucetError(result.error, "NBTC"), "error");
      }
    } catch (error) {
      showToast(formatFaucetError(error, "NBTC"), "error");
    } finally {
      setIsNbtcLoading(false);
    }
  }, [requestNbtc, showToast, waitAndRefresh, startCooldown]);

  // NUSDC Faucet (Move contract)
  const handleNusdcFaucet = useCallback(async () => {
    if (cooldownRef.current.has('NUSDC')) return;

    setIsNusdcLoading(true);
    try {
      const result = await requestNusdc();
      if (result.success) {
        if (result.digest) await waitAndRefresh(result.digest);
        showToast("100,000 NUSDC received!", "success");
        startCooldown('NUSDC');
      } else {
        showToast(formatFaucetError(result.error, "NUSDC"), "error");
      }
    } catch (error) {
      showToast(formatFaucetError(error, "NUSDC"), "error");
    } finally {
      setIsNusdcLoading(false);
    }
  }, [requestNusdc, showToast, waitAndRefresh, startCooldown]);

  // NETH Faucet (V2 Move contract — 24h cooldown)
  const handleNethFaucet = useCallback(async () => {
    if (cooldownRef.current.has('NETH')) return;

    setIsNethLoading(true);
    try {
      const result = await requestNeth();
      if (result.success) {
        if (result.digest) await waitAndRefresh(result.digest);
        showToast("10 NETH received!", "success");
        startCooldown('NETH');
      } else {
        const formatted = formatFaucetError(result.error, "NETH");
        const isCd = formatted.includes('cooldown');
        showToast(formatted, isCd ? "warning" : "error");
      }
    } catch (error) {
      showToast(formatFaucetError(error, "NETH"), "error");
    } finally {
      setIsNethLoading(false);
    }
  }, [requestNeth, showToast, waitAndRefresh, startCooldown]);

  // NSOL Faucet (V2 Move contract — 24h cooldown)
  const handleNsolFaucet = useCallback(async () => {
    if (cooldownRef.current.has('NSOL')) return;

    setIsNsolLoading(true);
    try {
      const result = await requestNsol();
      if (result.success) {
        if (result.digest) await waitAndRefresh(result.digest);
        showToast("100 NSOL received!", "success");
        startCooldown('NSOL');
      } else {
        const formatted = formatFaucetError(result.error, "NSOL");
        const isCd = formatted.includes('cooldown');
        showToast(formatted, isCd ? "warning" : "error");
      }
    } catch (error) {
      showToast(formatFaucetError(error, "NSOL"), "error");
    } finally {
      setIsNsolLoading(false);
    }
  }, [requestNsol, showToast, waitAndRefresh, startCooldown]);

  return {
    isNasunLoading,
    isNbtcLoading,
    isNusdcLoading,
    isNethLoading,
    isNsolLoading,
    isCooldown,
    handleNasunFaucet,
    handleNbtcFaucet,
    handleNusdcFaucet,
    handleNethFaucet,
    handleNsolFaucet,
  };
}
