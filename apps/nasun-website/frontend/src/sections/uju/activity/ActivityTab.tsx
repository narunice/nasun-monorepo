import { FC, useEffect } from "react";
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
import { consumeScrollTarget } from "../shared/ujuNavigation";

export const ActivityTab: FC = () => {
  const { account } = useWallet();
  const walletAddress = account?.address;

  // Process pending scroll-to-section requests (e.g. "Manage in App Directory"
  // buttons on the dashboard). Only consume targets that belong to this tab —
  // dashboard targets are handled by ActivatedAppsSection.
  useEffect(() => {
    const target = sessionStorage.getItem("uju:scrollTarget");
    if (target !== "apps-directory") return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(
          `[data-uju-scroll-target="${target}"]`,
        );
        if (el) {
          consumeScrollTarget();
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }, []);

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

      {/* section: Governance overview */}
      <UjuGovernanceCard />

      {/* section: Assets (NFTs & Objects) */}
      <UjuAssetsCard walletAddress={walletAddress} />
    </div>
  );
};
