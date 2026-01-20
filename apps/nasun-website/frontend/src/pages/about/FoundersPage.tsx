import { Suspense, lazy } from "react";
import { PageLayout } from "../../components/layout/PageLayout";
import { useTranslation } from "react-i18next";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import JoinSection from "@/sections/about/JoinSection";
import { SectionLoading } from "@/components/ui/SectionLoading";

const FoundersSection = lazy(() => import("../../sections/about/FoundersSection"));

const FoundersPage = () => {
  const { t } = useTranslation(["team", "common"]);

  return (
    <PageLayout className="relative">
      <ErrorBoundary fallback={<div>{t("common:info.loading")}</div>}>
        <Suspense fallback={<SectionLoading fullScreen />}>
          <FoundersSection />
          <JoinSection />
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
};

export default FoundersPage;
