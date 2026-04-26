import { Link } from "react-router-dom";
import { ENABLE_CRASH } from "../lib/gostop-config";
import crashThumb from "../assets/images/crash.webp";
import lotteryThumb from "../assets/images/lottery.webp";
import scratchThumb from "../assets/images/scratchcard.webp";
import numberMatchThumb from "../assets/images/number-match.webp";
import minesThumb from "../assets/images/mines.webp";

const UPCOMING = [
  ...(ENABLE_CRASH
    ? []
    : [
        {
          name: "Crash",
          tagline: "Go or stop. One decision, one multiplier.",
          eta: "Phase 2",
        },
      ]),
  { name: "Plinko", tagline: "Drop it and watch gold bounce.", eta: "Phase 3" },
  {
    name: "Roulette",
    tagline: "The European wheel, on-chain.",
    eta: "Phase 4",
  },
  { name: "Wheel", tagline: "A nightly spin, a daily chance.", eta: "Phase 5" },
];

export default function HomePage() {
  return (
    <div className="space-y-16">
      <Hero />
      <Live />
      <Upcoming />
      <BankrollTeaser />
    </div>
  );
}

function Hero() {
  return (
    <section className="text-center pt-10 pb-4">
      <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full border border-gold-subtle text-sm uppercase tracking-[0.2em] text-gold-200">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        Nasun Devnet
      </div>
      <h1 className="font-display text-5xl md:text-7xl leading-[1.05] italic">
        <span className="text-gold">Go</span>
        <span className="text-neutral-200 not-italic"> or </span>
        <span className="text-gold">Stop</span>
      </h1>
      <p className="mt-6 text-lg text-neutral-200 max-w-xl mx-auto leading-relaxed">
        An onchain casino on Nasun. Every round provably fair, every payout
        settled on chain, every player an owner.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
        <Link to="/lottery" className="btn-gold">
          Enter the Lottery
        </Link>
        <a href="#live" className="btn-ghost">
          See the Floor
        </a>
      </div>
    </section>
  );
}

function Live() {
  return (
    <section id="live" className="panel p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl text-gold">The Floor</h2>
        <span className="text-sm uppercase tracking-widest text-gold-200">
          Now open
        </span>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {ENABLE_CRASH && (
          <GameCard
            title="Crash"
            tagline="Go or stop. One decision, one multiplier."
            cta="Fly"
            to="/crash"
            accent="gold"
            thumb={crashThumb}
          />
        )}
        <GameCard
          title="Weekly Lottery"
          tagline="5 of 25. One ticket, seven days."
          cta="Play"
          to="/lottery"
          accent="gold"
          thumb={lotteryThumb}
        />
        <GameCard
          title="Scratch Cards"
          tagline="Ten cards, one tap. Up to 100× a pop."
          cta="Scratch"
          to="/scratch"
          accent="gold"
          thumb={scratchThumb}
        />
        <GameCard
          title="Number Match"
          tagline="Pick one to three. Match to win."
          cta="Play"
          to="/numbermatch"
          accent="gold"
          thumb={numberMatchThumb}
        />
        <GameCard
          title="Mines"
          tagline="Step carefully. Multiply wildly."
          cta="Enter"
          to="/mines"
          accent="gold"
          thumb={minesThumb}
        />
      </div>
    </section>
  );
}

function Upcoming() {
  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-2xl text-gold">On the Rail</h2>
        <span className="text-sm uppercase tracking-widest text-neutral-200">
          Coming soon
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {UPCOMING.map((g) => (
          <article
            key={g.name}
            className="panel p-6 transition hover:-translate-y-0.5 hover:shadow-gold-glow"
          >
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="font-display text-xl text-gold-200">{g.name}</h3>
              <span className="text-sm uppercase tracking-widest text-neutral-200">
                {g.eta}
              </span>
            </div>
            <p className="text-base text-neutral-200 italic">{g.tagline}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function BankrollTeaser() {
  return (
    <section className="panel p-8 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_60%)]">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-emerald-400 mb-3">
            Casino, reimagined as DeFi
          </p>
          <h2 className="font-display text-2xl md:text-3xl mb-2 text-neutral-100">
            Provide liquidity.{" "}
            <span className="text-gold">Become the house.</span>
          </h2>
          <p className="text-base text-neutral-200 max-w-xl leading-relaxed">
            LPs supply NUSDC to a shared bankroll. Every game routes its edge
            back to the pool. Early devnet LPs earn ecosystem points and mainnet
            priority.
          </p>
        </div>
        <button className="btn-ghost whitespace-nowrap" disabled>
          LP, Coming Soon
        </button>
      </div>
    </section>
  );
}

function GameCard({
  title,
  tagline,
  cta,
  to,
  accent,
  badge,
  thumb,
}: {
  title: string;
  tagline: string;
  cta: string;
  to: string;
  accent: "gold" | "emerald";
  badge?: string;
  thumb?: string;
}) {
  return (
    <Link
      to={to}
      className="group relative overflow-hidden panel px-4 py-4 flex items-center justify-between gap-5 transition hover:-translate-y-0.5 hover:shadow-gold-glow"
    >
      <div
        aria-hidden
        className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${
          accent === "gold"
            ? "bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.12),transparent_60%)]"
            : "bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.12),transparent_60%)]"
        }`}
      />
      {thumb && (
        <img
          src={thumb}
          alt=""
          aria-hidden
          className="relative shrink-0 w-28 h-28 md:w-32 md:h-32 rounded-lg object-cover border border-gold-subtle"
        />
      )}
      <div className="relative flex-1 min-w-0">
        <h3 className="font-display text-3xl text-gold mb-2">{title}</h3>
        <p className="text-base text-neutral-200 italic">{tagline}</p>
        {badge && (
          <span
            className={`inline-flex items-center gap-1.5 mt-3 px-2 py-0.5 rounded-full text-xs uppercase tracking-[0.15em] border ${
              badge === "Live"
                ? "border-emerald-400/50 bg-emerald-950/40 text-emerald-300"
                : "border-amber-400/40 bg-amber-950/30 text-amber-300/90"
            }`}
          >
            {badge === "Live" && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"
                aria-hidden
              />
            )}
            {badge}
          </span>
        )}
      </div>
      <span className="relative btn-gold whitespace-nowrap group-hover:translate-x-1 transition-transform">
        {cta}
        <span aria-hidden className="ml-2">
          →
        </span>
      </span>
    </Link>
  );
}
