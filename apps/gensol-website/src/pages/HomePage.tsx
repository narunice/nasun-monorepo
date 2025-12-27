import HomeHeroSection from "@/app/home/HomeHeroSection"
import ArkGalaxySection from "@/app/home/ArkGalaxySection"
import AerioSection from "@/app/home/AerioSection"
import NewsSection from "@/app/home/NewsSection"
import VGamesSection from "@/app/home/VGamesSection"
import CommunityDrivenSection from "@/app/home/CommunityDrivenSection"
import { ScrollSnapContainer } from "@/components/layout/ScrollSnapContainer"
import { ScrollSnapSection } from "@/components/layout/ScrollSnapSection"

const HomePage = () => {
  return (
    <main>
      <ScrollSnapContainer>
        <ScrollSnapSection>
          <HomeHeroSection />
        </ScrollSnapSection>
        <ScrollSnapSection>
          <ArkGalaxySection />
        </ScrollSnapSection>
        <ScrollSnapSection>
          <AerioSection />
        </ScrollSnapSection>
        <ScrollSnapSection>
          <NewsSection />
        </ScrollSnapSection>
        <ScrollSnapSection>
          <VGamesSection />
        </ScrollSnapSection>
        <ScrollSnapSection>
          <CommunityDrivenSection />
        </ScrollSnapSection>
      </ScrollSnapContainer>
    </main>
  )
}

export default HomePage
