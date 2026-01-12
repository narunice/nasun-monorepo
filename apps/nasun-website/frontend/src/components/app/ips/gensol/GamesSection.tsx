import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";

function GamesSection() {
  const { t } = useTranslation("genSol");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h4" className="uppercase text-center mb-2 md:mb-3 lg:mb-4">
          {t("games.title")}
        </SectionTitle>

        {/* Shooters */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <h4 className="text-xl font-semibold mb-4 md:mb-6">{t("games.shooters.title")}</h4>
          <div className="space-y-4 md:space-y-6">
            <p>{t("games.shooters.p1")}</p>
            <p>{t("games.shooters.p2")}</p>
          </div>
        </div>

        {/* The Spectra Games */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <h4 className="text-xl font-semibold mb-4 md:mb-6">{t("games.spectraGames.title")}</h4>
          <div className="space-y-4 md:space-y-6">
            <p>{t("games.spectraGames.p1")}</p>
          </div>
        </div>

        {/* Arkverse */}
        <div className="mb-8">
          <h4 className="text-xl font-semibold mb-4 md:mb-6">{t("games.arkverse.title")}</h4>
          <div className="space-y-4 md:space-y-6">
            <p>{t("games.arkverse.p1")}</p>
            <p>{t("games.arkverse.p2")}</p>
            <p>{t("games.arkverse.p3")}</p>
            <p>{t("games.arkverse.p4")}</p>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(GamesSection);
