import { useCallback, useState } from 'react'
import { useActiveAddress } from '../../hooks/useActiveAddress'
import { LOTTERY_TICKET_PRICE, LOTTERY_NUMBERS_COUNT, LOTTERY_MAX_NUMBER } from '../../lib/gostop-config'
import { validateLotteryPicks } from '../../lib/validation/game-rules'
import {
  buildBuyTicket,
  buildBuyTicketBulk,
  buildBurnTicket,
  buildBurnTicketBulk,
  buildClaimPrize,
} from './transactions'
import { autoPickNumbers } from './lottery-utils'
import { humanizeLotteryError } from './errors'
import { useGameTransaction } from '../../hooks/useGameTransaction'

export interface BulkBurnResult {
  burned: number
  failedChunks: number
  /** Aggregate storage rebate across successful chunks, in SOE (1e9 = 1 NASUN). */
  storageRebateSoe: bigint
  digests: string[]
}

export interface UseLotteryActionsResult {
  walletAddress: string | undefined
  isWalletConnected: boolean
  buyTicket: (roundId: string, numbers: number[]) => Promise<boolean>
  buyTicketBulk: (roundId: string, count: number) => Promise<boolean>
  claimPrize: (roundId: string, ticketId: string) => Promise<boolean>
  burnTicket: (roundId: string, ticketId: string) => Promise<boolean>
  burnTicketsBulk: (items: ReadonlyArray<{ roundId: string; ticketId: string }>) => Promise<BulkBurnResult>
  isBuying: boolean
  isBulkBurning: boolean
  bulkBurnProgress: { done: number; total: number } | null
  isClaiming: boolean
  claimingTicketId: string | null
  burningTicketId: string | null
  error: string | null
  clearError: () => void
}

export function useLotteryActions(): UseLotteryActionsResult {
  const walletAddress = useActiveAddress()
  const isWalletConnected = !!walletAddress

  const [localPhase, setLocalPhase] = useState<'buying' | 'claiming' | 'idle'>('idle')
  const [claimingTicketId, setClaimingTicketId] = useState<string | null>(null)
  const [burningTicketId, setBurningTicketId] = useState<string | null>(null)
  const [isBulkBurning, setIsBulkBurning] = useState(false)
  const [bulkBurnProgress, setBulkBurnProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { executeGameTx, isPending } = useGameTransaction()

  const buyTicket = useCallback(
    async (roundId: string, numbers: number[]): Promise<boolean> => {
      setLocalPhase('buying')
      setError(null)

      const success = await executeGameTx(
        async (coins) => buildBuyTicket(roundId, coins!.primary, numbers, coins!.extra),
        {
          amount: LOTTERY_TICKET_PRICE,
          expireThisEpoch: true,
          validate: () => validateLotteryPicks(numbers, LOTTERY_NUMBERS_COUNT, LOTTERY_MAX_NUMBER),
          humanizeMoveAbort: humanizeLotteryError,
          onError: (err) => setError(humanizeLotteryError(err.message)),
        }
      )

      setLocalPhase('idle')
      return success
    },
    [executeGameTx]
  )

  const buyTicketBulk = useCallback(
    async (roundId: string, count: number): Promise<boolean> => {
      if (count < 1 || count > 10) {
        setError('Bulk count must be between 1 and 10')
        return false
      }
      setLocalPhase('buying')
      setError(null)

      const totalCost = LOTTERY_TICKET_PRICE * BigInt(count)
      const success = await executeGameTx(
        async (coins) => {
          const bulkPicks = Array.from({ length: count }, () => autoPickNumbers())
          return buildBuyTicketBulk(roundId, coins!.primary, bulkPicks, coins!.extra)
        },
        {
          amount: totalCost,
          expireThisEpoch: true,
          humanizeMoveAbort: humanizeLotteryError,
          onError: (err) => setError(humanizeLotteryError(err.message)),
        }
      )

      setLocalPhase('idle')
      return success
    },
    [executeGameTx]
  )

  const claimPrize = useCallback(
    async (roundId: string, ticketId: string): Promise<boolean> => {
      setLocalPhase('claiming')
      setClaimingTicketId(ticketId)
      setError(null)

      const success = await executeGameTx(
        async () => buildClaimPrize(roundId, ticketId),
        {
          skipBalanceCheck: true,
          humanizeMoveAbort: humanizeLotteryError,
          onError: (err) => setError(humanizeLotteryError(err.message)),
        }
      )

      setLocalPhase('idle')
      setClaimingTicketId(null)
      return success
    },
    [executeGameTx]
  )

  const burnTicket = useCallback(
    async (roundId: string, ticketId: string): Promise<boolean> => {
      setError(null)
      setBurningTicketId(ticketId)
      const success = await executeGameTx(
        async () => buildBurnTicket(roundId, ticketId),
        {
          skipBalanceCheck: true,
          humanizeMoveAbort: humanizeLotteryError,
          onError: (err) => setError(humanizeLotteryError(err.message)),
        }
      )
      setBurningTicketId(null)
      return success
    },
    [executeGameTx]
  )

  /**
   * Bulk burn losing tickets in chunks. Chunk size 50 keeps PTB gas budget
   * predictable and wallet UX snappy. On chunk failure, accumulates the count
   * and keeps going (one bad ticket should not strand the rest).
   */
  const burnTicketsBulk = useCallback(
    async (
      items: ReadonlyArray<{ roundId: string; ticketId: string }>,
    ): Promise<BulkBurnResult> => {
      if (items.length === 0) return { burned: 0, failedChunks: 0, storageRebateSoe: 0n, digests: [] }
      setError(null)
      setIsBulkBurning(true)
      setBulkBurnProgress({ done: 0, total: items.length })

      const CHUNK = 50
      let burned = 0
      let failedChunks = 0
      let storageRebateSoe = 0n
      const digests: string[] = []

      try {
        for (let i = 0; i < items.length; i += CHUNK) {
          const chunk = items.slice(i, i + CHUNK)
          const ok = await executeGameTx(async () => buildBurnTicketBulk(chunk), {
            skipBalanceCheck: true,
            humanizeMoveAbort: humanizeLotteryError,
            // Capture storage rebate from this chunk's effects. The Sui effects
            // shape is `{ gasUsed: { storageRebate: string, ... } }` — both the
            // raw rebate and the digest are needed for the result modal.
            onSuccess: (result: unknown) => {
              const r = result as { digest?: string; effects?: { gasUsed?: { storageRebate?: string | number } } } | undefined
              if (r?.digest) digests.push(r.digest)
              const raw = r?.effects?.gasUsed?.storageRebate
              if (raw !== undefined && raw !== null) {
                try {
                  storageRebateSoe += BigInt(raw)
                } catch {
                  // ignore malformed value
                }
              }
            },
          })
          if (ok) burned += chunk.length
          else failedChunks += 1
          setBulkBurnProgress({ done: Math.min(i + CHUNK, items.length), total: items.length })
        }
      } finally {
        setIsBulkBurning(false)
        // Leave the final progress visible for one tick so the caller can read it.
        setTimeout(() => setBulkBurnProgress(null), 500)
      }

      return { burned, failedChunks, storageRebateSoe, digests }
    },
    [executeGameTx],
  )

  return {
    walletAddress,
    isWalletConnected,
    buyTicket,
    buyTicketBulk,
    claimPrize,
    burnTicket,
    burnTicketsBulk,
    isBuying: isPending && localPhase === 'buying',
    isClaiming: isPending && localPhase === 'claiming',
    claimingTicketId,
    burningTicketId,
    isBulkBurning,
    bulkBurnProgress,
    error,
    clearError: () => setError(null),
  }
}
