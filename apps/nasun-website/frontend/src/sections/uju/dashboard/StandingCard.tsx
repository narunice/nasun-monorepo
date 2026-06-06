// Nasun Standing (NSI) card for the my-account dashboard.
//
// Surfaces the user's current Nasun Standing Index tier + score + the economic
// benefits the tier unlocks, reading the same public endpoint the (currently
// hidden) NavStandingBadge uses:
//   `${VITE_EXPLORER_API_URL}/standing/by-address/{wallet}`
//
// Notes:
//   - useState + useEffect (no react-query) mirrors NavStandingBadge so the two
//     NSI surfaces share identical lifecycle / cancellation semantics.
//   - The public route returns a tier-1 baseline even when the user has no
//     `user_nsi` row yet, so new users see an honest "Tier 1, climb from here"
//     card rather than an empty gap.
//   - Silent-fail: any fetch error keeps `data === null` and the card renders
//     nothing. No noisy fallback.
//   - Copy strings come from `@nasun/standing/copy.ts` so wording stays
//     consistent with the navbar badge and future Pado / GoStop surfaces.
//   - Sub-score breakdown (staking / lp / tx / diversity / nft) needs the
//     `/standing/me` endpoint, which is reserved for Phase 2 and not yet built;
//     this card intentionally shows only the public coarse signals.

import { useState, useEffect } from "react";
import {
  NSI_MAX_SCORE,
  TIER_BADGE_TOOLTIP_DESC,
  type Tier,
} from "@nasun/standing";
import { useAuth } from "@/features/auth";
import { UjuCard, UjuSectionHeader, UjuBadge } from "../shared";

const EXPLORER_API = import.meta.env.VITE_EXPLORER_API_URL || "";

interface StandingBenefits {
  pado_fee_discount_bps: number;
  gostop_max_bet_usd: number;
  can_create_vault: boolean;
}

interface StandingData {
  tier: Tier;
  nsi_score: number;
  next_threshold: number | null;
  has_gp: boolean;
  benefits: StandingBenefits;
}

// Tier badge tone: 1 = neutral, 2 = violet, 3 = gold (amber). Mirrors the
// brand-neutral palette chosen for NavStandingBadge so the two surfaces agree.
const TIER_TONE: Record<Tier, "neutral" | "violet" | "amber"> = {
  1: "neutral",
  2: "violet",
  3: "amber",
};

function BenefitRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 border-b border-uju-border/50 last:border-0">
      <span className="text-base text-uju-secondary">{label}</span>
      <span className="text-base font-medium text-uju-primary tabular-nums">{value}</span>
    </li>
  );
}

export function StandingCard() {
  const { user } = useAuth();
  const walletAddress = user?.walletAddress;

  const [data, setData] = useState<StandingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!walletAddress || !EXPLORER_API) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(
          `${EXPLORER_API}/standing/by-address/${encodeURIComponent(walletAddress)}`,
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (cancelled) return;
        if (typeof json?.tier === "number" && json.tier >= 1 && json.tier <= 3) {
          setData({
            tier: json.tier as Tier,
            nsi_score: Number(json.nsi_score ?? 0),
            next_threshold:
              json.next_threshold === null ? null : Number(json.next_threshold),
            has_gp: Boolean(json.has_gp),
            benefits: {
              pado_fee_discount_bps: Number(json.benefits?.pado_fee_discount_bps ?? 0),
              gostop_max_bet_usd: Number(json.benefits?.gostop_max_bet_usd ?? 0),
              can_create_vault: Boolean(json.benefits?.can_create_vault),
            },
          });
        }
      } catch {
        // Silent-fail: card stays hidden.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  // Title carries an "Experimental" tag so users read the whole NSI surface as
  // a work-in-progress signal (formula + thresholds may still change; sub-score
  // breakdown is not yet exposed). Kept by the title rather than next to the
  // tier badge so it labels the feature, not the user's standing.
  const titleNode = (
    <span className="inline-flex items-center gap-2 flex-wrap">
      Nasun Standing
      <UjuBadge tone="amber">Experimental</UjuBadge>
    </span>
  );

  // Not connected or fetch failed: render nothing rather than an empty shell.
  if (!walletAddress) return null;

  if (loading) {
    return (
      <UjuCard>
        <UjuSectionHeader accent title={titleNode} subtitle={TIER_BADGE_TOOLTIP_DESC} />
        <div className="h-2 w-full rounded-full bg-uju-border/40 animate-pulse" />
      </UjuCard>
    );
  }

  if (!data) return null;

  const { tier, nsi_score, next_threshold, has_gp, benefits } = data;
  const score = Math.round(nsi_score);
  const progressPct = next_threshold
    ? Math.min(100, Math.round((nsi_score / next_threshold) * 100))
    : 100;
  const toNext = next_threshold ? Math.max(0, Math.round(next_threshold - nsi_score)) : 0;

  const feeDiscountPct = benefits.pado_fee_discount_bps / 100;

  return (
    <UjuCard>
      <UjuSectionHeader
        accent
        title={titleNode}
        subtitle={TIER_BADGE_TOOLTIP_DESC}
        trailing={
          <div className="flex items-center gap-2">
            <UjuBadge tone={TIER_TONE[tier]}>Tier {tier}</UjuBadge>
            {has_gp && <UjuBadge tone="lavender">Genesis Pass</UjuBadge>}
          </div>
        }
      />

      {/* Score + progress to next tier */}
      <div className="mb-5">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <span className="text-2xl font-semibold text-uju-primary tabular-nums">
            {score}
            <span className="text-base font-normal text-uju-secondary"> / {NSI_MAX_SCORE}</span>
          </span>
          <span className="text-sm text-uju-secondary">
            {next_threshold ? `Next tier at ${next_threshold} (+${toNext})` : "Top tier reached"}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-uju-border/40 overflow-hidden">
          <div
            className="h-full rounded-full bg-pado-2 transition-[width] duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Tier benefits */}
      <ul>
        <BenefitRow
          label="Pado trading fee discount"
          value={feeDiscountPct > 0 ? `-${feeDiscountPct}%` : "None"}
        />
        <BenefitRow
          label="GoStop max bet"
          value={`$${benefits.gostop_max_bet_usd.toLocaleString("en-US")}`}
        />
        <BenefitRow
          label="Vault manager eligibility"
          value={benefits.can_create_vault ? "Eligible" : "Tier 3 required"}
        />
      </ul>
    </UjuCard>
  );
}
