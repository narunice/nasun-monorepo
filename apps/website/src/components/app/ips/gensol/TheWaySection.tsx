import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";

function TheWaySection() {
  const { t } = useTranslation("genSol");

  return (
    <SectionLayout title={t("community.title")}>
      
        <p className="">{t("community.paragraph1")}</p>
      
    </SectionLayout>
  );
}

export default React.memo(TheWaySection);
