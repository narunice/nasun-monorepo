import { Suspense, lazy } from "react";
import { PageLayout } from "../components/layout/PageLayout";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { SectionLoading } from "../components/ui";

const RoadmapIntroSection = lazy(() =>
  import("../sections/updates/roadmap/RoadmapIntroSection").then((module) => ({
    default: module.RoadmapIntroSection,
  }))
);

const RoadmapTimelineSection = lazy(() =>
  import("../sections/updates/roadmap/RoadmapTimelineSection").then((module) => ({
    default: module.RoadmapTimelineSection,
  }))
);

const LiveNowSection = lazy(() =>
  import("../sections/updates/roadmap/LiveNowSection").then((module) => ({
    default: module.LiveNowSection,
  }))
);

export default function RoadmapPage() {
  const { t: tCommon } = useTranslation("common");

  return (
    <PageLayout>
      <ErrorBoundary fallback={<div>{tCommon("info.loading")}</div>}>
        <Suspense fallback={<SectionLoading showLayout={false} />}>
          <RoadmapIntroSection />
          <LiveNowSection />
          <RoadmapTimelineSection />
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
}
