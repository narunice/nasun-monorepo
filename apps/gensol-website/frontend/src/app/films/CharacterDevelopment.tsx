// <MONOREPO>/apps/gensol-website/frontend/src/app/films/ConceptExecutionSection.tsx

import { FadeIn } from "@/components/common/FadeIn"
import { FadeInUp } from "@/components/common/FadeInUp"
import { filmsContent } from "@/constants/pageContent/filmsContent"
import characterDevelopmentJosen from "@/assets/videos/characterDevelopmentJosen.webm"

const CharacterDevelopmentSection = () => {
  return (
    <>
      <section className="relative w-full flex flex-col lg:flex-row py-16 lg:py-0">
        {/* 텍스트 영역 */}
        <div className="w-full lg:w-1/2 flex flex-col space-y-1 justify-center px-10 pt-10 pb-12 lg:px-16 order-1 md:order-none">
          <FadeInUp>
            <h3 className="font-pirulen">{filmsContent.characterDevelopment.title}</h3>
            <p>{filmsContent.characterDevelopment.description}</p>
          </FadeInUp>
        </div>

        {/* 비디오 영역 */}
        <div className="w-full lg:w-1/2 relative aspect-video px-10 pb-16 lg:py-36 flex justify-center items-center order-2 md:order-none">
          <FadeIn>
            <video autoPlay loop muted playsInline className="w-full h-full object-contain">
              <source src={characterDevelopmentJosen} type="video/webm" />
              Your browser does not support the video tag.
            </video>
          </FadeIn>
        </div>
      </section>
    </>
  )
}

export default CharacterDevelopmentSection
