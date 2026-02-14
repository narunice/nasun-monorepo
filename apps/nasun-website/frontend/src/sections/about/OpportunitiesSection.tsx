import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox, OuterBox } from "@/components/ui";
import { PageTitle } from "@/components/ui/PageTitle";

function OpportunitiesSection() {
  const { t } = useTranslation("opportunities");

  const positions = [t("position1"), t("position2"), t("position3"), t("position4")];

  return (
    <SectionLayout className="!max-w-6xl">
      <div className="flex flex-col gap-6 md:gap-8 lg:gap-10">
        <PageTitle as="h2" align="center">
          {t("title")}
        </PageTitle>

        {/* First Box - Join Our Team */}
        <OuterBox color="w1">
          <div className="text-left mb-6 md:mb-8">
            <h4 className="font-medium text-nasun-white -mb-1">{t("joinTeam.heading")}</h4>
            <h5 className="text-nasun-nw1">{t("joinTeam.subheading")}</h5>
          </div>

          {/* Opportunities Cards */}
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DividerBox
                color="w5"
                disableHover={true}
                title={t("advisors.title")}
                titleClassName="!text-nasun-nw1"
                description={t("advisors.description")}
              />
              <DividerBox
                color="w5"
                disableHover={true}
                title={t("partners.title")}
                titleClassName="!text-nasun-nw1"
                description={t("partners.description")}
              />
            </div>
            <DividerBox
              color="w5"
              disableHover={true}
              title={t("members.title")}
              titleClassName="!text-nasun-nw1"
              description={t("members.description")}
            >
              <ul className="pt-2 list-disc pl-6 space-y-2 marker:text-nasun-nw1 leading-relaxed">
                {positions.map((position, index) => (
                  <li key={index}>{position}</li>
                ))}
              </ul>
            </DividerBox>
          </div>

          <div className="flex justify-center mt-8 md:mt-10">
            <a href="mailto:admin@nasun.io">
              <Button variant="nw1" size="2xl" className="text-white">
                {t("joinTeam.contactButton")}
              </Button>
            </a>
          </div>
        </OuterBox>

        {/* Second Box - Build Your Project */}
        <OuterBox color="w2">
          <div className="text-left mb-6 md:mb-8">
            <h4 className="font-medium text-nasun-white -mb-1">{t("buildProject.heading")}</h4>
            <h5 className="text-nasun-nw4">{t("buildProject.subheading")}</h5>
          </div>
          <p>{t("buildProject.description")}</p>
          <div className="flex justify-center mt-8 md:mt-10">
            <a href="mailto:admin@nasun.io">
              <Button variant="nw4" size="2xl">
                {t("buildProject.startButton")}
              </Button>
            </a>
          </div>
        </OuterBox>
      </div>
    </SectionLayout>
  );
}

export default React.memo(OpportunitiesSection);
