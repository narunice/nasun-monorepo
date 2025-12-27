import { FadeIn } from "@/components/common/FadeIn"
import { FadeInUp } from "@/components/common/FadeInUp"

import moonoaksDestiny from "@/assets/gensol/moonoaksDestiny.webp"

const FeatureFilmSection = () => {
  return (
    <>
      {/* 데스크탑 뷰 (lg 이상) - 고정 높이, cover */}
      <section className="hidden lg:block relative w-full h-[calc(100vh-64px)] overflow-hidden">
        <FadeIn>
          <div
            className="absolute inset-0 bg-center bg-no-repeat bg-cover"
            style={{
              backgroundImage: `url(${moonoaksDestiny})`,
            }}
          ></div>
        </FadeIn>

        <div className="absolute z-10 text-white right-[20%] bottom-[15%] text-center">
          <FadeInUp>
            <h3 className="font-semibold !tracking-widest">FEATURE FILMS</h3>
          </FadeInUp>
        </div>

        <div className="absolute z-10 left-[2%] bottom-[2%]">
          <p className="opacity-60">Concept Art "Moonoak's Destiny" by Eddie Han</p>
        </div>
      </section>

      {/* 모바일/태블릿 뷰 (lg 미만) - 이미지 높이에 맞춤, contain */}
      <section className="lg:hidden relative w-full overflow-hidden">
        <FadeIn>
          <img
            src={moonoaksDestiny}
            alt="Moonoak's Destiny"
            className="w-full h-auto object-contain"
          />
        </FadeIn>

        <div className="absolute z-10 w-full text-white  bottom-[15%] text-center">
          <FadeInUp>
            <h3 className="font-semibold !tracking-widest">FEATURE FILMS</h3>
          </FadeInUp>
        </div>

        <div className="absolute z-10 left-[2%] bottom-[2%]">
          <p className="opacity-60">Concept Art "Moonoak's Destiny" by Eddie Han</p>
        </div>
      </section>
    </>
  )
}

export default FeatureFilmSection
