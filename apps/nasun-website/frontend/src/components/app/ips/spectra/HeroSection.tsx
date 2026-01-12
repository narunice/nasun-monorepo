import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "../../../ui/SectionTitle";
import { OuterBox } from "@/components/ui";
import progressVideo from "@/assets/videos/Progress-Video-rf28.mp4";

/**
 * HeroSection - Spectra Game Introduction
 *
 * Consolidated section containing:
 * - Page Title + Progress Video + Community Engagement
 * - Overview with Game Specifications
 * - Game Description
 */
function HeroSection() {
  const { t } = useTranslation("spectra");

  return (
    <SectionLayout className="">
      {/* Page Title + Video + Community Engagement */}
      <PageTitle>{t("pageTitle")}</PageTitle>

      <div className="max-w-4xl mx-auto -mt-4 mb-6">
        <video
          src={progressVideo}
          autoPlay
          loop
          muted
          playsInline
          controls
          className="w-full rounded-lg"
        />
      </div>

      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h4" className="pt-2 mb-2 md:mb-3 lg:mb-4">
          {t("communityEngagement.title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6 mb-8 md:mb-10 lg:mb-12">
          <p>{t("communityEngagement.p1")}</p>
          <p>{t("communityEngagement.p2")}</p>
          <p>{t("communityEngagement.p3")}</p>
        </div>

        {/* Overview */}
        <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
          {t("overview.title")}
        </SectionTitle>

        <OuterBox color="n1" className="mb-2 md:mb-4 lg:mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-nasun-white/80">
            <div>
              <span className="text-nasun-c1 font-medium">Genre:</span> {t("overview.specs.genre")}
            </div>
            <div>
              <span className="text-nasun-c1 font-medium">Player Perspective:</span>{" "}
              {t("overview.specs.perspective")}
            </div>
            <div>
              <span className="text-nasun-c1 font-medium">Number of Players:</span>{" "}
              {t("overview.specs.players")}
            </div>
            <div>
              <span className="text-nasun-c1 font-medium">Setting:</span>{" "}
              {t("overview.specs.setting")}
            </div>
            <div className="md:col-span-2">
              <span className="text-nasun-c1 font-medium">Visual Style:</span>{" "}
              {t("overview.specs.visualStyle")}
            </div>
          </div>
        </OuterBox>

        <div className="space-y-4 md:space-y-6 mb-8 md:mb-10 lg:mb-12">
          <p>{t("overview.p1")}</p>
          <p>{t("overview.p2")}</p>
          <p>{t("overview.p3")}</p>
          <p>{t("overview.p4")}</p>
        </div>

        {/* Game Description */}
        <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
          {t("gameDescription.title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          <p>{t("gameDescription.p1")}</p>
          <p>{t("gameDescription.p2")}</p>
          <p>{t("gameDescription.p3")}</p>
          <p>{t("gameDescription.p4")}</p>
          <p>{t("gameDescription.p5")}</p>
          <p>{t("gameDescription.p6")}</p>
          <p>{t("gameDescription.p7")}</p>
          <p>{t("gameDescription.p8")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(HeroSection);
