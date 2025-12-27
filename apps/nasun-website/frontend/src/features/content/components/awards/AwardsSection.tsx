import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { OuterBox } from "../../../ui/OuterBox";

function AwardsSection() {
  const { t } = useTranslation("grants");

  return (
    <SectionLayout className="!max-w-6xl gap-8 md:gap-10 xl:gap-12">
      <OuterBox variant="default" className=" ">
        <div className="text-left mb-6 md:mb-8">
          <h4 className="font-medium text-nasun-white -mb-1">{t("heading1")}</h4>
          <h5 className="text-nasun-c4 font-medium">{t("heading2")}</h5>
        </div>

        <div className="space-y-4">
          <p>{t("paragraph1")}</p>
          <p>{t("paragraph2")}</p>
          <p>{t("paragraph3")}</p>
          <p>{t("paragraph4")}</p>
        </div>
      </OuterBox>
    </SectionLayout>
  );
}

export default React.memo(AwardsSection);
