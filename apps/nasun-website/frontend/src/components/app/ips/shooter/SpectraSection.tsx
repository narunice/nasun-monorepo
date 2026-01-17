import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { OuterBox } from "@/components/ui";
import { Button } from "@/components/ui/button";
import progressVideo from "@/assets/videos/Progress-Video-rf28.mp4";

interface ItemData {
  title: string;
  description: string;
}

interface CategoryData {
  title: string;
  items: string[];
}

interface PositionData {
  title: string;
  skills: string;
  work: string[];
}

interface SectionData {
  title: string;
  items?: string[];
}

interface PhaseData {
  sections: SectionData[];
}

/**
 * SpectraSection - Unified Spectra Game Page
 *
 * All content from HeroSection, FeaturesSection, DevelopmentSection, ResourcesSection
 * merged into a single component with consistent spacing per design convention.
 */
function SpectraSection() {
  const { t } = useTranslation("spectra");

  // Features data
  const mainFactorItems = t("mainFactors.items", { returnObjects: true }) as string[];
  const tournamentItems = t("tournaments.items", { returnObjects: true }) as string[];

  // Development data
  const currentStateItems = t("currentState.items", { returnObjects: true }) as ItemData[];
  const prototypeItems = t("prototypeDevelopment.items", { returnObjects: true }) as ItemData[];
  const beyondItems = t("beyondPrototype.items", { returnObjects: true }) as ItemData[];

  // Resources data
  const categoryKeys = [
    "serverBackend",
    "awsSetup",
    "alienSoldier",
    "aerioWeapons",
    "raidersWeapon",
    "weaponParticles",
    "environment",
    "gameImplementation",
    "creatureMugox",
  ];

  const categories = categoryKeys
    .map((key) => {
      const data = t(`foundersNftFunds.categories.${key}` as never, {
        returnObjects: true,
      }) as unknown as CategoryData;
      if (!data || typeof data !== "object" || !Array.isArray(data.items)) {
        return null;
      }
      return { key, data };
    })
    .filter((c): c is { key: string; data: CategoryData } => c !== null);

  const positionKeys = ["artist2d", "artist3d", "ueDesigner", "ueProgrammer"];

  const positions = positionKeys
    .map((key) => {
      const data = t(`hires.positions.${key}` as never, {
        returnObjects: true,
      }) as unknown as PositionData;
      if (!data || typeof data !== "object" || !Array.isArray(data.work)) {
        return null;
      }
      return { key, data };
    })
    .filter((p): p is { key: string; data: PositionData } => p !== null);

  const phaseKeys = [
    "phase1",
    "phase2",
    "phase3",
    "phase4",
    "phase5",
    "phase6",
    "phase7",
    "phase8",
    "phase9",
  ];

  return (
    <SectionLayout className="!max-w-6xl">
      <div className="flex flex-col gap-6 md:gap-8 lg:gap-10">
        {/* ========== HERO ========== */}
        <PageTitle>{t("pageTitle")}</PageTitle>

        {/* Video */}
        <video
          src={progressVideo}
          autoPlay
          loop
          muted
          playsInline
          controls
          className="w-full rounded-lg -mt-10 md:-mt-12 lg:-mt-14"
        />

        {/* Community Engagement */}
        <section>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("communityEngagement.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("communityEngagement.p1")}</p>
            <p>{t("communityEngagement.p2")}</p>
            <p>{t("communityEngagement.p3")}</p>
          </div>
        </section>

        {/* Overview */}
        <section>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("overview.title")}
          </SectionTitle>

          <OuterBox color="n1" className="mb-2 md:mb-3 lg:mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-nasun-white/80">
              <div>
                <span className="text-nasun-c1 font-medium">Genre:</span>{" "}
                {t("overview.specs.genre")}
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

          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("overview.p1")}</p>
            <p>{t("overview.p2")}</p>
            <p>{t("overview.p3")}</p>
            <p>{t("overview.p4")}</p>
          </div>
        </section>

        {/* Game Description */}
        <section>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("gameDescription.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("gameDescription.p1")}</p>
            <p>{t("gameDescription.p2")}</p>
            <p>{t("gameDescription.p3")}</p>
            <p>{t("gameDescription.p4")}</p>
            <p>{t("gameDescription.p5")}</p>
            <p>{t("gameDescription.p6")}</p>
            <p>{t("gameDescription.p7")}</p>
            <p>{t("gameDescription.p8")}</p>
          </div>
        </section>

        {/* ========== FEATURES ========== */}
        {/* Strategy */}
        <section>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("strategy.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("strategy.p1")}</p>
            <p>{t("strategy.p2")}</p>
            <p>{t("strategy.p3")}</p>
          </div>
        </section>

        {/* Details */}
        <section>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("details.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("details.p1")}</p>
            <p>{t("details.p2")}</p>
            <p>{t("details.p3")}</p>
            <p>{t("details.p4")}</p>
            <p>{t("details.p5")}</p>
          </div>
        </section>

        {/* Main Factors */}
        <section>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("mainFactors.title")}
          </SectionTitle>
          <ul className="list-disc pl-6 space-y-2 marker:text-nasun-c1">
            {mainFactorItems.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>

        {/* Tournaments */}
        <section>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("tournaments.title")}
          </SectionTitle>
          <p className="mb-2 md:mb-3 lg:mb-4">{t("tournaments.intro")}</p>
          <ul className="list-disc pl-6 space-y-2 marker:text-nasun-c1">
            {tournamentItems.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>

        {/* Web3 */}
        <section>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("web3.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("web3.p1")}</p>
          </div>
        </section>

        {/* ========== DEVELOPMENT ========== */}
        {/* Current State */}
        <section>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("currentState.title")}
          </SectionTitle>
          <p className="mb-4">{t("currentState.intro")}</p>
          <div className="space-y-4">
            {currentStateItems.map((item, index) => (
              <div key={index} className="flex gap-4">
                <div className="w-0.5 bg-nasun-c1 flex-shrink-0 my-1" />
                <div>
                  <h6 className="font-semibold text-nasun-white mb-1">{item.title}</h6>
                  <p>{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Prototype Development */}
        <section>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("prototypeDevelopment.title")}
          </SectionTitle>
          <div className="space-y-4">
            {prototypeItems.map((item, index) => (
              <div key={index} className="flex gap-4">
                <div className="w-0.5 bg-nasun-c1 flex-shrink-0 my-1" />
                <div>
                  <h6 className="font-semibold text-nasun-white mb-1">{item.title}</h6>
                  <p>{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Beyond Prototype */}
        <section>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("beyondPrototype.title")}
          </SectionTitle>
          <div className="space-y-4">
            {beyondItems.map((item, index) => (
              <div key={index} className="flex gap-4">
                <div className="w-0.5 bg-nasun-c1 flex-shrink-0 my-1" />
                <div>
                  <h6 className="font-semibold text-nasun-white mb-1">{item.title}</h6>
                  <p>{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ========== RESOURCES ========== */}
        {/* Genesis NFT Funds */}
        <section>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("foundersNftFunds.title")}
          </SectionTitle>
          <div className="space-y-6">
            {categories.map(({ key, data }) => (
              <div key={key}>
                <h6 className="font-semibold text-nasun-white mb-2">{data.title}</h6>
                <ul className="list-disc pl-6 space-y-2 marker:text-nasun-c1">
                  {data.items.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Hires */}
        <section>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("hires.title")}
          </SectionTitle>
          <div className="space-y-6">
            {positions.map(({ key, data }) => (
              <div key={key} className="flex gap-4">
                <div className="w-0.5 bg-nasun-c1 flex-shrink-0 my-1" />
                <div>
                  <h6 className="font-semibold text-nasun-white mb-2">{data.title}</h6>
                  <div className="space-y-3">
                    <p>
                      <span className="font-medium text-nasun-c1">Skills: </span>
                      {data.skills}
                    </p>
                    <div>
                      <span className="font-medium text-nasun-c1 block mb-1">Work:</span>
                      <ul className="list-disc pl-6 space-y-1 marker:text-nasun-c1">
                        {data.work.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Schedule */}
        <section>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("schedule.title")}
          </SectionTitle>
          <div className="space-y-6">
            {phaseKeys.map((phaseKey, phaseIndex) => {
              const phaseData = t(`schedule.phases.${phaseKey}` as never, {
                returnObjects: true,
              }) as unknown as PhaseData;

              if (
                !phaseData ||
                typeof phaseData !== "object" ||
                !Array.isArray(phaseData.sections)
              ) {
                return null;
              }

              return (
                <div key={phaseKey} className="flex gap-4">
                  <div className="w-0.5 bg-nasun-c1 flex-shrink-0" />
                  <div className="flex-1">
                    <h6 className="text-nasun-c1 font-semibold  mb-3">Phase {phaseIndex + 1}</h6>
                    <div className="space-y-3">
                      {phaseData.sections.map((section: SectionData, sectionIndex: number) => (
                        <div key={sectionIndex}>
                          <p className="font-medium text-nasun-white mb-1">{section.title}</p>
                          {section.items && section.items.length > 0 && (
                            <ul className="list-disc pl-6 space-y-1 marker:text-nasun-c1 text-sm opacity-80">
                              {section.items.map((item: string, itemIndex: number) => (
                                <li key={itemIndex}>{item}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Contact */}
        <section className="text-center pt-6 border-t border-nasun-white/20">
          <p className="text-lg mb-4">{t("contact.text")}</p>
          <Button variant="c1" size="lg" asChild>
            <a href="mailto:admin@nasun.io">{t("contact.button")}</a>
          </Button>
        </section>
      </div>
    </SectionLayout>
  );
}

export default React.memo(SpectraSection);
