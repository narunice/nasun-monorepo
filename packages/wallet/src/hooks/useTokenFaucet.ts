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

export interface UseTokenFaucetResult {
  /** Request tokens from faucet for a specific token */
  requestFaucet: (symbol: string) => Promise<boolean>;
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
    async (symbol: string): Promise<boolean> => {
      if (!canUseFaucet) return false;
      if (!hasTokenFaucet(symbol)) return false;

      const handler = getTokenFaucet(symbol);
      if (!handler) return false;

      setLoadingTokens((prev) => new Set(prev).add(symbol));

      try {
        let result = false;
        const suiClient = getSuiClient();

        // Mode 1: HTTP API faucet (NASUN)
        if (handler.request) {
          result = await handler.request(address!);
        }
        // Mode 2: Move contract faucet (NBTC/NUSDC)
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
        return result;
      } catch (err) {
        console.error(`Faucet request failed for ${symbol}:`, err);
        return false;
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
