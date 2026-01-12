import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";
import { PageTitle } from "@/components/ui";

function KoreanConnectionSection() {
  const { t } = useTranslation("genSol");

  return (
    <SectionLayout className="">
      {/* Page Title */}
      <PageTitle>{t("pageTitle")}</PageTitle>

      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("koreanConnection.title")}
        </SectionTitle>
        <div className="space-y-4 md:space-y-6">
          <p>{t("koreanConnection.p1")}</p>
          <p>{t("koreanConnection.p2")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(KoreanConnectionSection);
