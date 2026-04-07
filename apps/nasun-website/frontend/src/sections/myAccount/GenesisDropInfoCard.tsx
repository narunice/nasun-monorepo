/**
 * GenesisDropInfoCard Component
 *
 * Universal Genesis Pass drop schedule card for the My Account page.
 * Shows all stages with UTC + local time, highlights ongoing stage.
 */

import { FC, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { STAGE_START_TIMES, MINT_CLOSE_TIME } from "@/constants/nft-drop";

interface StageInfo {
  label: string;
  date: Date;
  price?: string;
  isHighlight: boolean; // Free Mint line uses larger font
}

const STAGES: StageInfo[] = [
  { label: "Free Mint starts", date: STAGE_START_TIMES[1], isHighlight: true },
  { label: "GTD Allowlist", date: STAGE_START_TIMES[2], price: "~$8 in ETH", isHighlight: false },
  { label: "FCFS Allowlist", date: STAGE_START_TIMES[3], price: "~$10 in ETH", isHighlight: false },
  { label: "Public Mint", date: STAGE_START_TIMES[4], price: "~$15 in ETH", isHighlight: false },
];

function formatUTC(date: Date): string {
  const month = date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const day = date.getUTCDate();
  const suffix = day === 1 || day === 21 || day === 31 ? "st"
    : day === 2 || day === 22 ? "nd"
    : day === 3 || day === 23 ? "rd" : "th";
  const hours = date.getUTCHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 || 12;
  const minutes = date.getUTCMinutes();
  const minStr = minutes > 0 ? `:${minutes.toString().padStart(2, "0")}` : ":00";
  return `${month} ${day}${suffix} - ${h12}${minStr} ${ampm} UTC`;
}

function formatLocal(date: Date): string {
  return date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

function getActiveStageIndex(now: number): number {
  // Find the currently ongoing stage (started but next hasn't started yet)
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (now >= STAGES[i].date.getTime()) {
      // Check if mint is still open
      if (now < MINT_CLOSE_TIME.getTime()) return i;
      return -1; // All ended
    }
  }
  return -1; // None started yet
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
  // Next stage = first stage that hasn't started yet
  const nextIdx = allEnded ? -1 : STAGES.findIndex((s) => now < s.date.getTime());

  return (
    <Link
      to="/wave1/genesis-pass-drop"
      className={`relative block rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 text-nasun-black
        px-5 py-4 hover:from-amber-400/90 hover:via-amber-500/90 hover:to-orange-500/90 transition-colors ${className}`}
    >
      {/* Heading */}
      <h5 className="text-lg font-bold uppercase tracking-wider text-nasun-black mb-2">
        Genesis Pass
      </h5>

      {/* Stage lines */}
      <div className="space-y-1">
        {STAGES.map((stage, idx) => {
          const isOngoing = idx === activeIdx;
          const isNext = idx === nextIdx && activeIdx >= 0;
          const isPast = now >= (STAGES[idx + 1]?.date.getTime() ?? MINT_CLOSE_TIME.getTime());

          // Style logic:
          // Ongoing: bold + ONGOING NOW badge
          // Next (while another is ongoing): bright normal font
          // Default (future, not next): slightly dim
          // Past: dim
          let textClass: string;
          if (isOngoing) {
            textClass = "text-nasun-black font-semibold";
          } else if (isNext) {
            textClass = "text-nasun-black font-medium";
          } else if (isPast) {
            textClass = "text-nasun-black/50";
          } else {
            textClass = "text-nasun-black/60";
          }

          const timeStr = `${formatUTC(stage.date)} / ${formatLocal(stage.date)}`;
          const priceStr = stage.price ? ` @ ${stage.price}` : "";

          if (stage.isHighlight) {
            return (
              <div key={idx} className={`flex items-center gap-2 ${textClass}`}>
                <p className="text-base">
                  {stage.label} {timeStr}{priceStr}
                </p>
                {isOngoing && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-emerald-500 text-white px-1.5 py-0.5 rounded-full whitespace-nowrap">
                    Ongoing Now
                  </span>
                )}
              </div>
            );
          }

          return (
            <div key={idx} className={`flex items-center gap-2 ${textClass}`}>
              <p className="text-sm">
                {stage.label}: {timeStr}{priceStr}
              </p>
              {isOngoing && (
                <span className="text-[10px] font-semibold uppercase tracking-wide bg-emerald-500 text-white px-1.5 py-0.5 rounded-full whitespace-nowrap">
                  Ongoing Now
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Link>
  );
};
