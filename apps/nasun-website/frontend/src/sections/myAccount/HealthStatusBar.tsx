/**
 * HealthStatusBar - Circular donut gauge showing ecosystem health status.
 *
 * States:
 * - Disabled (gray): No NFT activated yet
 * - Healthy (green):  isPenalized === false
 * - Weakened (red):   isPenalized === true
 *
 * Genesis Pass holders are always Healthy with full HP (immune to penalties).
 * Designed to sit alongside DailyMissionsCard at 1/3 width.
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

function getHealthState(
  isPenalized: boolean,
  hasGenesisPass: boolean,
): HealthState {
  if (hasGenesisPass) return "healthy";
  if (isPenalized) return "weakened";
  return "healthy";
}

function getHpPercent(
  activeDays: number,
  hasGenesisPass: boolean,
  isPenalized: boolean,
): number {
  if (hasGenesisPass) return 100;
  if (isPenalized) return Math.max(10, Math.round((activeDays / 7) * 100));
  return Math.max(20, Math.round((activeDays / 7) * 100));
}

const CONFIG: Record<
  HealthState,
  {
    label: string;
    strokeColor: string;
    textColor: string;
    trackColor: string;
    pulse: boolean;
  }
> = {
  healthy: {
    label: "Healthy",
    strokeColor: "stroke-emerald-500",
    textColor: "text-emerald-400",
    trackColor: "stroke-emerald-500/10",
    pulse: false,
  },
  weakened: {
    label: "Weakened",
    strokeColor: "stroke-red-500",
    textColor: "text-red-400",
    trackColor: "stroke-red-500/10",
    pulse: true,
  },
};

const SIZE = 100;
const STROKE_WIDTH = 8;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const HealthStatusBar: FC<HealthStatusBarProps> = ({
  activeDays,
  isPenalized,
  hasGenesisPass,
  hasActiveNft,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="flex flex-col h-full py-2">
        <h5 className="font-medium text-nasun-white text-sm mb-3 px-3">
          Health Status
        </h5>
        <div className="flex-1 flex items-center justify-center">
          <Spinner size="sm" />
        </div>
      </div>
    );
  }

  if (!hasActiveNft) {
    return (
      <div className="flex flex-col h-full py-2 opacity-50">
        <h5 className="font-medium text-nasun-white/30 text-sm mb-3 px-3">
          Health Status
        </h5>
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <DonutRing
            percent={0}
            strokeClass="stroke-nasun-white/10"
            trackClass="stroke-nasun-white/5"
          />
          <p className="text-nasun-white/20 text-sm">Activate NFT to unlock</p>
        </div>
      </div>
    );
  }

  const state = getHealthState(isPenalized, hasGenesisPass);
  const hpPercent = getHpPercent(activeDays, hasGenesisPass, isPenalized);
  const cfg = CONFIG[state];

  return (
    <div className="flex flex-col h-full py-2">
      <h5 className="font-medium text-nasun-white text-sm mb-3 px-3">
        Health Status
      </h5>
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <DonutRing
          percent={hpPercent}
          strokeClass={cfg.strokeColor}
          trackClass={cfg.trackColor}
          pulse={cfg.pulse}
          label={`${activeDays}/7`}
        />
        <div className="text-center">
          <p className={`text-xs font-semibold ${cfg.textColor}`}>
            {cfg.label}
          </p>
          {hasGenesisPass && (
            <p className="text-amber-400 text-sm mt-0.5">Genesis Shield</p>
          )}
          {state === "weakened" && (
            <p className="text-red-400 text-sm mt-0.5 leading-tight">
              2 active days
              <br />
              to recover
            </p>
          )}
          {!hasGenesisPass && state === "healthy" && (
            <p className="text-nasun-white/70 text-sm mt-0.5">
              {activeDays}/7 days active
            </p>
          )}
        </div>
      </div>
      <p className="text-nasun-white/60 text-sm leading-relaxed text-left px-3 mt-auto pt-2">
        {hasGenesisPass
          ? "Genesis Pass holders are immune to inactivity penalties."
          : "Without Genesis Pass, 2+ inactive days in the last 7 will pause point earnings until you recover."}
      </p>
    </div>
  );
};

function DonutRing({
  percent,
  strokeClass,
  trackClass,
  pulse = false,
  label,
}: {
  percent: number;
  strokeClass: string;
  trackClass: string;
  pulse?: boolean;
  label?: string;
}) {
  const dashOffset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;

  return (
    <div className="relative w-20 h-20">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-full -rotate-90">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE_WIDTH}
          className={trackClass}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          className={`${strokeClass} ${pulse ? "animate-pulse" : ""} transition-all duration-700 ease-out`}
        />
      </svg>
      {label && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-nasun-white text-sm font-bold">{label}</span>
        </div>
      )}
    </div>
  );
}
