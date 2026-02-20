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
        <div>
          <div className="mb-6 md:mb-8">
            <h4 className="font-medium text-nasun-white -mb-1">{t("heading1")}</h4>
            <h5 className="text-nasun-nw4 font-medium">{t("heading2")}</h5>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <OuterBox color="nw0" padding="sm">
              <small className="block text-nasun-nw4 tracking-widest uppercase mb-3">
                Track Record
              </small>
              <p>{t("paragraph1")}</p>
            </OuterBox>

            <OuterBox color="nw0" padding="sm">
              <small className="block text-nasun-nw4 tracking-widest uppercase mb-3">
                Why It Matters
              </small>
              <p className="">{t("paragraph2")}</p>
            </OuterBox>

            <OuterBox color="nw0" padding="sm">
              <small className="block text-nasun-nw4 tracking-widest uppercase mb-3">
                What's Next
              </small>
              <p className="text-nasun-white/70">{t("paragraph3")}</p>
            </OuterBox>
          </div>
        </div>
      </FadeInUp>
    </SectionLayout>
  );
}

export default React.memo(AwardsSection);
