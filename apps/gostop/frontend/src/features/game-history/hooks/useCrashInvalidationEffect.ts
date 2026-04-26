/**
 * useCrashInvalidationEffect — crash round termination → invalidate history.
 *
 * Latches `wasBetting` once `hadBet` becomes true so the invalidation fires
 * even when `hasBetThisRound` flips to false simultaneously with the
 * RESOLVED/CRASHED state dispatch (otherwise the closure captures a stale
 * `hadBet=false` and skips the invalidate).
 *
 * Gating on bet ensures we don't refetch the 1000-event sender query for
 * every crash round the user merely watches.
 */

import { useEffect, useRef } from 'react'
import { useInvalidateGameHistory } from './useInvalidateGameHistory'

export function useCrashInvalidationEffect(
  state: string | undefined,
  hadBet: boolean,
): void {
  const invalidate = useInvalidateGameHistory()
  const wasBettingRef = useRef(false)

  useEffect(() => {
    if (hadBet) wasBettingRef.current = true
    if (state === 'RESOLVED' || state === 'CRASHED') {
      if (wasBettingRef.current) {
        invalidate()
        wasBettingRef.current = false // ready for next round
      }
    }
  }, [state, hadBet, invalidate])
}
