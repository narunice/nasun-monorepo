import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";
import { Button } from "../../../ui/button";

interface SectionData {
  title: string;
  items?: string[];
}

interface PhaseData {
  sections: SectionData[];
}

function ScheduleSection() {
  const { t } = useTranslation("spectra");

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
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
          {t("schedule.title")}
        </SectionTitle>

        <div className="space-y-8 md:space-y-10">
          {phaseKeys.map((phaseKey, phaseIndex) => {
            // Using a more robust way to call t with dynamic keys and return objects
            const phaseData = t(`schedule.phases.${phaseKey}` as any, { // eslint-disable-line @typescript-eslint/no-explicit-any
              returnObjects: true,
            }) as unknown as PhaseData;

            // Type guard to ensure phaseData is valid and has sections
            if (!phaseData || typeof phaseData !== "object" || !Array.isArray(phaseData.sections)) {
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
    </SectionLayout>
  );
}

export default React.memo(ScheduleSection);
