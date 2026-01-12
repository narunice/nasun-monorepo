import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";

/**
 * ContentSection - GenSol Overview Main Content
 *
 * Consolidated section containing:
 * - Overarching Strategy
 * - Narrative (Animation, Live-Action, Movies)
 * - Games (Shooters, Spectra Games, Arkverse)
 * - Fan Community
 */
function ContentSection() {
  const { t } = useTranslation("genSol");

  return (
    <SectionLayout className="">
      {/* Overarching */}
      <div className="max-w-4xl mx-auto mb-8 md:mb-10 lg:mb-12">
        <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("overarching.title")}
        </SectionTitle>
        <div className="space-y-4 md:space-y-6">
          <p>{t("overarching.intro")}</p>
          <p>{t("overarching.p1")}</p>
          <p>{t("overarching.p2")}</p>
          <p>{t("overarching.p3")}</p>
          <p>{t("overarching.p4")}</p>
          <p>{t("overarching.p5")}</p>
        </div>
      </div>

      {/* Narrative */}
      <div className="max-w-4xl mx-auto mb-8 md:mb-10 lg:mb-12">
        <SectionTitle as="h4" className="uppercase text-center mb-2 md:mb-3 lg:mb-4">
          {t("narrative.title")}
        </SectionTitle>

        {/* Animation Series */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <h4 className="text-xl font-semibold mb-4 md:mb-6">{t("narrative.animation.title")}</h4>
          <div className="space-y-4 md:space-y-6">
            <p>{t("narrative.animation.p1")}</p>
            <p>{t("narrative.animation.p2")}</p>
            <p className="mx-4 px-4 border-l-4 border-nasun-c1 italic">
              {t("narrative.animation.p3")}
            </p>
            <p>{t("narrative.animation.p4")}</p>
          </div>
        </div>

        {/* Live-Action Show */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <h4 className="text-xl font-semibold mb-4 md:mb-6">{t("narrative.liveAction.title")}</h4>
          <div className="space-y-4 md:space-y-6">
            <p>{t("narrative.liveAction.p1")}</p>
            <p className="mx-4 px-4 border-l-4 border-nasun-c1 italic">
              {t("narrative.liveAction.p2")}
            </p>
            <p>{t("narrative.liveAction.p3")}</p>
            <p>{t("narrative.liveAction.p4")}</p>
          </div>
        </div>

        {/* Movies */}
        <div>
          <h4 className="text-xl font-semibold mb-4 md:mb-6">{t("narrative.movies.title")}</h4>
          <div className="space-y-4 md:space-y-6">
            <p className="mx-4 px-4 border-l-4 border-nasun-c1 italic">
              {t("narrative.movies.p1")}
            </p>
          </div>
        </div>
      </div>

      {/* Games */}
      <div className="max-w-4xl mx-auto mb-8 md:mb-10 lg:mb-12">
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
        <div>
          <h4 className="text-xl font-semibold mb-4 md:mb-6">{t("games.arkverse.title")}</h4>
          <div className="space-y-4 md:space-y-6">
            <p>{t("games.arkverse.p1")}</p>
            <p>{t("games.arkverse.p2")}</p>
            <p>{t("games.arkverse.p3")}</p>
            <p>{t("games.arkverse.p4")}</p>
          </div>
        </div>
      </div>

      {/* Fan Community */}
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("games.fanCommunity.title")}
        </SectionTitle>
        <div className="space-y-4 md:space-y-6">
          <p>{t("games.fanCommunity.p1")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(ContentSection);
