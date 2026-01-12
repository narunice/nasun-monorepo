import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../../layout/SectionLayout";
import SectionTitle from "../../../../ui/SectionTitle";

function CharactersSection() {
  const { t } = useTranslation("spectraHeist");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("characters.title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          {/* Josen */}
          <div className="flex gap-4">
            <div className="w-0.5 bg-nasun-c1 flex-shrink-0 my-1" />
            <div>
              <h4 className="text-base font-semibold mb-1 md:mb-2">{t("characters.josen.name")}</h4>
              <p>{t("characters.josen.description")}</p>
            </div>
          </div>

          {/* Naro */}
          <div className="flex gap-4">
            <div className="w-0.5 bg-nasun-c1 flex-shrink-0 my-1" />
            <div>
              <h4 className="text-base font-semibold mb-1 md:mb-2">{t("characters.naro.name")}</h4>
              <p>{t("characters.naro.description")}</p>
            </div>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(CharactersSection);
