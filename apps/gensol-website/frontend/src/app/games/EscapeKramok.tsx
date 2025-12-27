import { FadeInUp } from "@/components/common/FadeInUp"
import { AutoPlayVideo } from "@/components/common/AutoPlayVideo"
import { gamesContent } from "@/constants/pageContent/gamesContent"
import GameplayVideo from "@/assets/videos/Gameplay-Lavaplanet-Title-rf29.mp4"
import LavaPlanet from "@/assets/images/lava-planet_2.webp"

const EscapeKramokSection = () => {
  return (
    <>
      {/* Escape From Kramok 섹션 */}
      <section className="relative w-full h-full xl:py-20">
        {/* 배경 이미지 */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${LavaPlanet})` }}
        />
        {/* 배경 오버레이 */}
        <div className="absolute inset-0 bg-black/30" />
        {/* Mobile/Tablet: xl 미만 - 텍스트 → 비디오 → 디스클레이머 */}
        <div className="xl:hidden flex flex-col relative z-10">
          {/* 텍스트 컨테이너 */}
          <div className="w-full px-6 sm:px-10 md:px-16 lg:px-24 pt-16 pb-6 text-white">
            <FadeInUp>
              <div className="w-fit mb-6">
                <h6>{gamesContent.genSolGamesPresents.category}</h6>
                <h3 className="!font-light">{gamesContent.genSolGamesPresents.title}</h3>
              </div>
            </FadeInUp>

            <FadeInUp>
              <div className="space-y-4">
                <p>{gamesContent.genSolGamesPresents.firstMap}</p>
                <p className="whitespace-pre-line">{gamesContent.genSolGamesPresents.summary}</p>
                <p>{gamesContent.genSolGamesPresents.paragraphs}</p>
              </div>
            </FadeInUp>
          </div>

          {/* 비디오 */}
          <div className="w-full px-6 sm:px-10 md:px-16 lg:px-24 pb-4">
            <AutoPlayVideo
              videoSrc={GameplayVideo}
              videoType="video/mp4"
              threshold={0.3}
              loop={true}
              muted={true}
              volume={0.15}
              showControlsOnHover={true}
              className=""
            />
          </div>
        </div>

        {/* Desktop: xl 이상 - 텍스트(왼쪽) | 이미지(오른쪽) */}
        <div className="hidden xl:flex flex-row items-center w-full h-full relative z-10">
          {/* 텍스트 컨테이너 */}
          <div className="w-1/2 flex flex-col pl-24 pr-8 py-10 text-white">
            <div>
              <div className="w-fit mb-6">
                <h6>{gamesContent.genSolGamesPresents.category}</h6>
                <h3 className="!font-light">{gamesContent.genSolGamesPresents.title}</h3>
              </div>
              <div className="space-y-4">
                <p>{gamesContent.genSolGamesPresents.firstMap}</p>
                <p className="whitespace-pre-line">{gamesContent.genSolGamesPresents.summary}</p>
                <p>{gamesContent.genSolGamesPresents.paragraphs}</p>
              </div>
            </div>
          </div>

          {/* 비디오 컨테이너 */}
          <div className="w-1/2 flex justify-start items-center 2xl:pt-8 pl-4 pr-24">
            <AutoPlayVideo
              videoSrc={GameplayVideo}
              videoType="video/mp4"
              threshold={0.3}
              loop={true}
              muted={true}
              volume={0.15}
              showControlsOnHover={true}
              className=""
            />
          </div>
        </div>

        {/* Asset Disclaimer */}
        <div className="relative z-10 w-full px-6 sm:px-10 md:px-16 lg:px-24 lg:pt-6 xl:pt-8 2xl:pt-10 pb-16 xl:pb-0">
          <p className="text-sm lg:text-base !text-gray-400 italic  max-w-[1060px] mx-auto leading-relaxed">
            All weapons currently shown use marketplace assets to develop and validate core gameplay
            mechanics, such as aiming, reloading, damage, fire rate, animations, and effective
            range, implemented in C++ for speed and stability. When the weapon framework is
            complete, and these placeholder assets will be replaced with fully custom-designed
            sci-fi weapons and new animations without impacting the underlying systems; the Serhade
            Rifle is already implemented in-game as the first custom weapon.
          </p>
        </div>
      </section>
    </>
  )
}

export default EscapeKramokSection
