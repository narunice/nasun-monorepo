import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";

interface ItemData {
  title: string;
  description: string;
}

function PrototypeDevelopmentSection() {
  const { t } = useTranslation("spectra");
  const items = t("prototypeDevelopment.items", { returnObjects: true }) as ItemData[];

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h3" className="mb-2 md:mb-3 lg:mb-4">
          {t("prototypeDevelopment.title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          {items.map((item, index) => (
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
    </SectionLayout>
  );
}

export default React.memo(PrototypeDevelopmentSection);
