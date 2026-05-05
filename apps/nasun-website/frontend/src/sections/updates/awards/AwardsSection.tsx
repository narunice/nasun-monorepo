import React from "react";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox } from "@/components/ui/OuterBox";
import { FadeInUp } from "@/components/ui/FadeInUp";

function AwardsSection() {
  const { t } = useTranslation("grants");

  return (
    <SectionLayout className="!max-w-6xl gap-8 md:gap-10 xl:gap-12">
      <FadeInUp>
        <div>
          <div className="mb-6 md:mb-8">
            <h4 className="font-medium text-nasun-white -mb-1">{t("heading1")}</h4>
            <h5 className="text-nasun-nw4 font-medium">{t("heading2")}</h5>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <OuterBox color="noborder" padding="sm" className="bg-nasun-c6 hover:-translate-y-1 !transition-all !duration-[600ms] !ease-[cubic-bezier(0.25,0.8,0.25,1)]">
              <p className="block font-semibold text-nasun-nw4 tracking-widest uppercase mb-3">
                Track Record
              </p>
              <p>{t("paragraph1")}</p>
            </OuterBox>

            <OuterBox color="noborder" padding="sm" className="bg-nasun-c6 hover:-translate-y-1 !transition-all !duration-[600ms] !ease-[cubic-bezier(0.25,0.8,0.25,1)]">
              <p className="block font-semibold text-nasun-nw4 tracking-widest uppercase mb-3">
                Why It Matters
              </p>
              <p>{t("paragraph2")}</p>
            </OuterBox>

            <OuterBox color="noborder" padding="sm" className="bg-nasun-c6 hover:-translate-y-1 !transition-all !duration-[600ms] !ease-[cubic-bezier(0.25,0.8,0.25,1)]">
              <p className="block font-semibold text-nasun-nw4 tracking-widest uppercase mb-3">
                What's Next
              </p>
              <p>{t("paragraph3")}</p>
            </OuterBox>
          </div>
        </div>
      </FadeInUp>
    </SectionLayout>
  );
}

export default React.memo(AwardsSection);
