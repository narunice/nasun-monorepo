import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox } from "@/components/ui/DividerBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Infinity as InfinityIcon, Network, Users } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";

const StrategyOverviewV2 = () => {
  const { t } = useTranslation("strategy");

  return (
    <SectionLayout className="!max-w-6xl">
      {/* Page Title */}
      <PageTitle className="normal-case flex flex-col">
        <span>{t("overviewV2.pageTitle.line1")}</span>
        <span className="font-normal text-xl/tight md:text-2xl/tight lg:text-3xl/tight tracking-wide text-nasun-white ">
          {t("overviewV2.pageTitle.line2")}
        </span>
      </PageTitle>

      <div className="flex flex-col gap-6 md:gap-8 lg:gap-10">
        {/* Section 1: The Core Challenge */}
        <section>
          <SectionTitle as="h4">{t("overviewV2.section1.title")}</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4 ">
            {(t("overviewV2.section1.content", { returnObjects: true }) as string[]).map(
              (paragraph, index) => (
                <p key={index}>{paragraph}</p>
              )
            )}

            <DividerBox color="w1" padding="sm">
              <ul className="space-y-4 ">
                <li className="">
                  <Trans
                    t={t}
                    i18nKey="overviewV2.section1.box.item1"
                    components={[<strong className="text-nasun-nw1 " key="0" />]}
                  />
                </li>
                <li>
                  <Trans
                    t={t}
                    i18nKey="overviewV2.section1.box.item2"
                    components={[<strong className="text-nasun-nw1" key="0" />]}
                  />
                </li>
                <li>
                  <Trans
                    t={t}
                    i18nKey="overviewV2.section1.box.item3"
                    components={[<strong className="text-nasun-nw1" key="0" />]}
                  />
                </li>
              </ul>
            </DividerBox>

            <p>
              {t("overviewV2.section1.conclusion.line1")}
              <br />
              <Trans
                t={t}
                i18nKey="overviewV2.section1.conclusion.line2"
                components={[<strong className="text-nasun-white" key="0" />]}
              />
            </p>
            <p>
              <Trans
                t={t}
                i18nKey="overviewV2.section1.conclusion.line3"
                components={[<strong className="text-nasun-white" key="0" />]}
              />
            </p>
            <p>{t("overviewV2.section1.conclusion.line4")}</p>
          </div>
        </section>

        {/* Section 2: Our Solution */}
        <section>
          <SectionTitle as="h4">{t("overviewV2.section2.title")}</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            {(t("overviewV2.section2.intro", { returnObjects: true }) as string[]).map(
              (paragraph, index) => (
                <p key={index}>{paragraph}</p>
              )
            )}
          </div>

          <div className="grid grid-cols-1 gap-8 mt-2 md:mt-3 lg:mt-4">
            <DividerBox
              color="w1"
              className=""
              titleClassName="!text-nasun-nw1"
              icon={<InfinityIcon className="w-5 h-5 text-nasun-nw1" />}
              title={t("overviewV2.section2.box1.title")}
            >
              <div className="space-y-4 text-nasun-white/90 text-lg font-light">
                {(t("overviewV2.section2.box1.content", { returnObjects: true }) as string[]).map(
                  (paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  )
                )}
              </div>
            </DividerBox>

            <DividerBox
              color="w1"
              titleClassName="!text-nasun-nw1"
              icon={<Network className="w-5 h-5 text-nasun-nw1" />}
              title={t("overviewV2.section2.box2.title")}
            >
              <div className="space-y-4 text-nasun-white/90 text-lg font-light">
                {(t("overviewV2.section2.box2.content", { returnObjects: true }) as string[]).map(
                  (paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  )
                )}
              </div>
            </DividerBox>

            <DividerBox
              color="w1"
              titleClassName="!text-nasun-nw1"
              icon={<Users className="w-5 h-5 text-nasun-nw1" />}
              title={t("overviewV2.section2.box3.title")}
            >
              <div className="space-y-4 text-nasun-white/90 text-lg font-light">
                <p>{t("overviewV2.section2.box3.intro")}</p>
                <p>{t("overviewV2.section2.box3.p2")}</p>
                <ul className="list-disc pl-6 space-y-2 marker:text-nasun-nw1">
                  {(t("overviewV2.section2.box3.list", { returnObjects: true }) as string[]).map(
                    (_, index) => (
                      <li key={index}>
                        <Trans
                          t={t}
                          i18nKey={`overviewV2.section2.box3.list.${index}` as never}
                          components={[<strong className="text-nasun-white" key="0" />]}
                        />
                      </li>
                    )
                  )}
                </ul>
                <p>{t("overviewV2.section2.box3.conclusion")}</p>
              </div>
            </DividerBox>
          </div>
        </section>

        {/* Section 3: Built by Creators */}
        <section>
          <SectionTitle as="h4">{t("overviewV2.section3.title")}</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            {(t("overviewV2.section3.content", { returnObjects: true }) as string[]).map(
              (paragraph, index) => (
                <p key={index}>{paragraph}</p>
              )
            )}
          </div>
        </section>

        {/* Section 4: The Coordination Pipeline */}
        <section>
          <SectionTitle as="h4">{t("overviewV2.section4.title")}</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("overviewV2.section4.intro")}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2 md:mt-3 lg:mt-4">
            <DividerBox color="nw1" title={t("overviewV2.section4.box1.title")}>
              <p className="text-nasun-white/90 text-lg font-light">
                {t("overviewV2.section4.box1.content")}
              </p>
            </DividerBox>
            <DividerBox color="nw1" title={t("overviewV2.section4.box2.title")}>
              <p className="text-nasun-white/90 text-lg font-light">
                {t("overviewV2.section4.box2.content")}
              </p>
            </DividerBox>
            <DividerBox color="nw1" title={t("overviewV2.section4.box3.title")}>
              <p className="text-nasun-white/90 text-lg font-light">
                {t("overviewV2.section4.box3.content")}
              </p>
            </DividerBox>
            <DividerBox color="nw1" title={t("overviewV2.section4.box4.title")}>
              <p className="text-nasun-white/90 text-lg font-light">
                {t("overviewV2.section4.box4.content")}
              </p>
            </DividerBox>
          </div>
          <div className="mt-8 text-nasun-white/90 leading-relaxed text-lg md:text-xl font-light">
            <p>{t("overviewV2.section4.conclusion")}</p>
          </div>
        </section>

        {/* Section 5: Why Now */}
        <section>
          <SectionTitle as="h4">{t("overviewV2.section5.title")}</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("overviewV2.section5.content.0" as never)}</p>
            <p>
              <Trans
                t={t}
                i18nKey={"overviewV2.section5.content.1" as never}
                components={[
                  <strong className="text-nasun-white" key="0" />,
                  <br key="1" />,
                ]}
              />
            </p>
            {(t("overviewV2.section5.content", { returnObjects: true }) as string[])
              .slice(2)
              .map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
          </div>
        </section>
      </div>
    </SectionLayout>
  );
};

export default StrategyOverviewV2;
