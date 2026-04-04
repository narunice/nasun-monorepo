import React from "react";

export interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

interface CountdownTimerProps {
  label: string;
  timeLeft: TimeLeft;
  isExpired: boolean;
  price?: string;
  targetTimeUTC?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

function CountdownTimerInner({
  label,
  timeLeft,
  isExpired,
  price,
  targetTimeUTC,
}: CountdownTimerProps) {
  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-lg px-4 py-3 md:px-6 md:py-4 flex items-center justify-between gap-4">
      {/* Label + price + UTC time */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-nasun-white text-sm md:text-base font-medium whitespace-nowrap">
            {label}
          </span>
          {price && (
            <span className="text-nasun-white/60 text-xs md:text-sm">
              @ {price}
            </span>
          )}
        </div>
        {targetTimeUTC && (
          <span className="text-nasun-white/40 text-xs">{targetTimeUTC}</span>
        )}
      </div>

      {/* Countdown or LIVE badge */}
      {isExpired ? (
        <span className="bg-green-500 text-white text-xs md:text-sm font-semibold px-3 py-1 rounded-full whitespace-nowrap">
          LIVE
        </span>
      ) : (
        <div className="flex items-center gap-1.5 md:gap-2 font-mono text-nasun-white shrink-0">
          <DigitBlock value={pad(timeLeft.days)} unit="D" />
          <span className="text-nasun-white/30">:</span>
          <DigitBlock value={pad(timeLeft.hours)} unit="H" />
          <span className="text-nasun-white/30">:</span>
          <DigitBlock value={pad(timeLeft.minutes)} unit="M" />
          <span className="text-nasun-white/30">:</span>
          <DigitBlock value={pad(timeLeft.seconds)} unit="S" />
        </div>
      )}
    </div>
  );
}

function DigitBlock({ value, unit }: { value: string; unit: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-lg md:text-2xl font-bold leading-none">{value}</span>
      <span className="text-[10px] text-nasun-white/40 mt-0.5">{unit}</span>
    </div>
  );
}

export const CountdownTimer = React.memo(CountdownTimerInner);
