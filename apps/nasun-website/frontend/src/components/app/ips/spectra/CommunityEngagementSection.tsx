import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import SectionTitle from "@/components/ui/SectionTitle";

function CommunityEngagementSection() {
  const { t } = useTranslation("spectra");

  return (
    <SectionLayout className="">
      <PageTitle> {t("pageTitle")}</PageTitle>

      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h3" className="mb-2 md:mb-3 lg:mb-4">
          {t("communityEngagement.title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          <p>{t("communityEngagement.p1")}</p>
          <p>{t("communityEngagement.p2")}</p>
          <p>{t("communityEngagement.p3")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(CommunityEngagementSection);
