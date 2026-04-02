import { ScrollSnapContainer } from "@/components/layout/ScrollSnapContainer";
import { ScrollSnapSection } from "@/components/layout/ScrollSnapSection";
import TriptychSection from "@/sections/home/TriptychSection";

export default function DevHomePage() {
  return (
    <div className="bg-nasun-black">
      <ScrollSnapContainer>
        <ScrollSnapSection>
          <TriptychSection />
        </ScrollSnapSection>
      </ScrollSnapContainer>
    </div>
  );
}
