import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "@/components/layout/PageLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { PageTitle } from "@/components/ui/PageTitle";

// Lazy load section components (3 sections total)
const OverviewSection = lazy(() => import("@/components/app/ips/gensol/heist/OverviewSection"));
const CharactersSection = lazy(() => import("@/components/app/ips/gensol/heist/CharactersSection"));
const ProductionSection = lazy(() => import("@/components/app/ips/gensol/heist/ProductionSection"));

export default function HeistPage() {
  const { t } = useTranslation("heist");

  return (
    <ErrorBoundary>
      <PageLayout>
        <SectionLayout className="">
          <PageTitle>{t("pageTitle")}</PageTitle>
        </SectionLayout>

        <Suspense fallback={null}>
          <OverviewSection />
          <CharactersSection />
          <ProductionSection />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}
