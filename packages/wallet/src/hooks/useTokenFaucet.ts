/**
 * useTokenFaucet Hook
 *
 * React hook for requesting tokens from faucet.
 * Supports two modes:
 * 1. HTTP API faucet (NASUN) - uses request() handler
 * 2. Move contract faucet (NBTC/NUSDC) - uses buildTransaction() + wallet signing
 */

import { useState, useCallback } from 'react';
import { useNetwork } from './useNetwork';
import { useWallet } from './useWallet';
import { useZkLogin } from './useZkLogin';
import { useRefreshMultiBalance } from './useMultiBalance';
import { getTokenFaucet, hasTokenFaucet } from '../config/tokens';
import { getSuiClient } from '../sui/client';

export interface FaucetResult {
  success: boolean;
  /** Error message for display (e.g., "24h cooldown active") */
  error?: string;
}

export interface UseTokenFaucetResult {
  /** Request tokens from faucet for a specific token */
  requestFaucet: (symbol: string) => Promise<FaucetResult>;
  /** Check if a specific token is currently loading */
  isLoading: (symbol: string) => boolean;
  /** Check if a specific token is in cooldown after successful request */
  isCooldown: (symbol: string) => boolean;
  /** Set of tokens currently loading */
  loadingTokens: Set<string>;
  /** Whether faucet can be used (devnet/testnet + wallet connected) */
  canUseFaucet: boolean;
}

/**
 * Hook for requesting tokens from faucet
 */
export function useTokenFaucet(): UseTokenFaucetResult {
  const { isDevnet, isTestnet } = useNetwork();
  const { account, getKeypair } = useWallet();
  const { state: zkState, signTransaction: zkSignTransaction } = useZkLogin();
  const refreshBalance = useRefreshMultiBalance();

  const [loadingTokens, setLoadingTokens] = useState<Set<string>>(new Set());
  const [cooldownTokens, setCooldownTokens] = useState<Set<string>>(new Set());

  const COOLDOWN_MS = 5000;

  const address = account?.address || zkState?.address;
  const canUseFaucet = (isDevnet || isTestnet) && !!address;

  const requestFaucet = useCallback(
    async (symbol: string): Promise<FaucetResult> => {
      if (!canUseFaucet) return { success: false, error: 'Wallet not connected' };
      if (!hasTokenFaucet(symbol)) return { success: false, error: 'No faucet available' };

      const handler = getTokenFaucet(symbol);
      if (!handler) return { success: false, error: 'No faucet handler' };

      setLoadingTokens((prev) => new Set(prev).add(symbol));

      try {
        let result = false;
        const suiClient = getSuiClient();

        // Mode 1: HTTP API faucet (NASUN)
        if (handler.request) {
          result = await handler.request(address!);
        }
        // Mode 2: Move contract faucet (NBTC/NUSDC/NETH/NSOL)
        else if (handler.buildTransaction) {
          const tx = handler.buildTransaction();

          // Try regular wallet first, then zkLogin
          const keypair = getKeypair?.();

          if (keypair) {
            // Sign with regular wallet
            const txResult = await suiClient.signAndExecuteTransaction({
              signer: keypair,
              transaction: tx,
              options: { showEffects: true },
            });
            result = txResult.effects?.status?.status === 'success';

            // Wait for RPC indexing before refreshing balance
            if (result && txResult.digest) {
              await suiClient.waitForTransaction({ digest: txResult.digest });
            }
          } else if (zkState && zkSignTransaction) {
            // Sign with zkLogin
            tx.setSender(zkState.address);
            const bytes = await tx.build({ client: suiClient });
            const signature = await zkSignTransaction(bytes);

            // Execute transaction
            const txResult = await suiClient.executeTransactionBlock({
              transactionBlock: bytes,
              signature: signature,
              options: { showEffects: true },
            });
            result = txResult.effects?.status?.status === 'success';

            // Wait for RPC indexing before refreshing balance
            if (result && txResult.digest) {
              await suiClient.waitForTransaction({ digest: txResult.digest });
            }
          }
        }

        if (result) {
          await refreshBalance();

          // Start cooldown to prevent rapid re-clicks
          setCooldownTokens((prev) => new Set(prev).add(symbol));
          setTimeout(() => {
            setCooldownTokens((prev) => {
              const next = new Set(prev);
              next.delete(symbol);
              return next;
            });
          }, COOLDOWN_MS);
        }
        return { success: result, error: result ? undefined : 'Transaction failed' };
      } catch (err) {
        console.error(`Faucet request failed for ${symbol}:`, err);
        const errorMsg = parseFaucetError(err);
        return { success: false, error: errorMsg };
      } finally {
        setLoadingTokens((prev) => {
          const next = new Set(prev);
          next.delete(symbol);
          return next;
        });
      }
    },
    [canUseFaucet, address, getKeypair, zkState, zkSignTransaction, refreshBalance]
  );

  const isLoading = useCallback(
    (symbol: string) => {
      return loadingTokens.has(symbol);
    },
    [loadingTokens]
  );

  const isCooldown = useCallback(
    (symbol: string) => {
      return cooldownTokens.has(symbol);
    },
    [cooldownTokens]
  );

  return { requestFaucet, isLoading, isCooldown, loadingTokens, canUseFaucet };
}

/**
 * Parse Move contract faucet errors into user-friendly messages.
 * E_COOLDOWN_NOT_MET (error code 1) = 24h cooldown still active.
 */
function parseFaucetError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  // MoveAbort with function_name containing "cooldown" and status code 1
  if (msg.includes('MoveAbort') || msg.includes('moveAbort')) {
    if (msg.includes('1') && (msg.includes('cooldown') || msg.includes('faucet'))) {
      return 'Faucet cooldown active (24h). Try again later.';
    }
    return 'Faucet cooldown active (24h). Try again later.';
  }

  // InsufficientGas
  if (msg.includes('InsufficientGas') || msg.includes('insufficient gas')) {
    return 'Not enough NSN for gas fees. Get NSN first.';
  }

  return 'Faucet request failed. Try again later.';
}
