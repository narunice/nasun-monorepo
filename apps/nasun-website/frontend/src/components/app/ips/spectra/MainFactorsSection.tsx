import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";

function MainFactorsSection() {
  const { t } = useTranslation("spectra");
  const items = t("mainFactors.items", { returnObjects: true }) as string[];

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
          {t("mainFactors.title")}
        </SectionTitle>

        <div className="max-w-3xl mx-auto">
          <ul className="space-y-1 md:space-y-2 lg:space-y-3">
            {items.map((item, index) => (
              <li key={index} className="flex">
                <span className="text-nasun-c1 mr-4">●</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(MainFactorsSection);
