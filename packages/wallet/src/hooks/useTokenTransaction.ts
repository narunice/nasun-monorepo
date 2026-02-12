/**
 * Nasun Wallet Token Transaction Hook
 * Multi-token transfer functionality using unified Signer abstraction
 */

import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useSigner } from './useSigner';
import { useRefreshMultiBalance } from './useMultiBalance';
import { useRefreshBalance } from './useBalance';
import { getSuiClient, getMoveClient, isValidAddress } from '../sui/client';
import { getTokenByType, NATIVE_TOKEN } from '../config/tokens';
import { useChainStore } from './useChain';
import { getChain, isNasunChain } from '../config/chains';
import type { TokenTransactionRequest, TransactionResult } from '../types';

interface UseTokenTransactionReturn {
  // State
  isPending: boolean;
  error: string | null;
  lastResult: TransactionResult | null;

  // Actions
  sendTokenTransaction: (request: TokenTransactionRequest) => Promise<TransactionResult>;
  clearError: () => void;
  clearResult: () => void;
}

/**
 * Convert display amount to minimum unit based on decimals
 */
function parseTokenAmount(amount: string, decimals: number): bigint {
  const parts = amount.split('.');
  const integerPart = parts[0] || '0';
  let fractionalPart = parts[1] || '';

  // Pad fractional part to match decimals
  fractionalPart = fractionalPart.padEnd(decimals, '0').slice(0, decimals);

  return BigInt(integerPart + fractionalPart);
}

/**
 * Get the appropriate SuiClient for the current chain.
 * External Move chains use their own RPC; Nasun uses the default.
 */
function getChainAwareMoveClient(): import('@mysten/sui/client').SuiClient {
  const chainId = useChainStore.getState().currentChainId;
  const chainConfig = getChain(chainId);
  if (chainConfig && !isNasunChain(chainId)) {
    return getMoveClient(chainConfig.rpcUrl);
  }
  return getSuiClient();
}

export function useTokenTransaction(): UseTokenTransactionReturn {
  const { signer, address, isConnected } = useSigner();
  const refreshMultiBalance = useRefreshMultiBalance();
  const refreshBalance = useRefreshBalance();

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TransactionResult | null>(null);

  const sendTokenTransaction = useCallback(
    async (request: TokenTransactionRequest): Promise<TransactionResult> => {
      // Validate signer state
      if (!signer || !address || !isConnected) {
        const err = 'Wallet is not connected';
        setError(err);
        throw new Error(err);
      }

      // Validate recipient address
      if (!isValidAddress(request.to)) {
        const err = 'Invalid recipient address';
        setError(err);
        throw new Error(err);
      }

      // Get token config
      const tokenConfig = getTokenByType(request.tokenType);
      if (!tokenConfig) {
        const err = `Unknown token type: ${request.tokenType}`;
        setError(err);
        throw new Error(err);
      }

      // Parse amount based on token decimals
      const amountInMinUnit = parseTokenAmount(request.amount, tokenConfig.decimals);
      if (amountInMinUnit <= BigInt(0)) {
        const err = 'Invalid amount';
        setError(err);
        throw new Error(err);
      }

      setIsPending(true);
      setError(null);

      try {
        const suiClient = getChainAwareMoveClient();
        const tx = new Transaction();

        // For native token (NASUN/SUI), use tx.gas
        if (request.tokenType === NATIVE_TOKEN.type) {
          // Check native balance before transfer
          const balance = await suiClient.getBalance({ owner: address });
          const totalNative = BigInt(balance.totalBalance);
          // Reserve some for gas (0.01 NASUN = 10_000_000 in minimum units)
          const gasReserve = BigInt(10_000_000);
          const availableForTransfer = totalNative > gasReserve ? totalNative - gasReserve : BigInt(0);

          if (amountInMinUnit > availableForTransfer) {
            throw new Error(
              `Insufficient NASUN balance. Available for transfer: ${Number(availableForTransfer) / 1e9} NASUN (after gas reserve)`
            );
          }

          const [coin] = tx.splitCoins(tx.gas, [amountInMinUnit]);
          tx.transferObjects([coin], request.to);
        } else {
          // For other tokens, we need to get coins of that type
          const coins = await suiClient.getCoins({
            owner: address,
            coinType: request.tokenType,
          });

          if (coins.data.length === 0) {
            throw new Error(`No ${tokenConfig.symbol} coins available`);
          }

          // Calculate total available balance
          const totalAvailable = coins.data.reduce(
            (sum, coin) => sum + BigInt(coin.balance),
            BigInt(0)
          );

          if (totalAvailable < amountInMinUnit) {
            throw new Error(
              `Insufficient ${tokenConfig.symbol} balance. Available: ${totalAvailable}, Required: ${amountInMinUnit}`
            );
          }

          // If we have multiple coins, merge them first
          if (coins.data.length > 1) {
            const primaryCoin = tx.object(coins.data[0].coinObjectId);
            const coinsToMerge = coins.data.slice(1).map((c) => tx.object(c.coinObjectId));
            tx.mergeCoins(primaryCoin, coinsToMerge);

            // Split the required amount from merged coin
            const [transferCoin] = tx.splitCoins(primaryCoin, [amountInMinUnit]);
            tx.transferObjects([transferCoin], request.to);
          } else {
            // Single coin - split and transfer
            const coin = tx.object(coins.data[0].coinObjectId);
            const [transferCoin] = tx.splitCoins(coin, [amountInMinUnit]);
            tx.transferObjects([transferCoin], request.to);
          }
        }

        // Set sender for transaction
        tx.setSender(address);

        // Build transaction bytes
        const txBytes = await tx.build({ client: suiClient });

        // Sign using unified signer interface
        const { signature } = await signer.sign(txBytes);

        // Execute transaction
        const result = await suiClient.executeTransactionBlock({
          transactionBlock: txBytes,
          signature,
          options: {
            showEffects: true,
          },
        });

        // Parse result
        const txResult: TransactionResult = {
          digest: result.digest,
          status: result.effects?.status?.status === 'success' ? 'success' : 'failure',
          gasUsed: result.effects?.gasUsed
            ? (
                BigInt(result.effects.gasUsed.computationCost) +
                BigInt(result.effects.gasUsed.storageCost) -
                BigInt(result.effects.gasUsed.storageRebate)
              ).toString()
            : undefined,
          error: result.effects?.status?.error,
          tokenType: request.tokenType,
          amount: request.amount,
        };

        setLastResult(txResult);
        setIsPending(false);

        // Refresh balances (multi-balance for Nasun, single-balance for external)
        await Promise.all([refreshMultiBalance(), refreshBalance()]);

        return txResult;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Transaction failed';
        setError(message);
        setIsPending(false);

        const failedResult: TransactionResult = {
          digest: '',
          status: 'failure',
          error: message,
        };
        setLastResult(failedResult);

        throw err;
      }
    },
    [signer, address, isConnected, refreshMultiBalance, refreshBalance]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearResult = useCallback(() => {
    setLastResult(null);
  }, []);

  return {
    isPending,
    error,
    lastResult,
    sendTokenTransaction,
    clearError,
    clearResult,
  };
}
