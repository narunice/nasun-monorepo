import { useCallback, useEffect, useState } from 'react'
import { useActiveAddress } from '../../hooks/useActiveAddress'
import {
  getMyActiveSession,
  type MinesSession,
} from './mines-client'
import { humanizeMinesError } from './mines-config'
import {
  buildCreateSession,
  buildRevealCell,
  buildCashout,
  buildForfeitSession,
} from './transactions'
import { useGameTransaction } from '../../hooks/useGameTransaction'
import { MINES_MIN_BET, MINES_MAX_BET, MINES_MIN_MINES, MINES_MAX_MINES } from '../../lib/gostop-config'
import { validateBetAmount, validateMinesConfig } from '../../lib/validation/game-rules'

export type MinesPhase = 'idle' | 'creating' | 'cashing_out' | 'forfeiting' | 'busy'

export interface UseMinesResult {
  walletAddress: string | undefined
  isWalletConnected: boolean
  session: MinesSession | null
  phase: MinesPhase
  pendingCells: Set<number>
  createSession: (betAmount: bigint, mineCount: number) => Promise<boolean>
  revealCell: (cellIndex: number) => Promise<void>
  cashout: () => Promise<boolean>
  forfeit: () => Promise<boolean>
  refresh: () => Promise<void>
  error: string | null
  clearError: () => void
  /** Last cashout payout / last explosion bet for post-finish UI. */
  lastFinish: { kind: 'cashed_out' | 'exploded'; payout: bigint; bet: bigint } | null
  clearLastFinish: () => void
}

export function useMines(): UseMinesResult {
  const walletAddress = useActiveAddress()
  const isWalletConnected = !!walletAddress

  const [session, setSession] = useState<MinesSession | null>(null)
  const [pendingCells, setPendingCells] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [lastFinish, setLastFinish] = useState<UseMinesResult['lastFinish']>(null)
  const [localPhase, setLocalPhase] = useState<MinesPhase>('idle')

  const { executeGameTx, isPending } = useGameTransaction()

  const refresh = useCallback(async () => {
    if (!walletAddress) {
      setSession(null)
      return
    }
    try {
      const s = await getMyActiveSession(walletAddress)
      setSession(s)
    } catch (e) {
      console.warn('[mines] refresh failed', e)
    }
  }, [walletAddress])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createSession = useCallback(
    async (betAmount: bigint, mineCount: number): Promise<boolean> => {
      setLocalPhase('creating')
      setError(null)
      setLastFinish(null)

      const success = await executeGameTx(
        async (coins) => buildCreateSession(coins!.primary, betAmount, mineCount, coins!.extra),
        {
          amount: betAmount,
          expireThisEpoch: true,
          validate: () => {
            const betVal = validateBetAmount(betAmount, MINES_MIN_BET, MINES_MAX_BET);
            if (!betVal.isValid) return betVal;
            return validateMinesConfig(mineCount, MINES_MIN_MINES, MINES_MAX_MINES);
          },
          onSuccess: refresh,
          onError: (err) => setError(humanizeMinesError(err.message)),
        }
      )

      setLocalPhase('idle')
      return success
    },
    [executeGameTx, refresh]
  )

  const revealCell = useCallback(
    async (cellIndex: number) => {
      if (!session || session.status !== 0 || isPending || pendingCells.has(cellIndex)) return

      setPendingCells((prev) => new Set(prev).add(cellIndex))
      setError(null)

      await executeGameTx(
        async () => buildRevealCell(session.id, cellIndex),
        {
          awaitFullnode: false,
          onSuccess: (result) => {
            const finished = (result.events ?? []).find((e: any) =>
              e.type.endsWith('::mines::SessionFinished'),
            )
            if (finished) {
              const pj = finished.parsedJson as {
                payout: string | number
                bet_amount: string | number
                outcome: string | number
              }
              const outcome = Number(pj.outcome)
              setLastFinish({
                kind: outcome === 2 ? 'exploded' : 'cashed_out',
                payout: BigInt(pj.payout),
                bet: BigInt(pj.bet_amount),
              })
              setSession(null)
            } else {
              setSession((prev) => {
                if (!prev || prev.id !== session.id) return prev
                const nextRevealed = prev.revealed.slice()
                nextRevealed[cellIndex] = true
                return {
                  ...prev,
                  revealed: nextRevealed,
                  safeReveals: prev.safeReveals + 1,
                }
              })
            }
          },
          onError: (err) => setError(humanizeMinesError(err.message)),
        }
      )

      setPendingCells((prev) => {
        const next = new Set(prev)
        next.delete(cellIndex)
        return next
      })
    },
    [session, isPending, pendingCells, executeGameTx]
  )

  const cashout = useCallback(async (): Promise<boolean> => {
    if (!session) return false
    setLocalPhase('cashing_out')
    setError(null)

    const success = await executeGameTx(
      async () => buildCashout(session.id),
      {
        onSuccess: (result) => {
          const finished = (result.events ?? []).find((e: any) =>
            e.type.endsWith('::mines::SessionFinished'),
          )
          if (finished) {
            const pj = finished.parsedJson as {
              payout: string | number
              bet_amount: string | number
              outcome: string | number
            }
            setLastFinish({
              kind: Number(pj.outcome) === 2 ? 'exploded' : 'cashed_out',
              payout: BigInt(pj.payout),
              bet: BigInt(pj.bet_amount),
            })
          }
          setSession(null)
        },
        onError: (err) => setError(humanizeMinesError(err.message)),
      }
    )

    setLocalPhase('idle')
    return success
  }, [session, executeGameTx])

  const forfeit = useCallback(async (): Promise<boolean> => {
    if (!session) return false
    setLocalPhase('forfeiting')
    setError(null)

    const success = await executeGameTx(
      async () => buildForfeitSession(session.id),
      {
        skipBalanceCheck: true,
        onSuccess: () => {
          // Surface the forfeit as a closed-out session so the UI's
          // finish banner reads "forfeited" rather than lingering as
          // active. payout=0 mirrors the on-chain SessionFinished event.
          setLastFinish({ kind: 'exploded', payout: 0n, bet: session.bet })
          setSession(null)
        },
        onError: (err) => setError(humanizeMinesError(err.message)),
      }
    )

    setLocalPhase('idle')
    return success
  }, [session, executeGameTx])

  return {
    walletAddress,
    isWalletConnected,
    session,
    phase: isPending ? (localPhase !== 'idle' ? localPhase : 'busy') : 'idle',
    pendingCells,
    createSession,
    revealCell,
    cashout,
    forfeit,
    refresh,
    error,
    clearError: () => setError(null),
    lastFinish,
    clearLastFinish: () => setLastFinish(null),
  }
}
