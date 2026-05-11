import { useCallback, useState } from 'react'
import { useActiveAddress } from '../../hooks/useActiveAddress'
import {
  NM_PRICE_PER_PICK,
  NM_PLAYED_EVENT_TYPE,
} from '../../lib/gostop-config'
import { buildPlayGame } from './transactions'
import { useGameTransaction } from '../../hooks/useGameTransaction'

export interface NumberMatchResult {
  gameId: number
  picks: number[]
  winningNumber: number
  isWin: boolean
  cost: bigint
  payout: bigint
}

export interface UseNumberMatchResult {
  walletAddress: string | undefined
  isWalletConnected: boolean
  play: (picks: number[]) => Promise<NumberMatchResult | null>
  isPlaying: boolean
  error: string | null
  clearError: () => void
}

export function useNumberMatch(): UseNumberMatchResult {
  const walletAddress = useActiveAddress()
  const isWalletConnected = !!walletAddress

  const [error, setError] = useState<string | null>(null)
  const { executeGameTx, isPending } = useGameTransaction()

  const play = useCallback(
    async (picks: number[]): Promise<NumberMatchResult | null> => {
      setError(null)
      let result: NumberMatchResult | null = null

      const totalCost = NM_PRICE_PER_PICK * BigInt(picks.length)
      
      const success = await executeGameTx(
        async (coins) => buildPlayGame(coins!.primary, picks, coins!.extra),
        {
          amount: totalCost,
          onSuccess: (txResult) => {
            const ev = (txResult.events ?? []).find((e: any) => e.type === NM_PLAYED_EVENT_TYPE)
            if (!ev) {
              setError('Transaction confirmed but game result was not returned. Check your history for the outcome.')
              return
            }
            const pj = ev.parsedJson as {
              game_id: string | number
              picks: number[]
              winning_number: string | number
              is_win: boolean
              cost: string | number
              payout: string | number
            }
            result = {
              gameId: Number(pj.game_id),
              picks: pj.picks.map((n) => Number(n)),
              winningNumber: Number(pj.winning_number),
              isWin: pj.is_win,
              cost: BigInt(pj.cost),
              payout: BigInt(pj.payout),
            }
          },
          onError: (err) => setError(humanizeNmError(err.message)),
        }
      )

      return success ? result : null
    },
    [executeGameTx]
  )

  return {
    walletAddress,
    isWalletConnected,
    play,
    isPlaying: isPending,
    error,
    clearError: () => setError(null),
  }
}

function humanizeNmError(raw: string): string {
  if (/Balance of gas object.*lower than the needed amount|GasBalanceTooLow/i.test(raw)) {
    return 'Not enough NASUN for gas. Please top up your wallet and try again.'
  }
  if (raw.includes('MoveAbort')) {
    if (raw.includes(', 0)')) return 'Invalid pick count (1-3).'
    if (raw.includes(', 1)')) return 'Number out of range (1-5).'
    if (raw.includes(', 2)')) return 'Duplicate number in picks.'
    if (raw.includes(', 3)')) return 'Payment amount does not match cost exactly.'
    if (raw.includes(', 4)')) return 'Bankroll pool is temporarily low. Try again shortly.'
    if (raw.includes(', 6)')) return 'Number match module is not ready (game cap not installed).'
  }
  if (
    /is not available for consumption|ObjectVersionUnavailable|current version:|ObjectNotFound|InputObjectDeleted|ObjectDeleted/i.test(raw) ||
    /Transaction is rejected as invalid by more than 1\/3 of validators/i.test(raw) ||
    /ETIMEDOUT|ECONNRESET|fetch failed|socket hang up|NetworkError|Failed to fetch/i.test(raw)
  ) {
    return 'Devnet hiccup. Give it a moment and try again.'
  }
  return raw
}
