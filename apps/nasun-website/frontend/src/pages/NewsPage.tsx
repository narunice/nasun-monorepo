import { Suspense, lazy } from "react";
import { PageLayout } from "../components/layout/PageLayout";
import { SectionLoading } from "../components/ui";
import ErrorBoundary from "../components/layout/ErrorBoundary";

const NewsSection = lazy(() => import("../sections/updates/news/NewsSection"));
const AwardsSection = lazy(() => import("../sections/updates/awards/AwardsSection"));
const AwardsListSection = lazy(() => import("../sections/updates/awards/AwardsListSection"));

export default function NewsPage() {
  return (
    <PageLayout>
      <ErrorBoundary fallback={<div>Loading...</div>}>
        <Suspense fallback={<SectionLoading />}>
          <NewsSection />
          <AwardsListSection />
          <AwardsSection />
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
}
