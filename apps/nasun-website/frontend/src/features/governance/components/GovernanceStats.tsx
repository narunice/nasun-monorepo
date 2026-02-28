/**
 * GovernanceStats Component
 *
 * Displays user's governance participation statistics.
 * Shows voted proposals count and participation rate.
 */

import { FC } from "react";
import { useTranslation } from "react-i18next";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { useVoteHistory } from "../hooks/useVoteHistory";
import { OuterBox, Spinner } from "@/components/ui";

interface GovernanceStatsProps {
  className?: string;
}

export const GovernanceStats: FC<GovernanceStatsProps> = ({ className = "" }) => {
  const { t } = useTranslation("proposals");
  const { status, account } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const isConnected = (status === "unlocked" && account) || isZkConnected;

  const { stats, isLoading } = useVoteHistory();

  if (!isConnected) {
    return null;
  }

  if (isLoading) {
    return (
      <OuterBox color="nw2" padding="md" className={className}>
        <div className="flex items-center justify-center py-4">
          <Spinner size="md" />
        </div>
      </OuterBox>
    );
  }

  const { totalProposals, votedProposals, participationRate } = stats;

  // Don't show if no proposals exist
  if (totalProposals === 0) {
    return null;
  }

  return (
    <OuterBox color="nw2" padding="md" className={className}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-nasun-white/70">{t("stats.yourParticipation")}</span>
        <span className="text-sm font-medium text-nasun-white">
          {t("stats.voted", { voted: votedProposals, total: totalProposals, rate: participationRate.toFixed(0) })}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 bg-nasun-nw2/30 rounded-full overflow-hidden">
        <div
          className="h-full bg-nasun-nw1 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(participationRate, 100)}%` }}
        />
      </div>

      {/* Achievement Badge */}
      {participationRate >= 100 && (
        <div className="flex items-center gap-2 mt-3">
          <svg className="w-4 h-4 text-nasun-nw4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          <span className="text-xs text-nasun-nw4 font-medium">{t("stats.fullParticipation")}</span>
        </div>
      )}
    </OuterBox>
  );
};

export default GovernanceStats;
