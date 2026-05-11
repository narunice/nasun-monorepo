import { FC } from "react";
import { useWallet } from "@nasun/wallet";
import { UjuEcosystemPointsCard } from "./cards/UjuEcosystemPointsCard";
import { UjuRankHistoryCard } from "./cards/UjuRankHistoryCard";
import { UjuEcosystemLeaderboardHistoryCard } from "./cards/UjuEcosystemLeaderboardHistoryCard";
import { UjuDefiLeaderboardHistoryCard } from "./cards/UjuDefiLeaderboardHistoryCard";
import { UjuCreatorPostsCard } from "./cards/UjuCreatorPostsCard";
import { UjuGovernanceCard } from "./cards/UjuGovernanceCard";
import { UjuAppDirectoryCard } from "./cards/UjuAppDirectoryCard";
import { UjuAssetsCard } from "./cards/UjuAssetsCard";
import { UjuBugReportsCard } from "./cards/UjuBugReportsCard";
import { UjuReferralCard } from "./cards/UjuReferralCard";
import { useConsumeScrollTarget } from "../shared/ujuNavigation";

export const ActivityTab: FC = () => {
  const { account } = useWallet();
  const walletAddress = account?.address;

  // "Manage in App Directory →" buttons on the dashboard set a pending
  // scroll target in sessionStorage; consume it on activity-tab mount.
  useConsumeScrollTarget("apps-directory");

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto pb-12">
      {/* section: Nasun Points Breakdown (highest priority) */}
      <UjuEcosystemPointsCard />

      {/* section: Apps, Services, and AI Directory */}
      <UjuAppDirectoryCard />

      {/* section: Nasun Ecosystem Leaderboard History */}
      <UjuEcosystemLeaderboardHistoryCard />

      {/* section: Pado DeFi Leaderboard History */}
      <UjuDefiLeaderboardHistoryCard />

      {/* section: Creators Leaderboard History */}
      <UjuRankHistoryCard />

      {/* section: Creator Posts submission */}
      <UjuCreatorPostsCard />

      {/* section: Bug Reports & Feedback */}
      <UjuBugReportsCard />

      {/* section: Referral program — code issuance gated by 4-path eligibility,
          but referred users always see their own bonus activation status.
          Referee list is privacy-redacted: serial + date + status only. */}
      <UjuReferralCard />

      {/* section: Governance overview */}
      <UjuGovernanceCard />

      {/* section: Assets (NFTs & Objects) */}
      <UjuAssetsCard walletAddress={walletAddress} />
    </div>
  );
};
