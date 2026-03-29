/**
 * EcosystemStatusCard
 *
 * Dashboard card for /dev/my-account showing ecosystem score,
 * NFT multiplier breakdown, and activity streak.
 * Uses ecosystem score API (public) + ecosystem status API (auth'd).
 */

import { useState, useEffect } from "react";
import { useAuth } from "@/features/auth";
import { useEcosystemStatus } from "@/hooks/useEcosystemStatus";
import {
  getEcosystemScore,
  type EcosystemScoreData,
} from "@/services/ecosystemScoreApi";
import { Link } from "react-router-dom";

interface EcosystemStatusCardProps {
  className?: string;
}

export function EcosystemStatusCard({ className = "" }: EcosystemStatusCardProps) {
  const { user, cognitoToken } = useAuth();
  const { activations, getActivation } = useEcosystemStatus(cognitoToken ?? undefined);
  const [score, setScore] = useState<EcosystemScoreData | null>(null);
  const [loading, setLoading] = useState(true);

  const identityId = user?.identityId;

  useEffect(() => {
    if (!identityId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await getEcosystemScore(identityId);
        if (!cancelled) setScore(data);
      } catch (err) {
        console.error("[EcosystemStatus]", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [identityId]);

  const multiplier = score?.multiplier ?? 1.0;
  const dailyScore = score?.daily.ecosystemScore ?? 0;
  const weeklyScore = score?.weekly.ecosystemScore ?? 0;
  const weeklyDays = score?.weekly.activeDays ?? 0;
  const allTimeScore = score?.allTime.ecosystemScore ?? 0;

  // NFT activation summary
  const allianceActive = !!getActivation("alliance");
  const genesisActive = !!getActivation("genesis-pass");
  const battalionActivation = getActivation("battalion");
  const battalionActive = !!battalionActivation;
  const activeCount = [allianceActive, genesisActive, battalionActive].filter(Boolean).length;

  // Read per-NFT bonus from score API (server-computed). Fallback to defaults during deploy transition.
  const allianceBonusStr = formatBonus(score?.activations, "alliance", 1.0);
  const genesisBonusStr = formatBonus(score?.activations, "genesis-pass", 1.5);
  const battalionBonusStr = formatBonus(score?.activations, "battalion", 1.0);

  return (
    <div className={`rounded-xl border border-nasun-c6/50 bg-nasun-c6/20 p-5 ${className}`}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-nasun-white">
          Ecosystem Score
        </h3>
        <Link
          to="/ecosystem/leaderboard"
          className="text-xs text-nasun-c3 hover:underline"
        >
          View Leaderboard
        </Link>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center text-nasun-white/40">
          Loading...
        </div>
      ) : (
        <>
          {/* Score Overview */}
          <div className="mb-4 grid grid-cols-3 gap-3">
            <ScoreBox label="Today" value={dailyScore} />
            <ScoreBox label="This Week" value={weeklyScore} />
            <ScoreBox label="All Time" value={allTimeScore} />
          </div>

          {/* Multiplier */}
          <div className="mb-4 rounded-lg bg-nasun-c6/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-nasun-white/60">Multiplier</span>
              <span className={`text-xl font-bold ${multiplier > 1 ? "text-nasun-c3" : "text-nasun-white/60"}`}>
                {multiplier.toFixed(1)}x
              </span>
            </div>
            {/* NFT breakdown */}
            <div className="mt-2 flex gap-2">
              <NftBadge label="Alliance" active={allianceActive} bonus={allianceBonusStr} />
              <NftBadge label="Genesis" active={genesisActive} bonus={genesisBonusStr} />
              <NftBadge label="Battalion" active={battalionActive} bonus={battalionBonusStr} />
            </div>
            {activeCount === 0 && (
              <p className="mt-2 text-xs text-nasun-white/40">
                Activate NFTs in the NFT Status card to boost your multiplier
              </p>
            )}
          </div>

          {/* Weekly Active Days */}
          <div className="rounded-lg bg-nasun-c6/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-nasun-white/60">Active Days (7d)</span>
              <span className="text-sm font-medium text-nasun-white">
                {weeklyDays}/7 days
              </span>
            </div>
            {/* 7-day bar */}
            <div className="flex gap-1">
              {Array.from({ length: 7 }, (_, i) => (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded-full ${
                    i < weeklyDays ? "bg-nasun-c3" : "bg-nasun-c6/50"
                  }`}
                />
              ))}
            </div>
            {weeklyDays >= 5 && (
              <p className="mt-1 text-xs text-nasun-c3">
                Great activity! Keep it up for full multiplier benefits.
              </p>
            )}
          </div>

          {/* Experimental Season Notice */}
          <p className="mt-3 text-center text-[10px] text-nasun-white/30">
            Experimental Season - scores may be adjusted
          </p>
        </>
      )}
    </div>
  );
}

function ScoreBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-nasun-c6/40 p-2.5 text-center">
      <p className="text-[10px] text-nasun-white/50">{label}</p>
      <p className="text-lg font-bold text-nasun-c3">
        {value > 0 ? value.toFixed(1) : "0"}
      </p>
    </div>
  );
}

function formatBonus(
  activations: Array<{ nftType: string; bonus?: number }> | undefined,
  nftType: string,
  fallback: number,
): string {
  const act = activations?.find((a) => a.nftType === nftType);
  const bonus = act?.bonus ?? fallback;
  return `+${parseFloat(bonus.toFixed(1))}x`;
}

function NftBadge({
  label,
  active,
  bonus,
}: {
  label: string;
  active: boolean;
  bonus: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
        active
          ? "bg-nasun-c3/20 text-nasun-c3"
          : "bg-nasun-c6/50 text-nasun-white/30"
      }`}
    >
      {label}
      {active && <span className="font-medium">{bonus}</span>}
    </span>
  );
}
