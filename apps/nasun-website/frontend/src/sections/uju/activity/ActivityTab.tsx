import { EcosystemPointsCard } from "@/sections/myAccount/EcosystemPointsCard";
import { RankHistoryCard } from "@/sections/myAccount/RankHistoryCard";
import { CreatorPostsCard } from "@/sections/myAccount/CreatorPostsCard";
import { GovernanceCard } from "@/sections/myAccount/GovernanceCard";
import { AssetsCard } from "@/sections/myAccount/AssetsCard";
import { BugReportsCard } from "@/sections/myAccount/BugReportsCard";
import { UjuSectionHeader } from "../shared";

interface SectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

function Section({ title, subtitle, children }: SectionProps) {
  return (
    <section>
      <UjuSectionHeader accent title={title} subtitle={subtitle} />
      {children}
    </section>
  );
}

export function ActivityTab() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <Section
        title="Ecosystem Points"
        subtitle="All-time and weekly contribution breakdown"
      >
        <EcosystemPointsCard />
      </Section>

      <Section
        title="Rank History"
        subtitle="Leaderboard standing over time"
      >
        <RankHistoryCard />
      </Section>

      <Section
        title="Creator Posts"
        subtitle="Posts you've published and their performance"
      >
        <CreatorPostsCard />
      </Section>

      <Section
        title="Governance"
        subtitle="Proposals you've voted on or created"
      >
        <GovernanceCard />
      </Section>

      <Section
        title="Assets"
        subtitle="Your NFTs and on-chain holdings across networks"
      >
        <AssetsCard />
      </Section>

      <Section
        title="Bug Reports"
        subtitle="Reports you've submitted to the team"
      >
        <BugReportsCard />
      </Section>
    </div>
  );
}
