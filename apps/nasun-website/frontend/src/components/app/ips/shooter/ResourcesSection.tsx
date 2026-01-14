import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";
import { Button } from "../../../ui/button";

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
 * ResourcesSection - Spectra Resources & Schedule
 *
 * Consolidated section containing:
 * - Genesis NFT Funds Allocation
 * - Hires (Team Positions)
 * - Development Schedule + Contact
 */
function ResourcesSection() {
  const { t } = useTranslation("spectra");

  // Genesis NFT Funds categories
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

  // Hires positions
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

  // Schedule phases
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
    <SectionLayout className="!max-w-6xl ">
      <div className=" mx-auto">
        {/* Genesis NFT Funds */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("foundersNftFunds.title")}
          </SectionTitle>

          <div className="space-y-6 md:space-y-8">
            {categories.map(({ key, data }) => (
              <div key={key}>
                <h4 className="text-lg font-semibold mb-2 md:mb-3">{data.title}</h4>
                <div className="max-w-4xl mx-auto">
                  <ul className="space-y-1 md:space-y-2 lg:space-y-3">
                    {data.items.map((item, index) => (
                      <li key={index} className="flex">
                        <span className="text-nasun-c1 mr-4">●</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hires */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("hires.title")}
          </SectionTitle>

          <div className="space-y-6 md:space-y-8">
            {positions.map(({ key, data }) => (
              <div key={key} className="flex gap-4">
                <div className="w-0.5 bg-nasun-c1 flex-shrink-0 my-1" />
                <div>
                  <h4 className="text-lg font-semibold mb-2 md:mb-3">{data.title}</h4>

                  <div className="space-y-3 md:space-y-4">
                    <div>
                      <h5 className="text-sm font-medium text-nasun-c1 mb-1">Skills</h5>
                      <p>{data.skills}</p>
                    </div>

                    <div>
                      <h5 className="text-sm font-medium text-nasun-c1 mb-1">Work</h5>
                      <ul className="space-y-1">
                        {data.work.map((item, index) => (
                          <li key={index} className="flex items-start">
                            <span className="text-nasun-c1 mr-2">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Schedule */}
        <div>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("schedule.title")}
          </SectionTitle>

          <div className="space-y-8 md:space-y-10">
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
                    <h4 className="text-nasun-c1 font-semibold text-lg mb-4">
                      Phase {phaseIndex + 1}
                    </h4>

                    <div className="space-y-4">
                      {phaseData.sections.map((section: SectionData, sectionIndex: number) => (
                        <React.Fragment key={sectionIndex}>
                          <div>
                            <p className="font-medium mb-1">{section.title}</p>
                            {section.items && section.items.length > 0 && (
                              <ul className="pl-4 space-y-0.5">
                                {section.items.map((item: string, itemIndex: number) => (
                                  <li key={itemIndex} className="text-sm opacity-80">
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Contact Section */}
          <div className="text-center py-8 mt-8 border-t border-nasun-white/20">
            <p className="text-lg mb-4">{t("contact.text")}</p>
            <Button variant="c1" size="lg" asChild>
              <a href="mailto:admin@nasun.io">{t("contact.button")}</a>
            </Button>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(ResourcesSection);
