import React from "react";
import { PageLayout } from "../../components/layout/PageLayout";
import LeaderboardInfoSection from "../../components/app/wave1/leaderboard-info/LeaderboardInfoSection";

const LeaderboardInfoPage: React.FC = () => {
  return (
    <PageLayout>
      <LeaderboardInfoSection />
    </PageLayout>
  );
};

export default LeaderboardInfoPage;
