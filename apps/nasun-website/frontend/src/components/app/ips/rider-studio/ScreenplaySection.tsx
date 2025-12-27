import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import ScreenplaySteps from "./ScreenplaySteps";

function ScreenplaySection() {
  const { t } = useTranslation("riderStudio");

  return (
    <SectionLayout title={t("riderStudio.screenplay.title")}>
      
        <>
          <p className="">{t("riderStudio.screenplay.description1")}</p>
          <p className="">{t("riderStudio.screenplay.description2")}</p>
          <p className="">{t("riderStudio.screenplay.description3")}</p>
          <p className="">{t("riderStudio.screenplay.description4")}</p>
          <ScreenplaySteps />
        </>
      
    </SectionLayout>
  );
}

export default React.memo(ScreenplaySection);
