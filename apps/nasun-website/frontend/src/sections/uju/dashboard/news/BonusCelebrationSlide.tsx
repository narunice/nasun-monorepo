import type { FC } from "react";
import type { BonusFeedEntry } from "@/services/ecosystemScoreApi";
import {
  classifyEntry,
  VARIANTS,
  cumulativeLabelFor,
  type IconKey,
} from "./slideVariants";
import { ConfettiBurst } from "./ConfettiBurst";

interface Props {
  entry: BonusFeedEntry;
  cumulative?: number;
}

// Single celebration card. Designed to look good as a screenshot crop, so the
// composition holds at 1080x1080 (square share) and 1200x630 (wide share).
export const BonusCelebrationSlide: FC<Props> = ({ entry, cumulative }) => {
  const kind = classifyEntry(entry);
  const variant = VARIANTS[kind];
  const subline = variant.buildSubline(entry);

  // Rank delta arrow (leaderboard variants only). null means we skip it.
  const m = entry.metadata ?? {};
  const rankDelta = typeof m.rankDelta === "number" ? m.rankDelta : null;
  const previousRank = typeof m.previousRank === "number" ? m.previousRank : null;
  const rank = typeof m.rank === "number" ? m.rank : null;
  const weekId = typeof m.weekId === "string" ? m.weekId : null;
  const isLeaderboard = kind === "leaderboard-eco" || kind === "leaderboard-pado";
  const isNewEntrant = isLeaderboard && previousRank == null && rank != null;
  // Top 10 finishers earn a one-time confetti burst when the slide enters view.
  const isTopTen = isLeaderboard && rank != null && rank <= 10;

  const awardedDate = new Date(entry.awardedAt);
  const dateLabel = awardedDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="relative w-full h-full overflow-hidden rounded-md">
      {/* Glow background layers */}
      <div className={`absolute inset-0 ${variant.glowGradient}`} aria-hidden />
      {/* Subtle grain for shareable polish */}
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
        aria-hidden
      />
      {/* Decorative sparkles in opposing corners for celebration vibe */}
      <Sparkle className="absolute top-3 right-12 w-4 h-4 text-pado-3/30" />
      <Sparkle className="absolute bottom-10 left-4 w-3 h-3 text-pado-3/25" />
      <Sparkle className="absolute top-12 left-10 w-2.5 h-2.5 text-nasun-c3/30" />

      {/* Confetti burst for top-10 leaderboard finishers */}
      {isTopTen && <ConfettiBurst />}

      {/* Watermark anchored top-right. Category-aware: Pado leaderboard
          rewards point to pado.finance; everything else to nasun.io. */}
      <span className="absolute top-3 right-4 sm:right-5 text-xs text-uju-secondary/60 tabular-nums z-10">
        {watermarkFor(kind)}
      </span>

      {/* Content. Top-anchored layout: CONGRATULATIONS! sits near the top so
          the points number reads in the upper-middle of the card rather than
          the dead center. Footer pinned to bottom with mt-auto. */}
      <div className="relative h-full flex flex-col px-4 sm:px-5 pt-5 sm:pt-6 pb-8 sm:pb-9">
        {/* Hero stack at top */}
        <div className="flex flex-col items-center text-center gap-3 sm:gap-4">
          {/* CONGRATULATIONS! eyebrow — lavender-to-pink gradient text so it
              pops against the white headline + green points hero below. */}
          <p className="text-base sm:text-xl font-extrabold tracking-[0.22em] bg-clip-text text-transparent bg-gradient-to-r from-pado-lavender via-pink-300 to-pink-400 drop-shadow-[0_1px_8px_rgba(244,114,182,0.25)]">
            CONGRATULATIONS!
          </p>

          {/* Headline — leaderboard name + (when applicable) inline rank
              and rank-delta arrow on the same line. Plain white so it reads
              as the calm anchor between the colorful eyebrow and the green
              points hero. */}
          <h3 className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-lg sm:text-xl font-semibold text-white leading-tight">
            <span className="inline-flex items-center gap-2">
              <Icon
                name={variant.iconKey}
                className={`w-5 h-5 ${tagIconColor(kind)}`}
              />
              <span>
                {isLeaderboard ? leaderboardLabel(kind) : variant.headline}
              </span>
            </span>
            {isLeaderboard && rank != null && (
              <span className="inline-flex items-baseline gap-2 tabular-nums">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-nasun-c1 to-nasun-c2 drop-shadow-[0_1px_6px_rgba(249,168,36,0.25)]">
                  Rank{" "}
                  <span className="font-extrabold">#{rank}</span>
                </span>
                {rankDelta != null && rankDelta !== 0 && (
                  <RankDeltaInline delta={rankDelta} />
                )}
              </span>
            )}
          </h3>

          {/* Points hero — centered big number with green-to-pado-5 gradient
              (the celebratory color). Rank for leaderboard cards is placed
              in the footer-left line alongside NEW / rank-delta. */}
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className="text-5xl sm:text-6xl font-black tabular-nums tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-green-400 via-pado-4 to-pado-5 drop-shadow-[0_2px_14px_rgba(134,243,183,0.25)] leading-none"
            >
              +{formatPoints(entry.points)}
            </span>
            <span className="text-base font-semibold text-white/75">
              PTS
            </span>
          </div>
        </div>

        {/* Footer pushed to the bottom: NEW badge + weekId/subline + cumulative
            on the left, date pinned right. Rank + delta arrow live in the
            headline now and are intentionally not duplicated here. */}
        <div className="mt-auto flex items-center justify-between text-xs sm:text-sm text-uju-secondary/70 gap-3">
          <span className="truncate flex items-center gap-2 min-w-0">
            {isNewEntrant && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-pado-3/20 text-pado-3 border border-pado-3/40">
                NEW
              </span>
            )}
            <span className="truncate">
              {isLeaderboard && weekId
                ? weekId
                : subline ?? ""}
              {cumulative != null && cumulative > 0 && (
                <>
                  {(isLeaderboard && weekId) || subline ? " · " : ""}
                  {cumulativeLabelFor(kind)}:{" "}
                  <span className="text-uju-secondary tabular-nums">
                    {formatPoints(cumulative)} pts
                  </span>
                </>
              )}
            </span>
          </span>
          <span className="tabular-nums shrink-0">{dateLabel}</span>
        </div>
      </div>
    </div>
  );
};

// Per-category top-right watermark. Pado leaderboard rewards live in the
// Pado app, so they point at pado.finance; everything else routes back to
// the Nasun homepage.
function watermarkFor(kind: ReturnType<typeof classifyEntry>): string {
  if (kind === "leaderboard-pado") return "pado.finance";
  return "nasun.io";
}

const Sparkle: FC<{ className?: string }> = ({ className }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5z" />
  </svg>
);

function formatPoints(n: number): string {
  // Whole numbers without decimals; fractional referral bonuses get 2 places.
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function leaderboardLabel(kind: ReturnType<typeof classifyEntry>): string {
  if (kind === "leaderboard-eco") return "Ecosystem Leaderboard";
  if (kind === "leaderboard-pado") return "Pado DeFi Leaderboard";
  return "";
}

// Inline icon color per category, picking the dominant gradient stop so the
// icon reads as part of the headline rather than a foreign chip.
function tagIconColor(kind: ReturnType<typeof classifyEntry>): string {
  switch (kind) {
    case "leaderboard-eco":
    case "airdrop-alliance":
      return "text-nasun-c3";
    case "leaderboard-pado":
    case "game":
    case "creator-post":
    case "creators-appreciation":
      return "text-pado-lavender";
    case "bugreport":
    case "feedback":
      return "text-pado-3";
    case "airdrop-gp":
    case "earlybird":
      return "text-nasun-c1";
    case "referral":
      return "text-nasun-coral";
    default:
      return "text-pado-3";
  }
}

// Inline arrow + delta number for the headline. No chip background since
// it sits inside a typographic line, not a row of metadata badges.
function RankDeltaInline({ delta }: { delta: number }) {
  const climbed = delta > 0;
  const arrow = climbed ? "▲" : "▼";
  const color = climbed ? "text-pado-4" : "text-uju-secondary";
  return (
    <span
      className={`text-xs sm:text-sm font-bold tabular-nums ${color}`}
      aria-label={
        climbed
          ? `Rank up ${Math.abs(delta)} positions this week`
          : `Rank down ${Math.abs(delta)} positions this week`
      }
    >
      {arrow} {Math.abs(delta)}
    </span>
  );
}

// Inline SVG icons keep bundle small and avoid an icon-pack dependency.
const Icon: FC<{ name: IconKey; className?: string }> = ({ name, className }) => {
  const common = {
    className: className ?? "w-4 h-4",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };
  switch (name) {
    case "trophy":
      return (
        <svg {...common}>
          <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
          <path d="M5 4H3v3a4 4 0 0 0 4 4M19 4h2v3a4 4 0 0 1-4 4" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M3 3v18h18" />
          <path d="M7 14l4-4 3 3 5-6" />
        </svg>
      );
    case "controller":
      return (
        <svg {...common}>
          <path d="M6 11h4M8 9v4M15 12h.01M18 10h.01" />
          <rect x="2" y="6" width="20" height="12" rx="6" />
        </svg>
      );
    case "bug":
      return (
        <svg {...common}>
          <path d="M8 6V4a4 4 0 0 1 8 0v2" />
          <rect x="6" y="6" width="12" height="14" rx="6" />
          <path d="M2 12h4M18 12h4M3 18l3-2M21 18l-3-2M3 6l3 2M21 6l-3 2" />
        </svg>
      );
    case "chat":
      return (
        <svg {...common}>
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      );
    case "gift":
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="4" />
          <path d="M12 8v13M5 12v9h14v-9M12 8S9 2 6 5s6 3 6 3M12 8s3-6 6-3-6 3-6 3" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "sunrise":
      return (
        <svg {...common}>
          <path d="M17 18a5 5 0 0 0-10 0M12 2v7M4.22 10.22l1.42 1.42M1 18h2M21 18h2M18.36 11.64l1.42-1.42M23 22H1M8 6l4-4 4 4" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "pen":
      return (
        <svg {...common}>
          <path d="M12 19l7-7 3 3-7 7-3-3z" />
          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          <path d="M2 2l7.586 7.586" />
        </svg>
      );
    case "sparkle":
    default:
      return (
        <svg {...common}>
          <path d="M12 3l1.9 4.6L18 9l-4.1 1.4L12 15l-1.9-4.6L6 9l4.1-1.4L12 3z" />
          <path d="M19 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2zM5 14l.7 2 2 .7-2 .7L5 19.4l-.7-2-2-.7 2-.7.7-2z" />
        </svg>
      );
  }
};
