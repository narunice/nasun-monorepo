import React, { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../components/layout/PageLayout";
import { SectionLayout } from "../components/layout/SectionLayout";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { PageTitle } from "../components/ui/PageTitle";
import { SectionTitle } from "../components/ui/SectionTitle";
import { AlertTriangle } from "lucide-react";

type TermSection = {
  title: string;
  content?: string[];
  intro?: string;
  items?: string[];
  warrantyHeader?: string;
  warranties?: string[];
  liabilityHeader?: string;
  liabilities?: string[];
  limits?: string[];
};

type Disclaimer = {
  title: string;
  subtitle: string;
  intro: string;
  header: string;
  items: string[];
};

function TermsOfUsePage() {
  const { t } = useTranslation(["terms", "common"]);

  const disclaimer = t("terms:disclaimer", { returnObjects: true }) as Disclaimer;
  const sections = Object.entries(
    t("terms:sections", { returnObjects: true }) as Record<string, TermSection>,
  );

  return (
    <PageLayout className="pt-6 md:pt-8 lg:pt-10">
      <ErrorBoundary
        fallback={
          <SectionLayout>
            <p className="text-nasun-latte">Content loading failed</p>
          </SectionLayout>
        }
      >
        <Suspense
          fallback={
            <SectionLayout className="!max-w-6xl min-h-screen">
              <p>{t("common:info.loading")}</p>
            </SectionLayout>
          }
        >
          {/* Header */}
          <SectionLayout className="!max-w-6xl ">
            <PageTitle as="h2" align="center" className="uppercase">
              {t("terms:title")}
            </PageTitle>
            <p className="text-center text-gray-400 text-sm mt-2">{t("terms:lastUpdated")}</p>
          </SectionLayout>

          {/* Investment Disclaimer - Highlighted Box */}
          <SectionLayout className="!max-w-6xl">
            <div className="p-6 md:p-8 bg-yellow-900/20 border-2 border-yellow-500/50 rounded-lg">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-yellow-500 flex-shrink-0" />
                <h3 className="text-xl md:text-2xl font-bold text-yellow-200 uppercase">
                  {disclaimer.title}
                </h3>
              </div>
              <p className="text-yellow-200/90 font-medium mb-4">{disclaimer.subtitle}</p>
              <p className="text-gray-300 leading-relaxed mb-4">{disclaimer.intro}</p>
              <p className="text-nasun-white font-medium mb-3">{disclaimer.header}</p>
              <div className="space-y-2 pl-4">
                {disclaimer.items.map((item, idx) => (
                  <p key={idx} className="text-gray-300 leading-relaxed">
                    <strong className="text-nasun-white">{item.split(":")[0]}:</strong>
                    {item.split(":").slice(1).join(":")}
                  </p>
                ))}
              </div>
            </div>
          </SectionLayout>

          {/* Terms Sections */}
          <SectionLayout className="!max-w-6xl">
            <div className="flex flex-col gap-8 md:gap-10 lg:gap-12">
              {sections.map(([key, section]) => (
                <section key={key} className="border-b border-gray-700/50 pb-8 last:border-b-0">
                  <SectionTitle as="h4" className="mb-4 md:mb-5">
                    {section.title}
                  </SectionTitle>

                  <div className="space-y-3 md:space-y-4">
                    {/* Intro text */}
                    {section.intro && (
                      <p className="text-gray-300 leading-relaxed">{section.intro}</p>
                    )}

                    {/* Content paragraphs */}
                    {section.content?.map((paragraph, idx) => (
                      <p key={idx} className="text-gray-300 leading-relaxed">
                        {paragraph}
                      </p>
                    ))}

                    {/* Items list - displayed as paragraphs since data contains (i), (ii) etc. */}
                    {section.items && (
                      <div className="space-y-2 pl-4 md:pl-6">
                        {section.items.map((item, idx) => (
                          <p key={idx} className="text-gray-300 leading-relaxed">
                            {item}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Warranty section (for section 7) */}
                    {section.warrantyHeader && (
                      <>
                        <p className="text-nasun-white font-medium mt-4">
                          {section.warrantyHeader}
                        </p>
                        <div className="space-y-2 pl-4 md:pl-6">
                          {section.warranties?.map((item, idx) => (
                            <p key={idx} className="text-gray-300 leading-relaxed">
                              {item}
                            </p>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Liability section (for section 7) */}
                    {section.liabilityHeader && (
                      <>
                        <p className="text-nasun-white font-medium mt-4">
                          {section.liabilityHeader}
                        </p>
                        <div className="space-y-2 pl-4 md:pl-6">
                          {section.liabilities?.map((item, idx) => (
                            <p key={idx} className="text-gray-300 leading-relaxed">
                              {item}
                            </p>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Limits section (for section 8) */}
                    {section.limits && (
                      <div className="space-y-2 pl-4 md:pl-6">
                        {section.limits.map((item, idx) => (
                          <p key={idx} className="text-gray-300 leading-relaxed font-medium">
                            {item}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </SectionLayout>
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
}

export default React.memo(TermsOfUsePage);
