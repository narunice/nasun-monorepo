import { Link } from 'react-router-dom'
import { ENABLE_CRASH } from '../lib/gostop-config'
import crashThumb from '../assets/images/crash.webp'
import lotteryThumb from '../assets/images/lottery.webp'
import scratchThumb from '../assets/images/scratchcard.webp'
import numberMatchThumb from '../assets/images/number-match.webp'
import minesThumb from '../assets/images/mines.webp'

interface LiveGame {
  title: string
  tagline: string
  cta: string
  to: string
  thumb: string
}

interface UpcomingGame {
  title: string
  tagline: string
  eta: string
}

const LIVE_GAMES: LiveGame[] = [
  ...(ENABLE_CRASH
    ? [
        {
          title: 'Crash',
          tagline:
            'A live multiplier climbs from 1.00x and crashes at a random point. Cash out before the crash to lock in your payout, hesitate too long and you lose the bet. Provably fair, salted commit-reveal each round.',
          cta: 'Fly',
          to: '/crash',
          thumb: crashThumb,
        },
      ]
    : []),
  {
    title: 'Weekly Lottery',
    tagline:
      'Pick 5 numbers out of 25 and hold a ticket for the weekly draw. Match all five to take the jackpot, partial matches share the lower tiers. One round per week, settled on chain.',
    cta: 'Play',
    to: '/lottery',
    thumb: lotteryThumb,
  },
  {
    title: 'Scratch Cards',
    tagline:
      'Buy a sheet of ten cards and reveal them in a single tap. Match symbols for instant prizes up to 100x your stake. No skill, no waiting, pure scratch.',
    cta: 'Scratch',
    to: '/scratch',
    thumb: scratchThumb,
  },
  {
    title: 'Number Match',
    tagline:
      'Choose one to three numbers and a stake. The on-chain roll decides the outcome. Fewer picks pay bigger multipliers, more picks raise your hit rate. Tune your own risk curve.',
    cta: 'Play',
    to: '/numbermatch',
    thumb: numberMatchThumb,
  },
  {
    title: 'Mines',
    tagline:
      'Open tiles on a 5x5 grid seeded with hidden mines. Every safe tile pumps your multiplier higher, but one mine ends the run. Cash out at any time, push your luck for more.',
    cta: 'Enter',
    to: '/mines',
    thumb: minesThumb,
  },
]

const UPCOMING_GAMES: UpcomingGame[] = [
  ...(ENABLE_CRASH
    ? []
    : [
        {
          title: 'Crash',
          tagline:
            'A live multiplier climbs from 1.00x and crashes at a random point. Cash out before the crash to lock in your payout, hesitate too long and you lose the bet.',
          eta: 'Phase 2',
        },
      ]),
  {
    title: 'Plinko',
    tagline:
      'Drop a chip from the top of a peg-filled board and watch it bounce its way down. Where it lands decides the multiplier. Pick low, medium, or high risk to shape the payout curve.',
    eta: 'Phase 3',
  },
  {
    title: 'Roulette',
    tagline:
      'Classic European single-zero roulette settled fully on chain. Bet on numbers, splits, colors, columns, or dozens, then watch the wheel decide. Multiplayer table coming.',
    eta: 'Phase 4',
  },
  {
    title: 'Wheel',
    tagline:
      'A nightly community wheel. Stake to enter, spin together at the daily cutoff, and split a pooled prize. Bigger stakes, bigger slices, with weekly mega rounds layered on top.',
    eta: 'Phase 5',
  },
]

export default function FloorPage() {
  return (
    <div className="space-y-14">
      <FloorHeader />
      <LiveSection />
      <UpcomingSection />
    </div>
  )
}

function FloorHeader() {
  return (
    <section className="text-center pt-4">
      <div className="inline-flex items-center gap-2 mb-5 px-4 py-2 rounded-full border border-gold-subtle text-sm uppercase tracking-[0.2em] text-gold-200">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        The Floor
      </div>
      <h1 className="font-display text-4xl md:text-6xl leading-[1.05] italic">
        <span className="text-gold">Pick</span>
        <span className="text-neutral-200 not-italic"> your </span>
        <span className="text-gold">table</span>
      </h1>
      <p className="mt-5 text-base md:text-lg text-neutral-200 max-w-2xl mx-auto leading-relaxed">
        Every game on the floor is provably fair and settles on chain. Step up, place a bet,
        and let the rounds roll.
      </p>
    </section>
  )
}

function LiveSection() {
  return (
    <section>
      <SectionHeading title="Now Open" caption={`${LIVE_GAMES.length} games live`} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
        {LIVE_GAMES.map((g) => (
          <LiveCard key={g.title} game={g} />
        ))}
      </div>
    </section>
  )
}

function UpcomingSection() {
  return (
    <section>
      <SectionHeading title="On the Rail" caption="Coming soon" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
        {UPCOMING_GAMES.map((g) => (
          <UpcomingCard key={g.title} game={g} />
        ))}
      </div>
    </section>
  )
}

function SectionHeading({ title, caption }: { title: string; caption: string }) {
  return (
    <div className="flex items-baseline justify-between mb-6">
      <h2 className="font-display text-2xl md:text-3xl text-gold">{title}</h2>
      <span className="text-sm uppercase tracking-widest text-gold-200">{caption}</span>
    </div>
  )
}

function LiveCard({ game }: { game: LiveGame }) {
  return (
    <Link
      to={game.to}
      className="group panel relative overflow-hidden flex flex-col transition hover:-translate-y-1 hover:shadow-gold-glow"
    >
      <div className="relative aspect-square overflow-hidden border-b border-gold-subtle">
        <img
          src={game.thumb}
          alt=""
          aria-hidden
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-ink-950/85 via-ink-950/30 to-transparent"
        />
        <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] uppercase tracking-[0.18em] border border-emerald-400/50 bg-emerald-950/50 text-emerald-300 backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
          Live
        </span>
        <h3 className="absolute bottom-4 left-5 right-5 font-display text-3xl md:text-4xl text-gold drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
          {game.title}
        </h3>
      </div>
      <div className="flex flex-col gap-5 p-6 md:p-7">
        <p className="text-base md:text-lg text-neutral-200 leading-relaxed">
          {game.tagline}
        </p>
        <span className="btn-gold self-start whitespace-nowrap group-hover:translate-x-1 transition-transform">
          {game.cta}
          <span aria-hidden className="ml-2">→</span>
        </span>
      </div>
    </Link>
  )
}

function UpcomingCard({ game }: { game: UpcomingGame }) {
  return (
    <article
      aria-disabled
      className="panel relative overflow-hidden flex flex-col opacity-90"
    >
      <div className="relative aspect-square overflow-hidden border-b border-gold-subtle bg-[radial-gradient(circle_at_30%_20%,rgba(212,175,55,0.10),transparent_60%),radial-gradient(circle_at_80%_80%,rgba(16,185,129,0.08),transparent_60%)]">
        <div aria-hidden className="absolute inset-0 flex items-center justify-center">
          <span className="font-display text-6xl md:text-7xl text-gold-200/15 italic select-none">
            {game.title}
          </span>
        </div>
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-ink-950/70 via-ink-950/10 to-transparent"
        />
        <span className="absolute top-4 left-4 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] uppercase tracking-[0.18em] border border-amber-400/40 bg-amber-950/40 text-amber-300/90 backdrop-blur-sm">
          {game.eta}
        </span>
        <h3 className="absolute bottom-4 left-5 right-5 font-display text-3xl md:text-4xl text-neutral-100/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
          {game.title}
        </h3>
      </div>
      <div className="flex flex-col gap-5 p-6 md:p-7">
        <p className="text-base md:text-lg text-neutral-200 leading-relaxed">
          {game.tagline}
        </p>
        <span className="btn-ghost self-start whitespace-nowrap cursor-not-allowed select-none">
          Coming Soon
        </span>
      </div>
    </article>
  )
}
