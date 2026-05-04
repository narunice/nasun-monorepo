import type { FC } from "react";
import type { BonusFeedEntry } from "@/services/ecosystemScoreApi";
import {
  classifyEntry,
  VARIANTS,
  cumulativeLabelFor,
} from "./slideVariants";
import { SlideShell, Icon, tagIconColor } from "./sharedSlideUI";
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

  const m = entry.metadata ?? {};
  const rankDelta = typeof m.rankDelta === "number" ? m.rankDelta : null;
  const previousRank = typeof m.previousRank === "number" ? m.previousRank : null;
  const rank = typeof m.rank === "number" ? m.rank : null;
  const weekId = typeof m.weekId === "string" ? m.weekId : null;
  const isLeaderboard = kind === "leaderboard-eco" || kind === "leaderboard-pado";
  const isNewEntrant = isLeaderboard && previousRank == null && rank != null;
  const isTopTen = isLeaderboard && rank != null && rank <= 10;

  const awardedDate = new Date(entry.awardedAt);
  const dateLabel = awardedDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const watermark =
    kind === "leaderboard-pado" ? "pado.finance" : "nasun.io";

  return (
    <SlideShell
      glowGradient={variant.glowGradient}
      watermark={watermark}
      overlay={isTopTen ? <ConfettiBurst /> : undefined}
    >
      <div className="relative h-full flex flex-col px-4 sm:px-5 pt-5 sm:pt-6 pb-8 sm:pb-9">
        <div className="flex flex-col items-center text-center gap-3 sm:gap-4">
          <p className="text-base sm:text-xl font-extrabold tracking-[0.22em] bg-clip-text text-transparent bg-gradient-to-r from-pado-lavender via-pink-300 to-pink-400 drop-shadow-[0_1px_8px_rgba(244,114,182,0.25)]">
            CONGRATULATIONS!
          </p>

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

          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-5xl sm:text-6xl font-black tabular-nums tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-green-400 via-pado-4 to-pado-5 drop-shadow-[0_2px_14px_rgba(134,243,183,0.25)] leading-none">
              +{formatPoints(entry.points)}
            </span>
            <span className="text-base font-semibold text-white/75">
              PTS
            </span>
          </div>
        </div>

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
    </SlideShell>
  );
};

function formatPoints(n: number): string {
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
