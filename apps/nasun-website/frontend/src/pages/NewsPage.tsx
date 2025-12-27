import { Suspense, lazy } from "react";
import { PageLayout } from "../components/layout/PageLayout";
import { SectionLoading } from "../components/ui";

const NewsSection = lazy(() => import("../components/app/updates/news/NewsSection"));

export default function NewsPage() {
  return (
    <PageLayout>
      <Suspense fallback={<SectionLoading />}>
        <NewsSection />
      </Suspense>
    </PageLayout>
  );
}
