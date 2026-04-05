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
    <div className="h-[80px] lg:h-[90px] bg-white/5 border border-nasun-white/50 rounded-lg px-4 lg:px-6 flex items-center justify-between gap-4 transition-all duration-200 ease-out hover:scale-[1.03] hover:bg-white/10 hover:border-nasun-white/70 cursor-default">
      {/* Label + price + UTC time */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-nasun-white text-sm lg:text-lg font-semibold whitespace-nowrap">
          {label}
        </span>
        {price && (
          <span className="text-nasun-white/80 text-xs lg:text-base">
            {price}
          </span>
        )}
        {targetTimeUTC && (
          <span className="text-nasun-white/60 text-[11px] lg:text-sm">{targetTimeUTC}</span>
        )}
      </div>

      {/* Countdown or LIVE badge */}
      {isExpired ? (
        <span className="bg-green-500 text-white text-xs md:text-sm font-semibold px-3 py-1 rounded-full whitespace-nowrap">
          LIVE
        </span>
      ) : (
        <div className="flex items-center gap-1 lg:gap-2 font-mono text-nasun-white shrink-0">
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
    <div className="flex flex-col items-center w-6 lg:w-9">
      <span className="text-base lg:text-2xl font-bold leading-none tabular-nums text-center">
        {value}
      </span>
      <span className="text-[10px] text-nasun-white/40 mt-0.5">{unit}</span>
    </div>
  );
}

export const CountdownTimer = React.memo(CountdownTimerInner);
