/**
 * JackpotShareButton — plain X (Twitter) intent. No canvas card.
 * Stage B will add a visual share card.
 */

import { formatNusdc } from '../../lib/format'
import type { GameLabel } from './types'

interface Props {
  payout: bigint
  gameLabel: GameLabel
}

export function JackpotShareButton({ payout, gameLabel }: Props) {
  const text = `Just hit a jackpot on ${gameLabel} — +${formatNusdc(payout)} NUSDC at gostop.app 🎰`
  const url = 'https://gostop.app'
  const href = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-ghost !py-2 !px-4 text-sm inline-flex items-center gap-2"
    >
      <span aria-hidden>𝕏</span>
      Tweet this win
    </a>
  )
}
