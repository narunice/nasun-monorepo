import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../../../components/layout/PageLayout";

import { Button } from "../../../components/ui/button";
import ErrorBoundary from "../../../components/layout/ErrorBoundary";
import OverviewSkeleton from "../../../components/app/ips/gensol/OverviewSkeleton";

// Lazy load section components
const KoreanConnectionSection = lazy(
  () => import("../../../components/app/ips/gensol/KoreanConnectionSection")
);
const StoryBasedMarketingSection = lazy(
  () => import("../../../components/app/ips/gensol/StoryBasedMarketingSection")
);
const GlobalMarketSection = lazy(
  () => import("../../../components/app/ips/gensol/GlobalMarketSection")
);
const OverarchingSection = lazy(
  () => import("../../../components/app/ips/gensol/OverarchingSection")
);
const FanCommunitySection = lazy(
  () => import("../../../components/app/ips/gensol/FanCommunitySection")
);

export default function OverviewPage() {
  const { t } = useTranslation("genSol");

  return (
    <ErrorBoundary>
      <PageLayout>
        <div className="max-w-8xl mx-auto">
          <Suspense fallback={<OverviewSkeleton />}>
            <KoreanConnectionSection />
            <StoryBasedMarketingSection />
            <GlobalMarketSection />
            <OverarchingSection />
            <FanCommunitySection />
          </Suspense>

          <div className="py-16 flex justify-center">
            <Button variant="outlineC1" size="lg" className="mx-auto w-fit">
              <a href={import.meta.env.VITE_GENSOL_URL} target="_blank" rel="noopener noreferrer">
                {t("button")}
              </a>
            </Button>
          </div>
        </div>
      </PageLayout>
    </ErrorBoundary>
  );
}
