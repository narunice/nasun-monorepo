import { FadeInUp } from "@/components/common/FadeInUp"
import { Button } from "@/components/ui/button"
import WhitePlanetBackground from "@assets/images/White-Planet-Space.webp"

const CommunityDrivenSection = () => {
  return (
    <section className="relative flex items-center justify-center w-full min-h-screen h-full overflow-hidden">
      {/* 배경 이미지 */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${WhitePlanetBackground})`,
        }}
      />

      {/* 내용 컨테이너 - 중앙 정렬 */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 md:px-12 max-w-[460px] md:max-w-[780px] xl:max-w-[850px] mx-auto">
        <FadeInUp>
          <h3 className="font-pirulen text-white tracking-wider mb-6 md:mb-8">COMMUNITY DRIVEN</h3>
        </FadeInUp>

        <FadeInUp>
          <p className="!text-white/80 mb-4">
            Gen Sol is empowered by a passionate community of creators and fans collaborating
            together to produce the narrative content and games to share with the world.
          </p>

          <p className="!text-white/80 mb-8 md:mb-10">
            If you are interested in being part of Gen Sol, join our community.
          </p>
        </FadeInUp>

        <FadeInUp>
          <Button
            variant="sf-red"
            size="lg"
            className="opacity-80 px-6 py-2 bg-sf-red hover:bg-sf-darkred rounded-md font-medium tracking-widest transition-all text-sf-yellow hover:text-sf-blue font-pirulen"
          >
            JOIN US
          </Button>
        </FadeInUp>
      </div>
    </section>
  )
}

export default CommunityDrivenSection
