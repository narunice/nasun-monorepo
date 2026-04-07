/**
 * GenesisDropInfoCard Component
 *
 * Full-width Genesis Pass drop schedule + countdown card for the My Account page.
 * Two-column layout: left = schedule, right = live countdown state machine.
 */

import { FC, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  STAGE_START_TIMES,
  MINT_CLOSE_TIME,
  calcTimeLeft,
} from "@/constants/nft-drop";

const STAGES = [
  { key: 1, label: "Free Mint", date: STAGE_START_TIMES[1], price: null },
  {
    key: 2,
    label: "GTD Allowlist",
    date: STAGE_START_TIMES[2],
    price: "~$8 in ETH",
  },
  {
    key: 3,
    label: "FCFS Allowlist",
    date: STAGE_START_TIMES[3],
    price: "~$10 in ETH",
  },
  {
    key: 4,
    label: "Public Mint",
    date: STAGE_START_TIMES[4],
    price: "~$15 in ETH",
  },
] as const;

function formatLocal(date: Date): string {
  const datePart = date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
  });
  const timePart = date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
  return `${datePart} at ${timePart}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function getActiveStageIndex(now: number): number {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (now >= STAGES[i].date.getTime()) {
      return now < MINT_CLOSE_TIME.getTime() ? i : -1;
    }
  }
  return -1; // None started
}

interface GenesisDropInfoCardProps {
  className?: string;
}

export const GenesisDropInfoCard: FC<GenesisDropInfoCardProps> = ({
  className = "",
}) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const activeIdx = getActiveStageIndex(now);
  const allEnded = now >= MINT_CLOSE_TIME.getTime();
  const notStarted = now < STAGES[0].date.getTime();

  // Countdown target logic
  let countdownTarget: Date | null = null;
  let remainingLabel: string | null = null;
  let nextLabel: string | null = null;

  if (allEnded) {
    // Nothing to show
  } else if (notStarted) {
    remainingLabel = "Free Mint starts in";
    countdownTarget = STAGES[0].date;
  } else {
    const current = STAGES[activeIdx];
    const next = STAGES[activeIdx + 1];
    remainingLabel = current.label;
    countdownTarget = next?.date ?? MINT_CLOSE_TIME;

    if (next) {
      nextLabel = next.label;
    }
  }

  const timeLeft = countdownTarget ? calcTimeLeft(countdownTarget, now) : null;

  return (
    <Link
      to="/wave1/genesis-pass-drop"
      className={`relative block rounded-sm bg-gradient-to-br from-nasun-c6 via-nasun-c6/95 to-nasun-c5/60
        border border-nasun-c4/30 text-nasun-white
        px-6 py-5 hover:border-nasun-c4/50 transition-all ${className}`}
    >
      {/* Heading */}
      <h5 className=" font-bold uppercase tracking-wider text-center mb-4">
        Genesis Pass Drop
      </h5>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        {/* Left: Schedule */}
        <div className="space-y-1.5">
          {STAGES.map((stage, idx) => {
            const isActive = idx === activeIdx;
            const isPast = !allEnded && activeIdx >= 0 && idx < activeIdx;

            return (
              <div
                key={stage.key}
                className={`text-base leading-relaxed ${
                  isActive
                    ? "text-emerald-400 font-semibold"
                    : isPast
                      ? "text-nasun-white/20 line-through"
                      : "text-nasun-white/70"
                }`}
              >
                <span>
                  <span className="font-semibold">{stage.label}:</span>{" "}
                  {formatLocal(stage.date)}
                </span>
                {stage.price && <span className="ml-1">@ {stage.price}</span>}
              </div>
            );
          })}
          {/* Mint close */}
          <div
            className={`text-base leading-relaxed ${
              allEnded ? "text-nasun-white/40" : "text-nasun-white/70"
            }`}
          >
            <span>
              <span className="font-semibold">Mint closes:</span>{" "}
              {formatLocal(MINT_CLOSE_TIME)}
            </span>
          </div>
        </div>

        {/* Right: Countdown */}
        <div className="flex flex-col items-center justify-center">
          {allEnded ? (
            <p className="text-nasun-white/50 text-base">Minting has ended</p>
          ) : (
            <>
              {remainingLabel && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                  <span className="text-emerald-400 font-bold text-2xl uppercase tracking-wide">
                    {remainingLabel}
                  </span>
                </div>
              )}
              {timeLeft && !timeLeft.isExpired && (
                <div className="text-center">
                  <p className="text-nasun-white font-semibold text-lg mb-1">
                    Time Remaining
                  </p>
                  <p className="font-mono text-3xl font-bold text-nasun-white tabular-nums">
                    {timeLeft.days > 0 && (
                      <span>
                        {pad2(timeLeft.days)}
                        <span className="text-nasun-white/50 text-lg">d </span>
                      </span>
                    )}
                    {pad2(timeLeft.hours)}
                    <span className="text-nasun-white/50 text-lg">h </span>
                    {pad2(timeLeft.minutes)}
                    <span className="text-nasun-white/50 text-lg">m </span>
                    {pad2(timeLeft.seconds)}
                    <span className="text-nasun-white/50 text-lg">s</span>
                  </p>
                </div>
              )}
              {nextLabel && (
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs font-bold uppercase tracking-wider bg-orange-500 text-white px-2 py-0.5 rounded-full">
                    Next
                  </span>
                  <span className="text-nasun-white font-bold text-lg uppercase tracking-wide">
                    {nextLabel}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Link>
  );
};
