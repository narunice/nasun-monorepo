/**
 * useTokenFaucet Hook
 *
 * React hook for requesting tokens from faucet.
 * Supports three modes:
 * 1. HTTP API faucet (NASUN) - uses request() handler
 * 2. Move contract faucet (NBTC/NUSDC/NETH/NSOL) - uses buildTransaction() + wallet signing
 * 3. Batch PTB faucet - combines multiple Move faucets into a single transaction
 *
 * All tokens enforce 24h cooldown via localStorage + on-chain enforcement.
 *
 * Global mutual exclusion: module-level _globalLoadingTokens prevents concurrent
 * faucet transactions from different components (avoids gas coin contention).
 */

import { useState, useCallback, useEffect } from 'react';
import { useNetwork } from './useNetwork';
import { useWallet } from './useWallet';
import { useZkLogin } from './useZkLogin';
import { usePasskey } from './usePasskey';
import { useRefreshMultiBalance } from './useMultiBalance';
import { getTokenFaucet, hasTokenFaucet } from '../config/tokens';
import { getSuiClient } from '../sui/client';
import { buildBatchFaucetTx, ONCHAIN_FAUCET_SYMBOLS } from '../sui/tokenFaucet';
import {
  getCooldownRemaining as getRawCooldownRemaining,
  setCooldownTimestamp,
  formatCooldownRemaining,
  COOLDOWN_CHANGE_EVENT,
} from '../sui/faucetCooldown';

// ============================================
// Global loading state (cross-component mutual exclusion)
// ============================================

const _globalLoadingTokens = new Set<string>();
const FAUCET_LOADING_EVENT = 'nasun:faucet-loading-change';

function setGlobalLoading(symbol: string, loading: boolean): void {
  if (loading) {
    _globalLoadingTokens.add(symbol);
  } else {
    _globalLoadingTokens.delete(symbol);
  }
  window.dispatchEvent(new Event(FAUCET_LOADING_EVENT));
}

function setGlobalLoadingBatch(symbols: string[], loading: boolean): void {
  for (const s of symbols) {
    if (loading) _globalLoadingTokens.add(s);
    else _globalLoadingTokens.delete(s);
  }
  window.dispatchEvent(new Event(FAUCET_LOADING_EVENT));
}

// ============================================
// Types
// ============================================

export interface FaucetResult {
  success: boolean;
  /** Error message for display (e.g., "24h cooldown active") */
  error?: string;
  /** Custom success message from handler */
  successMessage?: string;
}

export interface BatchFaucetOptions {
  /** Include NSN (native) faucet request before the batch PTB. Default: false */
  includeNative?: boolean;
  /** Specific tokens to request. If omitted, requests all claimable on-chain tokens. */
  symbols?: string[];
}

export interface BatchFaucetResult {
  success: boolean;
  /** Tokens that were successfully claimed */
  claimed: string[];
  /** Tokens that failed (with reason) */
  failed: Array<{ symbol: string; error: string }>;
  /** Whether NSN was requested and its result */
  nsnResult?: { success: boolean; error?: string };
}

export interface UseTokenFaucetResult {
  /** Request tokens from faucet for a specific token */
  requestFaucet: (symbol: string) => Promise<FaucetResult>;
  /** Request all claimable tokens in a single PTB */
  requestBatchFaucet: (options?: BatchFaucetOptions) => Promise<BatchFaucetResult>;
  /** Check if a specific token is currently loading */
  isLoading: (symbol: string) => boolean;
  /** Whether ANY faucet transaction is currently in flight (cross-component) */
  isAnyLoading: boolean;
  /** Check if a specific token is in cooldown */
  isCooldown: (symbol: string) => boolean;
  /** Get remaining cooldown in ms for a specific token (0 = can claim) */
  getCooldownRemaining: (symbol: string) => number;
  /** Get formatted remaining cooldown string (e.g., "~23h 15m") */
  getCooldownFormatted: (symbol: string) => string;
  /** List of on-chain tokens that can be claimed right now (not in cooldown) */
  getClaimableTokens: () => string[];
  /** Set of tokens currently loading */
  loadingTokens: Set<string>;
  /** Whether faucet can be used (devnet/testnet + wallet connected) */
  canUseFaucet: boolean;
}

/**
 * Hook for requesting tokens from faucet.
 * Uses global module-level state for cross-component mutual exclusion.
 */
export function useTokenFaucet(): UseTokenFaucetResult {
  const { isDevnet, isTestnet } = useNetwork();
  const { account, getKeypair } = useWallet();
  const { state: zkState, signTransaction: zkSignTransaction } = useZkLogin();
  const { keypair: passkeyKeypair, address: passkeyAddress } = usePasskey();
  const refreshBalance = useRefreshMultiBalance();

  // Local mirror of global loading state (for re-rendering)
  const [loadingTokens, setLoadingTokens] = useState<Set<string>>(
    () => new Set(_globalLoadingTokens),
  );

  // Re-render counter: increments when any component sets/clears a cooldown
  const [, setCooldownTick] = useState(0);
  useEffect(() => {
    const handler = () => setCooldownTick((n) => n + 1);
    window.addEventListener(COOLDOWN_CHANGE_EVENT, handler);
    return () => window.removeEventListener(COOLDOWN_CHANGE_EVENT, handler);
  }, []);

  // Sync local state with global loading state changes
  useEffect(() => {
    const handler = () => setLoadingTokens(new Set(_globalLoadingTokens));
    window.addEventListener(FAUCET_LOADING_EVENT, handler);
    return () => window.removeEventListener(FAUCET_LOADING_EVENT, handler);
  }, []);

  const address = account?.address || zkState?.address || passkeyAddress;
  const canUseFaucet = (isDevnet || isTestnet) && !!address;
  const isAnyLoading = _globalLoadingTokens.size > 0;

  /**
   * Execute a transaction using the available signer (keypair > zkLogin > passkey).
   * Returns { success, digest } or throws on error.
   */
  const signAndExecute = useCallback(
    async (tx: import('@mysten/sui/transactions').Transaction) => {
      const suiClient = getSuiClient();
      const keypair = getKeypair?.();

      if (keypair) {
        const txResult = await suiClient.signAndExecuteTransaction({
          signer: keypair,
          transaction: tx,
          options: { showEffects: true },
        });
        const success = txResult.effects?.status?.status === 'success';
        if (success && txResult.digest) {
          await suiClient.waitForTransaction({ digest: txResult.digest });
        }
        return { success, digest: txResult.digest };
      }

      if (zkState && zkSignTransaction) {
        tx.setSender(zkState.address);
        const bytes = await tx.build({ client: suiClient });
        const signature = await zkSignTransaction(bytes);
        const txResult = await suiClient.executeTransactionBlock({
          transactionBlock: bytes,
          signature,
          options: { showEffects: true },
        });
        const success = txResult.effects?.status?.status === 'success';
        if (success && txResult.digest) {
          await suiClient.waitForTransaction({ digest: txResult.digest });
        }
        return { success, digest: txResult.digest };
      }

      if (passkeyKeypair) {
        const txResult = await suiClient.signAndExecuteTransaction({
          signer: passkeyKeypair,
          transaction: tx,
          options: { showEffects: true },
        });
        const success = txResult.effects?.status?.status === 'success';
        if (success && txResult.digest) {
          await suiClient.waitForTransaction({ digest: txResult.digest });
        }
        return { success, digest: txResult.digest };
      }

      return { success: false, digest: undefined };
    },
    [getKeypair, zkState, zkSignTransaction, passkeyKeypair],
  );

  // ---- Single-token faucet request ----

  const requestFaucet = useCallback(
    async (symbol: string): Promise<FaucetResult> => {
      if (!canUseFaucet) return { success: false, error: 'Wallet not connected' };
      if (!hasTokenFaucet(symbol)) return { success: false, error: 'No faucet available' };

      // Global mutual exclusion: block if any faucet tx is in flight
      if (_globalLoadingTokens.size > 0) {
        return { success: false, error: 'Another faucet request is in progress. Please wait.' };
      }

      const handler = getTokenFaucet(symbol);
      if (!handler) return { success: false, error: 'No faucet handler' };

      // Pre-check cooldown from handler or localStorage
      if (handler.getCooldownRemaining) {
        const remaining = handler.getCooldownRemaining(address!);
        if (remaining > 0) {
          const formatted = formatCooldownRemaining(remaining);
          return { success: false, error: `Faucet cooldown active (24h). Try again in ${formatted}.` };
        }
      }

      setGlobalLoading(symbol, true);

      try {
        let result = false;

        // Mode 1: HTTP API faucet (NASUN)
        if (handler.request) {
          result = await handler.request(address!);
        }
        // Mode 2: Move contract faucet (NBTC/NUSDC/NETH/NSOL)
        else if (handler.buildTransaction) {
          const tx = handler.buildTransaction();
          const txResult = await signAndExecute(tx);
          result = txResult.success;
        }

        if (result) {
          await refreshBalance();
          setCooldownTimestamp(address!, symbol);
        }
        return {
          success: result,
          error: result ? undefined : 'Transaction failed',
          successMessage: result ? handler.successMessage : undefined,
        };
      } catch (err) {
        console.error(`Faucet request failed for ${symbol}:`, err);
        const errorMsg = parseFaucetError(err);
        return { success: false, error: errorMsg };
      } finally {
        setGlobalLoading(symbol, false);
      }
    },
    [canUseFaucet, address, signAndExecute, refreshBalance],
  );

  // ---- Get claimable on-chain tokens ----

  const getClaimableTokens = useCallback((): string[] => {
    if (!address) return [];
    return ONCHAIN_FAUCET_SYMBOLS.filter((symbol) => {
      const handler = getTokenFaucet(symbol);
      if (handler?.getCooldownRemaining) {
        return handler.getCooldownRemaining(address) <= 0;
      }
      return getRawCooldownRemaining(address, symbol) <= 0;
    });
  }, [address]);

  // ---- Batch faucet request (single PTB for all claimable tokens) ----

  const requestBatchFaucet = useCallback(
    async (options?: BatchFaucetOptions): Promise<BatchFaucetResult> => {
      if (!canUseFaucet) {
        return { success: false, claimed: [], failed: [{ symbol: 'ALL', error: 'Wallet not connected' }] };
      }

      // Global mutual exclusion
      if (_globalLoadingTokens.size > 0) {
        return { success: false, claimed: [], failed: [{ symbol: 'ALL', error: 'Another faucet request is in progress' }] };
      }

      const includeNative = options?.includeNative ?? false;
      const targetSymbols = options?.symbols ?? getClaimableTokens();
      const onchainSymbols = targetSymbols.filter((s) => s !== 'NSN');

      const result: BatchFaucetResult = { success: false, claimed: [], failed: [] };

      // Phase 1: NSN (HTTP faucet) — must complete before Move tx (need gas)
      if (includeNative) {
        const nsnHandler = getTokenFaucet('NSN');
        const nsnCooldown = nsnHandler?.getCooldownRemaining?.(address!) ?? 0;

        if (nsnCooldown <= 0 && nsnHandler?.request) {
          setGlobalLoading('NSN', true);
          try {
            const nsnOk = await nsnHandler.request(address!);
            result.nsnResult = { success: nsnOk };
            if (nsnOk) {
              setCooldownTimestamp(address!, 'NSN');
              result.claimed.push('NSN');
            } else {
              result.nsnResult = { success: false, error: 'NSN faucet request failed' };
              // NSN failed and we needed it for gas — skip Phase 2
              result.failed.push({ symbol: 'NSN', error: 'NSN faucet request failed' });
              for (const s of onchainSymbols) {
                result.failed.push({ symbol: s, error: 'Skipped: no gas (NSN faucet failed)' });
              }
              return result;
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            result.nsnResult = { success: false, error: errorMsg };
            result.failed.push({ symbol: 'NSN', error: errorMsg });
            for (const s of onchainSymbols) {
              result.failed.push({ symbol: s, error: 'Skipped: no gas (NSN faucet failed)' });
            }
            return result;
          } finally {
            setGlobalLoading('NSN', false);
          }
        }
      }

      // Phase 2: On-chain tokens (single PTB)
      if (onchainSymbols.length === 0) {
        result.success = result.claimed.length > 0;
        if (result.success) await refreshBalance();
        return result;
      }

      const tx = buildBatchFaucetTx(onchainSymbols);
      if (!tx) {
        result.success = result.claimed.length > 0;
        return result;
      }

      setGlobalLoadingBatch(onchainSymbols, true);

      try {
        const txResult = await signAndExecute(tx);

        if (txResult.success) {
          for (const s of onchainSymbols) {
            setCooldownTimestamp(address!, s);
            result.claimed.push(s);
          }
          await refreshBalance();
          result.success = true;
        } else {
          for (const s of onchainSymbols) {
            result.failed.push({ symbol: s, error: 'Transaction failed' });
          }
        }
      } catch (err) {
        console.error('Batch faucet request failed:', err);
        const errorMsg = parseBatchFaucetError(err);
        for (const s of onchainSymbols) {
          result.failed.push({ symbol: s, error: errorMsg });
        }
      } finally {
        setGlobalLoadingBatch(onchainSymbols, false);
      }

      result.success = result.claimed.length > 0;
      return result;
    },
    [canUseFaucet, address, signAndExecute, refreshBalance, getClaimableTokens],
  );

  // ---- Derived helpers ----

  const isLoading = useCallback(
    (symbol: string) => loadingTokens.has(symbol),
    [loadingTokens],
  );

  const isCooldown = useCallback(
    (symbol: string) => {
      if (!address) return false;
      const handler = getTokenFaucet(symbol);
      if (handler?.getCooldownRemaining) {
        return handler.getCooldownRemaining(address) > 0;
      }
      return getRawCooldownRemaining(address, symbol) > 0;
    },
    [address],
  );

  const getCooldownRemaining = useCallback(
    (symbol: string) => {
      if (!address) return 0;
      const handler = getTokenFaucet(symbol);
      if (handler?.getCooldownRemaining) {
        return handler.getCooldownRemaining(address);
      }
      return getRawCooldownRemaining(address, symbol);
    },
    [address],
  );

  const getCooldownFormatted = useCallback(
    (symbol: string) => {
      const remaining = getCooldownRemaining(symbol);
      return formatCooldownRemaining(remaining);
    },
    [getCooldownRemaining],
  );

  return {
    requestFaucet,
    requestBatchFaucet,
    isLoading,
    isAnyLoading,
    isCooldown,
    getCooldownRemaining,
    getCooldownFormatted,
    getClaimableTokens,
    loadingTokens,
    canUseFaucet,
  };
}

// ============================================
// Error parsers
// ============================================

/**
 * Parse Move contract faucet errors into user-friendly messages.
 * E_COOLDOWN_NOT_MET (error code 1) = 24h cooldown still active.
 */
function parseFaucetError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes('cooldown')) return msg;
  if (msg.includes('MoveAbort') || msg.includes('moveAbort')) {
    return 'Faucet cooldown active (24h). Try again later.';
  }
  if (msg.includes('InsufficientGas') || msg.includes('insufficient gas')) {
    return 'Not enough NSN for gas fees. Get NSN first.';
  }
  return 'Faucet request failed. Try again later.';
}

/**
 * Parse batch faucet errors with fallback guidance.
 * Batch PTB is atomic — if one token aborts, all fail.
 */
function parseBatchFaucetError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes('MoveAbort') || msg.includes('moveAbort')) {
    return 'Some tokens may have active cooldowns. Try individual Faucet buttons.';
  }
  if (msg.includes('InsufficientGas') || msg.includes('insufficient gas')) {
    return 'Not enough NSN for gas fees. Get NSN first.';
  }
  return 'Batch faucet request failed. Try individual Faucet buttons.';
}
