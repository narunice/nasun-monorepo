import { useState, useEffect } from 'react';

interface CompetitionCountdownProps {
  targetTime: number;
  compact?: boolean;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calculateTimeLeft(targetTime: number): TimeLeft {
  const now = Date.now();
  const diff = Math.max(0, targetTime - now);

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
  };
}

export function CompetitionCountdown({ targetTime, compact }: CompetitionCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() =>
    calculateTimeLeft(targetTime)
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const next = calculateTimeLeft(targetTime);
      setTimeLeft(next);
      // Stop ticking once expired
      if (next.days === 0 && next.hours === 0 && next.minutes === 0 && next.seconds === 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetTime]);

  const isExpired =
    timeLeft.days === 0 &&
    timeLeft.hours === 0 &&
    timeLeft.minutes === 0 &&
    timeLeft.seconds === 0;

  if (isExpired) {
    return <span className="text-theme-text-muted">Ended</span>;
  }

  if (compact) {
    if (timeLeft.days > 0) {
      return <span>{timeLeft.days}d {timeLeft.hours}h left</span>;
    }
    return (
      <span>
        {String(timeLeft.hours).padStart(2, '0')}:
        {String(timeLeft.minutes).padStart(2, '0')}:
        {String(timeLeft.seconds).padStart(2, '0')}
      </span>
    );
  }

  return (
    <div className="flex gap-2">
      {timeLeft.days > 0 && (
        <div className="text-center">
          <div className="text-xl font-bold text-theme-text-primary">{timeLeft.days}</div>
          <div className="text-xs text-theme-text-secondary">days</div>
        </div>
      )}
      <div className="text-center">
        <div className="text-xl font-bold text-theme-text-primary">
          {String(timeLeft.hours).padStart(2, '0')}
        </div>
        <div className="text-xs text-theme-text-secondary">hours</div>
      </div>
      <div className="text-theme-text-secondary text-xl">:</div>
      <div className="text-center">
        <div className="text-xl font-bold text-theme-text-primary">
          {String(timeLeft.minutes).padStart(2, '0')}
        </div>
        <div className="text-xs text-theme-text-secondary">min</div>
      </div>
      <div className="text-theme-text-secondary text-xl">:</div>
      <div className="text-center">
        <div className="text-xl font-bold text-theme-text-primary">
          {String(timeLeft.seconds).padStart(2, '0')}
        </div>
        <div className="text-xs text-theme-text-secondary">sec</div>
      </div>
    </div>
  );
}
