import React from "react";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXTwitter, faYoutube } from "@fortawesome/free-brands-svg-icons";
import { faTrophy } from "@fortawesome/free-solid-svg-icons";
import { SectionLayout } from "../../../layout/SectionLayout";
import { PageTitle } from "../../../ui/PageTitle";
import { OuterBox, DividerBox } from "../../../ui";
import { Button } from "../../../ui/button";

export const EarlyContributorsSection: React.FC = () => {
  const { t } = useTranslation("early-contributors");

  const contentCreatorsItems = t("contentCreators.items", {
    returnObjects: true,
  }) as string[];
  const youtubeCreatorsItems = t("youtubeCreators.items", {
    returnObjects: true,
  }) as string[];
  const rewardsItems = t("rewards.items", { returnObjects: true }) as string[];
  const philosophyParagraphs = t("philosophy.paragraphs", { returnObjects: true }) as string[];

  return (
    <SectionLayout className="!max-w-6xl">
      <div className="flex flex-col ">
        {/* Page Title */}
        <PageTitle as="h2" align="center">
          {t("title")}
        </PageTitle>

        {/* Main Intro Box */}
        <OuterBox
          color="n1"
          className="max-w-4xl mx-auto border-nasun-c4 !bg-nasun-c4/10 mb-4 md:mb-6 lg:mb-8 xl:mb-10"
        >
          <h6 className="text-nasun-white/80 text-center">
            <span className="text-nasun-c4 font-medium">{t("intro.highlight")}</span>
            {t("intro.rest")}
          </h6>
        </OuterBox>

        {/* We're Looking For Section */}
        <div className="space-y-6 mb-6">
          <h3 className="font-medium text-center">{t("lookingFor.title")}</h3>

          <div className="flex flex-col md:grid md:grid-cols-2 gap-6">
            {/* Content Creators */}
            <DividerBox
              color="c3"
              title={t("contentCreators.title")}
              titleClassName="text-nasun-c3"
              icon={<FontAwesomeIcon icon={faXTwitter} className="text-nasun-c3 text-2xl" />}
            >
              <ul className="space-y-3">
                {contentCreatorsItems.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-nasun-white/80">
                    <span className="text-nasun-c3 mt-1">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </DividerBox>

            {/* YouTube Creators */}
            <DividerBox
              color="c3"
              title={t("youtubeCreators.title")}
              titleClassName="text-nasun-c3"
              icon={<FontAwesomeIcon icon={faYoutube} className="text-nasun-c3 text-2xl" />}
            >
              <ul className="space-y-3">
                {youtubeCreatorsItems.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 text-nasun-white/80">
                    <span className="text-nasun-c3 mt-1">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </DividerBox>
          </div>
        </div>

        {/* Rewards Section */}
        <DividerBox
          color="c3"
          title={t("rewards.title")}
          titleClassName="text-nasun-c3"
          icon={<FontAwesomeIcon icon={faTrophy} className="text-nasun-c3 text-2xl" />}
        >
          <p className="text-nasun-white/90 font-medium mb-4">{t("rewards.intro")}</p>
          <ul className="space-y-3">
            {rewardsItems.map((item, index) => (
              <li key={index} className="flex items-start gap-2 text-nasun-white/80">
                <span className="text-nasun-c3 mt-1">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </DividerBox>

        {/* Philosophy Section */}
        <OuterBox color="n1" className="bg-nasun-c6/50 mt-16">
          <div className="space-y-4 text-nasun-white/80 leading-relaxed">
            {philosophyParagraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>

          {/* Contact - 박스 내부 */}
          <div className="mt-8 pt-6 border-t border-nasun-white/10 text-center px-[11%]">
            <p className="mb-6">
              {t("philosophy.closing.before")}
              <span className="font-medium">{t("philosophy.closing.highlight")}</span>
              {t("philosophy.closing.after")}
            </p>
            <div className="flex justify-center gap-4">
              <a href="mailto:admin@nasun.io">
                <Button variant="c3" size="lg">
                  {t("philosophy.emailButton")}
                </Button>
              </a>
              <a href="https://x.com/Nasun_io" target="_blank" rel="noopener noreferrer">
                <Button variant="c3" size="lg">
                  {t("philosophy.xButton")} <FontAwesomeIcon icon={faXTwitter} className="ml-1" />
                </Button>
              </a>
            </div>
          </div>
        </OuterBox>
      </div>
    </SectionLayout>
  );
};
