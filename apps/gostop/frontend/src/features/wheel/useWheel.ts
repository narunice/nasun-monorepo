import { useCallback, useState } from 'react';
import { useActiveAddress } from '../../hooks/useActiveAddress';
import { WHEEL_RESULT_EVENT_TYPE } from '../../lib/gostop-config';
import { useGameTransaction } from '../../hooks/useGameTransaction';
import { buildSpinTx } from './transactions';

export interface WheelResult {
  gameId: number;
  bet: bigint;
  segmentIndex: number;
  multiplierBps: number;
  payout: bigint;
  txDigest: string;
}

export interface UseWheelResult {
  walletAddress: string | undefined;
  isWalletConnected: boolean;
  spin: (betAmount: bigint) => Promise<WheelResult | null>;
  isSpinning: boolean;
  error: string | null;
  clearError: () => void;
}

export function useWheel(): UseWheelResult {
  const walletAddress = useActiveAddress();
  const isWalletConnected = !!walletAddress;
  const [error, setError] = useState<string | null>(null);
  const { executeGameTx, isPending } = useGameTransaction();

  const spin = useCallback(
    async (betAmount: bigint): Promise<WheelResult | null> => {
      setError(null);
      let result: WheelResult | null = null;

      const success = await executeGameTx(
        async (coins) => buildSpinTx(coins!.primary, betAmount, coins!.extra),
        {
          amount: betAmount,
          onSuccess: (txResult) => {
            const ev = (txResult.events ?? []).find(
              (e: { type: string }) => e.type === WHEEL_RESULT_EVENT_TYPE,
            );
            if (!ev) {
              setError(
                'Transaction confirmed but the wheel result event was missing. Check your history.',
              );
              return;
            }
            const pj = ev.parsedJson as {
              game_id: string | number;
              bet: string | number;
              segment_index: string | number;
              multiplier_bps: string | number;
              payout: string | number;
            };
            result = {
              gameId: Number(pj.game_id),
              bet: BigInt(pj.bet),
              segmentIndex: Number(pj.segment_index),
              multiplierBps: Number(pj.multiplier_bps),
              payout: BigInt(pj.payout),
              txDigest: txResult.digest,
            };
          },
          onError: (err) => setError(humanizeWheelError(err.message)),
        },
      );

      return success ? result : null;
    },
    [executeGameTx],
  );

  return {
    walletAddress,
    isWalletConnected,
    spin,
    isSpinning: isPending,
    error,
    clearError: () => setError(null),
  };
}

function humanizeWheelError(raw: string): string {
  if (/Balance of gas object.*lower than the needed amount|GasBalanceTooLow/i.test(raw)) {
    return 'Not enough NASUN for gas. Top up your wallet and try again.';
  }
  if (raw.includes('MoveAbort')) {
    if (raw.includes(', 0)')) return 'Wheel is paused. Try again later.';
    if (raw.includes(', 1)')) return 'Bet out of range (1-100 NUSDC).';
    if (raw.includes(', 2)')) return 'Bankroll pool is temporarily low. Try again shortly.';
    if (raw.includes(', 4)')) return 'Wheel is not ready (game cap not installed).';
  }
  if (
    /is not available for consumption|ObjectVersionUnavailable|current version:|ObjectNotFound|InputObjectDeleted|ObjectDeleted/i.test(raw) ||
    /Transaction is rejected as invalid by more than 1\/3 of validators/i.test(raw) ||
    /RPC execute timed out|ETIMEDOUT|ECONNRESET|fetch failed|socket hang up|NetworkError|Failed to fetch|timed? ?out/i.test(raw)
  ) {
    return 'Devnet hiccup. Give it a moment and try again.';
  }
  return raw;
}
