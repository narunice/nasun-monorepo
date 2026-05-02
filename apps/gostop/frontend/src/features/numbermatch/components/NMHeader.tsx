import numberMatchThumb from '../../../assets/images/number-match.webp'
import { NM_MIN_NUM, NM_MAX_NUM, NM_MAX_PICKS } from '../constants'

export function NMHeader() {
  return (
    <header className="panel p-6 md:p-8 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.12),transparent_55%)] flex flex-col md:flex-row md:items-center gap-6">
      <img
        src={numberMatchThumb}
        alt=""
        aria-hidden
        className="w-full md:w-48 h-40 md:h-48 rounded-xl object-cover border border-gold-subtle shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm uppercase tracking-[0.3em] text-gold-300 mb-3">
          Instant Play
        </p>
        <h1 className="font-display text-4xl md:text-5xl text-gold">Number Match</h1>
        <p className="text-base text-neutral-200 mt-3 max-w-2xl leading-relaxed">
          Pick {NM_MIN_NUM}-{NM_MAX_PICKS} numbers from {NM_MIN_NUM} to {NM_MAX_NUM}. Match the drawn number to win.
          Partial refund on losses keeps every round meaningful.
        </p>
      </div>
    </header>
  )
}
