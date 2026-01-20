import React, { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLayout } from "../../components/layout/SectionLayout";
import { KeyPointsBox } from "../../components/ui/KeyPointsBox";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { PageTitle } from "../../components/ui/PageTitle";

const VisionForChangeSection = lazy(() => import("../../sections/_legacy/manifesto/VisionForChangeSection"));

function VisionManifestoPage() {
  const { t } = useTranslation("manifesto");

  return (
    <ErrorBoundary>
      <PageLayout>
        <SectionLayout title={t("heading")}>
          <PageTitle as="h2" align="center">
            {t("title")}
          </PageTitle>

          <p>{t("paragraph1")}</p>
          <p>{t("paragraph2")}</p>
          <p>{t("paragraph3")}</p>
          <div className="my-12 p-6 bg-gray-950 border-l-4 border-white">
            <blockquote className="italic">{t("quote")}</blockquote>
          </div>
          <p>{t("paragraph4")}</p>
          <p>{t("paragraph5")}</p>
          <p>{t("paragraph6")}</p>
          <p>{t("paragraph7")}</p>
          <p>{t("paragraph8")}</p>
          <p>{t("paragraph9")}</p>
          <p>{t("paragraph10")}</p>
          <p>{t("paragraph11")}</p>
          <p>{t("paragraph12")}</p>
          <p>{t("paragraph13")}</p>
          <p>{t("paragraph14")}</p>
        </SectionLayout>

        <KeyPointsBox
          title={t("commitment.title")}
          points={t("commitment.points", { returnObjects: true }) as string[]}
        />

        <Suspense fallback={<div>Loading...</div>}>
          <VisionForChangeSection />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}

export default React.memo(VisionManifestoPage);
