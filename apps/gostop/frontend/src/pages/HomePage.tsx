import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ENABLE_CRASH } from "../lib/gostop-config";
import { useTransparency } from "../lib/api/queries";
import crashThumb from "../assets/images/crash.webp";
import lotteryThumb from "../assets/images/lottery.webp";
import scratchThumb from "../assets/images/scratchcard.webp";
import numberMatchThumb from "../assets/images/number-match.webp";
import minesThumb from "../assets/images/mines.webp";
import wheelThumb from "../assets/images/wheel.webp";

// Compact NUSDC formatting for the hero counter.
//   raw 5_047_123_456_789 (6-decimal base units)  -> "5.05M"
//   raw     123_456_789   -> "123"
// Stays a bigint until the final compactor to avoid `Number` precision loss
// on the >2^53 raw values that already live in the DB.
function compactNusdc(rawSum: bigint): string {
  const whole = rawSum / 1_000_000n;
  if (whole >= 1_000_000n) {
    // millions, 2 decimals
    const millions = Number((whole * 100n) / 1_000_000n) / 100;
    return `${millions.toFixed(2)}M`;
  }
  if (whole >= 1_000n) {
    const k = Number((whole * 10n) / 1_000n) / 10;
    return `${k.toFixed(1)}K`;
  }
  return whole.toLocaleString("en-US");
}

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
    <section
      // Full-bleed only at lg+ where the desktop composition (text left,
      // image bleeding to the viewport edge) needs the extra width.
      // Below lg, the section uses its natural container width so nothing
      // exceeds the viewport (mobile horizontal-scroll fix).
      className="-mt-6 sm:-mt-10 lg:w-screen lg:ml-[calc(-50vw+50%)]"
    >
      <div className="relative overflow-hidden max-w-[1600px] mx-auto">
        {/* Dot grid texture */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle, #d4af37 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Ambient glow */}
        <div
          aria-hidden
          className="absolute -top-40 -left-20 w-[600px] h-[600px] rounded-full blur-3xl pointer-events-none"
          style={{ backgroundColor: "rgba(212, 175, 55, 0.1)" }}
        />

        <div className="relative flex flex-col-reverse lg:flex-row items-stretch  ">
          {/* Text panel */}
          <div className="w-full lg:w-1/2 shrink-0 flex flex-col justify-center py-12 md:py-16 lg:py-0">
            <div className="lg:-mr-[12%] flex flex-col gap-6 md:gap-7 w-full max-w-md sm:max-w-lg mx-auto lg:max-w-xl xl:max-w-2xl">
              <div className="flex flex-col gap-6 px-0 sm:px-4 md:px-9 lg:px-16 items-center text-center lg:items-stretch lg:text-left">
                {/* Live badge */}
                <div className="inline-flex items-center gap-2 lg:self-start px-3 py-1 rounded-full bg-gold-400/10 border border-gold-400/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs uppercase tracking-[0.15em] text-gold-200">
                    Live on Nasun Devnet
                  </span>
                </div>

                {/* Title */}
                <h1
                  className="font-display italic font-medium leading-[1.05] tracking-tight text-transparent bg-clip-text -ml-1 pb-2"
                  style={{
                    fontSize: "clamp(64px, 8vw, 144px)",
                    backgroundImage:
                      "linear-gradient(135deg, #fdf6e3 0%, #f2d67b 45%, #b68d22 100%)",
                  }}
                >
                  GoStop
                </h1>

                {/* Stat strip */}
                <HeroStats />

                {/* CTAs */}
                <div className="flex items-center gap-3 flex-wrap">
                  <Link to="/floor" className="btn-gold !py-2 !px-5 text-sm">
                    See the Floor
                  </Link>
                  <Link to="/leaderboard" className="btn-ghost !py-2 !px-5 text-sm">
                    Leaderboard
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Image panel */}
          <div className="relative w-full lg:w-1/2 shrink-0 overflow-hidden ">
            <div className="relative aspect-square md:aspect-[16/9] lg:aspect-[3/2]">
              <div className="relative h-full w-full lg:w-auto aspect-square md:aspect-[16/9] lg:aspect-square mx-auto lg:-translate-x-[15%]">
                <picture className="block w-full h-full">
                  <source
                    media="(min-width: 768px) and (max-width: 1023px)"
                    srcSet="/lottery-wide.webp"
                  />
                  <img
                    src={lotteryThumb}
                    alt=""
                    aria-hidden
                    className="w-full h-full object-cover object-center"
                  />
                </picture>
                {/* Left fade */}
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[10%] z-10 pointer-events-none hidden lg:block"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, #07070a, transparent)",
                  }}
                />
                {/* Right fade */}
                <div
                  aria-hidden
                  className="absolute inset-y-0 right-0 w-[10%] z-10 pointer-events-none hidden lg:block"
                  style={{
                    backgroundImage:
                      "linear-gradient(to left, #07070a, transparent)",
                  }}
                />
                {/* Warm overlay */}
                <div
                  aria-hidden
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage:
                      "linear-gradient(135deg, rgba(93, 71, 16, 0.45) 0%, transparent 50%, rgba(138, 106, 24, 0.2) 100%)",
                  }}
                />
              </div>
              {/* Bottom fade on mobile */}
              <div
                aria-hidden
                className="absolute bottom-0 inset-x-0 h-24 lg:hidden pointer-events-none"
                style={{
                  backgroundImage:
                    "linear-gradient(to top, #07070a, transparent)",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroStats() {
  const { data } = useTransparency();

  const wagered = (() => {
    if (!data?.games?.length) return null;
    try {
      let sum = 0n;
      for (const g of data.games) sum += BigInt(g.total_bet_raw);
      return sum;
    } catch {
      return null;
    }
  })();

  const wageredLabel = wagered === null ? "···" : compactNusdc(wagered);

  return (
    <div className="flex items-center gap-3 sm:gap-5 md:gap-7 min-w-0">
      <Stat value="5" label="Live Games" />
      <Divider />
      <Stat
        value={<ProofMark />}
        label="Provably Fair"
        // Override value alignment so the icon centers under the digit baseline
        // of the neighboring "5" without growing the stat column.
        valueClassName="flex items-center text-gold-200"
      />
      <Divider />
      <Stat
        value={wageredLabel}
        label="NUSDC Wagered"
        valueClassName="text-base md:text-xl font-medium text-gold-200 tabular-nums"
      />
    </div>
  );
}

function Stat({
  value,
  label,
  valueClassName,
}: {
  value: ReactNode;
  label: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <div
        className={
          valueClassName ??
          "text-base md:text-xl font-medium text-gold-200"
        }
      >
        {value}
      </div>
      <div className="text-[11px] sm:text-xs md:text-sm text-neutral-400 uppercase tracking-wider mt-0.5 whitespace-nowrap">
        {label}
      </div>
    </div>
  );
}

function Divider() {
  return <div aria-hidden className="w-px h-7 bg-gold-400/20 shrink-0" />;
}

// Hexagonal seal with an interior checkmark.
// Same visual weight as a 20px digit, so it sits cleanly inside the stat strip
// alongside the "5" and the NUSDC counter. Uses currentColor so it inherits
// the gold-200 tint from the parent stat row.
function ProofMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="w-5 h-5 md:w-6 md:h-6"
      fill="none"
      stroke="currentColor"
    >
      <path
        d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7L12 2.5z"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="m8.5 12.4 2.5 2.5 4.5-5"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Live() {
  return (
    <section id="live">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl text-gold">The Floor</h2>
        <span className="text-sm uppercase tracking-widest text-gold-200">
          Now open
        </span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
        <GameCard
          title="Wheel"
          tagline="One pull, one VRF roll. Up to 5×."
          cta="Spin"
          to="/wheel"
          accent="gold"
          thumb={wheelThumb}
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
    <section className="panel p-5 md:p-8 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_60%)]">
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
      className="group relative overflow-hidden panel p-4 flex items-center justify-between gap-3 sm:gap-5 transition hover:-translate-y-0.5 hover:shadow-gold-glow"
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
          className="relative shrink-0 w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-lg object-cover border border-gold-subtle"
        />
      )}
      <div className="relative flex-1 min-w-0">
        <h3 className="font-display text-xl sm:text-2xl md:text-3xl text-gold mb-1 sm:mb-2">
          {title}
        </h3>
        <p className="text-sm sm:text-base text-neutral-200 italic">
          {tagline}
        </p>
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
