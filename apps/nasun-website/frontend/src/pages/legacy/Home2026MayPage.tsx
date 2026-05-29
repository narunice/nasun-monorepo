/**
 * ARCHIVE — not in production. See apps/nasun-website/CLAUDE.md
 * Operational Invariants #11. Active home is src/pages/dev/DevHomePage.tsx.
 * Only mounted at /archive/home-may2026 for reference.
 */
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { ScrollSnapContainer } from "@/components/layout/ScrollSnapContainer";
import { ScrollSnapSection } from "@/components/layout/ScrollSnapSection";
import AllianceCreatorSection from "@/sections/home/legacy/may2026/AllianceCreatorSection";
import Hero2026Section from "@/sections/home/legacy/may2026/2026HeroSection";
import Hero2026StatsSection from "@/sections/home/legacy/may2026/2026StatsSection";
import WhatWeBuild2026Section from "@/sections/home/legacy/may2026/2026WhatWeBuildSection";
import DevNewsEventsSection from "@/sections/home/legacy/may2026/DevNewsEventsSection";
import { JsonLd, NASUN_ORG_SCHEMA } from "@/utils/jsonLd";

export default function Home2026MayPage() {
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
