/**
 * useForceTierDebug — dev-only ?forceTier=... query param honoring.
 *
 * Triggers a synthetic celebration once on mount when `?forceTier=<value>`
 * is present and `import.meta.env.DEV` is true. Game pages opt in by
 * calling this hook with their game label.
 *
 * Param values:
 *   normal   — 50 NUSDC payout, 5× multiplier
 *   big      — 200 NUSDC payout, 20× multiplier
 *   jackpot  — 1000 NUSDC payout, 100× multiplier
 *   slam     — slam variant at jackpot tier (Number Match preview)
 *   loss     — handled by caller (scratch only); not dispatched here
 */

import { useEffect, useRef } from 'react'
import { useCelebrate } from './CelebrationProvider'
import type { GameLabel } from './types'

const ONE_NUSDC = 1_000_000n

export function useForceTierDebug(gameLabel: GameLabel) {
  const celebrate = useCelebrate()
  const fired = useRef(false)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (typeof window === 'undefined') return
    if (fired.current) return
    const params = new URLSearchParams(window.location.search)
    const value = params.get('forceTier')
    if (!value) return
    fired.current = true

    const slam = value === 'slam'
    const tier =
      value === 'jackpot' || slam
        ? 'jackpot'
        : value === 'big'
          ? 'big'
          : value === 'normal'
            ? 'normal'
            : null

    if (!tier) return

    const payout =
      tier === 'jackpot' ? 1000n * ONE_NUSDC : tier === 'big' ? 200n * ONE_NUSDC : 50n * ONE_NUSDC
    const multiplier = tier === 'jackpot' ? 100 : tier === 'big' ? 20 : 5

    // Defer one tick so the page mounts first.
    const t = setTimeout(() => {
      celebrate({
        variant: slam ? 'slam' : 'tiered',
        tier,
        payout,
        multiplier: slam ? undefined : multiplier,
        gameLabel,
      })
    }, 200)
    return () => clearTimeout(t)
  }, [celebrate, gameLabel])
}
