import { ScrollSnapContainer } from "@/components/layout/ScrollSnapContainer";
import { ScrollSnapSection } from "@/components/layout/ScrollSnapSection";
import AllianceCreatorSection from "@/sections/home/AllianceCreatorSection";
import Hero2026Section from "@/sections/home/2026HeroSection";
import Hero2026StatsSection from "@/sections/home/2026StatsSection";
import WhatWeBuild2026Section from "@/sections/home/2026WhatWeBuildSection";
import DevNewsEventsSection from "@/sections/home/DevNewsEventsSection";

export default function DevHomePage() {
  return (
    <div className="bg-nasun-black">
      <ScrollSnapContainer>
        <ScrollSnapSection>
          <Hero2026Section />
        </ScrollSnapSection>
        <ScrollSnapSection allowTallContent>
          <Hero2026StatsSection />
        </ScrollSnapSection>
        {/* A/B comparison: object-contain vs object-cover — dev only */}
        <ScrollSnapSection>
          <WhatWeBuild2026Section />
        </ScrollSnapSection>
        <ScrollSnapSection>
          <WhatWeBuild2026Section videoCover />
        </ScrollSnapSection>
        <ScrollSnapSection allowTallContent>
          <DevNewsEventsSection />
        </ScrollSnapSection>
        <ScrollSnapSection>
          <AllianceCreatorSection />
        </ScrollSnapSection>
      </ScrollSnapContainer>
    </div>
  );
}
