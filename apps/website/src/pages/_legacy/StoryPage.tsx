import React from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLayout } from "../../components/layout/SectionLayout";
import CallToActionSection from "../../components/ui/CallToAction";
import { KeyPointsBox } from "../../components/ui/KeyPointsBox";
import { useNavigate } from "react-router-dom";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { PageTitle } from "../../components/ui/PageTitle";

function VisionStoryPage() {
  const { t } = useTranslation("story");
  const navigate = useNavigate();
  const handleNavigateToSale = () => {
    navigate("/founders-nft");
  };

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
          <p>{t("paragraph4")}</p>
          <p>{t("paragraph5")}</p>
          <p>{t("paragraph6")}</p>
          <p>{t("paragraph7")}</p>
          <p>{t("paragraph8")}</p>
          <p>{t("paragraph9")}</p>
          <p>{t("paragraph10")}</p>
          <p>{t("paragraph11")}</p>
          <p>{t("paragraph12")}</p>
        </SectionLayout>

        <KeyPointsBox
          title={t("next_chapter.title")}
          points={t("next_chapter.points", { returnObjects: true }) as string[]}
        />

        <CallToActionSection
          title={t("call.title")}
          description={t("call.description")}
          buttonText={t("call.button")}
          onButtonClick={handleNavigateToSale}
        />
      </PageLayout>
    </ErrorBoundary>
  );
}

export default React.memo(VisionStoryPage);
