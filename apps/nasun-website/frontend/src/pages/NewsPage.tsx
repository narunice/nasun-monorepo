import { Suspense, lazy } from "react";
import { PageLayout } from "../components/layout/PageLayout";
import { SectionLoading } from "../components/ui";

const NewsSection = lazy(() => import("../sections/updates/news/NewsSection"));

export default function NewsPage() {
  return (
    <PageLayout>
      <Suspense fallback={<SectionLoading />}>
        <NewsSection />
      </Suspense>
    </PageLayout>
  );
}
