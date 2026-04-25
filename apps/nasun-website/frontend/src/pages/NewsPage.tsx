import { Suspense, lazy } from "react";
import { PageLayout } from "../components/layout/PageLayout";
import { SectionLoading } from "../components/ui";
import ErrorBoundary from "../components/layout/ErrorBoundary";

const NewsSection = lazy(() => import("../sections/updates/news/NewsSection"));

export default function NewsPage() {
  return (
    <PageLayout>
      <ErrorBoundary fallback={<div>Loading...</div>}>
        <Suspense fallback={<SectionLoading />}>
          <NewsSection />
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
}
