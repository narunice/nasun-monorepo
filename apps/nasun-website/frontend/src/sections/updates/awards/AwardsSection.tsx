import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox } from "@/components/ui/OuterBox";
import { FadeInUp } from "@/components/ui/FadeInUp";

function AwardsSection() {
  const { t } = useTranslation("grants");

  return (
    <SectionLayout className="!max-w-6xl gap-8 md:gap-10 xl:gap-12">
      <FadeInUp>
        <OuterBox color="nw4" padding="md" className=" ">
          <div className="text-left mb-4 md:mb-5 lg:mb-6">
            <h4 className="font-medium text-nasun-white -mb-1">{t("heading1")}</h4>
            <h5 className="text-nasun-nw4 font-medium">{t("heading2")}</h5>
          </div>

          <div className="space-y-4">
            <p>{t("paragraph1")}</p>
            <p>{t("paragraph2")}</p>
            <p>{t("paragraph3")}</p>
            <p>{t("paragraph4")}</p>
          </div>
        </OuterBox>
      </FadeInUp>
    </SectionLayout>
  );
}

export default React.memo(AwardsSection);
