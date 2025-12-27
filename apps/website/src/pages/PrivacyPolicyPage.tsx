import React, { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../components/layout/PageLayout";
import { SectionLayout } from "../components/layout/SectionLayout";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { PageTitle } from "../components/ui/PageTitle";

type Section = {
  title: string;
  description?: string;
  items?: string[];
  rights?: string[];
  purposes?: string[];
  contact?: string;
  email?: string;
  website?: string;
  noSelling?: string;
  automatic?: {
    title: string;
    logData: string;
    tracking: string;
  };
  voluntary?: {
    title: string;
    fields: string[];
    childrenPolicy: string;
  };
};

function PrivacyPolicyPage() {
  const { t } = useTranslation(["privacyPolicy", "common"]);
  const sections = Object.entries(t("privacyPolicy:sections", { returnObjects: true })) as [
    string,
    Section,
  ][];

  return (
    <PageLayout>
      <ErrorBoundary
        fallback={
          <SectionLayout>
            <p className="text-nasun-latte">{t("common:error.content_load_failed")}</p>
          </SectionLayout>
        }
      >
        <Suspense
          fallback={
            <SectionLayout>
              <p>{t("common:info.loading")}</p>
            </SectionLayout>
          }
        >
          <SectionLayout>
            <PageTitle as="h2" align="center">
              {t("privacyPolicy:title")}
            </PageTitle>

            <span className="text-sm text-gray-500 mt-2">
              {t("privacyPolicy:lastUpdated")}
            </span>
          </SectionLayout>
          <SectionLayout>
            <p className="text-gray-300">{t("privacyPolicy:intro")}</p>
            <p className="text-sm italic text-gray-400 mt-4">
              {t("privacyPolicy:note")}
            </p>
          </SectionLayout>

          {sections.map(([key, section], index) => (
            <SectionLayout
              key={key}
              title={`${section.title}`}
              className={`${index !== sections.length - 1 ? "border-b border-gray-700" : ""}`}
            >
                {section.description && (
                  <p className="text-gray-300 mb-4">{section.description}</p>
                )}

                {(section.items || section.purposes || section.rights) && (
                  <div className="space-y-2 pl-5">
                    <ul className="list-disc space-y-2 text-gray-300">
                      {(section.items || section.purposes || section.rights)?.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {section.automatic && (
                  <div className="mt-4 space-y-3">
                    <h3 className="text-lg mt-6">
                      {section.automatic.title}
                    </h3>
                    <ul className="list-disc space-y-1 pl-5 text-gray-300">
                      <li>{section.automatic.logData}</li>
                      <li>{section.automatic.tracking}</li>
                    </ul>
                  </div>
                )}

                {section.voluntary && (
                  <div className="mt-4 space-y-3">
                    <h3 className="text-lg mt-6">
                      {section.voluntary.title}
                    </h3>
                    <ul className="list-disc space-y-1 pl-5 text-gray-300">
                      {section.voluntary.fields.map((field, i) => (
                        <li key={i}>{field}</li>
                      ))}
                    </ul>
                    <p className="text-sm text-gray-400 pt-4">
                      {section.voluntary.childrenPolicy}
                    </p>
                  </div>
                )}

                {section.noSelling && (
                  <p className="text-sm text-gray-400 pt-4">{section.noSelling}</p>
                )}

                {(section.contact || section.email || section.website) && (
                  <div className="flex flex-col mt-4 space-y-2">
                    {section.contact && <p>{section.contact}</p>}
                    {section.email && <p>{section.email}</p>}
                    {section.website && <p>{section.website}</p>}
                  </div>
                )}
              </SectionLayout>
          ))}
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
}

export default React.memo(PrivacyPolicyPage);
