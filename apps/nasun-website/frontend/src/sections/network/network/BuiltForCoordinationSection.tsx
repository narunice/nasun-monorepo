import React from "react";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { FadeInUp } from "@/components/ui/FadeInUp";

const COORDINATION_KEYS = ["item1", "item2", "item3", "item4"] as const;

function BuiltForCoordinationSection() {
  const { t } = useTranslation("tokenomics");

  return (
    <SectionLayout maxWidth="6xl">
      <FadeInUp>
      <div className="max-w-5xl w-full mx-auto">
        <div className="w-full md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto">
          <SectionTitle as="h4" className="font-normal uppercase">
            {t("builtForCoordination.heading")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <p>{t("builtForCoordination.description")}</p>

            <ul className="space-y-2 list-disc pl-6 md:pl-8 marker:text-nasun-nw4">
              {COORDINATION_KEYS.map((key) => (
                <li key={key}>
                  <p>{t(`builtForCoordination.${key}`)}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      </FadeInUp>
    </SectionLayout>
  );
}

export default BuiltForCoordinationSection;
