import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../../components/layout/PageLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";

const OpportunitiesSection = lazy(() => import("../../components/app/about/OpportunitiesSection"));

export default function OpportunitiesPage() {
  const { t } = useTranslation(["opportunities", "common"]);

  return (
    <PageLayout className="relative">
      {/* Content Section */}
      <div className="relative z-10 min-h-screen">
        <ErrorBoundary fallback={<div>{t("common:info.loading")}</div>}>
          <Suspense fallback={<div>{t("common:info.loading")}</div>}>
            <OpportunitiesSection />
          </Suspense>
        </ErrorBoundary>
      </div>
    </PageLayout>
  );
}
