import React from "react";
import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLayout } from "../../components/layout/SectionLayout";
import { PadoScoreLeaderboard } from "../../features/pado-score-leaderboard/PadoScoreLeaderboard";
import { PageTitle } from "@/components/ui/PageTitle";

const PadoScoreLeaderboardPage: React.FC = () => {
  return (
    <PageLayout>
      <SectionLayout maxWidth="6xl">
        <div className="flex justify-end mt-2 md:mt-4 mb-2">
          <span className="text-sm font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
            Experimental Phase
          </span>
        </div>
        <PageTitle wrapperClassName="flex flex-col mb-6 md:mb-8 lg:mb-10 xl:mb-12">
          Pado Score Leaderboard
        </PageTitle>
        <p className="text-base text-nasun-white/80 mb-6 -mt-2">
          Weekly rankings reset every Monday 00:10 UTC. Top traders earn
          Ecosystem Points.
        </p>
        <PadoScoreLeaderboard />

        {/* Points payout explanation */}
        <div className="mt-8 space-y-4">
          <h6 className=" text-nasun-white uppercase tracking-wide">
            How Ecosystem Points Are Awarded
          </h6>
          <p className="text-base text-nasun-white/80">
            At the end of each week, traders are ranked by their Pado Score and
            receive Ecosystem Points based on their final position. Genesis Pass
            holders receive a 2x multiplier on all payouts.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "1st", pts: 50 },
              { label: "2nd", pts: 40 },
              { label: "3rd", pts: 30 },
              { label: "Top 50", pts: 15 },
              { label: "Top 100", pts: 10 },
              { label: "Top 200", pts: 6 },
              { label: "Top 300", pts: 5 },
              { label: "Top 400", pts: 2 },
              { label: "Top 500", pts: 1 },
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
          <p className="text-base text-nasun-white/80 mt-4">
            Pado Score is calculated from trading activity each week: trades,
            volume, pool diversity, and realized PnL. Scores reset every Monday
            and do not carry over.
          </p>
        </div>
      </SectionLayout>
    </PageLayout>
  );
};

export default PadoScoreLeaderboardPage;
