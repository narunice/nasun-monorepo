import React, { useState, useEffect, useRef } from "react";
import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLayout } from "../../components/layout/SectionLayout";
import { PadoScoreLeaderboard } from "../../features/pado-score-leaderboard/PadoScoreLeaderboard";
import { PageTitle } from "@/components/ui/PageTitle";

const PadoScoreLeaderboardPage: React.FC = () => {
  return (
    <PageLayout>
      <SectionLayout maxWidth="6xl">
        <div className="flex justify-end mt-2 md:mt-4 mb-2 items-center gap-2">
          <span className="text-sm font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
            Experimental Phase
          </span>
          <ExperimentalInfoTooltip />
        </div>
        <PageTitle wrapperClassName="flex flex-col mb-6 md:mb-8 lg:mb-10 xl:mb-12">
          Pado Leaderboard
        </PageTitle>
        <p className="text-base text-nasun-white/80 mb-6 -mt-2">
          Weekly rankings reset every Monday 00:10 UTC. Top traders earn Nasun
          Points.
        </p>
        <PadoScoreLeaderboard />

        {/* Points payout explanation */}
        <div className="mt-8 space-y-4">
          <h6 className="text-nasun-white uppercase tracking-wide">
            How Nasun Points Are Awarded
          </h6>
          <p className="text-base text-nasun-white/80">
            At the end of each week, traders are ranked by their Pado Score and
            receive Ecosystem Points based on their final position.
          </p>
          <p className="text-base text-nasun-white/80 mt-4">
            Pado Score is calculated from trading activity each week: trades,
            volume, pool diversity, and realized PnL. Scores reset every Monday
            and do not carry over.
          </p>

          {/* Row 1: Top 3 */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "1st", pts: 50, crown: true },
              { label: "2nd", pts: 45, crown: false },
              { label: "3rd", pts: 40, crown: false },
            ].map(({ label, pts, crown }) => (
              <div
                key={label}
                className="flex items-center justify-between px-3 py-2.5 rounded-sm bg-pado-4/10 border border-pado-4/40"
              >
                <span className="text-base font-semibold text-pado-4">
                  {crown && <span className="mr-1">&#x1F451;</span>}
                  {label}
                </span>
                <span className="text-base font-bold text-pado-4">
                  {pts} pts
                </span>
              </div>
            ))}
          </div>

          {/* Row 2: Top 10 / 20 / 50 */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Top 10", pts: 35 },
              { label: "Top 20", pts: 30 },
              { label: "Top 50", pts: 25 },
            ].map(({ label, pts }) => (
              <div
                key={label}
                className="flex items-center justify-between px-3 py-2 rounded-sm bg-pd1/30 border border-pd2/25"
              >
                <span className="text-base text-pado-2">{label}</span>
                <span className="text-base font-bold text-pado-3">
                  {pts} pts
                </span>
              </div>
            ))}
          </div>

          {/* Row 3: Top 100 / 200 / 300 */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Top 100", pts: 20 },
              { label: "Top 200", pts: 15 },
              { label: "Top 300", pts: 10 },
            ].map(({ label, pts }) => (
              <div
                key={label}
                className="flex items-center justify-between px-3 py-2 rounded-sm bg-pd1/30 border border-pd2/25"
              >
                <span className="text-base text-pado-2">{label}</span>
                <span className="text-base font-bold text-pado-3">
                  {pts} pts
                </span>
              </div>
            ))}
          </div>

          {/* Row 4: Top 500 / 1000 / 2000 */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Top 500", pts: 8 },
              { label: "Top 1000", pts: 6 },
              { label: "Top 2000", pts: 5 },
            ].map(({ label, pts }) => (
              <div
                key={label}
                className="flex items-center justify-between px-3 py-2 rounded-sm bg-pd1/30 border border-pd2/25"
              >
                <span className="text-base text-pado-2">{label}</span>
                <span className="text-base font-bold text-pado-3">
                  {pts} pts
                </span>
              </div>
            ))}
          </div>

          {/* Genesis Pass 2x banner */}
          <div className="flex items-center gap-3 ">
            <span className="text-xl">&#x2728;</span>
            <div>
              <span className="text-base font-semibold text-nasun-white">
                Genesis Pass Holders
              </span>
              <span className="text-base text-nasun-white/80"> receive a </span>
              <span className="text-base font-semibold text-nasun-white">
                2x multiplier
              </span>
              <span className="text-base text-nasun-white/80">
                {" "}
                on all point payouts.
              </span>
            </div>
          </div>
        </div>
      </SectionLayout>
    </PageLayout>
  );
};

function ExperimentalInfoTooltip() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-nasun-white/50 text-sm leading-none text-nasun-white/70 hover:border-nasun-white/80 hover:text-nasun-white transition-colors"
        aria-label="More info"
      >
        i
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-2 w-80 rounded-lg border border-nasun-c6/60 bg-nasun-c6 p-3 text-left text-sm leading-snug text-nasun-white/70 shadow-lg">
          <p className="text-amber-400 font-semibold mb-1.5">
            Experimental Phase
          </p>
          <p>
            The leaderboard and points system are currently in an experimental
            phase and may be buggy. As real user data accumulates, the scoring
            formula may be rebalanced at any time to ensure fair competition.
          </p>
        </div>
      )}
    </div>
  );
}

export default PadoScoreLeaderboardPage;
