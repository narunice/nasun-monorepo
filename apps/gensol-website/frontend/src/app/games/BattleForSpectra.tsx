import { FadeIn } from "@/components/common/FadeIn"
import { FadeInUp } from "@/components/common/FadeInUp"
import SpectraPlantRaid from "@/assets/gensol/SpectraPlantRaid.webp"
import SpectraPlantRaidMobile from "@/assets/gensol/SpectraPlantRaidMobile.webp"

const BattleForSpectra = () => {
  return (
    <>
      {/* 데스크톱 버전 */}
      <section className="hidden md:block relative w-full overflow-hidden">
        <FadeIn className="flex justify-center">
          <img
            src={SpectraPlantRaid}
            alt="Battle for Spectra"
            className="w-full h-auto min-w-[1200px]"
          />
        </FadeIn>

        <div className="absolute z-10 w-full text-white bottom-[22%] text-center">
          <FadeInUp>
            <h3 className="font-normal">BATTLE FOR SPECTRA</h3>
          </FadeInUp>
        </div>

        <div className="absolute z-10 right-[2%] bottom-[2%]">
          <FadeIn>
            <p className="opacity-60">Concept Art "Spectra Plant Raid" by Eddie Han</p>
          </FadeIn>
        </div>
      </section>

      {/* 모바일 버전 */}
      <section className="relative md:hidden w-full overflow-hidden">
        <FadeIn className="flex justify-center">
          <img src={SpectraPlantRaidMobile} alt="Battle for Spectra" className="w-full h-auto" />
        </FadeIn>

        <div className="absolute z-10 w-full text-white bottom-[22%] text-center">
          <FadeInUp>
            <h3 className="font-normal">BATTLE FOR SPECTRA</h3>
          </FadeInUp>
        </div>

        <div className="absolute z-10 right-[2%] bottom-[2%]">
          <FadeIn>
            <p className="opacity-60">Concept Art "Spectra Plant Raid" by Eddie Han</p>
          </FadeIn>
        </div>
      </section>
    </>
  )
}

export default BattleForSpectra
