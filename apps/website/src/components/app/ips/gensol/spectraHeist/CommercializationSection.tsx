import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../../layout/SectionLayout";
import SectionTitle from "../../../../ui/SectionTitle";
import { Button } from "../../../../ui/button";

function CommercializationSection() {
  const { t } = useTranslation("spectraHeist");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("commercialization.title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          <p>{t("commercialization.p1")}</p>
          <p>{t("commercialization.p2")}</p>
        </div>

        {/* NDA Contact Section */}
        <div className="text-center py-8 mt-8 border-t border-nasun-white/20">
          <p className="text-lg mb-4">{t("nda.text")}</p>
          <Button variant="c1" size="lg" asChild>
            <a href="mailto:admin@nasun.io">{t("nda.button")}</a>
          </Button>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(CommercializationSection);
