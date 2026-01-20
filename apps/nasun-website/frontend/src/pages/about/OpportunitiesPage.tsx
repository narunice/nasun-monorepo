import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../../components/layout/PageLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { SectionLoading } from "@/components/ui/SectionLoading";

const OpportunitiesSection = lazy(() => import("../../sections/about/OpportunitiesSection"));

export default function OpportunitiesPage() {
  const { t } = useTranslation(["opportunities", "common"]);

  return (
    <PageLayout className="relative">
      <ErrorBoundary fallback={<div>{t("common:info.loading")}</div>}>
        <Suspense fallback={<SectionLoading fullScreen />}>
          <OpportunitiesSection />
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
}
