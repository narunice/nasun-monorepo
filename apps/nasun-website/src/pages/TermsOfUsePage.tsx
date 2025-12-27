import React, { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../components/layout/PageLayout";
import { SectionLayout } from "../components/layout/SectionLayout";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { PageTitle } from "../components/ui/PageTitle";

// 각 섹션별 타입 정의
type License = {
  nonCommercialUse: string;
  commercialUse: string;
};

type TermSection = {
  title: string;
  description?: string;
  description2?: string;
  description3?: string;
  terms?: Record<string, string>;
  license?: License;
  digitalAssets?: string;
  contact?: string;
  translation?: string;
  investmentDisclaimer?: string;
  list?: Record<string, string>;
  list2?: Record<string, string>;
  nestedList?: Record<string, string>;
  entities?: string;
  subsection?: string;
};

// Parse HTML tags (only <strong>) safely without dangerouslySetInnerHTML
const parseText = (text: string) => {
  const parts = [];
  const regex = /<strong>(.*?)<\/strong>/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the tag
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    // Add the strong content
    parts.push(<strong key={match.index}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
};

// Main list renderer with consistent spacing
const renderList = (listItems: Record<string, string>) => (
  <ul className="pl-5 space-y-2.5 mt-4">
    {Object.entries(listItems).map(([key, value]) => (
      <li key={key} className="text-gray-300 leading-relaxed">
        {parseText(value)}
      </li>
    ))}
  </ul>
);

// Nested list renderer with additional indentation and smaller font
const renderNestedList = (listItems: Record<string, string>) => (
  <ul className="pl-9 space-y-2 mt-2">
    {Object.entries(listItems).map(([key, value]) => (
      <li key={key} className="text-gray-400 text-sm leading-relaxed">
        {parseText(value)}
      </li>
    ))}
  </ul>
);

const renderSectionContent = (section: TermSection) => {
  return (
    <div className="space-y-4">
      {section.description && (
        <p className="text-gray-300 whitespace-pre-line leading-relaxed">
          {section.description}
        </p>
      )}

      {section.terms && (
        <div className="space-y-4 mt-4">
          {Object.entries(section.terms).map(([termKey, termValue]) => (
            <p key={termKey} className="text-gray-300 whitespace-pre-line leading-relaxed">
              {parseText(termValue)}
            </p>
          ))}
        </div>
      )}

      {section.entities && (
        <p className="text-gray-300 whitespace-pre-line leading-relaxed mt-4">
          {section.entities}
        </p>
      )}

      {section.subsection && (
        <p className="font-semibold text-gray-200 mt-5 mb-3">
          {parseText(section.subsection)}
        </p>
      )}

      {section.list && renderList(section.list)}
      {section.nestedList && renderNestedList(section.nestedList)}

      {section.description2 && (
        <p className="text-gray-300 whitespace-pre-line leading-relaxed mt-4">
          {section.description2}
        </p>
      )}

      {section.list2 && renderList(section.list2)}

      {section.description3 && (
        <p className="text-gray-300 whitespace-pre-line leading-relaxed mt-4">
          {section.description3}
        </p>
      )}

      {section.license && (
        <div className="space-y-4 mt-4">
          <div>
            <p className="font-semibold text-gray-200 mb-3">
              {parseText(section.license.nonCommercialUse.match(/<strong>(.*?)<\/strong>/)?.[1] || "")}
            </p>
            <p className="text-gray-300 whitespace-pre-line leading-relaxed">
              {parseText(section.license.nonCommercialUse.replace(/<strong>.*?<\/strong>/, ""))}
            </p>
          </div>
          <div>
            <p className="font-semibold text-gray-200 mb-3">
              {parseText(section.license.commercialUse.match(/<strong>(.*?)<\/strong>/)?.[1] || "")}
            </p>
            <p className="text-gray-300 whitespace-pre-line leading-relaxed">
              {parseText(section.license.commercialUse.replace(/<strong>.*?<\/strong>/, ""))}
            </p>
          </div>
        </div>
      )}

      {section.digitalAssets && (
        <div className="mt-4">
          <p className="font-semibold text-gray-200 mb-3">
            {parseText(section.digitalAssets.match(/<strong>(.*?)<\/strong>/)?.[1] || "")}
          </p>
          <p className="text-gray-300 whitespace-pre-line leading-relaxed">
            {parseText(section.digitalAssets.replace(/<strong>.*?<\/strong>/, ""))}
          </p>
        </div>
      )}

      {section.contact && (
        <p className="text-gray-300 whitespace-pre-line leading-relaxed mt-4">
          {section.contact}
        </p>
      )}

      {section.translation && (
        <p className="text-gray-300 whitespace-pre-line leading-relaxed mt-4">
          {section.translation}
        </p>
      )}

      {section.investmentDisclaimer && (
        <div className="mt-6 p-4 bg-yellow-900/20 border-l-4 border-yellow-500 rounded-lg">
          <p className="font-semibold text-yellow-200 whitespace-pre-line leading-relaxed">
            {section.investmentDisclaimer}
          </p>
        </div>
      )}
    </div>
  );
};

function TermsOfUsePage() {
  const { t } = useTranslation(["terms", "common"]);
  const sections = Object.entries(t("terms:sections", { returnObjects: true })) as [
    string,
    TermSection,
  ][];

  return (
    <PageLayout>
      <ErrorBoundary
        fallback={
          <SectionLayout>
            <p className="text-nasun-latte">Content loading failed</p>
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
              {t("terms:title")}
            </PageTitle>

            <span className="text-sm text-gray-500 mt-2">
              {t("terms:lastUpdated")}
            </span>
          </SectionLayout>
          <SectionLayout>
            <p className="text-gray-300 whitespace-pre-line">{t("terms:intro")}</p>
          </SectionLayout>

          {sections.map(([key, section], index) => (
            <SectionLayout
              key={key}
              title={section.title}
              className={`${index !== sections.length - 1 ? "border-b border-gray-700" : ""}`}
            >
              {renderSectionContent(section)}
            </SectionLayout>
          ))}
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
}

export default React.memo(TermsOfUsePage);
