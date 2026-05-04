import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { ScrollSnapContainer } from "@/components/layout/ScrollSnapContainer";
import { ScrollSnapSection } from "@/components/layout/ScrollSnapSection";
import AllianceCreatorSection from "@/sections/home/AllianceCreatorSection";
import Hero2026Section from "@/sections/home/2026HeroSection";
import Hero2026StatsSection from "@/sections/home/2026StatsSection";
import WhatWeBuild2026Section from "@/sections/home/2026WhatWeBuildSection";
import DevNewsEventsSection from "@/sections/home/DevNewsEventsSection";
import { JsonLd, NASUN_ORG_SCHEMA } from "@/utils/jsonLd";

export default function HomePage() {
  const errorFallback = (
    <SectionLayout>
      <p className="text-nasun-white">Failed to load section</p>
    </SectionLayout>
  );

  return (
    <div className="bg-nasun-black">
      <JsonLd data={NASUN_ORG_SCHEMA} />
      <ErrorBoundary fallback={errorFallback}>
        <ScrollSnapContainer>
          <ScrollSnapSection className="!min-h-0 !h-auto">
            <Hero2026Section />
          </ScrollSnapSection>
          <ScrollSnapSection allowTallContent>
            <Hero2026StatsSection />
          </ScrollSnapSection>
          <ScrollSnapSection
            allowTallContent
            className="!min-h-0 md:!min-h-[calc(100vh-50px)]"
          >
            <WhatWeBuild2026Section />
          </ScrollSnapSection>

          <ScrollSnapSection>
            <AllianceCreatorSection />
          </ScrollSnapSection>
          <ScrollSnapSection allowTallContent>
            <DevNewsEventsSection />
          </ScrollSnapSection>
        </ScrollSnapContainer>
      </ErrorBoundary>
    </div>
  );
}
