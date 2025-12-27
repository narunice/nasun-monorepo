import React, { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../../components/layout/PageLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { PageTitle } from "../../components/ui/PageTitle";

const WePopSection = lazy(() => import("../../components/app/ips/WePopSection"));

export default function WePopPage() {
  const { t } = useTranslation("wePop");

  return (
    <ErrorBoundary>
      <PageLayout>
        <PageTitle as="h2" align="center">
          {t("title")}
        </PageTitle>

        <div className="max-w-8xl mx-auto">
          <Suspense fallback={<div>Loading...</div>}>
            <WePopSection />
          </Suspense>
        </div>
      </PageLayout>
    </ErrorBoundary>
  );
}
