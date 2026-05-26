/**
 * Leaderboard V3 Page
 *
 * Public page displaying the community engagement leaderboard.
 */

import { Suspense } from "react";
// import { Link } from "react-router-dom";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { PageLayout } from "../components/layout/PageLayout";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { SectionLayout } from "../components/layout/SectionLayout";
import { SectionLoading } from "../components/ui/SectionLoading";
import { LeaderboardV3 } from "@/features/leaderboard-v3";

const LeaderboardV3Page = () => {
  const { t } = useTranslation("leaderboard");
  return (
    <PageLayout>
      <ErrorBoundary
        fallback={
          <SectionLayout>
            <p className="text-nasun-white">{t("v3.loadError")}</p>
          </SectionLayout>
        }
      >
        <Suspense fallback={<SectionLoading fullScreen />}>
          <LeaderboardV3 />
        </Suspense>
      </ErrorBoundary>
      {/*
      <div className="flex justify-center pb-12">
        <Link
          to="/community/creators-leaderboard-guide"
          className="text-base text-nasun-nw1 hover:text-nasun-nw2 underline underline-offset-4 transition-colors"
        >
          Creators Leaderboard Guide
        </Link>
      </div>
      */}
    </PageLayout>
  );
};

export default LeaderboardV3Page;
