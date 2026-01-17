import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "@/components/layout/PageLayout";

import { Button } from "@/components/ui/button";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import OverviewSkeleton from "@/components/app/ips/gensol/overview/OverviewSkeleton";

// Lazy load section components (2 sections total)
const IntroSection = lazy(() => import("@/components/app/ips/gensol/overview/IntroSection"));
const ContentSection = lazy(() => import("@/components/app/ips/gensol/overview/ContentSection"));

export default function OverviewPage() {
  const { t } = useTranslation("genSol");

  return (
    <ErrorBoundary>
      <PageLayout>
        <div className="max-w-8xl mx-auto">
          <Suspense fallback={<OverviewSkeleton />}>
            <IntroSection />
            <ContentSection />
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
