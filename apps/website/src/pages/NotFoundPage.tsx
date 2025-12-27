import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../components/layout/PageLayout";
import { SectionLayout } from "../components/layout/SectionLayout";
import { Button } from "../components/ui/button";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { PageTitle } from "../components/ui/PageTitle";

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { t } = useTranslation("common");

  return (
    <PageLayout>
      <ErrorBoundary fallback={<div>{/* @ts-expect-error - i18next translation with namespace */}{t("error.generic", { ns: "common" })}</div>}>
        <SectionLayout>
          <PageTitle as="h2" align="center">
            {/* @ts-expect-error - i18next translation with namespace */}
            {t("title", { ns: "notFound" })}
          </PageTitle>

          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <h1 className="mb-4">
              404
            </h1>
            <p className="text-xl text-gray-400 mb-8">
              {/* @ts-expect-error - i18next translation with namespace */}{t("message", { ns: "notFound" })}
            </p>
            <Button onClick={() => navigate("/")} size="lg">
              {/* @ts-expect-error - i18next translation with namespace */}{t("goHome", { ns: "notFound" })}
            </Button>
          </div>
        </SectionLayout>
      </ErrorBoundary>
    </PageLayout>
  );
}
