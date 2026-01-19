import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";
import { SectionLayout } from "../../layout/SectionLayout";
import { DividerBox, OuterBox } from "../../ui";
import { PageTitle } from "../../ui/PageTitle";

function OpportunitiesSection() {
  const { t } = useTranslation("opportunities");

  const positions = [t("position1"), t("position2"), t("position3"), t("position4")];

  return (
    <SectionLayout className="!max-w-6xl gap-8 md:gap-10 xl:gap-12">
      <PageTitle as="h2" align="center">
        {t("title")}
      </PageTitle>

      {/* First Box - Join Our Team */}
      <OuterBox color="w1" className="bg-nasun-c6/40">
        <div className="text-left mb-6 md:mb-8">
          <h4 className="font-medium text-nasun-white -mb-1">{t("joinTeam.heading")}</h4>
          <h5 className="text-nasun-c1">{t("joinTeam.subheading")}</h5>
        </div>

        {/* Opportunities Cards */}
        <div className="flex flex-col gap-6">
          {/* Advisors & Partners Row (Desktop: 2 columns, Mobile: stacked) */}
          <div className="flex flex-col md:grid md:grid-cols-2 gap-6">
            <DividerBox
              color="c3"
              disableHover={true}
              title={t("advisors.title")}
              titleClassName="text-nasun-c3"
              description={t("advisors.description")}
            />
            <DividerBox
              color="c3"
              disableHover={true}
              title={t("partners.title")}
              titleClassName="text-nasun-c3"
              description={t("partners.description")}
            />
          </div>
          {/* Founding Members (Full width on all screens) */}
          <DividerBox
            color="c3"
            disableHover={true}
            title={t("members.title")}
            titleClassName="text-nasun-c3"
            description={t("members.description")}
          >
            <ul className="pt-2 list-disc list-inside space-y-2 leading-relaxed">
              {positions.map((position, index) => (
                <li key={index}>{position}</li>
              ))}
            </ul>
          </DividerBox>
        </div>

        {/* Contact Us Button */}
        <div className="flex justify-center mt-8 md:mt-10">
          <a href="mailto:admin@nasun.io">
            <Button variant="c1" size="2xl" className="text-white">
              {t("joinTeam.contactButton")}
            </Button>
          </a>
        </div>
      </OuterBox>
      <div className="h-8 md:h-10 lg:h-12 xl:h-14"></div>
      {/* Second Box - Build Your Project */}
      <OuterBox color="n1" className="bg-nasun-c6/40">
        <div className="text-left mb-6 md:mb-8">
          <h4 className="font-medium text-nasun-white -mb-1">{t("buildProject.heading")}</h4>
          <h5 className="text-nasun-c4">{t("buildProject.subheading")}</h5>
        </div>
        <p>{t("buildProject.description")}</p>
        {/* Start Building Button - Outside of Box */}
        <div className="flex justify-center mt-8 md:mt-10">
          <a href="mailto:admin@nasun.io">
            <Button variant="c4" size="2xl">
              {t("buildProject.startButton")}
            </Button>
          </a>
        </div>
      </OuterBox>
    </SectionLayout>
  );
}

export default React.memo(OpportunitiesSection);
