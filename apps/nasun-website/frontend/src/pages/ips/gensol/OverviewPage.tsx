import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import OverviewSkeleton from "@/sections/ips/gensol/overview/OverviewSkeleton";

// Lazy load consolidated hero section
const OverviewHeroSection = lazy(() => import("@/sections/ips/gensol/overview/OverviewHeroSection"));

export default function OverviewPage() {
  const { t } = useTranslation("genSol");

  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={<OverviewSkeleton />}>
          <OverviewHeroSection />
        </Suspense>

        <div className="py-8 md:py-12 flex justify-center">
          <Button variant="c1" size="lg" asChild>
            <a href={import.meta.env.VITE_GENSOL_URL} target="_blank" rel="noopener noreferrer">
              {t("button")}
            </a>
          </Button>
        </div>
      </PageLayout>
    </ErrorBoundary>
  );
}
