import { Suspense, lazy } from "react";
import { PageLayout } from "../../components/layout/PageLayout";
import { useTranslation } from "react-i18next";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import JoinSection from "@/components/app/about/JoinSection";

const FoundersSection = lazy(() => import("../../components/app/about/FoundersSection"));

const FoundersPage = () => {
  const { t } = useTranslation(["team", "common"]);

  return (
    <PageLayout className="relative">
      {/* Content Section */}
      <div className="relative z-10 min-h-screen">
        <ErrorBoundary fallback={<div>{t("common:info.loading")}</div>}>
          <Suspense fallback={<div>{t("common:info.loading")}</div>}>
            <FoundersSection />
            <JoinSection />
          </Suspense>
        </ErrorBoundary>
      </div>
    </PageLayout>
  );
};

export default FoundersPage;
