import { FC } from "react";
import { Spinner } from "@/components/ui";
import { UjuBadge } from "../shared";

interface UjuHealthStatusProps {
  activeDays: number;
  isPenalized: boolean;
  hasGenesisPass: boolean;
  hasActiveNft: boolean;
  isLoading: boolean;
}

export const DONUT_SIZE = 100;
export const DONUT_STROKE_WIDTH = 10;
export const DONUT_RADIUS = (DONUT_SIZE - DONUT_STROKE_WIDTH) / 2;
export const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

// Keep local aliases for component's own use
const SIZE = DONUT_SIZE;
const STROKE_WIDTH = DONUT_STROKE_WIDTH;
const RADIUS = DONUT_RADIUS;
const CIRCUMFERENCE = DONUT_CIRCUMFERENCE;

export interface RingTheme {
  strokeClass: string;
  trackClass: string;
  pulse: boolean;
}

function getRingTheme(state: "healthy" | "weakened" | "locked"): RingTheme {
  if (state === "weakened") {
    return { strokeClass: "stroke-nasun-coral", trackClass: "stroke-nasun-coral/15", pulse: true };
  }
  if (state === "locked") {
    return { strokeClass: "stroke-uju-border", trackClass: "stroke-uju-border", pulse: false };
  }
  return { strokeClass: "stroke-pado-4", trackClass: "stroke-pado-4/15", pulse: false };
}

function hpPercent(activeDays: number, hasGenesisPass: boolean, isPenalized: boolean): number {
  if (hasGenesisPass) return 100;
  if (isPenalized) return Math.max(10, Math.round((activeDays / 7) * 100));
  return Math.max(20, Math.round((activeDays / 7) * 100));
}

export const UjuHealthStatus: FC<UjuHealthStatusProps> = ({
  activeDays,
  isPenalized,
  hasGenesisPass,
  hasActiveNft,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Spinner size="sm" />
      </div>
    );
  }

  if (!hasActiveNft) {
    const theme = getRingTheme("locked");
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <DonutRing percent={0} {...theme} />
        <UjuBadge tone="neutral">Locked</UjuBadge>
        <p className="text-base text-uju-secondary leading-relaxed">
          Activate any Nasun NFT to unlock the health system.
        </p>
      </div>
    );
  }

  const state = isPenalized && !hasGenesisPass ? "weakened" : "healthy";
  const percent = hpPercent(activeDays, hasGenesisPass, isPenalized);
  const theme = getRingTheme(state);

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <DonutRing percent={percent} {...theme} label={hasGenesisPass ? "∞" : `${activeDays}/7`} />
      {hasGenesisPass ? (
        <UjuBadge tone="amber">Genesis Shield</UjuBadge>
      ) : state === "weakened" ? (
        <UjuBadge tone="coral">Weakened</UjuBadge>
      ) : (
        <UjuBadge tone="mint">Healthy</UjuBadge>
      )}
      <p className="text-base text-uju-secondary leading-relaxed">
        {hasGenesisPass
          ? "Genesis Pass holders are immune to inactivity penalties."
          : state === "weakened"
          ? "2 active days needed to recover. Earnings paused while weakened."
          : `${activeDays}/7 active days this week. Stay above 5 to keep earning.`}
      </p>
    </div>
  );
};

export interface DonutRingProps extends RingTheme {
  percent: number;
  label?: string;
}

export function DonutRing({ percent, strokeClass, trackClass, pulse, label }: DonutRingProps) {
  const dashOffset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;

  return (
    <div className="relative w-24 h-24">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE_WIDTH} className={trackClass} />
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
          <span className="text-lg font-normal text-uju-primary tabular-nums">{label}</span>
        </div>
      )}
    </div>
  );
}
