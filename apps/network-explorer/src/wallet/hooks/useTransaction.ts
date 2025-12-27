/**
 * Nasun Wallet 트랜잭션 훅
 * NASUN 토큰 전송 기능
 */

import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useWallet } from './useWallet';
import { useRefreshBalance } from './useBalance';
import { suiClient, parseAmount, isValidAddress } from '../lib/sui-client';
import type { TransactionRequest, TransactionResult } from '../types/wallet';

interface UseTransactionReturn {
  // 상태
  isPending: boolean;
  error: string | null;
  lastResult: TransactionResult | null;

  // 액션
  sendTransaction: (request: TransactionRequest) => Promise<TransactionResult>;
  clearError: () => void;
  clearResult: () => void;
}

export function useTransaction(): UseTransactionReturn {
  const { status, account, getKeypair } = useWallet();
  const refreshBalance = useRefreshBalance();

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TransactionResult | null>(null);

  const sendTransaction = useCallback(
    async (request: TransactionRequest): Promise<TransactionResult> => {
      // 지갑 상태 검증
      if (status !== 'unlocked' || !account) {
        const err = 'Wallet is not unlocked';
        setError(err);
        throw new Error(err);
      }

      // 수신 주소 검증
      if (!isValidAddress(request.to)) {
        const err = 'Invalid recipient address';
        setError(err);
        throw new Error(err);
      }

      // 금액 검증
      const amountInSoe = parseAmount(request.amount);
      if (amountInSoe <= BigInt(0)) {
        const err = 'Invalid amount';
        setError(err);
        throw new Error(err);
      }

      // 키페어 가져오기
      const keypair = getKeypair();
      if (!keypair) {
        const err = 'Keypair not available';
        setError(err);
        throw new Error(err);
      }

      setIsPending(true);
      setError(null);

      try {
        // 트랜잭션 생성
        const tx = new Transaction();

        // 코인 분할 및 전송
        const [coin] = tx.splitCoins(tx.gas, [amountInSoe]);
        tx.transferObjects([coin], request.to);

        // 트랜잭션 서명 및 실행
        const result = await suiClient.signAndExecuteTransaction({
          signer: keypair,
          transaction: tx,
          options: {
            showEffects: true,
          },
        });

        // 결과 파싱
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
        };

        setLastResult(txResult);
        setIsPending(false);

        // 잔액 새로고침
        await refreshBalance();

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
    [status, account, getKeypair, refreshBalance]
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
    sendTransaction,
    clearError,
    clearResult,
  };
}
