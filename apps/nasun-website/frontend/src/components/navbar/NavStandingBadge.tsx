import { useState, useEffect } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  NSI_MAX_SCORE,
  TIER_BADGE_TOOLTIP_DESC,
  type Tier,
} from "@nasun/standing";

/**
 * Nasun Standing Index (NSI) badge.
 *
 * Reads the current user's tier + NSI score from
 * `${VITE_EXPLORER_API_URL}/standing/by-address/{wallet}`. Renders a tier pill
 * in the Navbar with a Radix Tooltip for the underlying breakdown on hover
 * (desktop) or tap (touch, via Radix's built-in pointer handling).
 *
 * Implementation notes:
 *   - useState + useEffect (no react-query) mirrors NavEcoPointsBadge so the
 *     two badges have identical lifecycle / cancellation semantics.
 *   - HTTP-layer caching: the explorer-api route sets
 *     `Cache-Control: public, max-age=60, Vary: Origin`. The browser and the
 *     nginx upstream cache absorb repeated hits; this component intentionally
 *     does NOT keep its own sessionStorage cache — HTTP cache is the SSOT for
 *     freshness.
 *   - Silent-fail: any fetch error keeps `data === null` and the badge is
 *     simply not rendered. No noisy fallback, no console spam.
 *   - Tooltip text strings come from `@nasun/standing/copy.ts` so wording
 *     stays consistent across surfaces (Pado / GoStop will reuse the same
 *     copy bundle in later phases).
 *   - Tooltip.Provider is mounted at the Navbar root — do not nest a new
 *     provider here.
 */

const EXPLORER_API = import.meta.env.VITE_EXPLORER_API_URL || "";

interface StandingData {
  tier: Tier;
  nsi_score: number;
  next_threshold: number | null;
  has_gp?: boolean;
}

interface NavStandingBadgeProps {
  walletAddress: string | null | undefined;
}

// Brand-neutral palette chosen for cross-app reuse in later phases.
// Tier 1 = light navy (nasun.nw4), Tier 2 = electric violet (pado.violet),
// Tier 3 = gold (nasun.c1).
const TIER_STYLES: Record<Tier, string> = {
  1: "bg-nasun-nw4/20 text-nasun-nw4 ring-nasun-nw4/40",
  2: "bg-pado-violet/20 text-pado-violet ring-pado-violet/40",
  3: "bg-nasun-c1/20 text-nasun-c1 ring-nasun-c1/50",
};

export function NavStandingBadge({ walletAddress }: NavStandingBadgeProps) {
  const [data, setData] = useState<StandingData | null>(null);

  useEffect(() => {
    if (!walletAddress || !EXPLORER_API) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `${EXPLORER_API}/standing/by-address/${encodeURIComponent(walletAddress)}`,
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (cancelled) return;
        if (
          typeof json?.tier === "number" &&
          json.tier >= 1 &&
          json.tier <= 3
        ) {
          setData({
            tier: json.tier as Tier,
            nsi_score: Number(json.nsi_score ?? 0),
            next_threshold:
              json.next_threshold === null ? null : Number(json.next_threshold),
            has_gp: Boolean(json.has_gp),
          });
        }
      } catch {
        // Silent fail — badge simply doesn't render.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  if (data === null) return null;

  const tierStyle = TIER_STYLES[data.tier];
  const scoreLabel = Math.round(data.nsi_score);
  const remainder =
    data.next_threshold !== null
      ? Math.max(0, data.next_threshold - data.nsi_score)
      : null;

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span
          className={`inline-flex items-center h-7 px-3 rounded-full text-xs font-semibold ring-1 ${tierStyle}`}
          data-testid="nav-standing-badge"
          aria-label={`Nasun Standing tier ${data.tier}, score ${scoreLabel} of ${NSI_MAX_SCORE}`}
        >
          {/* Mobile-friendly inline label: tier + score both visible without
              hover, so touch users get the same info as desktop hover users. */}
          <span>Tier {data.tier}</span>
          <span className="ml-1.5 hidden sm:inline opacity-70">·</span>
          <span className="ml-1.5 hidden sm:inline opacity-80">{scoreLabel}</span>
          <span className="ml-1.5 sm:hidden opacity-70">· {scoreLabel}</span>
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content
        side="bottom"
        align="center"
        sideOffset={5}
        className="max-w-[220px] px-3 py-2 bg-gray-300 text-nasun-black/80 text-xs border border-gray-500 rounded-lg"
      >
        <div className="font-semibold text-nasun-black">
          Nasun Standing — Tier {data.tier}
        </div>
        <div className="mt-0.5">
          Score {scoreLabel} / {NSI_MAX_SCORE}
        </div>
        {data.next_threshold !== null && remainder !== null && (
          <div className="mt-1">
            Next tier at {data.next_threshold} (+{Math.round(remainder)})
          </div>
        )}
        <div className="mt-2 text-nasun-black/60">
          {TIER_BADGE_TOOLTIP_DESC}
        </div>
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

export default NavStandingBadge;
