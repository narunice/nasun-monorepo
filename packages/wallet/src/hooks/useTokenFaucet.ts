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
import { peekServerCooldown } from '../sui/faucet';
import { buildBatchFaucetTx, ONCHAIN_FAUCET_SYMBOLS, queryAllCooldowns } from '../sui/tokenFaucet';
import {
  getCooldownRemaining as getRawCooldownRemaining,
  setCooldownTimestamp,
  clearCooldownTimestamp,
  formatCooldownRemaining,
  COOLDOWN_CHANGE_EVENT,
} from '../sui/faucetCooldown';

// ============================================
// Global loading state (cross-component mutual exclusion)
// ============================================

const _globalLoadingTokens = new Set<string>();
const FAUCET_LOADING_EVENT = 'nasun:faucet-loading-change';
const FAUCET_TX_TIMEOUT_MS = 45_000; // 45s (includes zkLogin proof time)
const FAUCET_TX_TIMEOUT_MSG = 'Faucet request timed out. Check your balance before retrying.';
const COOLDOWN_SYNC_MIN_INTERVAL_MS = 30_000; // debounce on-chain queries

// Post-success delay: wait for RPC object index to propagate new gas coin version
// before allowing the next faucet claim. Prevents "not available for consumption" errors
// when users click individual faucet buttons sequentially.
const POST_SUCCESS_DELAY_MS = 2_000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(FAUCET_TX_TIMEOUT_MSG)), FAUCET_TX_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Detect stale gas coin errors from Sui validators.
 * This occurs when the RPC returns an outdated object version after a previous
 * transaction consumed the gas coin. Unlike the bot retry.ts NON_RETRIABLE
 * classification (which retries the SAME tx bytes), faucet retry rebuilds
 * a fresh Transaction that forces new gas coin resolution via getCoins RPC.
 */
function isStaleObjectError(msg: string): boolean {
  return msg.includes('not available for consumption');
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
  /** Current NSN balance. When NSN faucet fails but gas is available, Phase 2 continues. */
  nsnBalance?: bigint;
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

  // Sync localStorage cooldowns from on-chain state (corrects mismatches)
  useEffect(() => {
    if (!canUseFaucet || !address) return;

    let lastSync = 0;

    async function syncCooldowns() {
      const now = Date.now();
      if (now - lastSync < COOLDOWN_SYNC_MIN_INTERVAL_MS) return;
      lastSync = now;

      try {
        const suiClient = getSuiClient();
        // Query on-chain (NBTC/NUSDC/NETH/NSOL) and HTTP faucet (NSN) in parallel.
        // NSN cooldown lives only in the faucet server's in-memory ClaimTracker;
        // without this fetch, localStorage cleared by cross-origin claim or cache
        // wipe would falsely render NSN as claimable.
        const [onchainCooldowns, nsnRemaining] = await Promise.all([
          queryAllCooldowns(suiClient, address!),
          peekServerCooldown(address!),
        ]);
        const all: Record<string, number> = { ...onchainCooldowns };
        if (nsnRemaining !== null) all.NSN = nsnRemaining;
        for (const [symbol, remaining] of Object.entries(all)) {
          const localRemaining = getRawCooldownRemaining(address!, symbol);
          if (remaining > 0 && localRemaining === 0) {
            setCooldownTimestamp(address!, symbol);
          } else if (remaining === 0 && localRemaining > 0) {
            clearCooldownTimestamp(address!, symbol);
          }
        }
      } catch {
        // RPC failure: keep localStorage values as fallback
      }
    }

    syncCooldowns();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncCooldowns();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [canUseFaucet, address]);

  /**
   * Execute a transaction using the available signer (keypair > zkLogin > passkey).
   * Returns { success, digest } or throws on error.
   */
  const signAndExecute = useCallback(
    async (tx: import('@mysten/sui/transactions').Transaction) => {
      const suiClient = getSuiClient();
      const keypair = getKeypair?.();

      // Best-effort wait for the RPC to index the digest, but never let an
      // indexing-side failure (slow polling, transient 503, or the outer
      // withTimeout race) flip an already-successful transaction into a
      // user-visible "failed" message. Status is determined by effects.
      const waitBestEffort = async (digest: string) => {
        try {
          await suiClient.waitForTransaction({ digest });
        } catch {
          // Tx already committed (effects.status === 'success'); propagation
          // wait is informational only.
        }
      };

      if (keypair) {
        const txResult = await suiClient.signAndExecuteTransaction({
          signer: keypair,
          transaction: tx,
          options: { showEffects: true },
        });
        const success = txResult.effects?.status?.status === 'success';
        if (success && txResult.digest) {
          await waitBestEffort(txResult.digest);
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
          await waitBestEffort(txResult.digest);
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
          await waitBestEffort(txResult.digest);
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
          const txResult = await withTimeout(signAndExecute(tx));
          result = txResult.success;
        }

        if (result) {
          await refreshBalance();
          setCooldownTimestamp(address!, symbol);
          // Wait for RPC object index to propagate new gas coin version
          // so the next sequential faucet claim gets fresh data
          await delay(POST_SUCCESS_DELAY_MS);
        }
        return {
          success: result,
          error: result ? undefined : 'Transaction failed',
          successMessage: result ? handler.successMessage : undefined,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        // Stale gas coin: RPC returned outdated object version.
        // Rebuild a FRESH Transaction (forces new gas coin resolution via getCoins RPC).
        // This differs from bot retry.ts NON_RETRIABLE: bots retry the SAME tx bytes,
        // while here we rebuild from scratch with handler.buildTransaction().
        if (isStaleObjectError(msg) && handler.buildTransaction) {
          try {
            await delay(POST_SUCCESS_DELAY_MS);
            const freshTx = handler.buildTransaction();
            const retryResult = await withTimeout(signAndExecute(freshTx));
            if (retryResult.success) {
              await refreshBalance();
              setCooldownTimestamp(address!, symbol);
              return { success: true, successMessage: handler.successMessage };
            }
          } catch (retryErr) {
            // Retry failed with cooldown = first tx actually succeeded
            const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
            if (classifyFaucetError(retryMsg) === 'cooldown') {
              await refreshBalance();
              setCooldownTimestamp(address!, symbol);
              return { success: true, successMessage: handler.successMessage };
            }
          }
        }

        console.error(`Faucet request failed for ${symbol}:`, err);
        const errorMsg = parseFaucetError(err);
        // Sync localStorage cooldown when on-chain rejects with cooldown error.
        // Prevents repeated attempts (each costs 10-15s for zkLogin users).
        if (classifyFaucetError(msg) === 'cooldown') {
          setCooldownTimestamp(address!, symbol);
        }
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
              result.failed.push({ symbol: 'NSN', error: 'NSN faucet request failed' });
              // If user has gas, continue to Phase 2 despite NSN failure
              if ((options?.nsnBalance ?? 0n) <= 0n) {
                for (const s of onchainSymbols) {
                  result.failed.push({ symbol: s, error: 'No gas available' });
                }
                return result;
              }
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            result.nsnResult = { success: false, error: errorMsg };
            result.failed.push({ symbol: 'NSN', error: errorMsg });
            // If user has gas, continue to Phase 2 despite NSN failure
            if ((options?.nsnBalance ?? 0n) <= 0n) {
              for (const s of onchainSymbols) {
                result.failed.push({ symbol: s, error: 'No gas available' });
              }
              return result;
            }
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
        const txResult = await withTimeout(signAndExecute(tx));

        if (txResult.success) {
          for (const s of onchainSymbols) {
            setCooldownTimestamp(address!, s);
            result.claimed.push(s);
          }
          await refreshBalance();
          result.success = true;
          // Wait for RPC object index to propagate new gas coin version
          await delay(POST_SUCCESS_DELAY_MS);
        } else {
          for (const s of onchainSymbols) {
            result.failed.push({ symbol: s, error: 'Transaction failed' });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        // Stale gas coin: rebuild fresh batch PTB and retry once
        if (isStaleObjectError(msg)) {
          try {
            await delay(POST_SUCCESS_DELAY_MS);
            const freshTx = buildBatchFaucetTx(onchainSymbols);
            if (freshTx) {
              const retryResult = await withTimeout(signAndExecute(freshTx));
              if (retryResult.success) {
                for (const s of onchainSymbols) {
                  setCooldownTimestamp(address!, s);
                  result.claimed.push(s);
                }
                await refreshBalance();
                result.success = true;
                return result;
              }
            }
          } catch { /* retry failed, fall through */ }
        }

        console.error('Batch faucet request failed:', err);
        const errorMsg = parseBatchFaucetError(err);
        const errorKind = classifyFaucetError(
          err instanceof Error ? err.message : String(err),
        );
        for (const s of onchainSymbols) {
          result.failed.push({ symbol: s, error: errorMsg });
          if (errorKind === 'cooldown') {
            setCooldownTimestamp(address!, s);
          }
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

type FaucetErrorKind = 'timeout' | 'network' | 'cooldown' | 'move_abort' | 'stale_object' | 'gas' | 'unknown';

function classifyFaucetError(msg: string): FaucetErrorKind {
  if (/timed?\s*out|AbortError/i.test(msg)) return 'timeout';
  if (/Failed to fetch|NetworkError|ECONNREFUSED|ENOTFOUND|ERR_NETWORK/i.test(msg)) return 'network';
  if (msg.includes('MoveAbort')) {
    const match = msg.match(/MoveAbort\(.+,\s*(\d+)\)/);
    const code = match ? parseInt(match[1], 10) : null;
    return code === 1 ? 'cooldown' : 'move_abort';
  }
  if (isStaleObjectError(msg)) return 'stale_object';
  if (/InsufficientGas|insufficient gas|No valid gas/i.test(msg)) return 'gas';
  return 'unknown';
}

const FAUCET_ERROR_MESSAGES: Record<FaucetErrorKind, string> = {
  timeout: FAUCET_TX_TIMEOUT_MSG,
  network: 'Network error. Please try again.',
  cooldown: 'Faucet cooldown active (24h). Try again later.',
  move_abort: 'Transaction failed. Please try again.',
  stale_object: 'Transaction failed after automatic retry. Please try again.',
  gas: 'Not enough NSN for gas fees. Get NSN first.',
  unknown: 'Faucet request failed. Try again later.',
};

const BATCH_FAUCET_ERROR_MESSAGES: Record<FaucetErrorKind, string> = {
  timeout: 'Request timed out. Try individual Faucet buttons.',
  network: 'Network error. Try individual Faucet buttons.',
  cooldown: 'Some tokens have active cooldowns. Try individual Faucet buttons.',
  move_abort: 'Transaction failed. Try individual Faucet buttons.',
  stale_object: 'Batch request failed after retry. Try individual Faucet buttons.',
  gas: 'Not enough NSN for gas fees. Get NSN first.',
  unknown: 'Batch faucet request failed. Try individual Faucet buttons.',
};

/**
 * Parse Move contract faucet errors into user-friendly messages.
 * Distinguishes cooldown (abort code 1) from other MoveAbort errors,
 * and detects timeout/network errors separately.
 */
function parseFaucetError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  const kind = classifyFaucetError(msg);
  return FAUCET_ERROR_MESSAGES[kind];
}

/**
 * Parse batch faucet errors with fallback guidance.
 * Batch PTB is atomic -- if one token aborts, all fail.
 */
function parseBatchFaucetError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  const kind = classifyFaucetError(msg);
  return BATCH_FAUCET_ERROR_MESSAGES[kind];
}
