import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { STAGE_LABELS, STAGE_START_TIMES, calcTimeLeft } from "@/constants/nft-drop";
import { CountdownTimer } from "@/sections/wave1/genesis-pass-drop/CountdownTimer";
import type { EligibilityData } from "@/hooks/useDropPageState";

interface IneligibleCountdownProps {
  currentStage: number;
  eligibility: EligibilityData;
}

function getCountdownTarget(eligibility: EligibilityData): { stage: number; date: Date } | null {
  // Prefer the user's eligible stage if registered
  if (eligibility.eligibleStage != null && STAGE_START_TIMES[eligibility.eligibleStage]) {
    const date = STAGE_START_TIMES[eligibility.eligibleStage];
    if (date.getTime() > Date.now()) {
      return { stage: eligibility.eligibleStage, date };
    }
  }

  // Otherwise find the next future stage
  const entries = Object.entries(STAGE_START_TIMES)
    .map(([k, v]) => ({ stage: Number(k), date: v }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  for (const entry of entries) {
    if (entry.date.getTime() > Date.now()) {
      return entry;
    }
  }

  return null;
}

export function IneligibleCountdown({ currentStage, eligibility }: IneligibleCountdownProps) {
  const target = getCountdownTarget(eligibility);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const stageLabel = STAGE_LABELS[currentStage] || "Unknown";
  const timeLeft = target ? calcTimeLeft(target.date, now) : null;

  return (
    <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-28">
      {/* Stage badge */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex justify-center mb-10"
      >
        <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full text-sm font-semibold tracking-wider uppercase bg-amber-400/10 text-amber-300 border border-amber-400/20">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          {stageLabel}
        </div>
      </motion.div>

      {/* Countdown */}
      {target && timeLeft && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="max-w-md mx-auto"
        >
          <p className="text-nasun-white/70 text-sm text-center mb-4">
            {eligibility.eligibleStageLabel
              ? `Your stage (${eligibility.eligibleStageLabel}) starts in:`
              : `Next stage (${STAGE_LABELS[target.stage] || "Unknown"}) starts in:`}
          </p>
          <CountdownTimer
            label={STAGE_LABELS[target.stage] || "Next Stage"}
            timeLeft={timeLeft}
            isExpired={timeLeft.isExpired}
            targetTimeUTC={target.date.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              timeZone: "UTC",
            }) + " UTC"}
          />
        </motion.div>
      )}

      {!target && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-center py-8"
        >
          <p className="text-nasun-white/80 text-lg font-medium">
            No upcoming stages scheduled.
          </p>
        </motion.div>
      )}

      {/* Navigation buttons */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="flex gap-3 max-w-md mx-auto mt-10"
      >
        <a
          href="/"
          className="flex-1 py-3 rounded-xl text-sm font-semibold border border-nasun-white/30 text-nasun-white hover:bg-nasun-white/10 transition-colors text-center"
        >
          Go to Home
        </a>
        <a
          href="/my-account"
          className="flex-1 py-3 rounded-xl text-sm font-semibold border border-amber-400/30 text-amber-300 hover:bg-amber-400/10 transition-colors text-center"
        >
          Go to Account
        </a>
      </motion.div>
    </section>
  );
}
