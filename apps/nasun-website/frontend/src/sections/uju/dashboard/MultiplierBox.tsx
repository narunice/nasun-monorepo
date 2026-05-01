import { useAuth } from "@/features/auth";
import { useEcosystemScore } from "@/hooks/useEcosystemScore";
import { useEcosystemStatus } from "@/hooks/useEcosystemStatus";

/**
 * Multiplier breakdown — mirrors the backend formula:
 *   final_multiplier = alliance_health + gp_bonus
 *
 *   alliance_health (0..1.0): one increment per Alliance segment
 *     (4 segments → 0.25 per inactive day). Locked at 1.0 for GP holders.
 *   gp_bonus       (0..1.0): one increment per GP segment
 *     (5 segments → 0.20 per inactive day). 0 for non-GP holders.
 *
 * Source of truth: apps/network-explorer/api-server/src/config/ecosystem.ts.
 * Self-contained: pulls its own data so consumers can drop it anywhere.
 */
export function MultiplierBox({ className = "" }: { className?: string }) {
  const { user } = useAuth();
  const { score } = useEcosystemScore(user?.identityId);
  const { getActivation } = useEcosystemStatus(
    user?.cognitoToken,
    user?.identityId,
  );

  // Prefer V3 health pcts when available; fall back to activation flags so
  // the breakdown still works on environments without ECO_HEALTH_V2.
  const allianceHealth = score?.health?.alliance;
  const genesisHealth = score?.health?.genesisPass;
  const fallbackAlliance = !!getActivation("alliance");
  const fallbackGenesis = !!getActivation("genesis-pass");

  const hasAlliance = allianceHealth?.hasNft ?? fallbackAlliance;
  const hasGenesis = genesisHealth?.hasNft ?? fallbackGenesis;

  // GP holders' alliance is locked at full per backend rule.
  const alliancePct = hasGenesis
    ? 100
    : hasAlliance
      ? (allianceHealth?.pct ?? (fallbackAlliance ? 100 : 0))
      : 0;
  const gpPct = hasGenesis
    ? (genesisHealth?.pct ?? (fallbackGenesis ? 100 : 0))
    : 0;

  const allianceHealthVal = alliancePct / 100;
  const gpBonusVal = gpPct / 100;
  const total = score?.multiplier ?? allianceHealthVal + gpBonusVal;

  return (
    <div
      className={`w-full rounded-xl bg-gradient-to-r from-pado-1/15 to-pado-2/15 border border-pado-2/40 shadow-[0_0_12px_rgba(59,185,216,0.15)] px-3 py-2 ${className}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-base font-light text-uju-secondary">Multiplier</p>
        <p className="text-2xl font-bold text-pado-3 tabular-nums">
          {total.toFixed(2)}x
        </p>
      </div>
      {/* Equation. The two contribution numbers are colored to match the
          health donut tone so the relationship between donut color and
          contribution reads at a glance. The leading multiplier value uses
          pado-3 (cyan) to mirror the header. */}
      <p className="mt-1.5 text-sm text-uju-secondary font-mono tabular-nums leading-snug">
        <span className="text-pado-3 font-semibold">
          {total.toFixed(2)}x
        </span>
        {" = Alliance health "}
        <span className="text-emerald-400 font-semibold">
          {allianceHealthVal.toFixed(2)}
        </span>
        {" + GP boost "}
        <span className="text-orange-500 font-semibold">
          {gpBonusVal.toFixed(2)}
        </span>
      </p>
    </div>
  );
}
