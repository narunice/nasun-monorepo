import React, { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../../components/layout/PageLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { PageTitle } from "../../components/ui/PageTitle";

const BeyondScreensSection = lazy(() => import("../../components/app/_legacy/products/BeyondScreensSection"));
const ProductsSection = lazy(() => import("../../components/app/_legacy/products/ProductsSection"));

export default function VisionProductsPage() {
  const { t } = useTranslation("products");

  return (
    <ErrorBoundary>
      <PageLayout>
        <PageTitle as="h2" align="center">
          {t("products.title")}
        </PageTitle>

        <Suspense fallback={<div>Loading...</div>}>
          <ProductsSection />
          <BeyondScreensSection />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}
