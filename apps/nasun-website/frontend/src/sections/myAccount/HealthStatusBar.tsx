/**
 * HealthStatusBar - HP gauge showing ecosystem health status.
 *
 * States:
 * - Disabled (gray): No NFT activated yet
 * - Healthy (green):  isPenalized === false (includes newly activated users)
 * - Weakened (red):   isPenalized === true (backend-confirmed penalty)
 *
 * Genesis Pass holders are always Healthy with full HP (immune to penalties).
 */

import { FC } from "react";
import { Spinner } from "@/components/ui";

interface HealthStatusBarProps {
  activeDays: number;
  isPenalized: boolean;
  hasGenesisPass: boolean;
  hasActiveNft: boolean;
  isLoading: boolean;
}

type HealthState = "healthy" | "weakened";

function getHealthState(isPenalized: boolean, hasGenesisPass: boolean): HealthState {
  if (hasGenesisPass) return "healthy";
  if (isPenalized) return "weakened";
  return "healthy";
}

function getHpPercent(activeDays: number, hasGenesisPass: boolean, isPenalized: boolean): number {
  if (hasGenesisPass) return 100;
  if (isPenalized) return Math.max(10, Math.round((activeDays / 7) * 100));
  return Math.max(20, Math.round((activeDays / 7) * 100));
}

const CONFIG: Record<HealthState, {
  label: string;
  barColor: string;
  barBg: string;
  textColor: string;
  iconColor: string;
  pulse: boolean;
}> = {
  healthy: {
    label: "Healthy",
    barColor: "bg-emerald-500",
    barBg: "bg-emerald-500/10",
    textColor: "text-emerald-400",
    iconColor: "text-emerald-400",
    pulse: false,
  },
  weakened: {
    label: "Weakened",
    barColor: "bg-red-500",
    barBg: "bg-red-500/10",
    textColor: "text-red-400",
    iconColor: "text-red-400",
    pulse: true,
  },
};

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      width="20"
      height="20"
    >
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

export const HealthStatusBar: FC<HealthStatusBarProps> = ({
  activeDays,
  isPenalized,
  hasGenesisPass,
  hasActiveNft,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="border border-dashed border-nasun-white/10 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Spinner size="sm" />
          <span className="text-nasun-white/50 text-sm">Loading health status...</span>
        </div>
      </div>
    );
  }

  // Disabled state: no NFT activated
  if (!hasActiveNft) {
    return (
      <div className="border border-dashed border-nasun-white/10 rounded-lg p-4 opacity-50">
        <p className="text-nasun-white/50 text-xs mb-3">
          Activate your Alliance NFT to unlock Health Status
        </p>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <HeartIcon className="w-5 h-5 text-nasun-white/20" />
            <h6 className="text-nasun-white/30 text-sm font-medium">Health Status</h6>
          </div>
          <span className="text-sm font-semibold text-nasun-white/20">--</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden bg-nasun-white/5">
          <div className="h-full rounded-full bg-nasun-white/10" style={{ width: "0%" }} />
        </div>
      </div>
    );
  }

  const state = getHealthState(isPenalized, hasGenesisPass);
  const hpPercent = getHpPercent(activeDays, hasGenesisPass, isPenalized);
  const cfg = CONFIG[state];

  return (
    <div className="border border-dashed border-nasun-white/10 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <HeartIcon className={`w-5 h-5 ${cfg.iconColor} ${cfg.pulse ? "animate-pulse" : ""}`} />
          <h6 className="text-nasun-white text-sm font-medium">Health Status</h6>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${cfg.textColor}`}>
            {cfg.label}
          </span>
          {hasGenesisPass && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
              Genesis Shield
            </span>
          )}
        </div>
      </div>

      {/* HP Bar */}
      <div className={`h-3 rounded-full overflow-hidden ${cfg.barBg}`}>
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${cfg.barColor} ${cfg.pulse ? "animate-pulse" : ""}`}
          style={{ width: `${hpPercent}%` }}
        />
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-nasun-white/40 text-xs">
          {activeDays}/7 active days this week
        </span>
        {state === "weakened" && (
          <span className="text-red-400/80 text-xs">
            2 consecutive active days to recover
          </span>
        )}
        {hasGenesisPass && (
          <span className="text-amber-400/60 text-xs">
            Immune to inactivity penalties
          </span>
        )}
      </div>
    </div>
  );
};
