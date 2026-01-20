import React from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXTwitter, faYoutube } from "@fortawesome/free-brands-svg-icons";
import { faTrophy } from "@fortawesome/free-solid-svg-icons";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { OuterBox, DividerBox } from "@/components/ui";
import { Button } from "@/components/ui/button";

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
      {/* Page Title */}
      <PageTitle as="h2" align="center">
        {t("title")}
      </PageTitle>
      <div className="flex flex-col gap-6 md:gap-7 lg:gap8">
        {/* Main Intro Box */}
        <OuterBox color="c1" className="w-full">
          <p className="text-lg font-light leading-relaxed text-nasun-white/90 text-center max-w-3xl mx-auto">
            <span className="text-nasun-c1 font-medium">{t("intro.highlight")}</span>
            {t("intro.rest")}
          </p>
        </OuterBox>

        {/* We're Looking For Section */}
        <section className="space-y-2 md:space-y-3 lg:space-y-4">
          <h3 className="font-medium text-center">{t("lookingFor.title")}</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-7 lg:gap-8 mt-2 md:mt-3 lg:mt-4">
            {/* Content Creators */}
            <DividerBox
              color="c3"
              title={t("contentCreators.title")}
              titleClassName="!text-nasun-c3"
              icon={<FontAwesomeIcon icon={faXTwitter} className="text-nasun-c3 w-5 h-5" />}
            >
              <ul className="list-disc marker:text-nasun-c3 pl-6 space-y-2 md:space-y-3 text-nasun-white/80">
                {contentCreatorsItems.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </DividerBox>

            {/* YouTube Creators */}
            <DividerBox
              color="c3"
              title={t("youtubeCreators.title")}
              titleClassName="!text-nasun-c3"
              icon={<FontAwesomeIcon icon={faYoutube} className="text-nasun-c3 w-5 h-5" />}
            >
              <ul className="list-disc marker:text-nasun-c3 pl-6 space-y-2 md:space-y-3 text-nasun-white/80">
                {youtubeCreatorsItems.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </DividerBox>
          </div>
        </section>

        {/* Rewards Section */}
        <DividerBox
          color="c3"
          title={t("rewards.title")}
          titleClassName="!text-nasun-c3"
          icon={<FontAwesomeIcon icon={faTrophy} className="text-nasun-c3 w-5 h-5" />}
        >
          <p className="text-nasun-white font-medium mb-4">{t("rewards.intro")}</p>
          <ul className="list-disc marker:text-nasun-c3 pl-6 space-y-2 md:space-y-3 text-nasun-white/80">
            {rewardsItems.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </DividerBox>

        {/* Philosophy Section */}
        <OuterBox color="w1" className="">
          <div className="space-y-2 md:space-y-3 lg:space-y-4 text-nasun-white/80 leading-relaxed">
            {philosophyParagraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>

          {/* Contact */}
          <div className="mt-6 md:mt-8 pt-6 border-t border-nasun-white/10 text-center">
            <p className="mb-6 max-w-2xl mx-auto">
              {t("philosophy.closing.before")}
              <span className="text-nasun-white font-medium">
                {t("philosophy.closing.highlight")}
              </span>
              {t("philosophy.closing.after")}
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <a href="mailto:admin@nasun.io">
                <Button variant="c3" size="lg">
                  {t("philosophy.emailButton")}
                </Button>
              </a>
              <a href="https://x.com/Nasun_io" target="_blank" rel="noopener noreferrer">
                <Button variant="c3" size="lg">
                  {t("philosophy.xButton")}{" "}
                  <FontAwesomeIcon icon={faXTwitter} className="ml-2 w-4 h-4" />
                </Button>
              </a>
            </div>
          </div>
        </OuterBox>
      </div>
    </SectionLayout>
  );
};
