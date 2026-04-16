import { ScrollSnapContainer } from "@/components/layout/ScrollSnapContainer";
import { ScrollSnapSection } from "@/components/layout/ScrollSnapSection";
import TriptychSection from "@/sections/home/TriptychSection";
import Hero2026Section from "@/sections/home/2026HeroSection";

export default function DevHomePage() {
  return (
    <div className="bg-nasun-black">
      <ScrollSnapContainer>
        <ScrollSnapSection>
          <Hero2026Section />
        </ScrollSnapSection>
        <ScrollSnapSection>
          <TriptychSection />
        </ScrollSnapSection>
      </ScrollSnapContainer>
    </div>
  );
}
