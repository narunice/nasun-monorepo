/**
 * Nasun Wallet Token Transaction Hook
 * Multi-token transfer functionality
 */

import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useWallet } from './useWallet';
import { useZkLogin } from './useZkLogin';
import { useRefreshMultiBalance } from './useMultiBalance';
import { getSuiClient, isValidAddress } from '../sui/client';
import { getTokenByType, NATIVE_TOKEN } from '../config/tokens';
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

export function useTokenTransaction(): UseTokenTransactionReturn {
  const { status, account, getKeypair } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState, signTransaction: zkSignTransaction } = useZkLogin();
  const refreshMultiBalance = useRefreshMultiBalance();

  // Determine if connected via traditional wallet or zkLogin
  const isWalletConnected = (status === 'unlocked' && account) || isZkLoggedIn;
  const connectedAddress = account?.address || zkState?.address;

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TransactionResult | null>(null);

  const sendTokenTransaction = useCallback(
    async (request: TokenTransactionRequest): Promise<TransactionResult> => {
      // Validate wallet state (traditional wallet OR zkLogin)
      if (!isWalletConnected || !connectedAddress) {
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

      // For traditional wallet, get keypair
      const keypair = !isZkLoggedIn ? getKeypair() : null;
      if (!isZkLoggedIn && !keypair) {
        const err = 'Keypair not available';
        setError(err);
        throw new Error(err);
      }

      setIsPending(true);
      setError(null);

      try {
        const suiClient = getSuiClient();
        const tx = new Transaction();

        // For native token (NASUN/SUI), use tx.gas
        if (request.tokenType === NATIVE_TOKEN.type) {
          const [coin] = tx.splitCoins(tx.gas, [amountInMinUnit]);
          tx.transferObjects([coin], request.to);
        } else {
          // For other tokens, we need to get coins of that type
          const coins = await suiClient.getCoins({
            owner: connectedAddress,
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

        // Sign and execute transaction
        let result;
        if (isZkLoggedIn && zkSignTransaction) {
          // zkLogin signing flow
          tx.setSender(connectedAddress);

          // === Debug logs for zkLogin (Gemini's suggestion) ===
          console.log('[useTokenTransaction] === zkLogin Debug ===');
          console.log('1. Transaction Sender:', connectedAddress);
          console.log('2. zkState.address:', zkState?.address);
          console.log('3. zkState.salt:', zkState?.salt?.substring(0, 20) + '...');
          console.log('4. zkState.maxEpoch:', zkState?.maxEpoch);
          console.log('5. zkState.ephemeralPublicKey:', zkState?.ephemeralPublicKey);
          console.log('6. zkState.addressSeed (first 30):', zkState?.addressSeed?.substring(0, 30));
          console.log('7. Address match check:', connectedAddress === zkState?.address);
          // ===================================================

          const txBytes = await tx.build({ client: suiClient });
          console.log('[useTokenTransaction] Transaction built, bytes length:', txBytes.length);

          const signature = await zkSignTransaction(txBytes);
          console.log('[useTokenTransaction] Signature received, length:', signature.length);
          console.log('[useTokenTransaction] Signature (first 100):', signature.substring(0, 100));

          console.log('[useTokenTransaction] Calling executeTransactionBlock...');
          try {
            result = await suiClient.executeTransactionBlock({
              transactionBlock: txBytes,
              signature,
              options: {
                showEffects: true,
              },
            });
            console.log('[useTokenTransaction] executeTransactionBlock completed:', result.digest);
          } catch (execError) {
            console.error('[useTokenTransaction] executeTransactionBlock FAILED:');
            console.error('  Error type:', execError?.constructor?.name);
            console.error('  Error message:', execError instanceof Error ? execError.message : String(execError));
            console.error('  Full error:', execError);
            throw execError;
          }
        } else if (keypair) {
          // Traditional wallet signing
          result = await suiClient.signAndExecuteTransaction({
            signer: keypair,
            transaction: tx,
            options: {
              showEffects: true,
            },
          });
        } else {
          throw new Error('No signing method available');
        }

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

        // Refresh balances
        await refreshMultiBalance();

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
    [isWalletConnected, connectedAddress, isZkLoggedIn, zkSignTransaction, getKeypair, refreshMultiBalance]
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
