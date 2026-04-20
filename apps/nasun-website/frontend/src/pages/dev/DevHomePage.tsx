import { ScrollSnapContainer } from "@/components/layout/ScrollSnapContainer";
import { ScrollSnapSection } from "@/components/layout/ScrollSnapSection";
import TriptychSection from "@/sections/home/TriptychSection";
import Hero2026Section from "@/sections/home/2026HeroSection";
import Hero2026StatsSection from "@/sections/home/2026StatsSection";
import WhatWeBuild2026Section from "@/sections/home/2026WhatWeBuildSection";

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
        <ScrollSnapSection>
          <WhatWeBuild2026Section />
        </ScrollSnapSection>
        <ScrollSnapSection>
          <TriptychSection />
        </ScrollSnapSection>
      </ScrollSnapContainer>
    </div>
  );
}
