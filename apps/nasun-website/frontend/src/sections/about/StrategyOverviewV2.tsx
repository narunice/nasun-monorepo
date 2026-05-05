import React from "react";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { ButtonV3 } from "@/components/ui/button-v3";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { MessageSquare, FileText, Vote, Zap, Check, ArrowRight, ArrowDown } from "lucide-react";

const StrategyOverviewV2 = () => {
  const { t } = useTranslation("strategy");

  const frameworkSteps = [
    { Icon: MessageSquare, step: t("v2.section2.collaborate"), description: t("v2.section2.collaborateDesc") },
    { Icon: FileText, step: t("v2.section2.propose"), description: t("v2.section2.proposeDesc") },
    { Icon: Vote, step: t("v2.section2.vote"), description: t("v2.section2.voteDesc") },
    { Icon: Zap, step: t("v2.section2.execute"), description: t("v2.section2.executeDesc") },
  ];

  const networkProvides = t("v2.section3.provides", { returnObjects: true }) as string[];
  const creatorUnderstanding = t("v2.section4.understanding", { returnObjects: true }) as string[];
  const koreaAdvantages = t("v2.section5.advantages", { returnObjects: true }) as string[];

  return (
    <SectionLayout className="!max-w-5xl">
      {/* Title */}
      <PageTitle>NASUN STRATEGY</PageTitle>
      <div className="text-center -mt-2 mb-10 md:mb-14">
        <p className="text-nasun-white/60">A System for Shared Creation</p>
      </div>

      <div className="flex flex-col gap-10 md:gap-14 lg:gap-16">
        {/* 1. The Core Problem */}
        <section>
          <SectionTitle as="h4">
            <span>1.</span> {t("v2.section1.title")}
          </SectionTitle>
          <h5 className="mb-4 md:mb-5">{t("v2.section1.subtitle")}</h5>
          <div className="space-y-3">
            <p>{t("v2.section1.p1")}</p>
            <p>{t("v2.section1.p2")}</p>
            <div className="border-l-4 border-nasun-nw1/40 pl-6 md:pl-8 py-2 space-y-2">
              <p>{t("v2.section1.box1")}</p>
              <p>{t("v2.section1.box2")}</p>
              <p>{t("v2.section1.box3")}</p>
            </div>
            <p>
              {t("v2.section1.p3")}
              <br /> {t("v2.section1.p4")}
            </p>
            <p>{t("v2.section1.p5")}</p>
            <p>{t("v2.section1.p6")}</p>
          </div>
        </section>

        {/* 2. The Nasun Framework */}
        <section>
          <SectionTitle as="h4">
            <span>2.</span> {t("v2.section2.title")}
          </SectionTitle>
          <p className="mb-5 md:mb-6">{t("v2.section2.intro")}</p>

          {/* Flow: horizontal on desktop, vertical on mobile */}
          <div className="flex flex-col md:flex-row items-stretch">
            {frameworkSteps.map(({ Icon, step, description }, index) => (
              <React.Fragment key={step}>
                <OuterBox color="nw0" padding="sm" className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4 text-nasun-nw1 flex-shrink-0" />
                    <h6 className="font-bold">{step}</h6>
                  </div>
                  <p className="text-nasun-white/75">{description}</p>
                </OuterBox>

                {index < frameworkSteps.length - 1 && (
                  <>
                    <div className="hidden md:flex items-center justify-center px-2 text-nasun-nw4/40 flex-shrink-0">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                    <div className="flex md:hidden justify-center py-2 text-nasun-nw4/40">
                      <ArrowDown className="w-4 h-4" />
                    </div>
                  </>
                )}
              </React.Fragment>
            ))}
          </div>
        </section>

        {/* 3. The Network as Economic Backbone */}
        <section>
          <SectionTitle as="h4">
            <span>3.</span> {t("v2.section3.title")}
          </SectionTitle>
          <p className="mb-5">{t("v2.section3.intro")}</p>
          <OuterBox color="nw1" padding="sm">
            <p className="mb-3">{t("v2.section3.providesIntro")}</p>
            <ul className="space-y-2">
              {networkProvides.map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <Check className="w-4 h-4 text-nasun-nw4 flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </OuterBox>
          <p className="mt-4">{t("v2.section3.conclusion")}</p>
        </section>

        {/* 4. Built by Creators, Not Just Engineers */}
        <section>
          <SectionTitle as="h4">
            <span>4.</span> {t("v2.section4.title")}
          </SectionTitle>
          <p className="mb-5">{t("v2.section4.intro")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <OuterBox color="nw0" padding="sm">
              <h6 className="font-bold text-nasun-nw4 mb-2">Naru</h6>
              <p className="text-nasun-white/80">{t("v2.section4.naru")}</p>
            </OuterBox>
            <OuterBox color="nw0" padding="sm">
              <h6 className="font-bold text-nasun-nw4 mb-2">Overclocked</h6>
              <p className="text-nasun-white/80">{t("v2.section4.overclocked")}</p>
            </OuterBox>
          </div>
          <p className="mb-3">{t("v2.section4.understand")}</p>
          <ul className="space-y-2 mb-4">
            {creatorUnderstanding.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-nasun-nw4 flex-shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p>{t("v2.section4.conclusion")}</p>
        </section>

        {/* 5. Why Korea, Why Global */}
        <section>
          <SectionTitle as="h4">
            <span>5.</span> {t("v2.section5.title")}
          </SectionTitle>
          <p className="mb-4">{t("v2.section5.intro")}</p>
          <ul className="space-y-2 mb-5">
            {koreaAdvantages.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-nasun-nw4 flex-shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="font-medium text-nasun-white">{t("v2.section5.global")}</p>
        </section>

        {/* 6. Why Now: The Relevance Era */}
        <section>
          <SectionTitle as="h4">
            <span>6.</span> {t("v2.section6.title")}
          </SectionTitle>
          <div className="space-y-3">
            <p>{t("v2.section6.p1")}</p>
            <p>{t("v2.section6.p2")}</p>
            <p>{t("v2.section6.p3")}</p>
            <p>{t("v2.section6.p4")}</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 my-6 md:my-8">
            {(t("v2.section6.pillars", { returnObjects: true }) as string[]).map((pillar, index) => (
              <React.Fragment key={pillar}>
                {index > 0 && <span className="hidden sm:block text-nasun-nw4/30">|</span>}
                <h5 className="font-medium">{pillar}</h5>
              </React.Fragment>
            ))}
          </div>
          <p>{t("v2.section6.conclusion")}</p>
        </section>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pb-4">
          <ButtonV3 variant="nw1" size="md" disabled>
            Litepaper
          </ButtonV3>
          <ButtonV3 variant="nw1" size="md" outline disabled>
            Join Beta
          </ButtonV3>
          <ButtonV3 variant="nw1" size="md" outline disabled>
            Team Deck
          </ButtonV3>
        </div>
      </div>
    </SectionLayout>
  );
};

export default StrategyOverviewV2;
