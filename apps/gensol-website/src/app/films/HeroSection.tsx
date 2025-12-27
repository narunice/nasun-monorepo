// <MONOREPO>/apps/gensol-website/frontend/src/app/films/HeroSection.tsx

import { FadeIn } from "@/components/common/FadeIn"
import { filmsContent } from "@/constants/pageContent/filmsContent"
import { FadeInUp } from "@/components/common/FadeInUp"
import DiscoveryofSpectraBones from "@/assets/gensol/DiscoveryofSpectraBones.webp"

const FilmsHeroSection = () => {
  return (
    <section className="relative w-full overflow-hidden">
      {/* Background image - determines section size */}
      <FadeIn className="flex justify-center">
        <img
          src={DiscoveryofSpectraBones}
          alt="Discovery of Spectra Bones"
          className="w-full h-auto min-w-[1100px]"
        />
      </FadeIn>

      {/* Main heading */}
      <div className="absolute z-10 text-white left-[10%] bottom-[15%] max-md:left-0 max-md:right-0 max-md:text-center">
        <FadeInUp>
          <h3 className="font-bold">
            DISCOVER POWER
            <br />
            BEYOND IMAGINATION
          </h3>
        </FadeInUp>
      </div>

      {/* Artist credit */}
      <div className="absolute z-10 right-[2%] bottom-[2%]">
        <FadeIn>
          <p className="opacity-60">{filmsContent.hero.credit}</p>
        </FadeIn>
      </div>
    </section>
  )
}

export default FilmsHeroSection
