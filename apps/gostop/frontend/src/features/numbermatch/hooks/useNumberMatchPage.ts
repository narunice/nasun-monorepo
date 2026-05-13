import { useState, useCallback } from 'react'
import {
  useNumberMatch,
  type NumberMatchResult,
} from '../useNumberMatch'
import { useToast } from '../../../components/ui/Toast'
import {
  useCelebrate,
  tierForNumberMatch,
} from '../../../components/celebration'
import { useInvalidateGameHistory } from '../../game-history'
import { formatNusdc } from '../../../lib/format'
import { NM_MAX_PICKS } from '../constants'

export function useNumberMatchPage() {
  const { isWalletConnected, play, isPlaying, error, clearError } = useNumberMatch()
  const { showToast } = useToast()
  const celebrate = useCelebrate()
  const invalidateHistory = useInvalidateGameHistory()
  
  const [picks, setPicks] = useState<number[]>([])
  const [result, setResult] = useState<NumberMatchResult | null>(null)

  const togglePick = useCallback((n: number) => {
    setResult(null)
    setPicks((prev) =>
      prev.includes(n)
        ? prev.filter((x) => x !== n)
        : prev.length < NM_MAX_PICKS
          ? [...prev, n].sort((a, b) => a - b)
          : prev,
    )
  }, [])

  const onPlay = useCallback(async () => {
    if (picks.length === 0) return
    const r = await play(picks)
    if (r) {
      setResult(r)
      setPicks([])
      invalidateHistory()
      if (r.isWin) {
        showToast(
          `Match! Winning number ${r.winningNumber} · +${formatNusdc(r.payout)} NUSDC`,
          'success',
        )
        const tier = tierForNumberMatch(r.isWin, picks.length)
        if (tier) {
          celebrate({
            variant: 'slam',
            tier,
            payout: r.payout,
            gameLabel: 'Number Match',
          })
        }
      } else {
        showToast(
          `No match. Winning number was ${r.winningNumber} · Refund ${formatNusdc(r.payout)} NUSDC`,
          'info',
        )
        celebrate({
          variant: 'loss',
          tier: 'loss',
          payout: r.payout,
          gameLabel: 'Number Match',
        })
      }
    }
  }, [picks, play, invalidateHistory, showToast, celebrate])

  return {
    isWalletConnected,
    isPlaying,
    error,
    clearError,
    picks,
    setPicks,
    result,
    setResult,
    togglePick,
    onPlay,
  }
}
