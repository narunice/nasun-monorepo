import React from "react";
import { useTranslation } from "react-i18next";

import { CumulativeLeaderboard } from "./components";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";

interface LeaderboardProps {
  showAdvancedFeatures?: boolean;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ showAdvancedFeatures = true }) => {
  const { t } = useTranslation("leaderboard");

  return (
    <SectionLayout className="!max-w-7xl px-auto">
      <PageTitle as="h2" align="center">
        {t("title")}
      </PageTitle>

      <CumulativeLeaderboard showAdvancedFeatures={showAdvancedFeatures} />
    </SectionLayout>
  );
};

export default Leaderboard;
