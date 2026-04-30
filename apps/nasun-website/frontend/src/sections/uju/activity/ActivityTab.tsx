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

export const ActivityTab: FC = () => {
  const { account } = useWallet();
  const walletAddress = account?.address;

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto pb-12">
      {/* 1. Ecosystem Points (Highest priority) */}
      <UjuEcosystemPointsCard />

      {/* 2. Ecosystem Leaderboard History */}
      <UjuEcosystemLeaderboardHistoryCard />

      {/* 3. DeFi Leaderboard History (Pado) */}
      <UjuDefiLeaderboardHistoryCard />

      {/* 4. Creators Leaderboard History */}
      <UjuRankHistoryCard />

      {/* 3. Creator Posts submission */}
      <UjuCreatorPostsCard />

      {/* 4. Governance overview */}
      <UjuGovernanceCard />

      {/* 5. Apps, Services, and AI Directory */}
      <UjuAppDirectoryCard />

      {/* 6. Assets (NFTs & Objects) */}
      <UjuAssetsCard walletAddress={walletAddress} />

      {/* 7. Bug Reports history */}
      <UjuBugReportsCard />
    </div>
  );
};
