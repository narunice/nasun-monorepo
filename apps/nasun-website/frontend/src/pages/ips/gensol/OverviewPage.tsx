import { Suspense, lazy } from "react";
// import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { PageLayout } from "@/components/layout/PageLayout";
// import { Button } from "@/components/ui/button";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
// import OverviewSkeleton from "@/sections/ips/gensol/overview/OverviewSkeleton";
import { SectionLoading } from "@/components/ui/SectionLoading";

const GenSolPlanSection = lazy(() => import("@/sections/ips/gensol/overview/GenSolPlanSection"));
// Legacy: const OverviewHeroSection = lazy(() => import("@/sections/ips/gensol/overview/OverviewHeroSection"));

export default function OverviewPage() {
  // const { t } = useTranslation("genSol");

  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={<SectionLoading />}>
          <GenSolPlanSection />
        </Suspense>

        {/* Legacy content — hidden pending removal
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
        */}
      </PageLayout>
    </ErrorBoundary>
  );
}
