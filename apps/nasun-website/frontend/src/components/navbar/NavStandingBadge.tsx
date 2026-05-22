import { useState, useEffect } from "react";

/**
 * Nasun Standing Index (NSI) badge.
 *
 * Fetches the current user's tier + NSI score from
 * `${VITE_EXPLORER_API_URL}/standing/by-address/{wallet}` and displays a
 * pill in the Navbar. Hover tooltip surfaces the underlying score for
 * power users; the badge label is just the tier number to stay calm in
 * the header chrome.
 *
 * Implementation deliberately mirrors NavEcoPointsBadge (useState +
 * useEffect, silent-fail) instead of pulling in react-query — same
 * cancellation semantics and zero extra dependencies.
 */

const EXPLORER_API = import.meta.env.VITE_EXPLORER_API_URL || "";

type Tier = 1 | 2 | 3;

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
  const scoreLabel = data.nsi_score.toFixed(0);
  const tooltip =
    data.next_threshold !== null
      ? `Nasun Standing: ${scoreLabel} / 1000 (next tier at ${data.next_threshold})`
      : `Nasun Standing: ${scoreLabel} / 1000`;

  return (
    <span
      className={`inline-flex items-center h-7 px-3 rounded-full text-xs font-semibold ring-1 ${tierStyle}`}
      title={tooltip}
      data-testid="nav-standing-badge"
    >
      Tier {data.tier}
    </span>
  );
}

export default NavStandingBadge;
