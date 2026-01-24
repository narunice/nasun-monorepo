import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox } from "@/components/ui/DividerBox";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Button } from "@/components/ui/button";
import { ExternalLink, User, Layers, ShieldCheck, Zap, Repeat, Globe, Lock } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";

export const UnifiedOnchain = () => {
  const { t } = useTranslation("pado");

  return (
    <SectionLayout className="!pt-0 !max-w-6xl">
      {/* ========== MAIN TITLE ========== */}
      <PageTitle as="h2" className="normal-case ">
        {t("unifiedOnchain.pageTitle")}
      </PageTitle>

      <div className="flex flex-col gap-6 md:gap-8 lg:gap-10 -mt-4 md:-mt-5 lg:-mt-6">
        {/* Subtitle Box */}
        <OuterBox color="w1" padding="md" className="!bg-[#3D3D3D]">
          <p className="text-nasun-white font-medium text-lg md:text-xl text-center ">
            {t("unifiedOnchain.subtitle.text")}
          </p>
          <Button
            variant="c1"
            size="lg"
            className="flex w-fit items-center gap-2 mt-6 mx-auto text-nasun-black"
            asChild
          >
            <a href="https://staging.pado.finance/" target="_blank" rel="noopener noreferrer">
              {t("unifiedOnchain.subtitle.button")}
              <ExternalLink className="w-4 h-4 ml-1" />
            </a>
          </Button>
        </OuterBox>

        {/* ========== CONTENT SECTIONS ========== */}

        {/* 1. Executive Summary */}
        <section>
          <SectionTitle as="h4">{t("unifiedOnchain.section1.title")}</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4 ">
            <p>{t("unifiedOnchain.section1.p1")}</p>
            <p>
              <Trans
                t={t}
                i18nKey="unifiedOnchain.section1.p2"
                components={[
                  <strong className="text-nasun-white font-medium" key="0" />, // Pado
                ]}
              />
            </p>
            <p>{t("unifiedOnchain.section1.p3")}</p>
          </div>
        </section>

        {/* 2. The One-Account Experience */}
        <section>
          <SectionTitle as="h4">{t("unifiedOnchain.section2.title")}</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4 ">
            <p>{t("unifiedOnchain.section2.intro")}</p>

            <div className="flex flex-col gap-4 pt-2">
              <DividerBox
                color="w4"
                hideDivider={true}
                padding="sm"
                title={t("unifiedOnchain.section2.box1.title")}
                icon={<User className="w-5 h-5 text-nasun-c1" />}
              >
                <p className="text-sm md:text-base">
                  <Trans
                    t={t}
                    i18nKey="unifiedOnchain.section2.box1.content"
                    components={[<strong className="text-nasun-white font-medium" key="0" />]}
                  />
                </p>
              </DividerBox>

              <DividerBox
                color="w4"
                hideDivider={true}
                padding="sm"
                title={t("unifiedOnchain.section2.box2.title")}
                icon={<ShieldCheck className="w-5 h-5 text-nasun-c1" />}
              >
                <p className="text-sm md:text-base">
                  <Trans
                    t={t}
                    i18nKey="unifiedOnchain.section2.box2.content"
                    components={[<strong className="text-nasun-white font-medium" key="0" />]}
                  />
                </p>
              </DividerBox>

              <DividerBox
                color="w4"
                hideDivider={true}
                padding="sm"
                title={t("unifiedOnchain.section2.box3.title")}
                icon={<Lock className="w-5 h-5 text-nasun-c1" />}
              >
                <p className="text-sm md:text-base">
                  <Trans
                    t={t}
                    i18nKey="unifiedOnchain.section2.box3.content"
                    components={[<strong className="text-nasun-white font-medium" key="0" />]}
                  />
                </p>
              </DividerBox>
            </div>

            <p className="pt-2">{t("unifiedOnchain.section2.conclusion")}</p>
          </div>
        </section>

        {/* 3. Object-Oriented Markets and Parallel Execution */}
        <section>
          <SectionTitle as="h4">{t("unifiedOnchain.section3.title")}</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4 ">
            <p>{t("unifiedOnchain.section3.intro")}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <DividerBox color="w5" padding="sm" className="h-full">
                <p>
                  <Trans
                    t={t}
                    i18nKey="unifiedOnchain.section3.box1"
                    components={[<strong className="text-nasun-c1 font-medium" key="0" />]}
                  />
                </p>
              </DividerBox>
              <DividerBox color="w5" padding="sm" className="h-full">
                <p>
                  <Trans
                    t={t}
                    i18nKey="unifiedOnchain.section3.box2"
                    components={[<strong className="text-nasun-c1 font-medium" key="0" />]}
                  />
                </p>
              </DividerBox>
              <DividerBox color="w5" padding="sm" className="h-full">
                <p>
                  <Trans
                    t={t}
                    i18nKey="unifiedOnchain.section3.box3"
                    components={[<strong className="text-nasun-c1 font-medium" key="0" />]}
                  />
                </p>
              </DividerBox>
              <DividerBox color="w5" padding="sm" className="h-full">
                <p>
                  <Trans
                    t={t}
                    i18nKey="unifiedOnchain.section3.box4"
                    components={[<strong className="text-nasun-c1 font-medium" key="0" />]}
                  />
                </p>
              </DividerBox>
            </div>

            <p className="pt-2 italic text-base">{t("unifiedOnchain.section3.conclusion")}</p>
          </div>
        </section>

        {/* 4. Unified Risk and Margin Engine */}
        <section>
          <SectionTitle as="h4">{t("unifiedOnchain.section4.title")}</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4 ">
            <p>
              <Trans
                t={t}
                i18nKey="unifiedOnchain.section4.intro"
                components={[<strong className="text-nasun-white font-medium" key="0" />]}
              />
            </p>

            <OuterBox color="c1" padding="md" className="space-y-4">
              <div className="flex gap-3">
                <Zap className="w-6 h-6 text-nasun-c1 shrink-0 mt-1" />
                <p>
                  <Trans
                    t={t}
                    i18nKey="unifiedOnchain.section4.box.item1"
                    components={[<strong className="text-nasun-white font-medium" key="0" />]}
                  />
                </p>
              </div>

              <div className="pl-9 space-y-2">
                <p className="font-medium text-nasun-white underline underline-offset-4 decoration-nasun-c1/50 mb-3">
                  {t("unifiedOnchain.section4.box.listTitle")}
                </p>
                <ul className="space-y-2 list-disc pl-5">
                  {(t("unifiedOnchain.section4.box.list", { returnObjects: true }) as string[]).map(
                    (_, index) => (
                      <li key={index}>
                        <Trans
                          t={t}
                          i18nKey={`unifiedOnchain.section4.box.list.${index}` as never}
                          components={[<strong className="text-nasun-white font-medium" key="0" />]}
                        />
                      </li>
                    ),
                  )}
                </ul>
              </div>

              <div className="flex gap-3">
                <ShieldCheck className="w-6 h-6 text-nasun-c1 shrink-0 mt-1" />
                <p>
                  <Trans
                    t={t}
                    i18nKey="unifiedOnchain.section4.box.item2"
                    components={[<strong className="text-nasun-white font-medium" key="0" />]}
                  />
                </p>
              </div>
            </OuterBox>

            <p>{t("unifiedOnchain.section4.conclusion")}</p>
          </div>
        </section>

        {/* 5. Native Lending, Borrowing, and Staking */}
        <section>
          <SectionTitle as="h4">{t("unifiedOnchain.section5.title")}</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4 ">
            <p>{t("unifiedOnchain.section5.intro")}</p>

            <div className="grid md:grid-col-1 lg:grid-cols-3 gap-6 pt-2">
              <DividerBox
                color="w4"
                hideDivider={true}
                padding="sm"
                title={t("unifiedOnchain.section5.box1.title")}
                icon={<Layers className="w-5 h-5 text-nasun-c1" />}
                titleClassName="!text-nasun-c1"
              >
                <p className="text-sm md:text-base">{t("unifiedOnchain.section5.box1.content")}</p>
              </DividerBox>

              <DividerBox
                color="w4"
                hideDivider={true}
                padding="sm"
                title={t("unifiedOnchain.section5.box2.title")}
                icon={<Repeat className="w-5 h-5 text-nasun-c1" />}
                titleClassName="!text-nasun-c1"
              >
                <p className="text-sm md:text-base">{t("unifiedOnchain.section5.box2.content")}</p>
              </DividerBox>

              <DividerBox
                color="w4"
                hideDivider={true}
                padding="sm"
                title={t("unifiedOnchain.section5.box3.title")}
                icon={<Globe className="w-5 h-5 text-nasun-c1" />}
                titleClassName="!text-nasun-c1 lg:min-h-[46px]"
              >
                <p className="text-sm md:text-base">{t("unifiedOnchain.section5.box3.content")}</p>
              </DividerBox>
            </div>

            <p className="pt-2">{t("unifiedOnchain.section5.conclusion")}</p>
          </div>
        </section>

        {/* 6. Programmable Cross-Chain Asset Access */}
        <section>
          <SectionTitle as="h4">{t("unifiedOnchain.section6.title")}</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4 ">
            <p>
              <Trans
                t={t}
                i18nKey="unifiedOnchain.section6.intro"
                components={[<strong className="text-nasun-white font-medium" key="0" />]}
              />
            </p>

            <ul className="space-y-3 list-disc pl-8 md:pl-12 marker:text-nasun-c1">
              {(t("unifiedOnchain.section6.list", { returnObjects: true }) as string[]).map(
                (item, index) => (
                  <li key={index}>{item}</li>
                ),
              )}
            </ul>

            <p>{t("unifiedOnchain.section6.conclusion")}</p>
          </div>
        </section>

        {/* 7. Insurance and Extreme Risk Management */}
        <section>
          <SectionTitle as="h4">{t("unifiedOnchain.section7.title")}</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4 ">
            <p>
              <Trans
                t={t}
                i18nKey="unifiedOnchain.section7.intro"
                components={[<strong className="text-nasun-white font-medium" key="0" />]}
              />
            </p>

            <ul className="space-y-3 list-disc pl-8 md:pl-12 marker:text-nasun-c1">
              {(t("unifiedOnchain.section7.list", { returnObjects: true }) as string[]).map(
                (item, index) => (
                  <li key={index}>{item}</li>
                ),
              )}
            </ul>

            <p>{t("unifiedOnchain.section7.conclusion")}</p>
          </div>
        </section>

        {/* 8. Compliance and Global Readiness */}
        <section>
          <SectionTitle as="h4">{t("unifiedOnchain.section8.title")}</SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4 ">
            <p>
              <Trans
                t={t}
                i18nKey="unifiedOnchain.section8.intro"
                components={[<strong className="text-nasun-white font-medium" key="0" />]}
              />
            </p>

            <ul className="space-y-3 list-disc pl-8 md:pl-12 marker:text-nasun-c1">
              {(t("unifiedOnchain.section8.list", { returnObjects: true }) as string[]).map(
                (_, index) => (
                  <li key={index}>
                    <Trans
                      t={t}
                      i18nKey={`unifiedOnchain.section8.list.${index}` as never}
                      components={[<strong className="text-nasun-white font-medium" key="0" />]}
                    />
                  </li>
                ),
              )}
            </ul>

            <p>{t("unifiedOnchain.section8.conclusion")}</p>
          </div>
        </section>

        {/* 9. The Result */}
        <section>
          <SectionTitle as="h4">{t("unifiedOnchain.section9.title")}</SectionTitle>
          <div className="space-y-6">
            <p className="text-nasun-white/90 text-lg font-light">
              {t("unifiedOnchain.section9.intro")}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <DividerBox color="w4" hideDivider={true} padding="sm">
                <p className="text-nasun-c1 font-medium flex items-center gap-2">
                  {t("unifiedOnchain.section9.box1.title")}
                </p>
                <p className="text-sm mt-1">{t("unifiedOnchain.section9.box1.content")}</p>
              </DividerBox>
              <DividerBox color="w4" hideDivider={true} padding="sm">
                <p className="text-nasun-c1 font-medium flex items-center gap-2">
                  {t("unifiedOnchain.section9.box2.title")}
                </p>
                <p className="text-sm mt-1">{t("unifiedOnchain.section9.box2.content")}</p>
              </DividerBox>
              <DividerBox color="w4" hideDivider={true} padding="sm">
                <p className="text-nasun-c1 font-medium flex items-center gap-2">
                  {t("unifiedOnchain.section9.box3.title")}
                </p>
                <p className="text-sm mt-1">{t("unifiedOnchain.section9.box3.content")}</p>
              </DividerBox>
            </div>

            <p className="text-nasun-white/90 leading-relaxed text-lg font-light italic">
              {t("unifiedOnchain.section9.conclusion")}
            </p>
          </div>
        </section>
      </div>
    </SectionLayout>
  );
};

export default UnifiedOnchain;
