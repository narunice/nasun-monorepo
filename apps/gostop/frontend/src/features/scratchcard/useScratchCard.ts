import { useCallback, useState } from 'react'
import { useWallet } from '@nasun/wallet'
import {
  SCRATCH_CARD_PRICE,
  SCRATCH_PURCHASED_EVENT_TYPE,
} from '../../lib/gostop-config'
import {
  buildBuyScratchCard,
  buildBuyScratchCardsBulk,
} from './transactions'
import { useGameTransaction } from '../../hooks/useGameTransaction'

export interface ScratchResult {
  cardId: number
  cardNftId: string | null
  multiplier: number
  prizeAmount: bigint
  bulkIndex: number
}

export interface UseScratchCardResult {
  walletAddress: string | undefined
  isWalletConnected: boolean
  buy: (count: number) => Promise<ScratchResult[] | null>
  isBuying: boolean
  error: string | null
  clearError: () => void
}

/**
 * Resolves the active wallet and exposes a single `buy(count)` helper.
 * Result list covers both winners and losers so the page can render
 * per-card reveal animations without a follow-up query.
 */
export function useScratchCard(): UseScratchCardResult {
  const { address: walletAddress } = useWallet()
  const isWalletConnected = !!walletAddress

  const [error, setError] = useState<string | null>(null)
  const { executeGameTx, isPending } = useGameTransaction()

  const buy = useCallback(
    async (count: number): Promise<ScratchResult[] | null> => {
      setError(null)
      let results: ScratchResult[] | null = null

      const totalCost = SCRATCH_CARD_PRICE * BigInt(count)
      
      const success = await executeGameTx(
        async (coins) => {
          return count === 1
            ? buildBuyScratchCard(coins!.primary, coins!.extra)
            : buildBuyScratchCardsBulk(coins!.primary, count, coins!.extra)
        },
        {
          amount: totalCost,
          onSuccess: (result) => {
            const events = result.events ?? []
            results = events
              .filter((e: any) => e.type === SCRATCH_PURCHASED_EVENT_TYPE)
              .map((e: any) => {
                const pj = e.parsedJson as {
                  card_id: string | number
                  card_nft_id: string | { vec: string[] } | null
                  multiplier: string | number
                  prize_amount: string | number
                  bulk_index: string | number
                }
                let nftId: string | null = null
                const raw = pj.card_nft_id as unknown
                if (typeof raw === 'string') {
                  nftId = raw
                } else if (raw && typeof raw === 'object' && 'vec' in raw) {
                  const vec = (raw as { vec: string[] }).vec
                  if (Array.isArray(vec) && vec.length > 0) nftId = vec[0]
                }
                return {
                  cardId: Number(pj.card_id),
                  cardNftId: nftId,
                  multiplier: Number(pj.multiplier),
                  prizeAmount: BigInt(pj.prize_amount),
                  bulkIndex: Number(pj.bulk_index),
                }
              })
              .sort((a: any, b: any) => a.bulkIndex - b.bulkIndex)
          },
          onError: (err) => setError(humanizeScratchError(err.message)),
        }
      )

      return success ? results : null
    },
    [executeGameTx]
  )

  return {
    walletAddress,
    isWalletConnected,
    buy,
    isBuying: isPending,
    error,
    clearError: () => setError(null),
  }
}

function humanizeScratchError(raw: string): string {
  if (raw.includes('MoveAbort')) {
    if (raw.includes(', 0)')) return 'Invalid card count (must be 1-10).'
    if (raw.includes(', 1)')) return 'Payment amount does not match card price exactly.'
    if (raw.includes(', 2)')) return 'Bankroll pool is temporarily low. Try again shortly.'
    if (raw.includes(', 4)')) return 'Scratch card module is not ready (game cap not installed).'
  }
  return raw
}
