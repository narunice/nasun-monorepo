import { useCallback, useState } from 'react'
import { useWallet } from '@nasun/wallet'
import { LOTTERY_TICKET_PRICE } from '../../lib/gostop-config'
import {
  buildBuyTicket,
  buildBuyTicketBulk,
  buildBurnTicket,
  buildClaimPrize,
} from './transactions'
import { autoPickNumbers } from './lottery-utils'
import { humanizeLotteryError } from './errors'
import { useGameTransaction } from '../../hooks/useGameTransaction'

export interface UseLotteryActionsResult {
  walletAddress: string | undefined
  isWalletConnected: boolean
  buyTicket: (roundId: string, numbers: number[]) => Promise<boolean>
  buyTicketBulk: (roundId: string, count: number) => Promise<boolean>
  claimPrize: (roundId: string, ticketId: string) => Promise<boolean>
  burnTicket: (roundId: string, ticketId: string) => Promise<boolean>
  isBuying: boolean
  isClaiming: boolean
  error: string | null
  clearError: () => void
}

export function useLotteryActions(): UseLotteryActionsResult {
  const { address: walletAddress } = useWallet()
  const isWalletConnected = !!walletAddress

  const [localPhase, setLocalPhase] = useState<'buying' | 'claiming' | 'idle'>('idle')
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
      setError(null)

      const success = await executeGameTx(
        async () => buildClaimPrize(roundId, ticketId),
        {
          skipBalanceCheck: true,
          onError: (err) => setError(humanizeLotteryError(err.message)),
        }
      )

      setLocalPhase('idle')
      return success
    },
    [executeGameTx]
  )

  const burnTicket = useCallback(
    async (roundId: string, ticketId: string): Promise<boolean> => {
      setError(null)
      const success = await executeGameTx(
        async () => buildBurnTicket(roundId, ticketId),
        {
          skipBalanceCheck: true,
          onError: (err) => setError(humanizeLotteryError(err.message)),
        }
      )
      return success
    },
    [executeGameTx]
  )

  return {
    walletAddress,
    isWalletConnected,
    buyTicket,
    buyTicketBulk,
    claimPrize,
    burnTicket,
    isBuying: isPending && localPhase === 'buying',
    isClaiming: isPending && localPhase === 'claiming',
    error,
    clearError: () => setError(null),
  }
}
