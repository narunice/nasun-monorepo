import Leaderboard from "../components/app/Leaderboard/Leaderboard";
import { PageLayout } from "../components/layout/PageLayout";
import { useTranslation } from "react-i18next";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { Suspense } from "react";
import { SectionLayout } from "../components/layout/SectionLayout";

const LeaderboardPage = () => {
  const { t } = useTranslation(["leaderboard", "common"]);

  return (
    <PageLayout>
      <ErrorBoundary
        fallback={
          <SectionLayout>
            <p className="text-nasun-latte">{t("error.generic", { ns: "common" })}</p>
          </SectionLayout>
        }
      >
        {/* Suspense fallback removed to prevent duplicate loading UI */}
        {/* CumulativeLeaderboard has its own LoadingState component */}
        <Suspense fallback={null}>
          <Leaderboard showAdvancedFeatures={true} />
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
};

export default LeaderboardPage;
