import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "../../ui/button";
import { SectionLayout } from "../../layout/SectionLayout";
import { DividerBox } from "../../ui/DividerBox";

function JoinSection() {
  const { t } = useTranslation("team");

  return (
    <SectionLayout className="!max-w-7xl mx-auto !pb-24">
      <div className="w-full">
        {/* JOIN OUR TEAM Box with Button inside */}
        <DividerBox
          color="w1"
          disableHover={true}
          title={t("joinUs.title")}
          titleClassName="text-nasun-white"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 md:gap-8 mt-1 md:mt-2">
            {/* Description */}
            <p className="text-center md:text-left text-nasun-white/85 text-base">
              {t("joinUs.description")}
            </p>
            {/* Button */}
            <Link to="/team/opportunities" className="shrink-0">
              <Button variant="c3" size="xl" className="w-full md:w-fit">
                {t("joinUs.buttonText")}
              </Button>
            </Link>
          </div>
        </DividerBox>
      </div>
    </SectionLayout>
  );
}

export default React.memo(JoinSection);
