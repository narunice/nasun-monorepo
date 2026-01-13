import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";

interface ItemData {
  title: string;
  description: string;
}

/**
 * DevelopmentSection - Spectra Development Status
 *
 * Consolidated section containing:
 * - Current State
 * - Prototype Development
 * - Beyond Prototype
 */
function DevelopmentSection() {
  const { t } = useTranslation("spectra");
  const currentStateItems = t("currentState.items", { returnObjects: true }) as ItemData[];
  const prototypeItems = t("prototypeDevelopment.items", { returnObjects: true }) as ItemData[];
  const beyondItems = t("beyondPrototype.items", { returnObjects: true }) as ItemData[];

  return (
    <SectionLayout className="!max-w-6xl ">
      <div className="mx-auto">
        {/* Current State */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("currentState.title")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-6">
            <p>{t("currentState.intro")}</p>
            {currentStateItems.map((item, index) => (
              <div key={index} className="flex gap-4">
                <div className="w-0.5 bg-nasun-c1 flex-shrink-0 my-1" />
                <div>
                  <h4 className="text-base font-semibold mb-1 md:mb-2">{item.title}</h4>
                  <p>{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Prototype Development */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("prototypeDevelopment.title")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-6">
            {prototypeItems.map((item, index) => (
              <div key={index} className="flex gap-4">
                <div className="w-0.5 bg-nasun-c1 flex-shrink-0 my-1" />
                <div>
                  <h4 className="text-base font-semibold mb-1 md:mb-2">{item.title}</h4>
                  <p>{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Beyond Prototype */}
        <div>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("beyondPrototype.title")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-6">
            {beyondItems.map((item, index) => (
              <div key={index} className="flex gap-4">
                <div className="w-0.5 bg-nasun-c1 flex-shrink-0 my-1" />
                <div>
                  <h4 className="text-base font-semibold mb-1 md:mb-2">{item.title}</h4>
                  <p>{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(DevelopmentSection);
