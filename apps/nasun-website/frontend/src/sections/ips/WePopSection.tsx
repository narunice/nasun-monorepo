import React from "react";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { SectionLayout } from "@/components/layout/SectionLayout";

function WePopSection() {
  const { t } = useTranslation("wePop");

  return (
    <SectionLayout title={t("subtitle")}>
      
        <>
          <p className="">{t("paragraph1")}</p>
          <p className="">{t("paragraph2")}</p>
          <p className="">{t("paragraph3")}</p>
          <p className="">{t("paragraph4")}</p>
          <p className="">{t("paragraph5")}</p>
          <p className="">{t("paragraph6")}</p>
        </>
      
    </SectionLayout>
  );
}

export default React.memo(WePopSection);
