import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../../layout/SectionLayout";
import SectionTitle from "../../../../ui/SectionTitle";

function CreativeChallengeSection() {
  const { t } = useTranslation("spectraHeist");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("creativeChallenge.title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          <p>{t("creativeChallenge.p1")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(CreativeChallengeSection);
