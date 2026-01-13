import { Suspense, lazy } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";

// Lazy load section components (4 sections total)
const HeroSection = lazy(() => import("@/components/app/ips/shooter/HeroSection"));
const FeaturesSection = lazy(() => import("@/components/app/ips/shooter/FeaturesSection"));
const DevelopmentSection = lazy(() => import("@/components/app/ips/shooter/DevelopmentSection"));
const ResourcesSection = lazy(() => import("@/components/app/ips/shooter/ResourcesSection"));

export default function SpectraPage() {
  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={null}>
          <HeroSection />
          <FeaturesSection />
          <DevelopmentSection />
          <ResourcesSection />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}
