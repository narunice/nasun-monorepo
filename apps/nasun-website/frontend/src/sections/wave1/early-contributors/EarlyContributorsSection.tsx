import React from "react";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { ButtonV3 } from "@/components/ui/button-v3";
import { OuterBox } from "@/components/ui";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Mail, ArrowUpRight } from "lucide-react";

function EarlyContributorsSection() {
  const { t } = useTranslation("early-contributors");

  const lookingForItems = t("v2.lookingForItems", { returnObjects: true }) as string[];

  const whatYouGetItems = [
    { head: t("v2.whatYouGetItems.item1.head"), rest: t("v2.whatYouGetItems.item1.rest") },
    { head: t("v2.whatYouGetItems.item2.head"), rest: t("v2.whatYouGetItems.item2.rest") },
    { head: t("v2.whatYouGetItems.item3.head"), rest: t("v2.whatYouGetItems.item3.rest") },
    { head: t("v2.whatYouGetItems.item4.head"), rest: t("v2.whatYouGetItems.item4.rest") },
  ];

  return (
    <SectionLayout className="!max-w-5xl">
      <PageTitle>EARLY CONTRIBUTORS</PageTitle>

      {/* Intro */}
      <div className="mb-8 md:mb-10 lg:mb-12 max-w-3xl mx-auto">
        <p className="mb-4">{t("v2.intro1")}</p>
        <p>{t("v2.intro2")}</p>
      </div>

      <div className="flex flex-col gap-8 md:gap-10">
        {/* What we're looking for */}
        <section>
          <SectionTitle as="h4">{t("v2.lookingFor")}</SectionTitle>
          <OuterBox color="nw0" padding="sm">
            <ul className="space-y-2">
              {lookingForItems.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-nasun-nw4 mt-2 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </OuterBox>
        </section>

        {/* What you get */}
        <section>
          <SectionTitle as="h4">{t("v2.whatYouGet")}</SectionTitle>
          <OuterBox color="nw0" padding="sm">
            <ul className="space-y-2">
              {whatYouGetItems.map(({ head, rest }) => (
                <li key={head} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-nasun-nw4 mt-2 flex-shrink-0" />
                  <span>
                    <span className="font-semibold text-nasun-nw4">{head}</span>
                    {rest}
                  </span>
                </li>
              ))}
            </ul>
          </OuterBox>
        </section>

        {/* Closing */}
        <div className="max-w-3xl mx-auto space-y-4">
          <p>{t("v2.closing1")}</p>
          <p>{t("v2.closing2")}</p>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <ButtonV3 variant="nw1" size="md" asChild>
            <a href="mailto:admin@nasun.io" className="inline-flex items-center gap-2">
              <Mail size={16} />
              {t("v2.emailUs")}
            </a>
          </ButtonV3>
          <ButtonV3 variant="nw1" size="md" asChild>
            <a
              href="https://x.com/Nasun_io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2"
            >
              {t("v2.dmNasun")}
              <ArrowUpRight size={16} />
            </a>
          </ButtonV3>
        </div>
      </div>
    </SectionLayout>
  );
}

export { EarlyContributorsSection };
export default React.memo(EarlyContributorsSection);
