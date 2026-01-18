import React, { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../components/layout/PageLayout";
import { SectionLayout } from "../components/layout/SectionLayout";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { PageTitle } from "../components/ui/PageTitle";
import { SectionTitle } from "../components/ui/SectionTitle";
import { AlertTriangle } from "lucide-react";

type Subsection = {
  title: string;
  items: string[];
};

type PrivacySection = {
  title: string;
  content?: string[];
  intro?: string;
  items?: string[];
  subsections?: Subsection[];
  note?: string;
};

type DevnetNotice = {
  title: string;
  content: string;
};

const toRoman = (num: number): string => {
  const numerals = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
  return numerals[num - 1] || num.toString();
};

function PrivacyPolicyPage() {
  const { t } = useTranslation(["privacyPolicy", "common"]);

  const devnetNotice = t("privacyPolicy:devnetNotice", { returnObjects: true }) as DevnetNotice;
  const sections = Object.entries(
    t("privacyPolicy:sections", { returnObjects: true }) as Record<string, PrivacySection>,
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
              {t("privacyPolicy:title")}
            </PageTitle>
            <p className="text-center text-gray-400 text-sm mt-2">
              {t("privacyPolicy:lastUpdated")}
            </p>
          </SectionLayout>

          {/* Devnet Notice - Highlighted Box */}
          <SectionLayout className="!max-w-6xl">
            <div className="p-6 md:p-8 bg-yellow-900/20 border-2 border-yellow-500/50 rounded-lg">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-yellow-500 flex-shrink-0" />
                <h3 className="text-xl md:text-2xl font-bold text-yellow-200 uppercase">
                  {devnetNotice.title}
                </h3>
              </div>
              <p className="text-gray-300 leading-relaxed">{devnetNotice.content}</p>
            </div>
          </SectionLayout>

          {/* Privacy Policy Sections */}
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

                    {/* Content paragraphs (for sections 1, 8, 9) */}
                    {section.content?.map((paragraph, idx) => (
                      <p key={idx} className="text-gray-300 leading-relaxed">
                        {paragraph}
                      </p>
                    ))}

                    {/* Subsections (for section 2 - Information We Collect) */}
                    {section.subsections?.map((subsection, idx) => (
                      <div key={idx} className="mt-4">
                        <p className="text-nasun-white font-medium mb-2">{subsection.title}</p>
                        <div className="space-y-2 pl-4 md:pl-6">
                          {subsection.items.map((item, itemIdx) => (
                            <p key={itemIdx} className="text-gray-300 leading-relaxed">
                              ({toRoman(itemIdx + 1)}) {item}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Items list (for sections 3, 4, 5, 6, 7) */}
                    {section.items && (
                      <div className="space-y-2 pl-4 md:pl-6">
                        {section.items.map((item, idx) => (
                          <p key={idx} className="text-gray-300 leading-relaxed">
                            ({toRoman(idx + 1)}) {item}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Note (for section 6 - Your Rights) */}
                    {section.note && (
                      <p className="text-yellow-200/90 font-medium mt-4 p-3 bg-yellow-900/10 border border-yellow-500/30 rounded">
                        {section.note}
                      </p>
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

export default React.memo(PrivacyPolicyPage);
