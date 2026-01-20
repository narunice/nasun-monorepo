import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../components/layout/PageLayout";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { SectionLoading } from "../components/ui";

const AwardsSection = lazy(() => import("../sections/updates/awards/AwardsSection"));
const AwardsListSection = lazy(() => import("../sections/updates/awards/AwardsListSection"));

export default function AwardsPage() {
  const { t } = useTranslation(["grants", "common"]);

  return (
    <PageLayout>
      <ErrorBoundary fallback={<div>{t("common:info.loading")}</div>}>
        <Suspense fallback={<SectionLoading />}>
          <AwardsListSection />
          <AwardsSection />
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
}
