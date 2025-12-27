import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../../../components/layout/PageLayout";
import { SectionLayout } from "../../../components/layout/SectionLayout";
import ErrorBoundary from "../../../components/layout/ErrorBoundary";
import { PageTitle } from "@/components/ui/PageTitle";

// Lazy load section components
const PlanningIntentSection = lazy(
  () => import("../../../components/app/ips/gensol/spectraHeist/PlanningIntentSection")
);
const SummarySection = lazy(
  () => import("../../../components/app/ips/gensol/spectraHeist/SummarySection")
);
const CharactersSection = lazy(
  () => import("../../../components/app/ips/gensol/spectraHeist/CharactersSection")
);
const CreativeChallengeSection = lazy(
  () => import("../../../components/app/ips/gensol/spectraHeist/CreativeChallengeSection")
);
const CommercializationSection = lazy(
  () => import("../../../components/app/ips/gensol/spectraHeist/CommercializationSection")
);

export default function SpectraHeistPage() {
  const { t } = useTranslation("spectraHeist");

  return (
    <ErrorBoundary>
      <PageLayout>
        <SectionLayout className="">
          <PageTitle>{t("pageTitle")}</PageTitle>
        </SectionLayout>

        <Suspense fallback={null}>
          <PlanningIntentSection />
          <SummarySection />
          <CharactersSection />
          <CreativeChallengeSection />
          <CommercializationSection />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}
