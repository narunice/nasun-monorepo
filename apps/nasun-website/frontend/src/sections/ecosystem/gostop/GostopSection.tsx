import React from "react";
import {
  Crown,
  Coins,
  ShieldCheck,
  Sparkles,
  Wallet,
  TrendingUp,
  Trophy,
  Cpu,
  Layers,
  ArrowUpRight,
  CheckCircle2,
  Hourglass,
} from "lucide-react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { DividerBox } from "@/components/ui/DividerBox";
import { OuterBox, FadeInUp } from "@/components/ui";
import lotteryImg from "@/assets/images/lottery.webp";

const GOSTOP_URL = "https://gostop.app";

// Hero stat values — update these manually or replace with API-driven data
const HERO_STATS = [
  { value: "5", label: "Live Games" },
  { value: "3,347", label: "Active Gamers" },
  { value: "8m 42s", label: "Avg. Session" },
] as const;

const liveGames: Array<{
  title: string;
  tagline: string;
  thumb: string;
  href: string;
}> = [
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

function GostopSection() {
  return (
    <SectionLayout className="!max-w-6xl">
      <div className="flex flex-col gap-10 md:gap-12 lg:gap-14">
        {/* ========== HERO ========== */}
        <div className="flex flex-col items-center text-center">
          <FadeInUp>
            <PageTitle>GoStop</PageTitle>
            <h5 className="-mt-4 md:-mt-6 lg:-mt-8 font-medium">
              A luxury onchain casino. Provably fair. Settled on chain.
            </h5>
          </FadeInUp>
        </div>

        <FadeInUp delay="0.15s">
          <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-[#0c0805]">
            {/* Dot grid texture */}
            <div
              className="absolute inset-0 opacity-[0.035] pointer-events-none"
              style={{
                backgroundImage:
                  "radial-gradient(circle, #f9a824 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />

            {/* Ambient top-left glow */}
            <div className="absolute -top-40 -left-20 w-[500px] h-[500px] bg-amber-500/8 rounded-full blur-3xl pointer-events-none" />

            <div className="relative flex flex-col lg:flex-row">
              {/* Text panel */}
              <div className="flex-1 flex flex-col justify-center gap-6 md:gap-7 px-8 py-12 md:px-12 md:py-16 lg:px-14 lg:py-20">
                {/* Live badge */}
                <div className="inline-flex items-center gap-2 self-start px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs uppercase tracking-[0.15em] text-amber-200/80">
                    Live on Nasun Devnet
                  </span>
                </div>

                {/* Card title */}
                <div className="-ml-1">
                  <h2
                    className="leading-[0.88] tracking-tight text-transparent bg-clip-text"
                    style={{
                      fontSize: "clamp(72px, 12vw, 144px)",
                      fontFamily: '"Cormorant Garamond", serif',
                      fontStyle: "italic",
                      fontWeight: 500,
                      backgroundImage:
                        "linear-gradient(135deg, #fef3c7 0%, #fbbf24 45%, #d97706 100%)",
                    }}
                  >
                    GoStop
                  </h2>
                </div>

                {/* Stat strip */}
                <div className="flex items-center gap-5 md:gap-7">
                  {HERO_STATS.map((stat, i) => (
                    <React.Fragment key={stat.label}>
                      {i > 0 && (
                        <div className="w-px h-7 bg-amber-500/20 shrink-0" />
                      )}
                      <div>
                        <div className="text-base md:text-xl font-bold text-amber-200">
                          {stat.value}
                        </div>
                        <div className="text-sm text-nasun-white/40 uppercase tracking-wider mt-0.5">
                          {stat.label}
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
                </div>

                {/* CTA */}
                <div>
                  <a
                    href={GOSTOP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-black font-semibold text-sm tracking-wide transition-all duration-200 hover:-translate-y-px"
                    style={{
                      backgroundImage:
                        "linear-gradient(135deg, #f2d67b 0%, #d4af37 50%, #b68d22 100%)",
                      boxShadow:
                        "inset 0 1px 0 rgba(255,255,255,0.2), 0 0 20px -5px rgba(212,175,55,0.4)",
                    }}
                  >
                    Enter the Floor <ArrowUpRight className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Image panel */}
              <div className="relative lg:w-[420px] xl:w-[500px] shrink-0 overflow-hidden">
                {/* Left fade mask — blends image into text panel on desktop */}
                <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-[#0c0805] to-transparent z-10 pointer-events-none hidden lg:block" />

                <div className="relative aspect-square lg:aspect-auto lg:h-full min-h-[280px] sm:min-h-[360px]">
                  <img
                    src={lotteryImg}
                    alt="GoStop Lottery"
                    className="w-full h-full object-cover object-center"
                  />

                  {/* Warm overlay to tie image into page palette */}
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-950/50 via-transparent to-amber-900/20 pointer-events-none" />

                  {/* Bottom fade on mobile */}
                  <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-[#0c0805] to-transparent lg:hidden pointer-events-none" />
                </div>
              </div>
            </div>
          </div>
        </FadeInUp>

        {/* ========== WHY CRYPTO CASINOS ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4">
              A SECTOR HITTING ESCAPE VELOCITY
            </SectionTitle>
            <h5 className="font-normal text-nasun-white/80 mb-0 md:mb-1 lg:mb-2">
              Crypto-native gambling is no longer a side bet.
            </h5>
          </FadeInUp>
          <FadeInUp delay="0.1s">
            <div className="space-y-3">
              <p>
                Onchain casinos crossed an estimated{" "}
                <span className="font-semibold text-amber-200">
                  $80B+ wagered in 2024
                </span>{" "}
                and are pacing higher into 2026 as regulated audiences look for
                venues that settle on transparent rails. The shift mirrors what
                DeFi did to spot trading: custody returns to the player, the
                house's edge becomes auditable, and the game logic stops being a
                black box behind a license.
              </p>
              <p>Three forces are pulling players in:</p>
            </div>
          </FadeInUp>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
            {[
              {
                icon: <ShieldCheck className="w-5 h-5" />,
                title: "Provable Fairness",
                body: "Commit-reveal salts and onchain RNG remove the operator's ability to silently tilt the odds. Anyone can replay the math.",
              },
              {
                icon: <Wallet className="w-5 h-5" />,
                title: "Self-Custody",
                body: "No wallet provider holds the bankroll. Withdrawals settle as native tokens; deposits never leave the chain.",
              },
              {
                icon: <TrendingUp className="w-5 h-5" />,
                title: "Open Liquidity",
                body: "House liquidity becomes a public market. LPs become the casino, and edge becomes yield.",
              },
            ].map((card, i) => (
              <FadeInUp key={card.title} delay={`${0.15 + i * 0.05}s`}>
                <DividerBox
                  color="w4"
                  hideDivider
                  padding="sm"
                  title={card.title}
                  icon={card.icon}
                  className="h-full"
                >
                  <p>{card.body}</p>
                </DividerBox>
              </FadeInUp>
            ))}
          </div>
        </section>

        {/* ========== WHERE IT'S HEADED ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4">WHERE THE CATEGORY GOES NEXT</SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.1s">
            <div className="space-y-3">
              <p>
                The next wave of onchain casinos competes on three axes that the
                legacy stack can't reach:
              </p>
              <ul className="space-y-2">
                {[
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
                ].map((item) => (
                  <li
                    key={item.head}
                    className="flex items-start gap-3 text-nasun-white/80"
                  >
                    <span className="text-amber-300 mt-0.5 shrink-0 text-xs">
                      ▶
                    </span>
                    <span>
                      <span className="font-semibold text-nasun-white">
                        {item.head}.
                      </span>{" "}
                      {item.body}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </FadeInUp>
        </section>

        {/* ========== GOSTOP'S EDGE ========== */}
        <section>
          <FadeInUp>
            <OuterBox
              color="w1"
              padding="lg"
              className="!bg-[#19130a] relative"
            >
              <div className="flex items-center gap-2 mb-3 md:mb-0 md:absolute md:top-5 md:right-5">
                <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap bg-amber-500/20 text-amber-300">
                  Onchain
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap bg-amber-500/20 text-amber-300">
                  Provably Fair
                </span>
              </div>
              <div className="mb-4">
                <h4 className="!font-rubik uppercase font-medium text-xl md:text-2xl lg:text-3xl">
                  WHERE GOSTOP COMPETES
                  <span className="block md:inline text-base md:text-lg lg:text-xl text-nasun-white/50 font-normal mt-1 md:mt-0 md:ml-3">
                    — Built for the on-chain era from day one
                  </span>
                </h4>
              </div>
              <div className="space-y-4">
                <p className="text-nasun-white/90">
                  GoStop isn't a casino bolted onto a chain. It's a casino
                  designed for one. Five live games today; a roadmap that pushes
                  into the formats legacy operators can't ship.
                </p>
                <ul className="space-y-2 py-2">
                  {[
                    {
                      label: "Sub-second feedback loops",
                      body: "Crash uses a server-broadcast multiplier curve with on-chain verification. Mines reveals snap instantly with a deferred ledger commit.",
                    },
                    {
                      label: "One bankroll, every game",
                      body: "A single shared treasury settles every payout. LP into the bankroll once and earn edge across all formats.",
                    },
                    {
                      label: "Production-grade UX",
                      body: "Wallet flows that hide chain friction, celebration tiers tuned to actual win amounts, mobile-first layouts, and result modals that turn a bust into a moment.",
                    },
                    {
                      label: "Composable identity",
                      body: "Every player is a Nasun account. Game history, points, and Alliance NFT membership carry across the rest of the ecosystem.",
                    },
                  ].map((item) => (
                    <li
                      key={item.label}
                      className="flex items-start gap-3 text-nasun-white/80"
                    >
                      <span className="text-amber-300 mt-0.5 shrink-0 text-xs">
                        ▶
                      </span>
                      <span>
                        <span className="font-semibold text-nasun-white">
                          {item.label}.
                        </span>{" "}
                        {item.body}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </OuterBox>
          </FadeInUp>
        </section>

        {/* ========== CURRENT GAMES ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4">ON THE FLOOR</SectionTitle>
            <h5 className="font-normal text-nasun-white/80 mb-0 md:mb-1 lg:mb-2">
              Five formats live. More queued.
            </h5>
          </FadeInUp>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
            {liveGames.map((game, i) => (
              <FadeInUp key={game.title} delay={`${0.1 + i * 0.04}s`}>
                <a
                  href={game.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block h-full overflow-hidden rounded-lg border border-amber-500/20 bg-[#0d0a05] hover:border-amber-500/50 hover:-translate-y-0.5 transition-all"
                >
                  <div className="aspect-square overflow-hidden border-b border-amber-500/20">
                    <img
                      src={game.thumb}
                      alt={game.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <h5 className="font-rubik text-amber-200 text-lg md:text-xl uppercase tracking-wide">
                        {game.title}
                      </h5>
                      <ArrowUpRight className="w-4 h-4 text-amber-300/60 group-hover:text-amber-200 transition-colors" />
                    </div>
                    <p className="text-sm text-nasun-white/70 mt-1.5">
                      {game.tagline}
                    </p>
                  </div>
                </a>
              </FadeInUp>
            ))}
          </div>
        </section>

        {/* ========== ROADMAP ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4">ON THE RAIL</SectionTitle>
          </FadeInUp>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                icon: <Sparkles className="w-5 h-5" />,
                title: "Plinko",
                body: "Drop a chip from the top, watch it bounce through golden pegs. Pick low, medium, or high risk to shape the payout curve.",
              },
              {
                icon: <Crown className="w-5 h-5" />,
                title: "Roulette",
                body: "Classic European single-zero roulette settled on chain. Numbers, splits, colors, columns — multiplayer table coming.",
              },
              {
                icon: <Trophy className="w-5 h-5" />,
                title: "Wheel",
                body: "A nightly community wheel. Stake to enter, spin together at the cutoff, split a pooled prize. Daily plus weekly mega rounds.",
              },
              {
                icon: <Coins className="w-5 h-5" />,
                title: "Bankroll Vault",
                body: "Open the casino's treasury to LPs. Deposit NUSDC, become the house, take edge as yield, withdraw any time.",
              },
            ].map((card, i) => (
              <FadeInUp key={card.title} delay={`${0.1 + i * 0.05}s`}>
                <DividerBox
                  color="c1"
                  hideDivider
                  padding="sm"
                  title={card.title}
                  icon={card.icon}
                  className="h-full !bg-black/30"
                >
                  <p>{card.body}</p>
                </DividerBox>
              </FadeInUp>
            ))}
          </div>
        </section>

        {/* ========== TECHNICAL FOUNDATION ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4">UNDER THE HOOD</SectionTitle>
          </FadeInUp>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: <Cpu className="w-5 h-5" />,
                title: "Move-based settlement",
                bullets: [
                  "Move contracts on Nasun Devnet",
                  "Object model for per-round state",
                  "Sub-second tx finality on consensus",
                ],
              },
              {
                icon: <ShieldCheck className="w-5 h-5" />,
                title: "Commit-reveal randomness",
                bullets: [
                  "Salt committed before betting opens",
                  "Reveal verifies the round on close",
                  "No operator can rewrite outcomes",
                ],
              },
              {
                icon: <Layers className="w-5 h-5" />,
                title: "Single bankroll",
                bullets: [
                  "Shared treasury across every game",
                  "Per-game caps to bound max payout",
                  "Edge accrues to one liquidity layer",
                ],
              },
            ].map((card, i) => (
              <FadeInUp key={card.title} delay={`${0.15 + i * 0.05}s`}>
                <DividerBox
                  color="w4"
                  hideDivider
                  padding="sm"
                  title={card.title}
                  icon={card.icon}
                  className="h-full"
                >
                  <ul className="space-y-1.5">
                    {card.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="flex items-start gap-2 text-nasun-white/80 text-sm"
                      >
                        <span className="text-amber-300 shrink-0 mt-0.5 text-xs">
                          •
                        </span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </DividerBox>
              </FadeInUp>
            ))}
          </div>
        </section>

        {/* ========== STATUS ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4">WHAT'S LIVE NOW</SectionTitle>
          </FadeInUp>
          <div className="space-y-6">
            <div>
              <FadeInUp delay="0.1s">
                <p className="text-emerald-400 font-medium text-lg mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Devnet Prototype (Playable)
                </p>
              </FadeInUp>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  "Five live games on gostop.app",
                  "Provably fair commit-reveal randomness",
                  "Shared bankroll across every game",
                  "Wallet, zkLogin, and passkey sign-in",
                ].map((item, i) => (
                  <FadeInUp key={item} delay={`${0.15 + i * 0.03}s`}>
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4">
                      <p className="text-nasun-white font-medium text-sm md:text-base">
                        {item}
                      </p>
                    </div>
                  </FadeInUp>
                ))}
              </div>
            </div>
            <div>
              <FadeInUp delay="0.1s">
                <p className="text-amber-400 font-medium text-lg mb-3 flex items-center gap-2">
                  <Hourglass className="w-5 h-5" />
                  In Development
                </p>
              </FadeInUp>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  "Plinko, Roulette, Wheel",
                  "Bankroll Vault for LP house edge",
                  "Tournaments and seasonal pools",
                  "Cross-game leaderboards",
                ].map((item, i) => (
                  <FadeInUp key={item} delay={`${0.15 + i * 0.03}s`}>
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
                      <p className="text-nasun-white font-medium text-sm md:text-base">
                        {item}
                      </p>
                    </div>
                  </FadeInUp>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ========== DISCLAIMER ========== */}
        <section>
          <FadeInUp>
            <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-5 md:p-6">
              <p className="text-xs uppercase tracking-[0.25em] text-amber-200 mb-2">
                Disclaimer
              </p>
              <p className="text-sm md:text-base text-amber-100/90 leading-relaxed">
                GoStop is a proof-of-concept prototype operating on Nasun
                Devnet, provided strictly for testing and entertainment. It is
                not a financial product. All tokens and balances shown on the
                site are test assets that hold no monetary value and cannot be
                redeemed. The devnet may be reset at any time without prior
                notice, which will erase all balances, history, and game state.
              </p>
            </div>
          </FadeInUp>
        </section>

        {/* ========== CTA ========== */}
        <section>
          <FadeInUp>
            <div className="text-center">
              <h5 className="font-medium mb-4">Ready to take the floor?</h5>
              <a
                href={GOSTOP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors"
              >
                Visit gostop.app <ArrowUpRight className="w-4 h-4" />
              </a>
            </div>
          </FadeInUp>
        </section>
      </div>
    </SectionLayout>
  );
}

export default React.memo(GostopSection);
