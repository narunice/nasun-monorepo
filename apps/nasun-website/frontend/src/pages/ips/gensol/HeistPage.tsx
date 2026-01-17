import { Suspense, lazy } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { SectionLoading } from "@/components/ui/SectionLoading";

// Lazy load consolidated hero section
const HeistHeroSection = lazy(() => import("@/components/app/ips/gensol/heist/HeistHeroSection"));

export default function HeistPage() {
  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={<SectionLoading fullScreen />}>
          <HeistHeroSection />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}
