import React, {
  useCallback,
  type ComponentType,
  type PointerEvent as RPointerEvent,
} from "react";
import {
  ShieldCheck,
  Wallet,
  TrendingUp,
  Sparkles,
  Crown,
  Trophy,
  Coins,
  Cpu,
  Layers,
  ArrowUpRight,
  CheckCircle2,
  Hourglass,
  type LucideProps,
} from "lucide-react";
import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";
import { useGridSpotlight } from "@/sections/dev/_shared/useGridSpotlight";
import lotteryImg from "@/assets/images/lottery.webp";

const GOSTOP_URL = "https://gostop.app";

/* ------------------------------------------------------------------ */
/* Content                                                            */
/* ------------------------------------------------------------------ */

const HERO_STATS = [
  { value: "5", label: "Live games" },
  { value: "3,347", label: "Social DAU" },
  { value: "8m 42s", label: "Avg. session" },
] as const;

type Game = { title: string; tagline: string; thumb: string; href: string };

const LIVE_GAMES: Game[] = [
  {
    title: "Crash",
    tagline: "A live multiplier you cash out before it busts.",
    thumb: "/images/gostop/crash.webp",
    href: `${GOSTOP_URL}/crash`,
  },
  {
    title: "Weekly Lottery",
    tagline: "5 of 25, one ticket, seven days.",
    thumb: "/images/gostop/lottery.webp",
    href: `${GOSTOP_URL}/lottery`,
  },
  {
    title: "Scratch Cards",
    tagline: "Buy a sheet, reveal up to 100x in a tap.",
    thumb: "/images/gostop/scratchcard.webp",
    href: `${GOSTOP_URL}/scratch`,
  },
  {
    title: "Mines",
    tagline: "Reveal safe tiles, push your luck, cash out anytime.",
    thumb: "/images/gostop/mines.webp",
    href: `${GOSTOP_URL}/mines`,
  },
  {
    title: "Number Match",
    tagline: "Pick one to three, match to win.",
    thumb: "/images/gostop/number-match.webp",
    href: `${GOSTOP_URL}/numbermatch`,
  },
];

type Card = {
  title: string;
  Icon: ComponentType<LucideProps>;
  body?: string;
  bullets?: string[];
  status?: "live" | "alpha" | "soon";
};

const FORCES: Card[] = [
  {
    title: "Provable fairness",
    Icon: ShieldCheck,
    body: "Commit-reveal salts and onchain RNG remove the operator's ability to silently tilt the odds. Anyone can replay the math.",
  },
  {
    title: "Self-custody",
    Icon: Wallet,
    body: "No wallet provider holds the bankroll. Withdrawals settle as native tokens; deposits never leave the chain.",
  },
  {
    title: "Open liquidity",
    Icon: TrendingUp,
    body: "House liquidity becomes a public market. LPs become the casino, and edge becomes yield.",
  },
];

const NEXT: Array<{ head: string; body: string }> = [
  {
    head: "Latency-sensitive games",
    body: "Multiplier curves, live duels, and shared-state rounds need fast finality and a chat layer that survives spikes.",
  },
  {
    head: "Becoming the house",
    body: "Players want to LP into the bankroll, take edge as yield, and unwind any time. Vault primitives replace operator equity.",
  },
  {
    head: "Social stakes",
    body: "Leaderboards, shared tables, and tournament pools turn solo grind into a social loop with persistent identity.",
  },
];

const EDGE: Array<{ label: string; body: string }> = [
  {
    label: "Sub-second feedback loops",
    body: "Crash uses a server-broadcast multiplier curve with onchain verification. Mines reveals snap instantly with a deferred ledger commit.",
  },
  {
    label: "One bankroll, every game",
    body: "A single shared treasury settles every payout. LP into the bankroll once and earn edge across all formats.",
  },
  {
    label: "Production-grade UX",
    body: "Wallet flows that hide chain friction, celebration tiers tuned to real win amounts, mobile-first layouts, and result modals that turn a bust into a moment.",
  },
  {
    label: "Composable identity",
    body: "Every player is a Nasun account. Game history, points, and Alliance NFT membership carry across the rest of the ecosystem.",
  },
];

const TECH: Card[] = [
  {
    title: "Move-based settlement",
    Icon: Cpu,
    bullets: [
      "Move contracts on Nasun devnet",
      "Object model for per-round state",
      "Sub-second tx finality on consensus",
    ],
  },
  {
    title: "Commit-reveal randomness",
    Icon: ShieldCheck,
    bullets: [
      "Salt committed before betting opens",
      "Reveal verifies the round on close",
      "No operator can rewrite outcomes",
    ],
  },
  {
    title: "Single bankroll",
    Icon: Layers,
    bullets: [
      "Shared treasury across every game",
      "Per-game caps to bound max payout",
      "Edge accrues to one liquidity layer",
    ],
  },
];

const ROADMAP: Card[] = [
  {
    title: "Plinko",
    Icon: Sparkles,
    status: "soon",
    body: "Drop a chip from the top, watch it bounce through golden pegs. Pick low, medium, or high risk to shape the payout curve.",
  },
  {
    title: "Roulette",
    Icon: Crown,
    status: "soon",
    body: "Classic European single-zero roulette settled on chain. Numbers, splits, colors, columns, with a multiplayer table coming.",
  },
  {
    title: "Wheel",
    Icon: Trophy,
    status: "soon",
    body: "A nightly community wheel. Stake to enter, spin together at the cutoff, split a pooled prize. Daily plus weekly mega rounds.",
  },
  {
    title: "Bankroll Vault",
    Icon: Coins,
    status: "soon",
    body: "Open the casino's treasury to LPs. Deposit NUSDC, become the house, take edge as yield, withdraw any time.",
  },
];

const LIVE_NOW = [
  "Five live games on gostop.app",
  "Provably fair commit-reveal randomness",
  "Shared bankroll across every game",
  "Wallet, zkLogin, and passkey sign-in",
];

const IN_DEV = [
  "Plinko, Roulette, Wheel",
  "Bankroll Vault for LP house edge",
  "Tournaments and seasonal pools",
  "Cross-game leaderboards",
];

/* ------------------------------------------------------------------ */
/* Shared interactions                                                */
/* ------------------------------------------------------------------ */

function useCardTilt() {
  const onMove = useCallback((e: RPointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    el.style.setProperty("--rx", `${(0.5 - y) * 4}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 4}deg`);
  }, []);
  const onLeave = useCallback((e: RPointerEvent<HTMLElement>) => {
    e.currentTarget.style.setProperty("--rx", "0deg");
    e.currentTarget.style.setProperty("--ry", "0deg");
  }, []);
  return { onMove, onLeave };
}

const STATUS_LABEL: Record<NonNullable<Card["status"]>, string> = {
  live: "LIVE",
  alpha: "ALPHA",
  soon: "SOON",
};

function InfoCard({
  card,
  tilt,
}: {
  card: Card;
  tilt: ReturnType<typeof useCardTilt>;
}) {
  const { Icon } = card;
  return (
    <article
      className="ch-step-card ch-product-card"
      data-spotlight-card=""
      onPointerMove={tilt.onMove}
      onPointerLeave={tilt.onLeave}
    >
      <span className="ch-step-card-halo" aria-hidden="true" />
      <span className="ch-step-card-glow" aria-hidden="true" />
      <span className="ch-product-card-rail" aria-hidden="true" />

      <header
        className="ch-step-card-header"
        style={{ alignItems: "center", justifyContent: "space-between", gap: "0.6rem" }}
      >
        <Icon className="gs-card-icon" aria-hidden="true" />
        {card.status && (
          <span className="ch-status" data-status={card.status}>
            {STATUS_LABEL[card.status]}
          </span>
        )}
      </header>

      <h3 className="ch-step-card-title" style={{ marginTop: 4, fontSize: "1.35rem" }}>
        {card.title}
      </h3>

      {card.body && <p className="ch-step-card-body">{card.body}</p>}

      {card.bullets && (
        <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
          {card.bullets.map((b) => (
            <li
              key={b}
              className="ch-step-card-body flex items-start gap-2"
              style={{ fontSize: "0.875rem" }}
            >
              <span aria-hidden="true" style={{ color: "#fbbf24", marginTop: 1 }}>
                •
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Sections                                                           */
/* ------------------------------------------------------------------ */

function HeroSection() {
  return (
    <section
      className="ch-section relative overflow-hidden"
      style={{ paddingTop: "6.5rem", paddingBottom: "3.5rem" }}
    >
      {/* Ambient warm glow behind the copy. */}
      <div
        aria-hidden="true"
        className="absolute -top-24 -left-24 w-[520px] h-[520px] rounded-full pointer-events-none"
        style={{ background: "rgba(245,158,11,0.10)", filter: "blur(120px)" }}
      />
      <div className="ch-container relative">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-14 items-center">
          <FadeInUp className="flex flex-col gap-5 items-start text-left">
            <span className="gs-live-badge">
              <span className="gs-live-dot" aria-hidden="true" />
              Live on Nasun Devnet
            </span>

            <p
              className="m-0 -ml-1 text-6xl sm:text-7xl lg:text-8xl"
              style={{
                fontFamily: '"Playfair Display", Georgia, serif',
                fontStyle: "italic",
                fontWeight: 600,
                lineHeight: 0.9,
                letterSpacing: "-0.01em",
                backgroundImage:
                  "linear-gradient(135deg, #fff8dc 0%, #f5e08a 28%, #d4af37 62%, #b8860b 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                WebkitTextFillColor: "transparent",
              }}
            >
              GoStop
            </p>

            <h1 className="ch-display" style={{ maxWidth: "20ch" }}>
              A luxury onchain casino.{" "}
              <span className="gs-accent">Provably fair.</span>
            </h1>

            <p className="ch-lead">
              Five games live on devnet, every round committed and revealed on
              chain. A self-custodial bankroll, auditable odds, and payouts that
              settle in seconds.
            </p>

            <div className="flex flex-wrap gap-3 mt-1">
              <a
                href={GOSTOP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="ch-btn ch-btn-lg ch-btn-primary"
                style={{ color: "#000" }}
              >
                Enter the Floor
              </a>
              <a
                href={`${GOSTOP_URL}/leaderboard`}
                target="_blank"
                rel="noopener noreferrer"
                className="ch-btn ch-btn-lg ch-btn-ghost"
              >
                Leaderboard
              </a>
            </div>

            <div className="flex items-stretch gap-5 sm:gap-7 mt-3">
              {HERO_STATS.map((stat, i) => (
                <React.Fragment key={stat.label}>
                  {i > 0 && <span className="gs-stat-divider" aria-hidden="true" />}
                  <div className="flex flex-col">
                    <span className="gs-stat-num">{stat.value}</span>
                    <span className="gs-stat-label">{stat.label}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </FadeInUp>

          <FadeInUp delayMs={140}>
            <figure className="gs-hero-shot">
              <img
                src={lotteryImg}
                alt="GoStop onchain lottery"
                width={1024}
                height={1024}
                decoding="async"
              />
              {/* Warm wash + bottom fade to seat the render in the palette. */}
              <div
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(160deg, rgba(245,158,11,0.10) 0%, rgba(0,0,0,0) 45%), linear-gradient(to top, rgba(12,8,5,0.85) 0%, rgba(12,8,5,0) 40%)",
                }}
              />
            </figure>
          </FadeInUp>
        </div>
      </div>
    </section>
  );
}

function FloorSection() {
  const gridRef = useGridSpotlight<HTMLDivElement>();
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow">01 / On the floor</span>
        <h2 className="ch-display">
          Five formats live, <span className="gs-accent">more queued</span>.
        </h2>
        <p className="ch-lead">
          Every game settles on Nasun devnet with commit-reveal randomness and a
          shared bankroll. Tap in, the chain does the rest.
        </p>
      </FadeInUp>

      <div ref={gridRef} className="gs-game-grid">
        {LIVE_GAMES.map((game, i) => (
          <FadeInUp key={game.title} delayMs={100 + i * 60}>
            <a
              href={game.href}
              target="_blank"
              rel="noopener noreferrer"
              className="gs-game-card"
              data-spotlight-card=""
            >
              <span className="ch-step-card-glow" aria-hidden="true" />
              <div className="gs-game-media">
                <img
                  src={game.thumb}
                  alt={game.title}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="gs-game-body">
                <div className="flex items-center justify-between gap-2">
                  <h3
                    className="ch-step-card-title"
                    style={{ marginTop: 0, fontSize: "1.3rem" }}
                  >
                    {game.title}
                  </h3>
                  <ArrowUpRight
                    className="w-4 h-4 shrink-0"
                    style={{ color: "#fcd34d" }}
                    aria-hidden="true"
                  />
                </div>
                <p className="ch-step-card-body">{game.tagline}</p>
              </div>
            </a>
          </FadeInUp>
        ))}
      </div>
    </ChSection>
  );
}

function MarketSection() {
  const gridRef = useGridSpotlight<HTMLDivElement>();
  const tilt = useCardTilt();
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow ch-eyebrow-cyan">
          02 / A sector hitting escape velocity
        </span>
        <h2 className="ch-display">
          Crypto-native gambling is{" "}
          <span className="gs-accent">no longer a side bet</span>.
        </h2>
        <p className="ch-lead">
          Onchain casinos crossed an estimated $80B+ wagered in 2024 and keep
          pacing higher. Custody returns to the player, the house edge becomes
          auditable, and game logic stops being a black box behind a license.
        </p>
      </FadeInUp>

      <div ref={gridRef} className="ch-step-grid gs-products-grid">
        {FORCES.map((card, i) => (
          <FadeInUp key={card.title} delayMs={120 + i * 70}>
            <InfoCard card={card} tilt={tilt} />
          </FadeInUp>
        ))}
      </div>

      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <h3 className="ch-step-card-title" style={{ marginTop: 0, fontSize: "1.5rem" }}>
          Where the category goes next
        </h3>
        <ul className="flex flex-col gap-3 list-none p-0 m-0">
          {NEXT.map((item) => (
            <li key={item.head} className="ch-body flex gap-3">
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  backgroundColor: "#fbbf24",
                  marginTop: 10,
                  flexShrink: 0,
                }}
              />
              <span>
                <span className="font-medium" style={{ color: "var(--ch-fg-display)" }}>
                  {item.head}.
                </span>{" "}
                {item.body}
              </span>
            </li>
          ))}
        </ul>
      </FadeInUp>
    </ChSection>
  );
}

function EdgeSection() {
  const gridRef = useGridSpotlight<HTMLDivElement>();
  const tilt = useCardTilt();
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow">03 / Where GoStop competes</span>
        <h2 className="ch-display">
          Built for the onchain era{" "}
          <span className="gs-accent">from day one</span>.
        </h2>
        <p className="ch-lead">
          GoStop isn't a casino bolted onto a chain. It's a casino designed for
          one, with five live games today and a roadmap into formats legacy
          operators can't ship.
        </p>
      </FadeInUp>

      <ul
        className="list-none p-0 m-0 flex flex-col"
        style={{ borderTop: "1px solid var(--ch-divider)" }}
      >
        {EDGE.map((item, i) => (
          <FadeInUp key={item.label} delayMs={90 + i * 70}>
            <li
              className="grid grid-cols-1 sm:grid-cols-[220px_minmax(0,1fr)] gap-1.5 sm:gap-10"
              style={{
                padding: "1.25rem 0 1.4rem",
                borderBottom: "1px solid var(--ch-divider)",
              }}
            >
              <h3
                className="ch-step-card-title"
                style={{ marginTop: 0, fontSize: "1.2rem" }}
              >
                {item.label}
              </h3>
              <p className="ch-step-card-body" style={{ marginTop: 0 }}>
                {item.body}
              </p>
            </li>
          </FadeInUp>
        ))}
      </ul>

      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <h3 className="ch-step-card-title" style={{ marginTop: 0, fontSize: "1.5rem" }}>
          Under the hood
        </h3>
      </FadeInUp>
      <div ref={gridRef} className="ch-step-grid gs-products-grid" style={{ marginTop: "-2.5rem" }}>
        {TECH.map((card, i) => (
          <FadeInUp key={card.title} delayMs={120 + i * 70}>
            <InfoCard card={card} tilt={tilt} />
          </FadeInUp>
        ))}
      </div>
    </ChSection>
  );
}

function StatusColumn({
  eyebrow,
  Icon,
  color,
  items,
}: {
  eyebrow: string;
  Icon: ComponentType<LucideProps>;
  color: string;
  items: string[];
}) {
  return (
    <FadeInUp className="flex flex-col gap-3">
      <p className="flex items-center gap-2 m-0 font-medium" style={{ color }}>
        <Icon className="w-5 h-5" aria-hidden="true" />
        {eyebrow}
      </p>
      <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
        {items.map((item) => (
          <li key={item} className="ch-body flex gap-3">
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 5,
                height: 5,
                borderRadius: 999,
                backgroundColor: color,
                marginTop: 10,
                flexShrink: 0,
              }}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </FadeInUp>
  );
}

function RoadmapSection() {
  const gridRef = useGridSpotlight<HTMLDivElement>();
  const tilt = useCardTilt();
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow ch-eyebrow-cyan">04 / On the rail</span>
        <h2 className="ch-display">
          The floor keeps <span className="gs-accent">growing</span>.
        </h2>
        <p className="ch-lead">
          New formats and a player-owned bankroll are in active development.
        </p>
      </FadeInUp>

      <div ref={gridRef} className="ch-step-grid">
        {ROADMAP.map((card, i) => (
          <FadeInUp key={card.title} delayMs={110 + i * 70}>
            <InfoCard card={card} tilt={tilt} />
          </FadeInUp>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
        <StatusColumn
          eyebrow="Playable now"
          Icon={CheckCircle2}
          color="#34d399"
          items={LIVE_NOW}
        />
        <StatusColumn
          eyebrow="In development"
          Icon={Hourglass}
          color="#fbbf24"
          items={IN_DEV}
        />
      </div>
    </ChSection>
  );
}

function CtaSection() {
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-6 items-start text-left max-w-4xl">
        <span className="ch-eyebrow ch-eyebrow-cyan">05 / Take the floor</span>
        <h2 className="ch-display">
          Provably fair. <span className="gs-accent">Settled on chain</span>.
        </h2>
        <p className="ch-lead">
          GoStop is live on Nasun devnet. Self-custodial sign-in, auditable
          odds, instant settlement.
        </p>
        <div className="flex flex-wrap gap-3 mt-1">
          <a
            href={GOSTOP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ch-btn ch-btn-lg ch-btn-primary"
            style={{ color: "#000" }}
          >
            Enter the Floor
          </a>
          <a
            href={`${GOSTOP_URL}/leaderboard`}
            target="_blank"
            rel="noopener noreferrer"
            className="ch-btn ch-btn-lg ch-btn-ghost"
          >
            View Leaderboard
          </a>
        </div>
      </FadeInUp>

      <FadeInUp>
        <div className="gs-disclaimer">
          <p
            className="ch-eyebrow m-0"
            style={{ fontSize: "0.625rem", letterSpacing: "0.25em" }}
          >
            Disclaimer
          </p>
          <p className="ch-body" style={{ marginTop: "0.6rem", marginBottom: 0 }}>
            GoStop is a proof-of-concept prototype operating on Nasun devnet,
            provided strictly for testing and entertainment. It is not a
            financial product. All tokens and balances shown on the site are
            test assets that hold no monetary value and cannot be redeemed. The
            devnet may be reset at any time without prior notice, which will
            erase all balances, history, and game state.
          </p>
        </div>
      </FadeInUp>
    </ChSection>
  );
}

function GostopSection() {
  return (
    <>
      <HeroSection />
      <FloorSection />
      <MarketSection />
      <EdgeSection />
      <RoadmapSection />
      <CtaSection />
    </>
  );
}

export default React.memo(GostopSection);
