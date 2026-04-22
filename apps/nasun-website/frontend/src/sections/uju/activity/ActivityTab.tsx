import { EcosystemPointsCard } from "@/sections/myAccount/EcosystemPointsCard";
import { RankHistoryCard } from "@/sections/myAccount/RankHistoryCard";
import { CreatorPostsCard } from "@/sections/myAccount/CreatorPostsCard";
import { GovernanceCard } from "@/sections/myAccount/GovernanceCard";
import { AssetsCard } from "@/sections/myAccount/AssetsCard";
import { BugReportsCard } from "@/sections/myAccount/BugReportsCard";

export function ActivityTab() {
  return (
    <div className="space-y-4">
      <EcosystemPointsCard />
      <RankHistoryCard />
      <CreatorPostsCard />
      <GovernanceCard />
      <AssetsCard />
      <BugReportsCard />
    </div>
  );
}
