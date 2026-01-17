import { Leaderboard } from "@/features/leaderboard";
import { PageLayout } from "../components/layout/PageLayout";
import { useTranslation } from "react-i18next";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { Suspense } from "react";
import { SectionLayout } from "../components/layout/SectionLayout";
import { SectionLoading } from "../components/ui/SectionLoading";

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
        <Suspense fallback={<SectionLoading fullScreen />}>
          <Leaderboard showAdvancedFeatures={true} />
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
};

export default LeaderboardPage;
