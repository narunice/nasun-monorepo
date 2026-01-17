import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { PageTitle } from "@/components/ui";

/**
 * OverviewHeroSection - Consolidated Hero Section for GenSol Overview Page
 *
 * Combines:
 * - IntroSection (Page Title, Korean Connection, Story-Based Marketing, Global Market)
 * - ContentSection (Overarching Strategy, Narrative, Games, Fan Community)
 *
 * Following page-design-convention.md guidelines.
 */
function OverviewHeroSection() {
  const { t } = useTranslation("genSol");

  return (
    <SectionLayout className="!max-w-6xl">
      {/* Page Title */}
      <PageTitle className="normal-case">{t("pageTitle")}</PageTitle>

      <div className="flex flex-col gap-6 md:gap-8 lg:gap-10">
        {/* Korean Connection */}
        <section>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("koreanConnection.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p className="text-lg font-light leading-relaxed text-nasun-white/90">
              {t("koreanConnection.p1")}
            </p>
            <p>{t("koreanConnection.p2")}</p>
          </div>
        </section>

        {/* Story-Based Marketing */}
        <section>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("marketing.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("marketing.p1")}</p>
            <p>{t("marketing.p2")}</p>
          </div>
        </section>

        {/* Global Market */}
        <section>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("globalMarket.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("globalMarket.p1")}</p>
            <p>{t("globalMarket.p2")}</p>
          </div>
        </section>

        {/* Overarching Strategy */}
        <section>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("overarching.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p className="text-lg font-light leading-relaxed text-nasun-white/90">
              {t("overarching.intro")}
            </p>
            <p>{t("overarching.p1")}</p>
            <p>{t("overarching.p2")}</p>
            <p>{t("overarching.p3")}</p>
            <p>{t("overarching.p4")}</p>
            <p className="italic">{t("overarching.p5")}</p>
          </div>
        </section>

        {/* Narrative */}
        <section>
          <SectionTitle as="h4" className="uppercase text-center mb-2 md:mb-3 lg:mb-4">
            {t("narrative.title")}
          </SectionTitle>

          <div className="flex flex-col gap-6 md:gap-8">
            {/* Animation Series */}
            <div>
              <h5 className="text-lg font-semibold text-nasun-white mb-2 md:mb-3">
                {t("narrative.animation.title")}
              </h5>
              <div className="space-y-2 md:space-y-3 lg:space-y-4">
                <p>{t("narrative.animation.p1")}</p>
                <p>{t("narrative.animation.p2")}</p>
                <blockquote className="pl-4 border-l-2 border-nasun-c1 italic text-nasun-white/80">
                  {t("narrative.animation.p3")}
                </blockquote>
                <p>{t("narrative.animation.p4")}</p>
              </div>
            </div>

            {/* Live-Action Show */}
            <div>
              <h5 className="text-lg font-semibold text-nasun-white mb-2 md:mb-3">
                {t("narrative.liveAction.title")}
              </h5>
              <div className="space-y-2 md:space-y-3 lg:space-y-4">
                <p>{t("narrative.liveAction.p1")}</p>
                <blockquote className="pl-4 border-l-2 border-nasun-c1 italic text-nasun-white/80">
                  {t("narrative.liveAction.p2")}
                </blockquote>
                <p>{t("narrative.liveAction.p3")}</p>
                <p>{t("narrative.liveAction.p4")}</p>
              </div>
            </div>

            {/* Movies */}
            <div>
              <h5 className="text-lg font-semibold text-nasun-white mb-2 md:mb-3">
                {t("narrative.movies.title")}
              </h5>
              <div className="space-y-2 md:space-y-3 lg:space-y-4">
                <blockquote className="pl-4 border-l-2 border-nasun-c1 italic text-nasun-white/80">
                  {t("narrative.movies.p1")}
                </blockquote>
              </div>
            </div>
          </div>
        </section>

        {/* Games */}
        <section>
          <SectionTitle as="h4" className="uppercase text-center mb-2 md:mb-3 lg:mb-4">
            {t("games.title")}
          </SectionTitle>

          <div className="flex flex-col gap-6 md:gap-8">
            {/* Shooters */}
            <div>
              <h5 className="text-lg font-semibold text-nasun-white mb-2 md:mb-3">
                {t("games.shooters.title")}
              </h5>
              <div className="space-y-2 md:space-y-3 lg:space-y-4">
                <p>{t("games.shooters.p1")}</p>
                <p>{t("games.shooters.p2")}</p>
              </div>
            </div>

            {/* The Spectra Games */}
            <div>
              <h5 className="text-lg font-semibold text-nasun-white mb-2 md:mb-3">
                {t("games.spectraGames.title")}
              </h5>
              <div className="space-y-2 md:space-y-3 lg:space-y-4">
                <p>{t("games.spectraGames.p1")}</p>
              </div>
            </div>

            {/* Arkverse */}
            <div>
              <h5 className="text-lg font-semibold text-nasun-white mb-2 md:mb-3">
                {t("games.arkverse.title")}
              </h5>
              <div className="space-y-2 md:space-y-3 lg:space-y-4">
                <p>{t("games.arkverse.p1")}</p>
                <p>{t("games.arkverse.p2")}</p>
                <p>{t("games.arkverse.p3")}</p>
                <p className="italic">{t("games.arkverse.p4")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Fan Community */}
        <section>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("games.fanCommunity.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("games.fanCommunity.p1")}</p>
          </div>
        </section>
      </div>
    </SectionLayout>
  );
}

export default React.memo(OverviewHeroSection);
