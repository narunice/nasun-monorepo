import { NM_PRICE_PER_PICK } from '../constants'

interface NMPlayPanelProps {
  picksCount: number
  isWalletConnected: boolean
  isPlaying: boolean
  onPlay: () => void
}

export function NMPlayPanel({
  picksCount,
  isWalletConnected,
  isPlaying,
  onPlay,
}: NMPlayPanelProps) {
  const cost = picksCount * NM_PRICE_PER_PICK
  const canPlay = picksCount >= 1 && isWalletConnected && !isPlaying

  return (
    <section className="panel p-5 sm:p-7">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-2xl text-gold">Play</h2>
          <p className="text-sm text-neutral-200 mt-1">
            {NM_PRICE_PER_PICK} NUSDC per pick. 80% RTP across all pick counts.
          </p>
        </div>
        <p className="text-base text-gold-200 font-mono">
          {picksCount} × {NM_PRICE_PER_PICK.toFixed(2)} = {cost.toFixed(2)} NUSDC
        </p>
      </div>
      <div className="flex justify-center">
        <button
          onClick={onPlay}
          disabled={!canPlay}
          className="btn-gold w-full sm:w-auto sm:min-w-[20rem] !px-10 !py-4 text-xl font-bold tracking-wide shadow-gold-glow disabled:shadow-none"
        >
          {isPlaying
            ? 'Playing…'
            : !isWalletConnected
              ? 'Connect Wallet'
              : picksCount === 0
                ? 'Pick numbers first'
                : `Play ${picksCount} pick${picksCount === 1 ? '' : 's'}`}
        </button>
      </div>
    </section>
  )
}
