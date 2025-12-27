import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";

function BeyondScreensSection() {
  const { t } = useTranslation("products");

  return (
    <SectionLayout title={t("beyondScreens.title")} className="mt-12 md:mt-8">
      <div className="w-full h-full flex flex-col gap-16 md:gap-24 lg:gap-32 mt-6 md:mt-8 lg:mt-10">
        <div className="flex flex-col gap-4 md:gap-6 lg:gap-8">
          <h3>{t("beyondScreens.experiences.title")}</h3>
          <p>{t("beyondScreens.experiences.description1")}</p>
          <p>{t("beyondScreens.experiences.description2")}</p>
          <p>{t("beyondScreens.experiences.description3")}</p>
          <p>{t("beyondScreens.experiences.description4")}</p>
          <p>{t("beyondScreens.experiences.description5")}</p>
        </div>

        <div className="flex flex-col gap-4 md:gap-6 lg:gap-8">
          <h3>{t("beyondScreens.robotStadium.title")}</h3>
          <p>{t("beyondScreens.robotStadium.description1")}</p>
          <p>{t("beyondScreens.robotStadium.description2")}</p>
          <p>{t("beyondScreens.robotStadium.description3")}</p>
        </div>

        <div className="flex flex-col gap-4 md:gap-6 lg:gap-8">
          <h3>{t("beyondScreens.horrorCorridor.title")}</h3>
          <p>{t("beyondScreens.horrorCorridor.description1")}</p>
          <p>{t("beyondScreens.horrorCorridor.description2")}</p>
          <p>{t("beyondScreens.horrorCorridor.description3")}</p>
          <p>{t("beyondScreens.horrorCorridor.description4")}</p>
          <p>{t("beyondScreens.horrorCorridor.description5")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(BeyondScreensSection);
