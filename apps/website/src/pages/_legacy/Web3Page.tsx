import React from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLayout } from "../../components/layout/SectionLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { PageTitle } from "../../components/ui/PageTitle";

function VisionWeb3Page() {
  const { t } = useTranslation("web3");

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
        </SectionLayout>
      </PageLayout>
    </ErrorBoundary>
  );
}

export default React.memo(VisionWeb3Page);
