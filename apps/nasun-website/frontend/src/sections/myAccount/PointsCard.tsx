/**
 * PointsCard Component
 *
 * On-chain activity points summary card for the Bento Grid layout.
 * Shows total points, category breakdown, and activity count.
 */

import { FC, useEffect, useState } from "react";
import { useAuth } from "@/features/auth";
import { getPointsUser } from "@/services/activityPointsApi";
import type { UserPoints } from "@/types/points";
import { OuterBox, Spinner } from "@/components/ui";

interface PointsCardProps {
  className?: string;
}

const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;

const CATEGORY_COLORS: Record<string, string> = {
  staking: "bg-emerald-500",
  "pado-dex": "bg-blue-500",
  governance: "bg-purple-500",
  "pado-prediction": "bg-amber-500",
  "pado-lottery": "bg-pink-500",
  "pado-perp": "bg-red-500",
  "pado-lending": "bg-cyan-500",
  "baram-ai": "bg-indigo-500",
  "baram-executor": "bg-violet-500",
  "wallet-transfer": "bg-gray-500",
  "referral-bonus": "bg-amber-500",
};

const CATEGORY_LABELS: Record<string, string> = {
  staking: "Staking",
  "pado-dex": "DEX",
  governance: "Governance",
  "pado-prediction": "Prediction",
  "pado-lottery": "Lottery",
  "pado-perp": "Perp",
  "pado-lending": "Lending",
  "baram-ai": "Baram AI",
  "baram-executor": "Executor",
  "wallet-transfer": "Transfer",
  "referral-bonus": "Referral",
};

export const PointsCard: FC<PointsCardProps> = ({ className = "" }) => {
  const { user } = useAuth();
  const [points, setPoints] = useState<UserPoints | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const nasunWalletAddress =
    user?.linkedAccounts?.["nasun wallet"]?.walletAddress ?? user?.walletAddress;

  const hasValidAddress = nasunWalletAddress && SUI_ADDRESS_RE.test(nasunWalletAddress);

  useEffect(() => {
    if (!hasValidAddress) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getPointsUser(nasunWalletAddress!)
      .then((data) => {
        if (!cancelled) setPoints(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [nasunWalletAddress, hasValidAddress]);

  // No Nasun wallet connected
  if (!hasValidAddress) {
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        <h5 className="font-medium uppercase text-nasun-white mb-4 flex items-center gap-2">ACTIVITY POINTS <span className="text-sm font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 normal-case">Experimental</span></h5>
        <div className="flex flex-col items-center justify-center py-4 gap-3">
          <p className="text-nasun-white/50 text-center text-sm">
            Connect Nasun Wallet to view activity points
          </p>
        </div>
      </OuterBox>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        <h5 className="font-medium uppercase text-nasun-white mb-4 flex items-center gap-2">ACTIVITY POINTS <span className="text-sm font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 normal-case">Experimental</span></h5>
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      </OuterBox>
    );
  }

  // Error
  if (error) {
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        <h5 className="font-medium uppercase text-nasun-white mb-4 flex items-center gap-2">ACTIVITY POINTS <span className="text-sm font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 normal-case">Experimental</span></h5>
        <p className="text-red-400 text-sm text-center py-4">Failed to load points</p>
      </OuterBox>
    );
  }

  // No points yet
  if (!points) {
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        <h5 className="font-medium uppercase text-nasun-white mb-4 flex items-center gap-2">ACTIVITY POINTS <span className="text-sm font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 normal-case">Experimental</span></h5>
        <div className="flex flex-col items-center justify-center py-4 gap-3">
          <p className="text-nasun-white/50 text-center text-sm">
            No activity points yet
          </p>
          <p className="text-nasun-white/30 text-center text-sm">
            Use Nasun ecosystem to earn points
          </p>
        </div>
      </OuterBox>
    );
  }

  const totalPts = Number(points.totalPoints);
  const totalForBar = points.categories.reduce((sum, c) => sum + Number(c.points), 0);
  const firstDate = points.firstActivity
    ? new Date(points.firstActivity).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <OuterBox color="c5" padding="sm" className={className}>
      <h5 className="font-medium uppercase text-nasun-white mb-3 flex items-center gap-2">ACTIVITY POINTS <span className="text-sm font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 normal-case">Experimental</span></h5>

      {/* Total Points */}
      <div className="text-3xl font-bold text-nasun-white mb-3">
        {totalPts.toLocaleString("en-US")}
        <span className="text-sm font-normal text-nasun-white/50 ml-2">pts</span>
      </div>

      {/* Category Distribution Bar */}
      {points.categories.length > 0 && totalForBar > 0 && (
        <div className="mb-3">
          <div className="flex h-2 rounded-full overflow-hidden gap-px">
            {points.categories.map((cat) => {
              const pct = (Number(cat.points) / totalForBar) * 100;
              if (pct < 1) return null;
              return (
                <div
                  key={cat.category}
                  className={`${CATEGORY_COLORS[cat.category] || "bg-gray-400"} transition-all`}
                  style={{ width: `${pct}%` }}
                  title={`${CATEGORY_LABELS[cat.category] || cat.category}: ${Number(cat.points).toLocaleString("en-US")} pts`}
                />
              );
            })}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {points.categories.map((cat) => (
              <span key={cat.category} className="flex items-center gap-1 text-sm text-nasun-white/60">
                <span className={`w-2 h-2 rounded-full ${CATEGORY_COLORS[cat.category] || "bg-gray-400"}`} />
                {CATEGORY_LABELS[cat.category] || cat.category}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-sm text-nasun-white/40 mt-1">
        {points.activityCount} {points.activityCount === 1 ? "activity" : "activities"}
        {firstDate && <span> &middot; Since {firstDate}</span>}
      </div>
    </OuterBox>
  );
};
